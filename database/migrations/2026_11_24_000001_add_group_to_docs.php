<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* 文档分组: 索引页按「大标题=分组 / 小标题=文章」清单式展示(参照上游文档站版式)。
   group_name 为空 = 未分组(索引页置顶显示在第一个分组之前) */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('docs', function (Blueprint $table) {
            $table->string('group_name', 60)->default('')->after('title');
        });
    }

    public function down(): void
    {
        Schema::table('docs', function (Blueprint $table) {
            $table->dropColumn('group_name');
        });
    }
};
