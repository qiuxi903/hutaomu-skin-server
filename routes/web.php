<?php

use App\Http\Middleware;
use App\Services\WallpaperCache;

/*
|--------------------------------------------------------------------------
| Application Routes
|--------------------------------------------------------------------------
|
| Here is where you can register all of the routes for an application.
| It's a breeze. Simply tell Laravel the URIs it should respond to
| and give it the controller to call when that URI is requested.
|
*/

Route::get('', 'HomeController@index');

/* 暖樱白主题: 壁纸图源服务端中继。
   浏览器直连图源没有 CORS 头(图无法转 dataURL 保存/收藏), weserv 代理又
   只放行 paugram——由本站后端随机挑一个后台配置的源抓图, 同源返回。
   逐源回退, 全挂时 502; 仅请求后台配置的固定源, 不是开放代理。

   2026-11-24 性能改造: php -S 在 Windows 上单线程, 旧版每次都同步直连图源,
   慢源时一次请求堵 8 秒以上——期间全站请求(含页面切换)都在排队。
   现改为磁盘缓存 + stale-while-revalidate(WallpaperCache):
   - 缓存期内(TTL 240s)瞬时回图(X-Wallpaper-Cache: HIT);
   - 过期先回旧图(STALE)并派发独立 PHP 进程后台刷新(wallpaper-worker.php),
     慢图源下载完全不占用主 worker;
   - fresh=1(手动「换一张」)同步抓新图并更新缓存;
   - 同步抓新但全源挂时兜底回旧缓存(有的话), 没有才 502。 */
Route::get('theme/wallpaper', function (\Illuminate\Http\Request $request) {
    $mobile = $request->boolean('mobile');
    $fresh = $request->boolean('fresh');

    $cachedResponse = function (string $state) use ($mobile) {
        $meta = WallpaperCache::meta($mobile);
        $bin = WallpaperCache::paths($mobile)['bin'];
        if (!$meta || !is_file($bin)) {
            abort(502, 'wallpaper cache missing');
        }

        return response(file_get_contents($bin), 200, [
            'Content-Type' => $meta['type'] ?? 'image/jpeg',
            'Cache-Control' => 'no-store',
            'X-Wallpaper-Source' => $meta['source'] ?? '',
            'X-Wallpaper-Cache' => $state,
        ]);
    };

    /* 缓存语义: 手动换一张(fresh)必抓新图; 自动预取走缓存/过期回旧图+后台刷新 */
    if (!$fresh) {
        $age = WallpaperCache::age($mobile);
        if ($age !== null && $age <= WallpaperCache::TTL) {
            return $cachedResponse('HIT');
        }
        if ($age !== null) {
            WallpaperCache::spawnRefresh($mobile);

            return $cachedResponse('STALE');
        }
    }

    /* 同步抓新: 手动换一张, 或首次(尚无缓存) */
    $result = WallpaperCache::fetchAndStore($mobile);
    if ($result) {
        $meta = $result['meta'];

        return response(file_get_contents($result['bin']), 200, [
            'Content-Type' => $meta['type'],
            'Cache-Control' => 'no-store',
            'X-Wallpaper-Source' => $meta['source'],
            'X-Wallpaper-Cache' => 'FRESH',
        ]);
    }

    /* 全部图源失败: 兜底回旧缓存(若有), 没有才 502 */
    if (WallpaperCache::age($mobile) !== null) {
        return $cachedResponse('STALE-FALLBACK');
    }

    abort(502, 'all wallpaper sources failed');
})->name('theme.wallpaper');

/* 「换一张」异步化：派发后台刷新进程（独立 PHP 进程，慢源下载零占主 worker）
   并立即返回当前缓存版本号(mtime)。JS 轮询 status 直到版本变化(新图落盘)
   再回源取图(此时为 HIT 瞬时)——手动换一张的等待期间页面切换完全不受影响。
   throttle 防止进程派发被滥用。 */
