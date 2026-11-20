<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class SetAppLocale
{
    protected Request $request;

    public function __construct(Request $request)
    {
        $this->request = $request;
    }

    public function handle($event)
    {
        /** @var User */
        $user = $event->user;

        if ($this->request->has('lang')) {
            $user->locale = $this->request->input('lang');
            $user->save();

            return;
        }

        /* 登录前最后一次显式选择的语言(cookie, 由语言切换器写入且已过
           config('locales') 白名单)优先于账号里保存的旧偏好——否则游客时
           选的日语会在登录后被账号旧设置覆盖回中文。cookie 缺失或非法时
           仍回落账号偏好。 */
        $cookieLocale = $this->request->cookie('locale');
        if ($cookieLocale && Arr::has(config('locales'), $cookieLocale)) {
            if ($cookieLocale !== $user->locale) {
                $user->locale = $cookieLocale;
                $user->save();
            }
            app()->setLocale($cookieLocale);

            return;
        }

        $locale = $user->locale;
        if ($locale) {
            app()->setLocale($locale);
        }
    }
}
