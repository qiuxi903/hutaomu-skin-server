<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* 壁纸收藏云端化: 收藏索引随账号走(JSON: [{f:文件名, t:时间戳, h:内容哈希}]),
   图片字节落 storage/wallpaper-fav/{uid}/, 换设备登录收藏即同步 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('wallpaper_favorites')->nullable()->after('is_dark_mode');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('wallpaper_favorites');
        });
    }
};
