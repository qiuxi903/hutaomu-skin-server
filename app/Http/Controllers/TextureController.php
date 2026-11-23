<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Models\Texture;
use App\Models\User;
use Blessing\Minecraft;
use Cache;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Image;
use Storage;

class TextureController extends Controller
{
    public function __construct()
    {
        $this->middleware('cache.headers:public;max_age='.option('cache_expire_time'))
            ->only(['json']);

        $this->middleware('cache.headers:etag;public;max_age='.option('cache_expire_time'))
            ->only([
                'preview',
                'raw',
                'texture',
                'avatarByPlayer',
                'avatarByUser',
                'avatarByTexture',
            ]);
    }

    public function json($player)
    {
        $player = Player::where('name', $player)->firstOrFail();
        $isBanned = $player->user->permission === User::BANNED;
        abort_if($isBanned, 403, trans('general.player-banned'));

        return response()->json($player)->setLastModified($player->last_modified);
    }

    public function previewByHash(Minecraft $minecraft, Request $request, $hash)
    {
        $texture = Texture::where('hash', $hash)->firstOrFail();

        return $this->preview($minecraft, $request, $texture);
    }

    public function preview(Minecraft $minecraft, Request $request, Texture $texture)
    {
        $tid = $texture->tid;
        $hash = $texture->hash;
        $usePNG = $request->has('png') || !(imagetypes() & IMG_WEBP);
        $format = $usePNG ? 'png' : 'webp';

        $disk = Storage::disk('textures');
        abort_if($disk->missing($hash), 404);

        /* 私密材质可见性(与详情页同规则): 路由迁入 web 组后才有会话可校验 */
        $user = $request->user();
        if (!$texture->public && (!$user || ($user->uid != $texture->uploader && !$user->isAdmin()))) {
            $statusCode = (int) option('status_code_for_private');
            abort($statusCode === 404 ? 404 : 403, trans('skinlib.show.private'));
        }

        $height = (int) $request->query('height', 200);

        /* 读穿: 公开材质的落盘静态预览直接回——衣柜/角色页等动态引用每张 ~0.47s
           的 GD 渲染在 php -S 单线程下串行排队, 是「图片加载非常慢」的主因 */
        $staticFile = public_path('previews/'.$tid.'.'.$format);
        if ($texture->public && is_file($staticFile)) {
            return response(file_get_contents($staticFile), 200, [
                'Content-Type' => $usePNG ? 'image/png' : 'image/webp',
                'Cache-Control' => 'public, max-age=604800, immutable',
            ]);
        }
        $now = Carbon::now();
        $response = Cache::remember(
            'preview-t'.$tid."-$format",
            option('enable_preview_cache') ? $now->addYear() : $now->addMinute(),
            function () use ($minecraft, $disk, $texture, $hash, $height, $usePNG) {
                $file = $disk->get($hash);
                if ($texture->type === 'cape') {
                    $image = $minecraft->renderCape($file, $height);
                } else {
                    $image = $minecraft->renderSkin($file, 12, $texture->type === 'alex');
                }

                $lastModified = $disk->lastModified($hash);

                $rendered = Image::make($image)->response($usePNG ? 'png' : 'webp', 100)
                    ->setLastModified(Carbon::createFromTimestamp($lastModified))
                    /* 浏览器缓存 7 天: 预览与 tid 一一对应(材质不可变), 重复浏览
                       免重拉 24 张图——皮肤库刷新慢的主因 */
                    ->header('Cache-Control', 'public, max-age=604800, immutable');
                /* 静态化: 公开材质的预览落盘 public/previews/{tid}.{ext},
                   列表页直接取静态文件(php -S 秒回), 私密材质不入盘(防绕过访问控制) */
                if ($texture->public && !$disk->missing($hash)) {
                    $staticDir = public_path('previews');
                    if (!is_dir($staticDir)) {
                        @mkdir($staticDir, 0755, true);
                    }
                    @file_put_contents(
                        $staticDir.'/'.$tid.($usePNG ? '.png' : '.webp'),
                        $rendered->getContent()
                    );
                }
                return $rendered;
            }
        );

        return $response;
    }

    public function raw($tid)
    {
        abort_unless(option('allow_downloading_texture'), 403);

        $texture = Texture::findOrFail($tid);

        return $this->texture($texture->hash);
    }

    public function texture(string $hash)
    {
        $disk = Storage::disk('textures');
        abort_if($disk->missing($hash), 404);

        $lastModified = Carbon::createFromTimestamp($disk->lastModified($hash));

        return response($disk->get($hash))
            ->withHeaders([
                'Content-Type' => 'image/png',
                'Content-Length' => $disk->size($hash),
            ])
            ->setLastModified($lastModified);
    }

    public function avatarByPlayer(Minecraft $minecraft, Request $request, $name)
    {
        $player = Player::where('name', $name)->firstOrFail();

        return $this->avatar($minecraft, $request, $player->skin);
    }

    public function avatarByUser(Minecraft $minecraft, Request $request, $uid)
    {
        $texture = Texture::find(optional(User::find($uid))->avatar);

        return $this->avatar($minecraft, $request, $texture);
    }

    public function avatarByHash(Minecraft $minecraft, Request $request, $hash)
    {
        $texture = Texture::where('hash', $hash)->first();

        return $this->avatar($minecraft, $request, $texture);
    }

    public function avatarByTexture(Minecraft $minecraft, Request $request, $tid)
    {
        $texture = Texture::find($tid);

        return $this->avatar($minecraft, $request, $texture);
    }

    protected function avatar(Minecraft $minecraft, Request $request, ?Texture $texture)
    {
        if (!empty($texture) && $texture->type !== 'steve' && $texture->type !== 'alex') {
            return abort(422);
        }

        $size = (int) $request->query('size', 100);
        $mode = $request->has('3d') ? '3d' : '2d';
        $usePNG = $request->has('png') || !(imagetypes() & IMG_WEBP);
        $format = $usePNG ? 'png' : 'webp';

        $disk = Storage::disk('textures');
        if (is_null($texture) || $disk->missing($texture->hash)) {
            return Image::make(resource_path("misc/textures/avatar$mode.png"))
                ->resize($size, $size)
                ->response($usePNG ? 'png' : 'webp', 100);
        }

        $hash = $texture->hash;
        $now = Carbon::now();
        $response = Cache::remember(
            'avatar-'.$mode.'-t'.$texture->tid.'-s'.$size."-$format",
            option('enable_avatar_cache') ? $now->addYear() : $now->addMinute(),
            function () use ($minecraft, $disk, $hash, $size, $mode, $usePNG) {
                $file = $disk->get($hash);
                if ($mode === '3d') {
                    $image = $minecraft->render3dAvatar($file, 25);
                } else {
                    $image = $minecraft->render2dAvatar($file, 25);
                }

                $lastModified = Carbon::createFromTimestamp($disk->lastModified($hash));

                return Image::make($image)
                    ->resize($size, $size)
                    ->response($usePNG ? 'png' : 'webp', 100)
                    ->setLastModified($lastModified);
            }
        );

        return $response;
    }
}
