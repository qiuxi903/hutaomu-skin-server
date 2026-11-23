<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    public const STATUS_PENDING = 0;
    public const STATUS_APPROVED = 1;

    public const MAX_LENGTH = 500;

    protected $fillable = ['tid', 'uid', 'content', 'status', 'ip', 'parent_id', 'reply_uid'];

    protected $casts = [
        'tid' => 'integer',
        'uid' => 'integer',
        'status' => 'integer',
        'parent_id' => 'integer',
        'reply_uid' => 'integer',
    ];

    public function texture()
    {
        return $this->belongsTo(Texture::class, 'tid', 'tid');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'uid', 'uid');
    }

    /* 回复挂靠的顶层评论(parent_id 恒指向顶层; 顶层评论此值为 null) */
    public function parent()
    {
        return $this->belongsTo(Comment::class, 'parent_id', 'id');
    }

    /* 被回复的那条评论的作者(仅用于 @昵称展示) */
    public function replyUser()
    {
        return $this->belongsTo(User::class, 'reply_uid', 'uid');
    }
}
