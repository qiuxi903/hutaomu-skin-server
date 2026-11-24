<?php

namespace Yggdrasil\Middleware;

use Illuminate\Http\Response;

class AddApiIndicationHeader
{
    public function handle($request, \Closure $next)
    {
        /** @var Response */
        $response = $next($request);
        /* 客户端以站点根作为 API 地址时（见 RootPathNegotiation 的协商标记），
           回显根地址让客户端留在根 API 上；其余情况回显经典的 /api/yggdrasil */
        $location = $request->attributes->get('ygg_root_negotiated') ? url('/') : url('api/yggdrasil');
        $response->header('X-Authlib-Injector-API-Location', $location);

        return $response;
    }
}
