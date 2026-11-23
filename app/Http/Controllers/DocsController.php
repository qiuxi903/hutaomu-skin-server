<?php

namespace App\Http\Controllers;

use App\Models\Doc;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use League\CommonMark\GithubFlavoredMarkdownConverter;

/* 站点文档(/docs): 公开读已发布; 管理员后台 CRUD + Markdown 预览。
   渲染时 raw HTML 一律转义(管理员虽可信, 防注入不设例外) */
class DocsController extends Controller
{
    private function converter(): GithubFlavoredMarkdownConverter
    {
        return new GithubFlavoredMarkdownConverter([
            'html_input' => 'escape',
            'allow_unsafe_links' => false,
        ]);
    }

    public static function renderMarkdown(string $content): string
    {
        return (new GithubFlavoredMarkdownConverter([
            'html_input' => 'escape',
            'allow_unsafe_links' => false,
        ]))->convertToHtml($content);
    }

    /* 未发布文档仅管理员可见(预览态, 页面挂「未发布」徽章); 游客 404 */
    private function authorizeVisible(Doc $doc): void
    {
        $user = Auth::user();
        if (!$doc->published && (!$user || !$user->isAdmin())) {
            abort(404);
        }
    }

    public static function sidebarDocs(): array
    {
        $user = Auth::user();
        $query = Doc::orderBy('sort')->orderBy('id');
        if (!$user || !$user->isAdmin()) {
            $query->where('published', true);
        }

        return $query->get(['id', 'slug', 'title', 'published'])->all();
    }

    /* 摘要: 去掉 Markdown 标记取前 60 字 */
    private function excerpt(string $content): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags(self::renderMarkdown($content))));

        return mb_substr($text, 0, 60).(mb_strlen($text) > 60 ? '…' : '');
    }

    public function index()
    {
        $user = Auth::user();
        $docs = Doc::orderBy('sort')->orderBy('id')->get();
        if (!$user || !$user->isAdmin()) {
            $docs = $docs->filter(fn ($d) => $d->published);
        }
        $list = $docs->map(fn (Doc $d) => [
            'slug' => $d->slug,
            'title' => $d->title,
            'published' => $d->published,
            'excerpt' => $this->excerpt($d->content),
            'updated' => optional($d->updated_at)->format('Y-m-d'),
        ])->values()->all();

        return view('docs.index')->with([
            'docs' => $list,
            'side' => self::sidebarDocs(),
        ]);
    }

    public function show(string $slug)
    {
        $doc = Doc::where('slug', $slug)->firstOrFail();
        $this->authorizeVisible($doc);

        return view('docs.show')->with([
            'doc' => $doc,
            'html' => self::renderMarkdown($doc->content),
            'side' => self::sidebarDocs(),
        ]);
    }

    /* ---------- 管理后台 ---------- */

    public function adminList()
    {
        $docs = Doc::orderBy('sort')->orderBy('id')->get()->map(fn (Doc $d) => [
            'id' => $d->id,
            'title' => $d->title,
            'slug' => $d->slug,
            'published' => $d->published,
            'sort' => $d->sort,
            'updated' => optional($d->updated_at)->format('Y-m-d H:i'),
        ])->all();

        return view('admin.docs')->with('docs', $docs);
    }

    public function create(Request $request)
    {
        /* Twig 无 old() 函数(坑 #10 同族), 重定向回的旧输入由控制器显式传入 */
        return view('admin.docs-form')
            ->with('doc', null)
            ->with('old', (array) $request->old());
    }

    private function validateDoc(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'title' => 'required|string|max:100',
            'slug' => ['required', 'regex:/^[a-z0-9-]{1,60}$/'],
            'content' => 'required|string|max:200000',
            'published' => 'nullable|in:1',
            'sort' => 'nullable|integer|min:0|max:9999',
        ]);
        $exists = Doc::where('slug', $data['slug'])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
        if ($exists) {
            abort(422, trans('admin.panel.docs.slug-taken'));
        }

        return $data;
    }

    public function store(Request $request)
    {
        $data = $this->validateDoc($request);
        Doc::create([
            'slug' => $data['slug'],
            'title' => $data['title'],
            'content' => $data['content'],
            'published' => isset($data['published']),
            'sort' => (int) ($data['sort'] ?? 0),
            'updated_by' => optional(Auth::user())->uid,
        ]);

        return redirect('/admin/docs')->with('message', trans('admin.panel.docs.created'));
    }

    public function edit(Request $request, Doc $doc)
    {
        return view('admin.docs-form')
            ->with('doc', $doc)
            ->with('old', (array) $request->old());
    }

    public function update(Request $request, Doc $doc)
    {
        $data = $this->validateDoc($request, $doc->id);
        $doc->update([
            'slug' => $data['slug'],
            'title' => $data['title'],
            'content' => $data['content'],
            'published' => isset($data['published']),
            'sort' => (int) ($data['sort'] ?? 0),
            'updated_by' => optional(Auth::user())->uid,
        ]);

        return redirect('/admin/docs')->with('message', trans('admin.panel.docs.updated'));
    }

    public function destroy(Doc $doc)
    {
        $doc->delete();

        return response()->json(['code' => 0, 'message' => trans('admin.panel.docs.deleted')]);
    }

    /* 编辑器实时预览: 返回渲染后的 HTML(与前台同一转义管线) */
    public function preview(Request $request)
    {
        $data = $request->validate(['content' => 'required|string|max:200000']);

        return response()->json([
            'code' => 0,
            'html' => self::renderMarkdown($data['content']),
        ]);
    }
}
