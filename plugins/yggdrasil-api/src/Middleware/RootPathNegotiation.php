<?php

namespace Yggdrasil\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * 根路径双挂载：让 authlib-injector 可以直接用「站点根」作为 API 地址
 * （例如 http://127.0.0.1:8000/），同时保留原 /api/yggdrasil 前缀完全可用。
 *
 * 原理：在全局中间件阶段（路由匹配之前）内部改写请求路径——
 * - /authserver/* /sessionserver/* 以及 Yggdrasil 扩展的
 *   /api/profiles|/api/users/profiles|/api/user/profile → /api/yggdrasil/...，
 *   由插件原有路由处理，无需重复注册路由；
 * - 站点根(/)同时是网页首页：按请求特征协商——authlib-injector 的元数据
 *   请求（UA 含 authlib-injector，或 Accept 为纯 JSON）内部转元数据端点，
 *   浏览器（Accept 含 text/html）照常返回首页。
 *
 * 与站点自带 /api(OAuth2) 的隔离：改写目标都带 /api/yggdrasil 前缀，
 * 且仅上述端点形状参与改写，OAuth 的 /api/user、/api/players 等不受影响。
 */
class RootPathNegotiation
{
    public function handle(Request $request, Closure $next)
    {
        $path = trim($request->getPathInfo(), '/');
        $newUri = null;

        if ($path === '') {
            if (self::looksLikeAuthlib($request)) {
                $newUri = '/api/yggdrasil';
                /* 标记加在原请求上：外层的 AddApiIndicationHeader 据此回显根地址 */
                $request->attributes->set('ygg_root_negotiated', true);
            }
        } elseif (preg_match('#^(authserver|sessionserver)(/|$)#', $path)) {
            $newUri = '/api/yggdrasil/'.$path;
        } elseif (preg_match('#^api/(profiles(/|$)|users/profiles(/|$)|user/profile(/|$))#', $path)) {
            $newUri = '/api/yggdrasil/'.$path;
        }

        if ($newUri === null) {
            return $next($request);
        }

        /* 用 duplicate 携带改写后的 URI：新实例的 pathInfo 未缓存，路由匹配即取新值；
           method / body / cookie / 用户解析器全部原样保留 */
        $query = $request->getQueryString();
        $uri = $query ? $newUri.'?'.$query : $newUri;
        $server = array_merge($request->server->all(), [
            'REQUEST_URI' => $uri,
            'QUERY_STRING' => (string) $query,
        ]);

        return $next($request->duplicate(null, null, null, null, null, $server));
    }

    /* 请求是否来自 authlib-injector（元数据获取）：UA 标识，或 Accept 为纯 JSON
       （浏览器的 Accept 即使带任意通配也不会出现 application/json 字样，不会误入此分支） */
    public static function looksLikeAuthlib(Request $request): bool
    {
        if (stripos((string) $request->userAgent(), 'authlib-injector') !== false) {
            return true;
        }

        $accept = (string) $request->header('Accept');

        return strpos($accept, 'application/json') !== false
            && strpos($accept, 'text/html') === false;
    }
}
