<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Texture;
use App\Models\User;
use App\Notifications\SiteMessage;
use App\Services\Facades\Option;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/* 材质评论区(皮肤/披风共用详情页):
   - 游客可读已通过评论; 登录用户可发表/回复(限流 throttle:comments); 作者或管理员可删
   - 回复为扁平单层: parent_id 恒指向顶层评论(回复的回复归并到同一线), reply_uid 记被回复人供 @展示
   - 私密材质与详情页同一可见性规则(仅上传者与管理员), 读写都拦
   - 总开关 comment_enabled / 审核开关 comment_moderation, 后台 admin/comments 管理
   - 所有内容服务端校验长度, 输出端转义(twig autoescape + 前端 textContent) */
class CommentController extends Controller
{
    public const PAGE_SIZE = 10;

    /* 与 SkinlibController 构造器里 show/info 的可见性中间件同规则 */
    private function authorizeVisible(Texture $texture): void
    {
        if ($texture->public) {
            return;
        }

        $user = Auth::user();
        if (!Auth::check() || ($user->uid != $texture->uploader && !$user->isAdmin())) {
            $statusCode = (int) option('status_code_for_private');
            if ($statusCode === 404) {
                abort(404, trans('skinlib.show.deleted'));
            }

            abort(403, trans('skinlib.show.private'));
        }
    }

    private function closed()
    {
        if (option('comment_enabled', '1') != '1') {
            return response()->json(['code' => 1, 'message' => '评论区已关闭'], 403);
        }

        return null;
    }

    /* 统一的评论展示载荷: index/store/前端首屏共用, 时间与权限在这里定死 */
    public static function present(Comment $comment, ?User $viewer): array
    {
        $isOwn = $viewer && (int) $viewer->uid === (int) $comment->uid;
        $isAdmin = $viewer && $viewer->isAdmin();

        return [
            'id' => $comment->id,
            'uid' => $comment->uid,
            'name' => $comment->user->nickname ?? trans('general.unexistent-user'),
            'avatar' => url('avatar/user/'.$comment->uid.'?size=48'),
            'content' => $comment->content,
            'status' => $comment->status,
            'parent_id' => $comment->parent_id,
            'reply_name' => $comment->reply_uid ? ($comment->replyUser->nickname ?? null) : null,
            'time_text' => self::timeText($comment->created_at),
            'time_full' => (string) $comment->created_at,
            'can_delete' => $isOwn || $isAdmin,
            'can_approve' => $isAdmin && $comment->status === Comment::STATUS_PENDING,
            'can_reply' => (bool) $viewer,
            'can_report' => $viewer && !$isOwn && $comment->status === Comment::STATUS_APPROVED,
        ];
    }

    private static function timeText($datetime): string
    {
        if (str_starts_with(app()->getLocale(), 'zh')) {
            return $datetime->diffForHumans();
        }

        return $datetime->format('Y-m-d H:i');
    }

    /* 回复落地为公开可见后, 给被回复人发站内通知(铃铛, 点击条目弹窗内含跳转链接)。
       内容会经 CommonMark 转 HTML 渲染, 用户派生文本必须 e() 转义防注入 */
    public static function notifyReply(Comment $reply): void
    {
        if (!$reply->reply_uid || (int) $reply->reply_uid === (int) $reply->uid) {
            return;
        }

        $target = User::find($reply->reply_uid);
        if (!$target) {
            return;
        }

        $url = url('skinlib/show/'.$reply->tid.'#comment-'.$reply->id);
        $excerpt = mb_substr($reply->content, 0, 30).(mb_strlen($reply->content) > 30 ? '…' : '');
        $textureName = optional($reply->texture)->name ?? ('#'.$reply->tid);
        $content = (optional($reply->user)->nickname ?? '有人').' 回复了你在材质「'
            .e($textureName).'」下的评论：'. "\n\n".'> '.e($excerpt)."\n\n".'[点击查看该回复]('.$url.')';

        $target->notify(new SiteMessage('你的评论收到了新回复', $content));
    }

    /* 某材质对当前观看者可见的评论分页(顶层评论分页, 回复整体挂在其顶层线下)
       游客/普通用户: 已通过 + 自己的待审; 管理员: 全部 */
    public static function visiblePage(Texture $texture, ?User $viewer, int $page): array
    {
        $applyVisibility = function ($query) use ($viewer) {
            if (!$viewer || !$viewer->isAdmin()) {
                $query->where(function ($outer) use ($viewer) {
                    $outer->where('status', Comment::STATUS_APPROVED);
                    if ($viewer) {
                        $outer->orWhere(function ($inner) use ($viewer) {
                            $inner->where('status', Comment::STATUS_PENDING)->where('uid', $viewer->uid);
                        });
                    }
                });
            }

            return $query;
        };

        $page = max(1, $page);
        $total = $applyVisibility(Comment::where('tid', $texture->tid)->whereNull('parent_id'))->count();
        $tops = $applyVisibility(Comment::where('tid', $texture->tid)->whereNull('parent_id'))
            ->with(['user:uid,nickname', 'replyUser:uid,nickname'])
            ->orderByDesc('id')
            ->forPage($page, self::PAGE_SIZE)
            ->get();

        $replies = collect();
        if ($tops->isNotEmpty()) {
            $replies = $applyVisibility(Comment::whereIn('parent_id', $tops->pluck('id')))
                ->with(['user:uid,nickname', 'replyUser:uid,nickname'])
                ->orderBy('id')
                ->get()
                ->groupBy('parent_id');
        }

        $items = $tops
            ->map(fn (Comment $c) => self::present($c, $viewer) + [
                'replies' => ($replies[$c->id] ?? collect())
                    ->map(fn (Comment $r) => self::present($r, $viewer))
                    ->values()->all(),
            ])
            ->all();

        return [
            'items' => $items,
            'total' => $total,
            'has_more' => $page * self::PAGE_SIZE < $total,
        ];
    }

