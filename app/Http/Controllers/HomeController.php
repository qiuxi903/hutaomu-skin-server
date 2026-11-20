<?php

namespace App\Http\Controllers;

class HomeController extends Controller
{
    public function index()
    {
        return view('home')
            ->with('user', auth()->user())
            ->with('site_description', option_localized('site_description'))
            ->with('transparent_navbar', (bool) option('transparent_navbar', false))
            ->with('fixed_bg', option('fixed_bg'))
            ->with('hide_intro', option('hide_intro'))
            ->with('home_pic_url', option('home_pic_url') ?: config('options.home_pic_url'));
    }

    public function apiRoot()
    {
        $copyright = str_replace(
            ['{year}', '{site_name}', '{site_url}'],
            [date('Y'), option('site_name'), url('/')],
            option('theme_footer_text')
        );

        return response()->json([
            'blessing_skin' => config('app.version'),
            'spec' => 0,
            'copyright' => $copyright,
            'site_name' => option('site_name'),
        ]);
    }
}
