<?php

namespace App\Http\Controllers;

use App\Http\View\Composers\SideMenuComposer;
use App\Services\Facades\Option;
use App\Services\OptionForm;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class OptionsController extends Controller
{
    /**
     * 暖樱白主题专属「个性化」页: 只暴露主题真正的功能开关(壁纸/柔光/樱花/图源),
     * 不再提供原生 CSS/JS 注入; 主题本体是源码资产 site/public/theme/。
     */
    public function theme()
    {
        /* 文案走 admin.panel.forms 翻译组(四语言), 见 resources/lang 下的 admin.yml */
        $wallpaper = Option::form('themeWallpaper', trans('admin.panel.forms.theme-wallpaper-title'), function ($form) {
            $form->checkbox('theme_panel_wallpaper', trans('admin.panel.forms.theme-wallpaper-enabled'))
                ->description(trans('admin.panel.forms.theme-wallpaper-enabled-desc'));

            $form->select('theme_panel_dim', trans('admin.panel.forms.theme-dim'))
                ->option('0.35', trans('admin.panel.forms.theme-dim-light'))
                ->option('0.5', trans('admin.panel.forms.theme-dim-medium'))
                ->option('0.65', trans('admin.panel.forms.theme-dim-heavy'))
                ->description(trans('admin.panel.forms.theme-dim-desc'));

            $form->textarea('theme_wallpaper_sources', trans('admin.panel.forms.theme-sources'))
                ->rows(6)
                ->description(trans('admin.panel.forms.theme-sources-desc'));

            $form->textarea('theme_mobile_wallpaper_sources', trans('admin.panel.forms.theme-sources-mobile'))
                ->rows(3)
                ->description(trans('admin.panel.forms.theme-sources-mobile-desc'));
        })->handle();

        $effects = Option::form('themeEffects', trans('admin.panel.forms.theme-effects-title'), function ($form) {
            $form->checkbox('theme_petals', trans('admin.panel.forms.theme-petals'))
                ->description(trans('admin.panel.forms.theme-petals-desc'));
        })->handle();

        $footer = Option::form('themeFooter', trans('admin.panel.forms.theme-footer-title'), function ($form) {
            $form->text('theme_footer_text', trans('admin.panel.forms.theme-footer-text'))
                ->description(trans('admin.panel.forms.theme-footer-text-desc'));

            $form->text('theme_icp', trans('admin.panel.forms.theme-icp'))
                ->description(trans('admin.panel.forms.theme-icp-desc'));
        })->handle();

        /* 侧边栏自定义编辑器: 应用自定义后的完整嵌套树(翻译标题) */
        /* keepHidden=true: 隐藏项在编辑器里保留(灰显可恢复), 只有前台渲染才剔除 */
        $sidebarTree = SideMenuComposer::sidebarEditorTree(true, true);

        return view('admin.theme')->with([
            'forms' => compact('wallpaper', 'effects', 'footer'),
            'sidebarTree' => json_encode($sidebarTree, JSON_UNESCAPED_UNICODE),
            'sidebarGroups' => [trans('general.explore'), trans('general.user-center')],
        ]);
    }

    /* 保存侧边栏自定义(嵌套树: 顺序/分组/显隐/改名/子项/自定义链接) */
    public function saveSidebar(Request $request)
    {
        $items = $request->input('items');
        if (!is_array($items)) {
            return json(trans('admin.panel.sidebar.invalid'), 1);
        }
        option(['sidebar_custom' => json_encode(
            $this->sanitizeSidebarItems($items),
            JSON_UNESCAPED_UNICODE
        )]);

        return json(trans('admin.panel.sidebar.updated'), 0);
    }

    /* 递归校验: 只保留白名单字段, 文本 strip_tags; 自定义项必须有链接 */
    private function sanitizeSidebarItems(array $items): array
    {
        $clean = [];
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $row = [
                'id' => strip_tags((string) $item['id']),
                'group' => strip_tags((string) Arr::get($item, 'group', '')),
                'hidden' => !empty($item['hidden']),
            ];
            if (Arr::get($item, 'custom')) {
                $row['custom'] = true;
                $row['link'] = strip_tags((string) Arr::get($item, 'link', '#'));
                $row['icon'] = strip_tags((string) Arr::get($item, 'icon', 'fa-link'));
                $row['title'] = strip_tags((string) Arr::get($item, 'title', '未命名'));
            } elseif (Arr::get($item, 'title')) {
                $row['title'] = strip_tags((string) Arr::get($item, 'title'));
            }
            if (isset($item['children']) && is_array($item['children'])) {
                $row['children'] = $this->sanitizeSidebarItems($item['children']);
            }
            $clean[] = $row;
        }

        return $clean;
    }

    public function score()
    {
        $rate = Option::form('rate', OptionForm::AUTO_DETECT, function ($form) {
            $form->group('score_per_storage')->text('score_per_storage')->addon();

            $form->group('private_score_per_storage')
                ->text('private_score_per_storage')->addon()->hint();

            $form->group('score_per_closet_item')
                ->text('score_per_closet_item')->addon();

            $form->checkbox('return_score')->label();

            $form->group('score_per_player')->text('score_per_player')->addon();

            $form->text('user_initial_score');
        })->handle();

        $report = Option::form('report', OptionForm::AUTO_DETECT, function ($form) {
            $form->text('reporter_score_modification')->description();

            $form->text('reporter_reward_score');
        })->handle();

        $sign = Option::form('sign', OptionForm::AUTO_DETECT, function ($form) {
            $form->group('sign_score')
                ->text('sign_score_from')->addon(trans('options.sign.sign_score.addon1'))
                ->text('sign_score_to')->addon(trans('options.sign.sign_score.addon2'));

            $form->group('sign_gap_time')->text('sign_gap_time')->addon();

            $form->checkbox('sign_after_zero')->label()->hint();
        })->after(function () {
            $sign_score = request('sign_score_from').','.request('sign_score_to');
            Option::set('sign_score', $sign_score);
        })->with([
            'sign_score_from' => @explode(',', option('sign_score'))[0],
            'sign_score_to' => @explode(',', option('sign_score'))[1],
        ])->handle();

        $sharing = Option::form('sharing', OptionForm::AUTO_DETECT, function ($form) {
            $form->group('score_award_per_texture')
                ->text('score_award_per_texture')
                ->addon(trans('general.user.score'));
            $form->checkbox('take_back_scores_after_deletion')->label();
            $form->group('score_award_per_like')
                ->text('score_award_per_like')
                ->addon(trans('general.user.score'));
        })->handle();

        return view('admin.score', ['forms' => compact('rate', 'report', 'sign', 'sharing')]);
    }

    public function options()
    {
        $general = Option::form('general', OptionForm::AUTO_DETECT, function ($form) {
            $form->text('site_name');
            $form->text('site_description')->description();

            $form->text('site_url')
                ->hint()
                ->format(function ($url) {
                    if (Str::endsWith($url, '/')) {
                        $url = substr($url, 0, -1);
                    }

                    if (Str::endsWith($url, '/index.php')) {
                        $url = substr($url, 0, -10);
                    }

                    return $url;
                });

            $form->checkbox('register_with_player_name')->label();
            $form->checkbox('require_verification')->label();

            $form->text('regs_per_ip');

            $form->group('max_upload_file_size')
                    ->text('max_upload_file_size')->addon('KB')
                    ->hint(trans('options.general.max_upload_file_size.hint', ['size' => ini_get('upload_max_filesize')]));

            $form->select('player_name_rule')
                    ->option('official', trans('options.general.player_name_rule.official'))
                    ->option('cjk', trans('options.general.player_name_rule.cjk'))
                    ->option('utf8', trans('options.general.player_name_rule.utf8'))
                    ->option('custom', trans('options.general.player_name_rule.custom'));

            $form->text('custom_player_name_regexp')->hint()->placeholder();

            $form->group('player_name_length')
                ->text('player_name_length_min')
                ->addon('~')
                ->text('player_name_length_max')
                ->addon(trans('options.general.player_name_length.suffix'));

            $form->checkbox('auto_del_invalid_texture')->label()->hint();

            $form->checkbox('allow_downloading_texture')->label();

            $form->select('status_code_for_private')
                ->option('403', '403 Forbidden')
                ->option('404', '404 Not Found');

            $form->text('texture_name_regexp')->hint()->placeholder();

            $form->textarea('content_policy')->rows(3)->description();
        })->handle(function () {
            Option::set('site_name_'.config('app.locale'), request('site_name'));
            Option::set('site_description_'.config('app.locale'), request('site_description'));
            Option::set('content_policy_'.config('app.locale'), request('content_policy'));
        });

        $announ = Option::form('announ', OptionForm::AUTO_DETECT, function ($form) {
            $form->textarea('announcement')->rows(10)->description();
        })->renderWithoutTable()->handle(function () {
            Option::set('announcement_'.config('app.locale'), request('announcement'));
        });

        $meta = Option::form('meta', OptionForm::AUTO_DETECT, function ($form) {
            $form->text('meta_keywords')->hint();
            $form->text('meta_description')->hint();
            $form->textarea('meta_extras')->rows(6);
        })->handle();

        $recaptcha = Option::form('recaptcha', 'reCAPTCHA', function ($form) {
            $form->text('recaptcha_sitekey', 'sitekey');
            $form->text('recaptcha_secretkey', 'secretkey');
            $form->checkbox('recaptcha_invisible')->label();
        })->handle();

        return view('admin.options')
            ->with('forms', compact('general', 'announ', 'meta', 'recaptcha'));
    }

    public function resource(Request $request)
    {
        $resources = Option::form('resources', OptionForm::AUTO_DETECT, function ($form) {
            $form->checkbox('force_ssl')->label()->hint();
            $form->checkbox('auto_detect_asset_url')->label()->description();

            $form->text('cache_expire_time')->hint(OptionForm::AUTO_DETECT);
            $form->text('cdn_address')
                ->hint(OptionForm::AUTO_DETECT)
                ->description(OptionForm::AUTO_DETECT);
        })
            ->type('primary')
            ->hint(OptionForm::AUTO_DETECT)
            ->after(function () {
                $cdnAddress = request('cdn_address');
                if ($cdnAddress == null) {
                    $cdnAddress = '';
                }
                if (Str::endsWith($cdnAddress, '/')) {
                    $cdnAddress = substr($cdnAddress, 0, -1);
                }
                Option::set('cdn_address', $cdnAddress);
            })
            ->handle();

        $cache = Option::form('cache', OptionForm::AUTO_DETECT, function ($form) {
            $form->checkbox('enable_avatar_cache')->label();
            $form->checkbox('enable_preview_cache')->label();
        })
            ->type('warning')
            ->addButton([
                'text' => trans('options.cache.clear'),
                'type' => 'a',
                'class' => 'float-right',
                'style' => 'warning',
                'href' => '?clear-cache',
            ])
            ->addMessage(trans('options.cache.driver', ['driver' => config('cache.default')]), 'info');

        if ($request->has('clear-cache')) {
            Cache::flush();
            $cache->addMessage(trans('options.cache.cleared'), 'success');
        }
        $cache->handle();

        return view('admin.resource')->with('forms', compact('resources', 'cache'));
    }
}
