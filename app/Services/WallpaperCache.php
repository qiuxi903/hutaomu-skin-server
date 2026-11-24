<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;

/**
 * 壁纸磁盘缓存 + 后台刷新派发。
 *
 * 背景：php -S 在 Windows 上单线程，/theme/wallpaper 中继每次都直连外部图源，
 * 慢源时一次请求可堵 8 秒以上——期间全站所有请求（含切页）都在排队。
 * 引入 stale-while-revalidate：缓存期内瞬时回图；过期先回旧图并派发独立
 * PHP 进程后台刷新（分离开不占主 worker），彻底消除预取对切页的阻塞。
 *
 * 缓存文件：storage/app/wallpaper-cache/{desktop|mobile}.bin（图字节）
 *           + 同名 .meta（JSON：type/source/time）；锁 refresh-{...}.lock。
 */
class WallpaperCache
{
    /** 缓存有效期（秒）：比最短自动切换档（5 分）略短，过期由后台刷新补新 */
    public const TTL = 240;

    /** 后台刷新锁的存活时间（秒）：防 worker 堆积 */
    public const LOCK_TTL = 30;

    public static function dir(): string
    {
        return storage_path('app/wallpaper-cache');
    }

    /** @return array{bin: string, meta: string, lock: string} */
    public static function paths(bool $mobile): array
    {
        $name = $mobile ? 'mobile' : 'desktop';

        return [
            'bin' => self::dir()."/{$name}.bin",
            'meta' => self::dir()."/{$name}.meta",
            'lock' => self::dir()."/refresh-{$name}.lock",
        ];
    }

    public static function meta(bool $mobile): ?array
    {
        $meta = self::paths($mobile)['meta'];

        return is_file($meta) ? json_decode((string) file_get_contents($meta), true) : null;
    }

    /** 缓存年龄（秒）；无缓存返回 null */
    public static function age(bool $mobile): ?int
    {
        $bin = self::paths($mobile)['bin'];

        return is_file($bin) ? (time() - (int) filemtime($bin)) : null;
    }

    /** 图源挑选：与旧中继逻辑一致（逐行取配置，移动端无配置时回退桌面源） */
    public static function pickSources(bool $mobile): array
    {
        $pick = function (string $key) {
            return array_values(array_filter(array_map('trim', preg_split(
                '/\r\n|\r|\n/',
                (string) option($key, '')
            )), function ($line) {
                return $line !== '';
            }));
        };

        $sources = $mobile ? $pick('theme_mobile_wallpaper_sources') : $pick('theme_wallpaper_sources');
        if (!$sources && $mobile) {
            $sources = $pick('theme_wallpaper_sources');
        }
        if (!$sources) {
            $sources = ['https://api.paugram.com/wallpaper/'];
        }
        shuffle($sources);

        return $sources;
    }

    /** 逐源抓取（任一成功即止）并原子写缓存；全挂返回 null */
    public static function fetchAndStore(bool $mobile): ?array
    {
        if (!is_dir(self::dir())) {
            @mkdir(self::dir(), 0755, true);
        }

        foreach (self::pickSources($mobile) as $url) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_SSL_VERIFYPEER => false, // 自用站点, 个别图源证书链不全
                /* 固定桌面 UA: loliapi 按 UA 跳「手机池」端点(当前 404), 桌面池才可用 */
                CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ]);
            $body = curl_exec($ch);
            $ctype = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $errno = curl_errno($ch);
            curl_close($ch);

            if ($errno || $code < 200 || $code >= 300 || !is_string($body)
                || !$ctype || stripos($ctype, 'image/') !== 0 || strlen($body) <= 20000) {
                continue;
            }

            $meta = json_encode([
                'type' => $ctype,
                'source' => $url,
                'time' => time(),
                'mobile' => $mobile,
            ], JSON_UNESCAPED_SLASHES);

            /* 原子写：先 tmp 再 rename，避免读到半张图 */
            $paths = self::paths($mobile);
            $ok = file_put_contents($paths['bin'].'.tmp', $body) !== false
                && file_put_contents($paths['meta'].'.tmp', $meta) !== false
                && @rename($paths['bin'].'.tmp', $paths['bin'])
                && @rename($paths['meta'].'.tmp', $paths['meta']);

            return $ok ? ['bin' => $paths['bin'], 'meta' => json_decode($meta, true)] : null;
        }

        return null;
    }

    /** 后台刷新锁是否仍在有效期内（worker 正在跑） */
    public static function lockFresh(bool $mobile): bool
    {
        $lock = self::paths($mobile)['lock'];

        return is_file($lock) && (time() - (int) filemtime($lock)) < self::LOCK_TTL;
    }

    public static function acquireLock(bool $mobile): void
    {
        @file_put_contents(self::paths($mobile)['lock'], (string) time());
    }

    public static function releaseLock(bool $mobile): void
    {
        @unlink(self::paths($mobile)['lock']);
    }

    /**
     * 派发后台刷新（分离进程，Windows/Linux 双形态）。
     * php -S 单线程下这是唯一不阻塞主 worker 的后台工作方式。
     * 这里只做「锁新鲜则不派发」的去重；锁由 worker 自持（acquire→干活→release），
     * 派发端提前写锁会让 worker 误判"已在跑"而空转退出。
     */
    public static function spawnRefresh(bool $mobile): void
    {
        if (self::lockFresh($mobile)) {
            return; /* 已有 worker 在跑, 不堆积 */
        }

        $script = base_path('wallpaper-worker.php');
        $arg = $mobile ? ' --mobile' : '';

        if (PHP_OS_FAMILY === 'Windows') {
            /* start /B 的第一个引号串是窗口标题占位; pclose 立即返回不等待 */
            pclose(popen('start /B "" '.escapeshellarg(PHP_BINARY).' '.escapeshellarg($script).$arg, 'r'));
        } else {
            shell_exec(escapeshellarg(PHP_BINARY).' '.escapeshellarg($script).$arg.' > /dev/null 2>&1 &');
        }
    }
}
