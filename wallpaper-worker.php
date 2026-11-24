<?php

/* 壁纸缓存后台刷新进程 —— 由 /theme/wallpaper 中继在缓存过期时以分离进程派发
   （WallpaperCache::spawnRefresh），使慢图源下载完全不占用 php -S 的唯一 worker，
   页面切换不再被壁纸预取阻塞。参数：--mobile 刷新移动端缓存，缺省刷桌面端。 */

require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Services\WallpaperCache;

$mobile = in_array('--mobile', $argv, true);

/* 锁在派发端已检查过一次；worker 里再核一遍防窗口期堆积 */
if (WallpaperCache::lockFresh($mobile)) {
    exit(0);
}

WallpaperCache::acquireLock($mobile);
WallpaperCache::fetchAndStore($mobile);
WallpaperCache::releaseLock($mobile);
