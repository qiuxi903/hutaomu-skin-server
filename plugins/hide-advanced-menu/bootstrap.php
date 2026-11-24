<?php

namespace Blessing\HideAdvancedMenu;

use Blessing\Filter;

return function (Filter $filter) {
    /* 把「配置生成」收进「高级功能」折叠组: 默认收起, 展开才可选 */
    $filter->add('side_menu', function ($menu, $type) {
        if ($type !== 'user') {
            return $menu;
        }

        $configItem = null;
        $rest = array_values(array_filter($menu, function ($item) use (&$configItem) {
            if ($item['title'] === 'Blessing\ConfigGenerator::config.generate-config') {
                $configItem = $item;

                return false;
            }

            return true;
        }));

        if ($configItem === null) {
            return $rest;
        }

        return array_map(function ($item) use ($configItem) {
            if ($item['title'] === 'general.developer') {
                /* 插到「关于」之前, 保持 OAuth2 应用 → 配置生成 → 关于 的顺序 */
                $at = count($item['children']);
                foreach ($item['children'] as $i => $child) {
                    if ($child['title'] === 'general.about') {
                        $at = $i;
                        break;
                    }
                }
                array_splice($item['children'], $at, 0, [$configItem]);
            }

            return $item;
        }, $rest);
    });
};
