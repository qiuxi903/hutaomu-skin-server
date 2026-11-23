<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Report;
use App\Models\Texture;
use App\Models\User;
use Blessing\Filter;
use Blessing\Rejection;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function submit(Request $request, Dispatcher $dispatcher, Filter $filter)
    {
        $data = $request->validate([
            'tid' => 'required|exists:textures',
            'reason' => 'required',
        ]);
        /** @var User */
        $reporter = auth()->user();
        $tid = $data['tid'];
        $reason = $data['reason'];

        $can = $filter->apply('user_can_report', true, [$tid, $reason, $reporter]);
        if ($can instanceof Rejection) {
            return json($can->getReason(), 1);
        }

        $dispatcher->dispatch('report.submitting', [$tid, $reason, $reporter]);

        if (Report::where('reporter', $reporter->uid)->where('tid', $tid)->count() > 0) {
            return json(trans('skinlib.report.duplicate'), 1);
        }

        $score = option('reporter_score_modification', 0);
        if ($score < 0 && $reporter->score < -$score) {
            return json(trans('skinlib.upload.lack-score'), 1);
        }
        $reporter->score += $score;
        $reporter->save();

        $report = new Report();
        $report->tid = $tid;
        $report->uploader = Texture::find($tid)->uploader;
        $report->reporter = $reporter->uid;
        $report->reason = $reason;
        $report->status = Report::PENDING;
        $report->save();

        $dispatcher->dispatch('report.submitted', [$report]);

        return json(trans('skinlib.report.success'), 0);
    }

    /* 评论举报: 与材质举报同一张 reports 表, type=TYPE_COMMENT 分区, 后台举报管理页分 Tab 展示 */
    public function submitComment(Request $request, Comment $comment)
    {
        $data = $request->validate([
            'reason' => 'required|string|max:200',
        ]);
        /** @var User */
        $reporter = auth()->user();

        /* 只能举报自己可见的已通过评论(私密材质不可见者自然够不到) */
        if ($comment->status !== Comment::STATUS_APPROVED) {
            return json('该评论不可举报', 1);
        }
        if ($comment->uid == $reporter->uid) {
            return json('不能举报自己的评论', 1);
        }

        if (Report::where('reporter', $reporter->uid)->where('comment_id', $comment->id)->count() > 0) {
            return json('你已经举报过这条评论', 1);
        }

        $score = option('reporter_score_modification', 0);
        if ($score < 0 && $reporter->score < -$score) {
            return json(trans('skinlib.upload.lack-score'), 1);
        }
        $reporter->score += $score;
        $reporter->save();

        $report = new Report();
        $report->type = Report::TYPE_COMMENT;
        $report->comment_id = $comment->id;
        $report->tid = $comment->tid;
        $report->uploader = $comment->uid; /* 被举报人 = 评论作者(与材质举报同列语义) */
        $report->reporter = $reporter->uid;
        $report->reason = $data['reason'];
        $report->status = Report::PENDING;
        $report->save();

        return json('举报成功，感谢反馈', 0);
    }

    /* 后台举报管理页(服务端渲染双 Tab 分区: 材质举报 / 评论举报) */
    public function adminPage(Request $request)
    {
        $type = $request->input('type') === 'comment' ? Report::TYPE_COMMENT : Report::TYPE_TEXTURE;
        $with = $type === Report::TYPE_COMMENT
            ? ['comment.user', 'texture', 'informer']
            : ['texture', 'textureUploader', 'informer'];

        $pending = Report::where('type', $type)
            ->where('status', Report::PENDING)
            ->with($with)
            ->orderByDesc('id')
            ->get();
        $recent = Report::where('type', $type)
            ->where('status', '!=', Report::PENDING)
            ->with($with)
            ->orderByDesc('id')
            ->limit(20)
            ->get();

        return view('admin.reports')->with([
            'tab' => $type === Report::TYPE_COMMENT ? 'comment' : 'texture',
            'pending' => $pending,
            'recent' => $recent,
        ]);
    }

    public function track()
    {
        $reports = Report::where('reporter', auth()->id())
            ->orderBy('report_at', 'desc')
            ->paginate(10);

        return view('user.report', ['reports' => $reports]);
    }

    public function manage(Request $request)
    {
        $q = $request->input('q');

        return Report::usingSearchString($q)
            ->with(['texture', 'textureUploader', 'informer'])
            ->paginate(9);
    }

    public function review(
        Report $report,
        Request $request,
        Dispatcher $dispatcher
    ) {
        /* 评论举报的动作集不含「删材质/封号」: delete=删除被举报的评论 */
        $allowed = $report->type === Report::TYPE_COMMENT
            ? ['delete', 'reject']
            : ['delete', 'ban', 'reject'];
        $data = $request->validate([
            'action' => ['required', Rule::in($allowed)],
        ]);
        $action = $data['action'];

        $dispatcher->dispatch('report.reviewing', [$report, $action]);

        if ($action == 'reject') {
            if (
                $report->informer &&
                ($score = option('reporter_score_modification', 0)) > 0 &&
                $report->status == Report::PENDING
            ) {
                $report->informer->score -= $score;
                $report->informer->save();
            }
            $report->status = Report::REJECTED;
            $report->save();

            $dispatcher->dispatch('report.rejected', [$report]);

            return json(trans('general.op-success'), 0, ['status' => Report::REJECTED]);
        }

        /* 评论举报: delete = 删除被举报的评论(不是删材质), 复用积分返还/奖励逻辑 */
        if ($report->type === Report::TYPE_COMMENT) {
            optional($report->comment)->delete();
            self::returnScore($report);
            self::giveAward($report);
            $report->status = Report::RESOLVED;
            $report->save();

            return json(trans('general.op-success'), 0, ['status' => Report::RESOLVED]);
        }

        switch ($action) {
            case 'delete':
                /** @var Texture */
                $texture = $report->texture;
                if ($texture) {
                    $dispatcher->dispatch('texture.deleting', [$texture]);
                    Storage::disk('textures')->delete($texture->hash);
                    $texture->delete();
                    $dispatcher->dispatch('texture.deleted', [$texture]);
                } else {
                    // The texture has been deleted by its uploader
                    // We will return the score, but will not give the informer any reward
                    self::returnScore($report);
                    $report->status = Report::RESOLVED;
                    $report->save();

                    $dispatcher->dispatch('report.resolved', [$report, $action]);

                    return json(trans('general.texture-deleted'), 0, ['status' => Report::RESOLVED]);
                }
                break;
            case 'ban':
                $uploader = User::find($report->uploader);
                if (!$uploader) {
                    return json(trans('admin.users.operations.non-existent'), 1);
                }
                if (auth()->user()->permission <= $uploader->permission) {
                    return json(trans('admin.users.operations.no-permission'), 1);
                }
                $uploader->permission = User::BANNED;
                $uploader->save();
                $dispatcher->dispatch('user.banned', [$uploader]);
                break;
        }

        self::returnScore($report);
        self::giveAward($report);
        $report->status = Report::RESOLVED;
        $report->save();

        $dispatcher->dispatch('report.resolved', [$report, $action]);

        return json(trans('general.op-success'), 0, ['status' => Report::RESOLVED]);
    }

    public static function returnScore($report)
    {
        if (
            $report->status == Report::PENDING &&
            ($score = option('reporter_score_modification', 0)) < 0 &&
            $report->informer
        ) {
            $report->informer->score -= $score;
            $report->informer->save();
        }
    }

    public static function giveAward($report)
    {
        if ($report->status == Report::PENDING && $report->informer) {
            $report->informer->score += option('reporter_reward_score', 0);
            $report->informer->save();
        }
    }
}
