<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* 材质评论区(皮肤/披风共用详情页, 以 tid 关联):
   status 0=待审核 1=已通过; 材质删除时评论级联清理 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comments', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('tid')->index();
            $table->unsignedInteger('uid')->index();
            $table->text('content');
            $table->unsignedTinyInteger('status')->default(1);
            $table->string('ip', 45)->nullable();
            $table->timestamps();
            $table->foreign('tid')->references('tid')->on('textures')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comments');
    }
};
