<?php

namespace App\Http\Controllers;

use App\Services\Plugin;
use App\Services\PluginManager;
use App\Services\Unzip;
use Composer\CaBundle\CaBundle;
use Composer\Semver\Comparator;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;

class MarketController extends Controller
{
    public function marketData(PluginManager $manager)
    {
        $plugins = $this->fetch()->map(function ($item) use ($manager) {
            $plugin = $manager->get($item['name']);

            if ($plugin) {
                $item['installed'] = $plugin->version;
                $item['can_update'] = Comparator::greaterThan($item['version'], $item['installed']);
            } else {
                $item['installed'] = false;
            }

            $requirements = Arr::get($item, 'require', []);
            unset($item['require']);
            $item['dependencies'] = [
                'all' => $requirements,
                'unsatisfied' => $manager->getUnsatisfied(new Plugin('', $item)),
            ];

            return $item;
        });

        return $plugins;
    }

    public function download(Request $request, PluginManager $manager, Unzip $unzip)
    {
        $name = $request->input('name');
        $plugins = $this->fetch();
        $metadata = $plugins->firstWhere('name', $name);

        if (!$metadata) {
            return json(trans('admin.plugins.market.non-existent', ['plugin' => $name]), 1);
        }

        $fakePlugin = new Plugin('', $metadata);
        $unsatisfied = $manager->getUnsatisfied($fakePlugin);
        $conflicts = $manager->getConflicts($fakePlugin);
        if ($unsatisfied->isNotEmpty() || $conflicts->isNotEmpty()) {
            $reason = $manager->formatUnresolved($unsatisfied, $conflicts);

            return json(trans('admin.plugins.market.unresolved'), 1, compact('reason'));
        }

        $path = tempnam(sys_get_temp_dir(), $name);
        $response = Http::withOptions([
            'sink' => $path,
            'verify' => CaBundle::getSystemCaRootBundlePath(),
        ])->get($metadata['dist']['url']);

        if ($response->ok()) {
            $unzip->extract($path, $manager->getPluginsDirs()->first());

            return json(trans('admin.plugins.market.install-success'), 0);
        } else {
            return json(trans('admin.download.errors.download', ['error' => $response->status()]), 1);
        }
    }

    protected function fetch(): Collection
    {
        $lang = in_array(app()->getLocale(), config('plugins.locales'))
            ? app()->getLocale()
            : config('app.fallback_locale');

        /* 多市场源逐一尝试, 单源失败(连不上/超时/非 200)跳过不拖垮整个市场——
           曾因 .env 指向的重定向目标源死亡, 市场接口 500 且同步阻塞主 worker 21 秒
           (php -S 单线程, 期间全站切页都在排队)。5 秒短超时保证最坏阻塞可控。 */
        $plugins = collect(explode(',', config('plugins.registry')))
            ->map(fn ($registry) => trim($registry))
            ->filter()
            ->flatMap(function ($registry) use ($lang) {
                $registry = str_replace('{lang}', $lang, $registry);
                try {
                    $response = Http::withOptions([
                        'verify' => CaBundle::getSystemCaRootBundlePath(),
                    ])->timeout(5)->get($registry);

                    if ($response->ok()) {
                        return collect($response->json()['packages'] ?? []);
                    }
                } catch (Exception $e) {
                    /* 源失效: 跳过该源 */
                }

                return collect();
            });

        /* 多源合并去重(镜像源内容重复) */
        return $plugins->unique('name')->values();
    }
}