    public function index(Request $request, Texture $texture)
    {
        $this->authorizeVisible($texture);
        if ($closed = $this->closed()) {
            return $closed;
        }

        $page = (int) $request->query('page', '1');

        return response()->json([
            'code' => 0,
            'data' => self::visiblePage($texture, Auth::user(), $page),
        ]);
    }

    public function store(Request $request, Texture $texture)
    {
        $this->authorizeVisible($texture);
        if ($closed = $this->closed()) {
            return $closed;
        }

        /** @var User $user */
        $user = Auth::user();

        $content = trim((string) $request->input('content', ''));
        if ($content === '') {
            return response()->json(['code' => 1, 'message' => '评论内容不能为空'], 422);
        }
        if (mb_strlen($content) > Comment::MAX_LENGTH) {
            return response()->json(['code' => 1, 'message' => '评论最多 '.Comment::MAX_LENGTH.' 字'], 422);
        }

        /* 回复目标校验: 同一材质 + 对回复者可见; 归并到顶层线(parent_id 恒为顶层 id) */
        $parentId = null;
        $replyUid = null;
        if ($request->filled('reply_to')) {
            $target = Comment::find((int) $request->input('reply_to'));
            $visible = $target
                && (int) $target->tid === (int) $texture->tid
                && ($target->status === Comment::STATUS_APPROVED
                    || $target->uid === $user->uid
                    || $user->isAdmin());
            if (!$visible) {
                return response()->json(['code' => 1, 'message' => '回复的评论不存在或不可见'], 422);
            }

            $parentId = $target->parent_id ?: $target->id;
            $replyUid = $target->uid;
        }

        $moderation = option('comment_moderation', '0') == '1';
        $comment = Comment::create([
            'tid' => $texture->tid,
            'uid' => $user->uid,
            'content' => $content,
            'status' => $moderation ? Comment::STATUS_PENDING : Comment::STATUS_APPROVED,
            'ip' => $request->ip(),
            'parent_id' => $parentId,
            'reply_uid' => $replyUid,
        ]);

        /* 未开审核时回复即公开 → 立即通知被回复人; 开审核时由 approve() 通知 */
        $this->notifyIfVisibleReply($comment);

        return response()->json([
            'code' => 0,
            'message' => $moderation ? '已提交，审核通过后展示' : ($parentId ? '回复成功' : '评论发表成功'),
            'pending' => $moderation,
            'comment' => self::present($comment, $user),
        ]);
    }

    /* 回复通过审核后再通知被回复人(未开审核时在 store 里直接通知) */
    private function notifyIfVisibleReply(Comment $comment): void
    {
        if ($comment->status === Comment::STATUS_APPROVED) {
            self::notifyReply($comment);
        }
    }

    /* 作者本人或管理员删除; 删除顶层评论时其下回复一并删除(FK 级联) */
    public function destroy(Request $request, Comment $comment)
    {
        /** @var User $user */
        $user = Auth::user();
        if ($user->uid != $comment->uid && !$user->isAdmin()) {
            return response()->json(['code' => 1, 'message' => trans('skinlib.no-permission')], 403);
        }

        $comment->delete();

        return response()->json(['code' => 0, 'message' => trans('admin.panel.comments.deleted')]);
    }

    /* ---------- 管理后台 ---------- */

    public function adminPage()
    {
        /* 文案走 admin.panel.forms 翻译组(四语言) */
        $settings = Option::form('commentSettings', trans('admin.panel.forms.comment-settings-title'), function ($form) {
            $form->checkbox('comment_enabled', trans('admin.panel.forms.comment-enabled'))
                ->description(trans('admin.panel.forms.comment-enabled-desc'));

            $form->checkbox('comment_moderation', trans('admin.panel.forms.comment-moderation'))
                ->description(trans('admin.panel.forms.comment-moderation-desc'));
        })->handle();

        $nameMap = [];
        $pending = Comment::where('status', Comment::STATUS_PENDING)->orderByDesc('id')->get();
        $recent = Comment::where('status', Comment::STATUS_APPROVED)->orderByDesc('id')->limit(20)->get();
        $tids = $pending->pluck('tid')->merge($recent->pluck('tid'))->unique();
        foreach (Texture::whereIn('tid', $tids)->pluck('name', 'tid') as $tid => $name) {
            $nameMap[$tid] = $name;
        }

        $decorate = function ($list) use ($nameMap) {
            return $list->map(fn (Comment $c) => array_merge(self::present($c, Auth::user()), [
                'tid' => $c->tid,
                'texture_name' => $nameMap[$c->tid] ?? ('#'.$c->tid),
            ]))->all();
        };

        return view('admin.comments')->with([
            'form' => $settings,
            'pending' => $decorate($pending),
            'recent' => $decorate($recent),
        ]);
    }

    public function approve(Request $request, Comment $comment)
    {
        if ($comment->status !== Comment::STATUS_PENDING) {
            return response()->json(['code' => 1, 'message' => trans('admin.panel.comments.not-pending')], 422);
        }

        $comment->update(['status' => Comment::STATUS_APPROVED]);
        $this->notifyIfVisibleReply($comment);

        return response()->json(['code' => 0, 'message' => '已通过审核']);
    }
}
