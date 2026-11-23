<?php

namespace App\Models;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Lorisleiva\LaravelSearchString\Concerns\SearchString;

/**
 * @property int     $id
 * @property int     $tid
 * @property int     $uploader
 * @property int     $reporter
 * @property string  $reason
 * @property int     $status
 * @property Carbon  $report_at
 * @property Texture $texture
 * @property User    $informer  The reporter.
 */
class Report extends Model
{
    use SearchString;

    public const CREATED_AT = 'report_at';
    public const UPDATED_AT = null;

    public const PENDING = 0;
    public const RESOLVED = 1;
    public const REJECTED = 2;

    /* 分区: 材质举报(type=0, 原有) / 评论举报(type=1) */
    public const TYPE_TEXTURE = 0;
    public const TYPE_COMMENT = 1;

    protected $fillable = [
        'uploader', 'reporter', 'reason', 'status',
    ];

    protected $casts = [
        'tid' => 'integer',
        'uploader' => 'integer',
        'reporter' => 'integer',
        'status' => 'integer',
        'type' => 'integer',
        'comment_id' => 'integer',
    ];

    protected $searchStringColumns = [
        'id', 'tid', 'uploader', 'reporter',
        'reason', 'status', 'type',
        'report_at' => ['date' => true],
    ];

    public function texture()
    {
        return $this->belongsTo(Texture::class, 'tid', 'tid');
    }

    /* 被举报的评论(type=comment 时有值; 评论删除后置 NULL, 保留审计记录) */
    public function comment()
    {
        return $this->belongsTo(Comment::class, 'comment_id', 'id');
    }

    public function textureUploader()
    {
        return $this->belongsTo(User::class, 'uploader', 'uid');
    }

    public function informer()
    {
        return $this->belongsTo(User::class, 'reporter', 'uid');
    }

    protected function serializeDate(DateTimeInterface $date)
    {
        return $date->format('Y-m-d H:i:s');
    }
}
