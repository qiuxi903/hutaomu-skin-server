<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/* 壁纸收藏(跟随登录态): 图片字节落私有磁盘 storage/wallpaper-fav/{uid}/,
   users.wallpaper_favorites 存索引 JSON [{f:文件名, t:时间戳, h:sha8}];
   换设备登录收藏即同步。上限 9 张(与面板 UI 一致), 单张解码后 ≤3MB */
class WallpaperController extends Controller
{
    public const MAX_FAVS = 9;
    public const MAX_BYTES = 3 * 1024 * 1024;

    private function entries(int $uid): array
    {
        $raw = optional(\App\Models\User::find($uid))->wallpaper_favorites;

        return $raw ? (json_decode($raw, true) ?: []) : [];
    }

    private function saveEntries(int $uid, array $entries): void
    {
        \App\Models\User::where('uid', $uid)->update([
            'wallpaper_favorites' => json_encode($entries, JSON_UNESCAPED_SLASHES),
        ]);
    }

    private function present(array $entry): array
    {
        return [
            'id' => $entry['f'],
            'url' => url('theme/wallpaper/favorites/'.$entry['f'].'/file'),
            'ts' => $entry['t'],
        ];
    }

    public function index(Request $request)
    {
        $uid = $request->user()->uid;

        return response()->json([
            'code' => 0,
            'data' => array_map([$this, 'present'], $this->entries($uid)),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'data' => 'required|string',
        ]);
        $uid = $request->user()->uid;

        /* dataURL 严格校验: 仅 png/jpeg/webp, 解码后 ≤3MB */
        if (!preg_match('/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+\/=]+)$/', $data['data'], $m)) {
            return response()->json(['code' => 1, 'message' => '不是受支持的图片格式'], 422);
        }
        $bytes = base64_decode($m[2], true);
        if ($bytes === false || strlen($bytes) > self::MAX_BYTES) {
            return response()->json(['code' => 1, 'message' => '图片过大（上限 3MB）'], 422);
        }

        $entries = $this->entries($uid);
        $hash = substr(sha1($bytes), 0, 10);
        foreach ($entries as $e) {
            if (($e['h'] ?? '') === $hash) {
                return response()->json(['code' => 0, 'duplicate' => true, 'message' => '已在收藏里', 'entry' => $this->present($e)]);
            }
        }
        if (count($entries) >= self::MAX_FAVS) {
            return response()->json(['code' => 1, 'message' => '收藏最多 '.self::MAX_FAVS.' 张'], 422);
        }

        $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
        $name = Str::random(12).'.'.$ext;
        Storage::disk('local')->put('wallpaper-fav/'.$uid.'/'.$name, $bytes);

        $entry = ['f' => $name, 't' => time(), 'h' => $hash];
        $entries[] = $entry;
        $this->saveEntries($uid, $entries);

        return response()->json([
            'code' => 0,
            'message' => '已收藏当前壁纸',
            'entry' => $this->present($entry),
        ]);
    }

    public function destroy(Request $request, string $id)
    {
        $uid = $request->user()->uid;
        /* 文件名白名单: 只允许我们生成的 12 位随机名.扩展名, 防路径穿越 */
        if (!preg_match('/^[A-Za-z0-9]{12}\.(png|jpe?g|webp)$/', $id)) {
            return response()->json(['code' => 1, 'message' => '无效的收藏'], 404);
        }

        $entries = $this->entries($uid);
        $kept = array_values(array_filter($entries, fn ($e) => $e['f'] !== $id));
        if (count($kept) === count($entries)) {
            return response()->json(['code' => 1, 'message' => '收藏不存在'], 404);
        }

        Storage::disk('local')->delete('wallpaper-fav/'.$uid.'/'.$id);
        $this->saveEntries($uid, $kept);

        return response()->json(['code' => 0, 'message' => '已删除']);
    }

    /* 图片字节流: 仅属主可取(索引在用户行上, 天然按账号隔离) */
    public function file(Request $request, string $id)
    {
        $uid = $request->user()->uid;
        if (!preg_match('/^[A-Za-z0-9]{12}\.(png|jpe?g|webp)$/', $id)) {
            abort(404);
        }

        $owned = collect($this->entries($uid))->contains(fn ($e) => $e['f'] === $id);
        abort_unless($owned, 404);

        $disk = Storage::disk('local');
        abort_if($disk->missing('wallpaper-fav/'.$uid.'/'.$id), 404);

        $ext = pathinfo($id, PATHINFO_EXTENSION);
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'][$ext];

        return response($disk->get('wallpaper-fav/'.$uid.'/'.$id), 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=604800, immutable',
        ]);
    }
}
