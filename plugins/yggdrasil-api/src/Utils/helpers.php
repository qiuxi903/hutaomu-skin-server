<?php

use Carbon\Carbon;
use Vectorface\Whip\Whip;

if (!function_exists('ygg_generate_rsa_keys')) {
    function ygg_generate_rsa_keys($config = [])
    {
        $config = array_merge($config, [
            'private_key_bits' => 4096,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
            'config' => plugin('yggdrasil-api')->getPath().'/assets/openssl.cnf',
        ]);

        $res = openssl_pkey_new($config);

        if (!$res) {
            throw new Exception(openssl_error_string(), 1);
        }

        openssl_pkey_export($res, $privateKey, null, $config);

        return [
            'private' => $privateKey,
            'public' => openssl_pkey_get_details($res)['key'],
        ];
    }
}

/* 判断请求路径是否落在 Yggdrasil API 的挂载范围内（含根路径双挂载形态） */
if (!function_exists('ygg_is_api_path')) {
    function ygg_is_api_path(string $path): bool
    {
        $path = trim($path, '/');
        if ($path === 'api/yggdrasil' || strpos($path, 'api/yggdrasil/') === 0) {
            return true;
        }

        /* 根挂载形态：authlib-injector 兼容路径 */
        return (bool) preg_match('#^(authserver|sessionserver)(/|$)#', $path)
            || (bool) preg_match('#^api/(profiles(/|$)|users/profiles(/|$)|user/profile(/|$))#', $path);
    }
}

if (!function_exists('ygg_log_http_request_and_response')) {
    function ygg_log_http_request_and_response()
    {
        Log::channel('ygg')->info('============================================================');
        Log::channel('ygg')->info(request()->method(), [request()->path()]);

        Event::listen('kernel.handled', function ($request, $response) {
            $statusCode = $response->getStatusCode();
            $statusText = Symfony\Component\HttpFoundation\Response::$statusTexts[$statusCode];
            Log::channel('ygg')->info(sprintf('HTTP/%s %s %s', $response->getProtocolVersion(), $statusCode, $statusText));
        });
    }
}

if (!function_exists('ygg_log')) {
    function ygg_log($params)
    {
        if (env('YGG_VERBOSE_LOG')) {
            $data = array_merge([
                'action' => 'undefined',
                'user_id' => 0,
                'player_id' => 0,
                'parameters' => '[]',
                'ip' => (new Whip())->getValidIpAddress(),
                'time' => Carbon::now(),
            ], $params);

            return DB::table('ygg_log')->insert($data);
        }
    }
}
