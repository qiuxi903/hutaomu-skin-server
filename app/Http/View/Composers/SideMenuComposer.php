<?php

namespace App\Http\View\Composers;

use App\Events;
use App\Services\Plugin;
use App\Services\PluginManager;
use Blessing\Filter;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\View\View;

class SideMenuComposer
{
    protected Request $request;

    protected Filter $filter;

    public function __construct(Request $request, Filter $filter)
    {
        $this->request = $request;
        $this->filter = $filter;
    }

    public function compose(View $view)
    {
        /* shared.sidebar(渲染循环)与 shared.side-menu(旧入口)都要触发 composer,
           否则 items 不会被注入, 侧栏整条空白 */
        $gather = $view->gatherData();
        $type = $gather['type'] ?? $gather['scope'] ?? null;

        $menu = config('menu');
        switch ($type) {
            case 'user':
                /* 浏览组与用户中心组合并为单列表, 顺序/分组/显隐/改名/子项
                   由「个性化 → 侧边栏自定义」(sidebar_custom 选项)驱动 */
                $items = self::sidebarEditorTree(false);
                $menu = array_map(fn ($item) => $this->transform($item), $items);
                $view->with('items', $menu);

                return;
            case 'explore':
                event(new Events\ConfigureExploreMenu($menu));
                break;
            case 'admin':
                event(new Events\ConfigureAdminMenu($menu));
                $menu['admin'] = $this->collectPluginConfigs($menu['admin']);
                break;
        }

        $menu = $menu[$type];
        $menu = $this->filter->apply('side_menu', $menu, [$type]);

        $view->with('items', array_map(fn ($item) => $this->transform($item), $menu));
    }

    /* 合并「浏览 + 用户中心」两作用域为带分组的嵌套树; 供渲染与后台编辑器共用 */
    public static function combinedUserMenu(): array
    {
        $menu = config('menu');
        event(new Events\ConfigureUserMenu($menu));
        event(new Events\ConfigureExploreMenu($menu));
        $menu['user'] = app(Filter::class)->apply('side_menu', $menu['user'], ['user']);

        $combined = [];
        foreach ($menu['explore'] as $item) {
            $id = Arr::get($item, 'link') ?: Arr::get($item, 'title');
            $combined[$id] = $item + ['id' => $id, 'group' => trans('general.explore')];
        }
        foreach ($menu['user'] as $item) {
            $id = Arr::get($item, 'link') ?: Arr::get($item, 'title');
            $combined[$id] = $item + ['id' => $id, 'group' => trans('general.user-center')];
        }

        return $combined;
    }

    /* 编辑器用: 应用自定义后的完整嵌套树(可翻译标题) */
    public static function sidebarEditorTree(bool $translate = true, bool $keepHidden = false): array
    {
        $combined = self::combinedUserMenu();
        $custom = json_decode((string) option('sidebar_custom', ''), true);
        $items = self::applyTreeCustomization($combined, is_array($custom) ? $custom : [], $keepHidden);
        if ($translate) {
            $walk = function (array $nodes) use (&$walk) {
                foreach ($nodes as &$node) {
                    $node['title'] = trans($node['title']);
                    if (isset($node['children'])) {
                        $node['children'] = $walk($node['children']);
                    }
                }

                return $nodes;
            };
            $items = $walk($items);
        }

        return $items;
    }

    /* 全局项注册表: 所有内置项(含各级子项, 子项继承顶层分组) + 既有自定义链接。
       编辑器把项拖到任何层级, 渲染都能从注册表取回完整数据(图标/链接/默认名) */
    public static function globalItemRegistry(): array
    {
        $registry = [];
        $walk = function (array $items, ?string $inherited) use (&$walk, &$registry) {
            foreach ($items as $item) {
                $id = Arr::get($item, 'id') ?: (Arr::get($item, 'link') ?: Arr::get($item, 'title'));
                $item['id'] = $id;
                $group = Arr::get($item, 'group') ?: $inherited;
                if ($group) {
                    $item['group'] = $group;
                }
                $registry[$id] = $item;
                if (isset($item['children'])) {
                    $walk($item['children'], $group);
                }
            }
        };
        $walk(self::combinedUserMenu(), null);

        /* 既有自定义链接项也入册(重保存时不丢数据) */
        $custom = json_decode((string) option('sidebar_custom', ''), true);
        if (is_array($custom)) {
            $walkCustom = function (array $list) use (&$walkCustom, &$registry) {
                foreach ($list as $c) {
                    if (Arr::get($c, 'custom')) {
                        $id = Arr::get($c, 'id');
                        if ($id && !isset($registry[$id])) {
                            $registry[$id] = [
                                'id' => $id,
                                'title' => Arr::get($c, 'title', '未命名'),
                                'link' => Arr::get($c, 'link', '#'),
                                'icon' => Arr::get($c, 'icon', 'fa-link'),
                                'group' => Arr::get($c, 'group', ''),
                                'custom' => true,
                            ];
                        }
                    }
                    if (isset($c['children']) && is_array($c['children'])) {
                        $walkCustom($c['children']);
                    }
                }
            };
            $walkCustom($custom);
        }

        return $registry;
    }