Route::get('theme/wallpaper/refresh', function (\Illuminate\Http\Request $request) {
    $mobile = $request->boolean('mobile');
    $from = WallpaperCache::mtime($mobile);
    WallpaperCache::spawnRefresh($mobile);

    return json(['code' => 0, 'from' => $from]);
})->middleware('throttle:10,1');

Route::get('theme/wallpaper/refresh/status', function (\Illuminate\Http\Request $request) {
    $mobile = $request->boolean('mobile');
    $from = (int) $request->query('from', '0');
    $now = WallpaperCache::mtime($mobile);

    return json(['code' => 0, 'ready' => $now > 0 && $now > $from, 'now' => $now]);
});

Route::prefix('auth')->name('auth.')->group(function () {
    Route::middleware('guest')->group(function () {
        Route::get('login', 'AuthController@login')->name('login');
        Route::post('login', 'AuthController@handleLogin');

        Route::get('register', 'AuthController@register')->name('register');
        Route::post('register', 'AuthController@handleRegister');

        Route::get('forgot', 'AuthController@forgot')->name('forgot');
        Route::post('forgot', 'AuthController@handleForgot');

        Route::get('reset/{uid}', 'AuthController@reset')->name('reset');
        Route::post('reset/{uid}', 'AuthController@handleReset');
    });

    Route::post('logout', 'AuthController@logout')->name('logout')->middleware('authorize');
    Route::any('captcha', 'AuthController@captcha');

    Route::middleware(['authorize', Middleware\EnsureEmailFilled::class])
        ->group(function () {
            Route::view('bind', 'auth.bind');
            Route::post('bind', 'AuthController@fillEmail');
        });

    Route::get('verify/{user}', 'AuthController@verify')->name('verify');
    Route::post('verify/{user}', 'AuthController@handleVerify');
});

Route::prefix('user')
    ->name('user.')
    ->middleware(['authorize'])
    ->group(function () {
        Route::get('', 'UserController@index')->name('home');
        Route::post('notifications/{id}', 'NotificationsController@read')->name('notification');
        Route::get('score-info', 'UserController@scoreInfo')->name('score');
        Route::post('sign', 'UserController@sign')->name('sign');

        Route::get('reports', 'ReportController@track');

        Route::prefix('profile')->name('profile.')->group(function () {
            Route::get('', 'UserController@profile');
            Route::post('', 'UserController@handleProfile');
            Route::post('avatar', 'UserController@setAvatar')->name('avatar');
        });

        Route::post('email-verification', 'UserController@sendVerificationEmail');

        Route::put('dark-mode', 'UserController@toggleDarkMode');

        Route::prefix('player')
            ->name('player.')
            ->middleware('verified')
            ->group(function () {
                Route::get('', 'PlayerController@index')->name('page');
                Route::get('list', 'PlayerController@list')->name('list');
                Route::post('', 'PlayerController@add')->name('add');
                Route::put('{player}/textures', 'PlayerController@setTexture')->name('set');
                Route::delete('{player}/textures', 'PlayerController@clearTexture')->name('clear');
                Route::put('{player}/name', 'PlayerController@rename')->name('rename');
                Route::delete('{player}', 'PlayerController@delete')->name('delete');
            });

        Route::prefix('closet')->name('closet.')->group(function () {
            Route::get('', 'ClosetController@index')->name('page');
            Route::get('list', 'ClosetController@getClosetData')->name('list');
            Route::get('ids', 'ClosetController@allIds')->name('ids');
            Route::post('', 'ClosetController@add')->name('add');
            Route::put('{tid}', 'ClosetController@rename')->name('rename');
            Route::delete('{tid}', 'ClosetController@remove')->name('remove');
        });

        // OAuth2 Management
        Route::view('oauth/manage', 'user.oauth')->middleware('verified');
    });

