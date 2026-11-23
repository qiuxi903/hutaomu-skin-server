<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* 站点文档(/docs): 管理员后台撰写教程, Markdown 渲染, 公开已发布文档 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('docs', function (Blueprint $table) {
            $table->increments('id');
            $table->string('slug', 60)->unique();
            $table->string('title', 100);
            $table->longText('content');
            $table->boolean('published')->default(false);
            $table->unsignedInteger('sort')->default(0);
            $table->unsignedInteger('updated_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('docs');
    }
};
