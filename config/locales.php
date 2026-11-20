<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Configuration for i18n
    |--------------------------------------------------------------------------
    |
    | Available Languages
    | 本站仅开放四种语言: 简体中文 / 繁体中文 / English / 日本語,
    | 切换参数与 cookie 均以此白名单校验, 删条目即彻底禁用该语言
    |
    */
    'zh_CN' => [
        'name' => '中文 (简体)',
        'short_name' => 'zh-CN',
    ],
    'zh_HANS_CN' => [
        'alias' => 'zh_CN',
    ],
    'zh_TW' => [
        'name' => '中文 (正體)',
        'short_name' => 'zh-TW',
    ],
    'en' => [
        'name' => 'English',
        'short_name' => 'en',
    ],
    'en_US' => [
        'alias' => 'en',
    ],
    'ja_JP' => [
        'name' => '日本語',
        'short_name' => 'ja',
    ],
];