Route::prefix('texture')->name('texture.')->group(function () {
    Route::get('{texture}', 'SkinlibController@info')->name('info');
    Route::middleware(['authorize', 'verified'])->group(function () {
        Route::post('', 'SkinlibController@handleUpload')->name('upload');
        Route::prefix('{texture}')->group(function () {
            Route::put('type', 'SkinlibController@type')->name('type');
            Route::put('name', 'SkinlibController@rename')->name('name');
            Route::put('privacy', 'SkinlibController@privacy')->name('privacy');
            Route::delete('', 'SkinlibController@delete')->name('delete');
        });
    });
});

Route::prefix('skinlib')->name('skinlib.')->group(function () {
    Route::get('', 'SkinlibController@index')->name('home');
    Route::get('info/{texture}', 'SkinlibController@info')->name('info');
    Route::get('show/{texture}', 'SkinlibController@show')->name('show');
    Route::get('list', 'SkinlibController@library')->name('list');

    Route::middleware(['authorize', 'verified'])->group(function () {
        Route::get('upload', 'SkinlibController@upload');
        Route::post('report', 'ReportController@submit');
    });
});

// 材质评论区(皮肤/披风共用详情页): 游客可读已通过评论, 登录可发(限流), 作者/管理员可删
// 可见性与详情页同规则(私密材质仅上传者与管理员), 校验在 CommentController
Route::get('skinlib/show/{texture}/comments', 'CommentController@index');

// 材质预览动态路由(衣柜/角色页等旧引用): 自 static.php 迁入带会话的 web 组,
// 私密材质按观看者校验可见性(原静态路由无会话, 私密预览图存在越权泄露);
// 公开材质由控制器读穿 public/previews 静态文件, 免 GD 渲染排队
Route::get('preview/hash/{hash}', 'TextureController@previewByHash');
Route::get('preview/{texture}', 'TextureController@preview');
Route::middleware('authorize')->group(function () {
    Route::post('skinlib/show/{texture}/comments', 'CommentController@store')
        ->middleware('throttle:comments');
    Route::delete('comments/{comment}', 'CommentController@destroy');
    /* 评论举报: 与材质举报同一 reports 表(type 分区), 后台举报管理分 Tab 展示 */
    Route::post('comments/{comment}/report', 'ReportController@submitComment')
        ->middleware(['verified', 'throttle:comments']);

    // 壁纸收藏(跟随登录态): 索引在 users.wallpaper_favorites, 字节在私有磁盘
    Route::get('theme/wallpaper/favorites', 'WallpaperController@index');
    Route::post('theme/wallpaper/favorites', 'WallpaperController@store')
        ->middleware('throttle:comments');
    Route::delete('theme/wallpaper/favorites/{id}', 'WallpaperController@destroy');
    Route::get('theme/wallpaper/favorites/{id}/file', 'WallpaperController@file');
});

// 关于页: 源项目地址 / 开源组件鸣谢 / 本分支修改清单, 公开可访问
Route::view('about', 'about');

// 站点文档(/docs): 公开读已发布文档; 未发布仅管理员可预览(404 兜底)
Route::get('docs', 'DocsController@index');
Route::get('docs/{slug}', 'DocsController@show');

