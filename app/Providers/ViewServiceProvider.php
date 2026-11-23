<?php

namespace App\Providers;

use App\Http\View\Composers;
use Illuminate\Support\ServiceProvider;
use View;

class ViewServiceProvider extends ServiceProvider
{
    public function boot()
    {
        View::composer([
            'home',
            'about',
            'docs.*',
            '*.base',
            '*.master',
            'shared.header',
        ], function ($view) {
            $lightColors = ['light', 'warning', 'white', 'orange'];
            $color = option('navbar_color');
            $view->with([
                'site_name' => option_localized('site_name'),
                'navbar_color' => $color,
                'color_mode' => in_array($color, $lightColors) ? 'light' : 'dark',
                'dark_mode' => (bool) optional(auth()->user())->is_dark_mode,
                'locale' => str_replace('_', '-', app()->getLocale()),
            ]);
        });

        View::composer('shared.head', Composers\HeadComposer::class);

        View::composer('shared.notifications', function ($view) {
            $notifications = auth()->user()->unreadNotifications->map(function ($notification) {
                return [
                    'id' => $notification->id,
                    'title' => $notification->data['title'],
                ];
            });
            $view->with(['notifications' => $notifications]);
        });

        View::composer(
            ['shared.languages', 'errors.*'],
            Composers\LanguagesMenuComposer::class
        );

        View::composer('shared.user-menu', Composers\UserMenuComposer::class);

        View::composer('shared.sidebar', function ($view) {
            $isDarkMode = (bool) optional(auth()->user())->is_dark_mode;
            $color = option('sidebar_color');
            $color = $isDarkMode ? str_replace('light', 'dark', $color) : $color;

            $view->with('sidebar_color', $color);
        });

        View::composer(['shared.side-menu', 'shared.sidebar'], Composers\SideMenuComposer::class);

        View::composer('shared.user-panel', Composers\UserPanelComposer::class);

        View::composer('shared.copyright', function ($view) {
            /* 页尾由后台「个性化」的 theme_footer_text / theme_icp 驱动,
               {year} 自动替换为当前年份, 旧的 copyright_prefer/copyright_text 链路已移除 */
            $view->with([
                'footer_text' => str_replace(
                    ['{year}', '{site_name}', '{site_url}'],
                    [date('Y'), option_localized('site_name'), url('/')],
                    option('theme_footer_text')
                ),
                'icp' => option('theme_icp'),
            ]);
        });

        View::composer('shared.foot', Composers\FootComposer::class);

        View::composer('shared.dark-mode', function ($view) {
            $view->with([
                'dark_mode' => (bool) optional(auth()->user())->is_dark_mode,
            ]);
        });

        View::composer('assets.*', function ($view) {
            $view->with('cdn_base', option('cdn_address', ''));
        });
    }
}
