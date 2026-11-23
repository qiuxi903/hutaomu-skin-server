<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* 评论回复(扁平单层: parent_id 恒指向顶层评论, reply_uid 为被回复人用于 @展示)
   + 评论举报(reports.type 分区: 0=材质 1=评论; comment_id 置 NULL 保留举报审计记录) */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comments', function (Blueprint $table) {
            $table->unsignedInteger('parent_id')->nullable()->after('tid');
            $table->unsignedInteger('reply_uid')->nullable()->after('parent_id');
            $table->foreign('parent_id')->references('id')->on('comments')->cascadeOnDelete();
        });

        Schema::table('reports', function (Blueprint $table) {
            $table->unsignedTinyInteger('type')->default(0)->after('status');
            $table->unsignedInteger('comment_id')->nullable()->after('tid');
            $table->foreign('comment_id')->references('id')->on('comments')->onDelete('set null');
            $table->index(['type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropForeign(['comment_id']);
            $table->dropIndex(['type', 'status']);
            $table->dropColumn(['type', 'comment_id']);
        });

        Schema::table('comments', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn(['parent_id', 'reply_uid']);
        });
    }
};