    /* 递归应用自定义: 顺序/分组/显隐/改名/子项/自定义链接。
       关键不变量: 每个项在全树只出现一次——渲染以「自定义树」为准,
       查不到的默认项(被拖走/隐藏)不再追加回来; 拖进来的项(不在本层默认池)
       从全局注册表取完整数据 */
    public static function applyTreeCustomization(array $items, array $customList, bool $keepHidden = false): array
    {
        $registry = self::globalItemRegistry();

        /* 全局提及集: 自定义树里出现过的 id, 本层默认池不再追加(防拖走的项被塞回来) */
        $mentioned = [];
        $collect = function (array $list) use (&$collect, &$mentioned) {
            foreach ($list as $c) {
                $id = Arr::get($c, 'id');
                if ($id) {
                    $mentioned[$id] = true;
                }
                if (isset($c['children']) && is_array($c['children'])) {
                    $collect($c['children']);
                }
            }
        };
        $collect($customList);

        return self::applyLevel($items, $customList, $keepHidden, $registry, $mentioned);
    }

    /* 渲染自定义列表的一层; items 仅用于「未提及默认项追加」(顶层传合并池, 子层传默认子项) */
    private static function applyLevel(array $items, array $customList, bool $keepHidden, array $registry, array $mentioned): array
    {
        $pool = [];
        foreach ($items as $item) {
            $id = Arr::get($item, 'id') ?: (Arr::get($item, 'link') ?: Arr::get($item, 'title'));
            $item['id'] = $id;
            $pool[$id] = $item;
        }

        $out = [];
        foreach ($customList as $c) {
            $id = Arr::get($c, 'id');
            if (!$id) {
                continue;
            }

            /* 自定义链接项: 数据全在保存的条目里 */
            if (Arr::get($c, 'custom')) {
                $hidden = (bool) Arr::get($c, 'hidden', false);
                if ($hidden && !$keepHidden) {
                    continue;
                }
                $node = [
                    'id' => $id,
                    'title' => Arr::get($c, 'title', '未命名'),
                    'link' => Arr::get($c, 'link', '#'),
                    'icon' => Arr::get($c, 'icon', 'fa-link'),
                    'group' => Arr::get($c, 'group', ''),
                    'custom' => true,
                ];
                if ($keepHidden && $hidden) {
                    $node['hidden'] = true;
                }
                $kids = (array) Arr::get($c, 'children', []);
                if ($kids) {
                    $node['children'] = self::applyLevel([], $kids, $keepHidden, $registry, $mentioned);
                }
                $out[] = $node;

                continue;
            }

            /* 内置项: 从全局注册表取完整数据(支持跨层级拖动——不在本层默认池也能渲染) */
            if (!isset($registry[$id])) {
                continue;
            }
            $item = $registry[$id];
            if (Arr::get($c, 'group')) {
                $item['group'] = Arr::get($c, 'group');
            } elseif (!isset($item['group'])) {
                $item['group'] = '';
            }
            if (Arr::get($c, 'title')) {
                $item['title'] = Arr::get($c, 'title');
            }
            $kids = (array) Arr::get($c, 'children', []);
            if ($kids || isset($item['children'])) {
                $item['children'] = self::applyLevel(
                    isset($item['children']) ? $item['children'] : [],
                    $kids,
                    $keepHidden,
                    $registry,
                    $mentioned
                );
            }
            if (Arr::get($c, 'hidden')) {
                if (!$keepHidden) {
                    continue; /* 前台渲染: 隐藏项不输出 */
                }
                $item['hidden'] = true; /* 编辑器: 保留灰显节点以便恢复 */
            }
            $out[] = $item;
        }

        /* 本层默认池里、整个自定义树都没提到的项: 按默认顺序可见追加 */
        foreach ($pool as $id => $item) {
            if (isset($mentioned[$id])) {
                continue;
            }
            if (isset($item['children'])) {
                $item['children'] = self::applyLevel($item['children'], [], $keepHidden, $registry, $mentioned);
            }
            $out[] = $item;
        }

        return $out;
    }

    public function transform(array $item): array
    {
        $isActive = $this->request->is(Arr::get($item, 'link'));
        foreach (Arr::get($item, 'children', []) as $k => $v) {
            if ($this->request->is(Arr::get($v, 'link'))) {
                $isActive = true;
                break;
            }
        }

        $classes = [];
        if ($isActive) {
            $item['active'] = true;
            $classes[] = 'active menu-open';
        }

        if (Arr::has($item, 'children')) {
            $item['children'] = array_map(
                fn ($item) => $this->transform($item),
                $item['children'],
            );
        }

        $item['classes'] = $classes;

        return $item;
    }

    public function collectPluginConfigs(array &$menu)
    {
        $menu = array_map(function ($item) {
            if (Arr::get($item, 'id') === 'plugin-configs') {
                $pluginConfigs = resolve(PluginManager::class)
                    ->getEnabledPlugins()
                    ->filter(fn (Plugin $plugin) => $plugin->hasConfig())
                    ->map(function ($plugin) {
                        return [
                            'title' => trans($plugin->title),
                            'link' => 'admin/plugins/config/'.$plugin->name,
                            'icon' => 'fa-circle',
                        ];
                    });

                // Don't display this menu item when no plugin config is available
                if ($pluginConfigs->isNotEmpty()) {
                    array_push($item['children'], ...$pluginConfigs->values()->all());

                    return $item;
                }
            } else {
                return $item;
            }
        }, $menu);

        return array_filter($menu); // Remove empty items
    }
}
