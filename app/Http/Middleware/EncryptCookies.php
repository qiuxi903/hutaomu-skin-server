<?php

namespace App\Http\Middleware;

class EncryptCookies extends \Illuminate\Cookie\Middleware\EncryptCookies
{
    /**
     * 不参与加解密的 cookie。
     * locale 由 DetectLanguagePrefer 写入明文（该中间件在全局层、晚于 web 组
     * 的加解密执行，写侧天然绕过加密），必须同时豁免读侧解密，
     * 否则请求读取时明文值解密失败会被置为 null，
     * SetAppLocale 监听器拿不到登录前选择的语言。
     */
    protected $except = [
        'locale',
    ];
}
