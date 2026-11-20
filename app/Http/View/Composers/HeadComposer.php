<?php

namespace App\Http\View\Composers;

use Blessing\Filter;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\View\View;

class HeadComposer
{
    protected Dispatcher $dispatcher;

    protected Request $request;

    protected Filter $filter;

    public function __construct(
        Dispatcher $dispatcher,
        Request $request,
        Filter $filter
    ) {
        $this->dispatcher = $dispatcher;
        $this->request = $request;
        $this->filter = $filter;
    }

    public function compose(View $view)
    {
        $this->addFavicon($view);
        $this->applyThemeColor($view);
        $this->seo($view);
        $this->injectStyles($view);
        $this->addExtra($view);
        $this->serializeGlobals($view);
    }

    public function addFavicon(View $view)
    {
        $url = option('favicon_url', config('options.favicon_url'));
        $url = Str::startsWith($url, 'http') ? $url : url($url);
        $view->with('favicon', $url);
    }

    public function applyThemeColor(View $view)
    {
        $colors = [
            'primary' => '#007bff',
            'secondary' => '#6c757d',
            'success' => '#28a745',
            'warning' => '#ffc107',
            'danger' => '#dc3545',
            'navy' => '#001f3f',
            'olive' => '#3d9970',
            'lime' => '#01ff70',
            'fuchsia' => '#f012be',
            'maroon' => '#d81b60',
            'indigo' => '#6610f2',
            'purple' => '#6f42c1',
            'pink' => '#e83e8c',
            'orange' => '#fd7e14',
            'teal' => '#20c997',
            'cyan' => '#17a2b8',
            'gray' => '#6c757d',
        ];
        $view->with('theme_color', Arr::get($colors, option('navbar_color')));
    }

    public function seo(View $view)
    {
        $view->with('seo', [
            'keywords' => option('meta_keywords'),
            'description' => option('meta_description'),
            'extra' => option('meta_extras'),
        ]);
    }

    public function injectStyles(View $view)
    {
        $links = [];
        $links = $this->filter->apply('head_links', $links);
        $view->with('links', $links);
        $view->with('custom_cdn_host', option('cdn_address'));
    }

    public function addExtra(View $view)
    {
        $content = [];
        $this->dispatcher->dispatch(new \App\Events\RenderingHeader($content));
        $view->with('extra_head', $content);
    }

    public function serializeGlobals(View $view)
    {
        /* 暖樱白主题个性化配置: 后台「个性化」页写入 options, JS 侧读此数组 */
        $sources = array_values(array_filter(array_map('trim', preg_split(
            '/\r\n|\r|\n/',
            (string) option('theme_wallpaper_sources', '')
        )), function ($line) {
            return $line !== '';
        }));

        $dim = (float) option('theme_panel_dim', '0.5');
        if ($dim <= 0 || $dim > 1) {
            $dim = 0.5;
        }

        $blessing = [
            'version' => config('app.version'),
            'locale' => config('app.locale'),
            'base_url' => url('/'),
            'site_name' => option_localized('site_name'),
            'route' => request()->path(),
            'theme' => [
                /* option() 已把 'true'/'0' 自动转成布尔, 这里只做规范化 */
                'panel_wallpaper' => (bool) option('theme_panel_wallpaper'),
                'petals' => (bool) option('theme_petals'),
                'panel_dim' => $dim,
                'sources' => $sources,
            ],
        ];
        $view->with('blessing', $blessing);
    }
}
