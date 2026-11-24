<?php
/*
|--------------------------------------------------------------------------
| Sidebar Menus
|--------------------------------------------------------------------------
|
| Register your custom sidebar menu here.
|
*/

$menu['user'] = [
    ['title' => 'general.dashboard',      'link' => 'user',         'icon' => 'fa-tachometer-alt'],
    ['title' => 'general.my-closet',      'link' => 'user/closet',  'icon' => 'fa-star'],
    ['title' => 'general.player-manage',  'link' => 'user/player',  'icon' => 'fa-users'],
    ['title' => 'general.my-reports',     'link' => 'user/reports', 'icon' => 'fa-flag'],
    ['title' => 'general.profile',        'link' => 'user/profile', 'icon' => 'fa-user'],
    [
        'title' => 'general.developer',
        'icon' => 'fa-code-branch',
        'children' => [
            ['title' => 'general.oauth-manage', 'link' => 'user/oauth/manage', 'icon' => 'fa-feather-alt'],
            /* 关于: 按需求收在高级功能组尾 */
            ['title' => 'general.about',        'link' => 'about',             'icon' => 'fa-info-circle'],
        ],
    ],
];

$menu['admin'] = [
    ['title' => 'general.dashboard',      'link' => 'admin',                'icon' => 'fa-tachometer-alt'],
    ['title' => 'general.user-manage',    'link' => 'admin/users',          'icon' => 'fa-users'],
    ['title' => 'general.player-manage',  'link' => 'admin/players',        'icon' => 'fa-gamepad'],
    ['title' => 'general.report-manage',  'link' => 'admin/reports',        'icon' => 'fa-flag'],
    // 材质评论区管理(总开关/审核开关/待审队列); 标题用翻译键(四语言)
    ['title' => 'admin.panel.comments.title', 'link' => 'admin/comments',   'icon' => 'fa-comments'],
    // 站点文档管理(撰写教程/更新文档, Markdown + 预览)
    ['title' => 'admin.panel.docs.title',     'link' => 'admin/docs',       'icon' => 'fa-book-open'],
    // 个性化(暖樱白主题专属): 配置壁纸/柔光/樱花, 主题本体是源码资产 public/theme/
    ['title' => 'general.customize',      'link' => 'admin/theme',          'icon' => 'fa-paint-brush'],
    ['title' => 'general.i18n',           'link' => 'admin/i18n',           'icon' => 'fa-globe'],
    ['title' => 'general.score-options',  'link' => 'admin/score',          'icon' => 'fa-credit-card'],
    ['title' => 'general.options',        'link' => 'admin/options',        'icon' => 'fa-cog'],
    ['title' => 'general.res-options',    'link' => 'admin/resource',       'icon' => 'fa-atom'],
    ['title' => 'general.status',         'link' => 'admin/status',         'icon' => 'fa-battery-three-quarters'],
    ['title' => 'general.plugin-manage',  'link' => 'admin/plugins/manage', 'icon' => 'fa-plug'],
    ['title' => 'general.plugin-market',  'link' => 'admin/plugins/market', 'icon' => 'fa-shopping-bag'],
    ['title' => 'general.plugin-configs', 'id'   => 'plugin-configs',       'icon' => 'fa-cogs', 'children' => []],
    ['title' => 'general.check-update',   'link' => 'admin/update',         'icon' => 'fa-arrow-up'],
];

$menu['explore'] = [
    ['title' => 'general.skinlib',  'link' => 'skinlib', 'icon' => 'fa-archive'],
    // 站点使用文档(/docs): 公开读已发布, 管理员后台撰写
    ['title' => 'general.docs',     'link' => 'docs',    'icon' => 'fa-book'],
];

return $menu;
