<?php

Route::get('{player}.json', 'TextureController@json');
Route::get('csl/{player}.json', 'TextureController@json');

Route::get('textures/{hash}', 'TextureController@texture');
Route::get('csl/textures/{hash}', 'TextureController@texture');
Route::get('raw/{tid}', 'TextureController@raw');

Route::prefix('avatar')->name('avatar.')->group(function () {
    Route::get('player/{name}', 'TextureController@avatarByPlayer')->name('player');
    Route::get('user/{uid}', 'TextureController@avatarByUser')->name('user');
    Route::get('hash/{hash}', 'TextureController@avatarByHash')->name('hash');
    Route::get('{tid}', 'TextureController@avatarByTexture')->name('texture');
});

/* 材质预览路由已迁往 routes/web.php（web 中间件组带会话）:
   静态路由无会话, 私密材质的预览图任何人都可拉取（越权泄露）,
   且无法按观看者校验可见性。迁移后控制器内做可见性校验 + 公开材质读穿静态文件 */
