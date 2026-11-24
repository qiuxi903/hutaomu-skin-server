<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Doc extends Model
{
    protected $fillable = ['slug', 'title', 'group_name', 'content', 'published', 'sort', 'updated_by'];

    protected $casts = [
        'published' => 'boolean',
        'sort' => 'integer',
        'updated_by' => 'integer',
    ];
}