Route::prefix('admin')
    ->name('admin.')
    ->middleware(['authorize', 'role:admin'])
    ->group(function () {
        Route::get('', 'AdminController@index');
        Route::get('chart', 'AdminController@chartData');
        Route::post('notifications/send', 'NotificationsController@send');

        // 个性化(暖樱白主题专属配置): 主题本体为源码资产 site/public/theme/, 见 shared/head.twig
        Route::any('theme', 'OptionsController@theme');
        Route::post('theme/sidebar', 'OptionsController@saveSidebar');

        // 材质评论管理: 总开关/审核开关 + 待审队列(通过/删除, 删除走前台同一接口)
        Route::any('comments', 'CommentController@adminPage');
        Route::post('comments/{comment}/approve', 'CommentController@approve');

        // 站点文档管理: 管理员撰写教程/更新文档(Markdown + 实时预览)
        Route::post('docs/preview', 'DocsController@preview');
        Route::get('docs/create', 'DocsController@create');
        Route::post('docs', 'DocsController@store');
        Route::get('docs/{doc}/edit', 'DocsController@edit');
        Route::put('docs/{doc}', 'DocsController@update');
        Route::delete('docs/{doc}', 'DocsController@destroy');
        Route::get('docs', 'DocsController@adminList');
        Route::any('score', 'OptionsController@score');
        Route::any('options', 'OptionsController@options');
        Route::any('resource', 'OptionsController@resource');

        Route::get('status', 'AdminController@status');

        Route::prefix('users')->name('users.')->group(function () {
            Route::view('', 'admin.users');
            Route::get('list', 'UsersManagementController@list')->name('list');
            Route::prefix('{user}')->group(function () {
                Route::put('email', 'UsersManagementController@email')->name('email');
                Route::put('verification', 'UsersManagementController@verification')->name('verification');
                Route::put('nickname', 'UsersManagementController@nickname')->name('nickname');
                Route::put('password', 'UsersManagementController@password')->name('password');
                Route::put('score', 'UsersManagementController@score')->name('score');
                Route::put('permission', 'UsersManagementController@permission')->name('permission');
                Route::delete('', 'UsersManagementController@delete')->name('delete');
            });
        });

        Route::prefix('players')->name('players.')->group(function () {
            Route::view('', 'admin.players');
            Route::get('list', 'PlayersManagementController@list')->name('list');
            Route::prefix('{player}')->group(function () {
                Route::put('name', 'PlayersManagementController@name')->name('name');
                Route::put('owner', 'PlayersManagementController@owner')->name('owner');
                Route::put('textures', 'PlayersManagementController@texture')->name('texture');
                Route::delete('', 'PlayersManagementController@delete')->name('delete');
            });
        });

        Route::prefix('closet')->group(function () {
            Route::post('{user}', 'ClosetManagementController@add');
            Route::delete('{user}', 'ClosetManagementController@remove');
        });

        Route::prefix('reports')->group(function () {
            // 服务端渲染双 Tab(材质举报/评论举报分区), 取代原 React 页
            Route::get('', 'ReportController@adminPage');
            Route::put('{report}', 'ReportController@review');
            Route::get('list', 'ReportController@manage');
        });

        Route::prefix('i18n')->group(function () {
            Route::view('', 'admin.i18n');
            Route::get('list', 'TranslationsController@list');
            Route::post('', 'TranslationsController@create');
            Route::put('{line}', 'TranslationsController@update');
            Route::delete('{line}', 'TranslationsController@delete');
        });

        Route::prefix('plugins')->group(function () {
            Route::get('data', 'PluginController@getPluginData');

            Route::view('manage', 'admin.plugins');
            Route::post('manage', 'PluginController@manage');
            Route::any('config/{name}', 'PluginController@config');
            Route::get('readme/{name}', 'PluginController@readme');
            Route::middleware('role:super-admin')->group(function () {
                Route::post('upload', 'PluginController@upload');
                Route::post('wget', 'PluginController@wget');
            });

            Route::prefix('market')->group(function () {
                Route::view('', 'admin.market');
                Route::get('list', 'MarketController@marketData');
                Route::post('download', 'MarketController@download');
            });
        });

        Route::prefix('update')->middleware('role:super-admin')->group(function () {
            Route::get('', 'UpdateController@showUpdatePage');
            Route::post('download', 'UpdateController@download');
        });
    });

Route::prefix('setup')->group(function () {
    Route::middleware('setup')->group(function () {
        Route::view('', 'setup.wizard.welcome');
        Route::any('database', 'SetupController@database');
        Route::view('info', 'setup.wizard.info');
        Route::post('finish', 'SetupController@finish');
    });
});

Route::prefix('.well-known')->group(function () {
    Route::redirect('change-password', '/user/profile');
});
