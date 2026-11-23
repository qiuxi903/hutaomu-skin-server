- **简体中文**
- [English](./README.md)

<p align="center"><b>胡桃木皮肤站 · Hutaomu Skin Server</b></p>

<p align="center">基于 <a href="https://github.com/bs-community/blessing-skin-server">Blessing Skin Server</a> 深度定制的 Minecraft 皮肤站。</p>

胡桃木皮肤站 fork 自开源项目 [Blessing Skin Server](https://github.com/bs-community/blessing-skin-server)（v6 分支），在保留其完整皮肤站能力的基础上，以手绘樱花粉主题重新设计了全站 UI，并加入了一系列交互升级。

## 特性

继承 Blessing Skin Server 的全部能力（皮肤/披风上传管理、角色管理、皮肤库分享、Yggdrasil API 认证、插件生态），另外加入：

- **暖樱白主题** —— 樱花粉玻璃拟态全站重设计；亮色（暖樱白）/ 暗色（暗夜樱）双模式，跨页面视图过渡平滑切换。
- **主题设置面板** —— 点击页眉调色板按钮滑出：
  - 外观切换（按账号持久化）
  - 随机二次元壁纸，走**服务端多源中继**（`GET /theme/wallpaper`）：后端从配置的图源列表随机抓取并同源返回，因此壁纸可本地缓存、收藏与下载
  - 自动换壁纸（5/15/30/60 分钟）、我的收藏（最多 9 张）、一键下载
  - 樱花飘落动效
- **纯享展示** —— 一键让全部控件动画退场，只留壁纸与右上角浮动调色板按钮（可当自动轮播壁纸屏用）。
- **侧边栏自定义**（管理面板 → 个性化）：树形拖拽编辑——大项/子项可跨层级互拖、分组调整、显示/隐藏、改名、添加自定义链接，保存后全站生效。
- **PJAX 无缝导航** —— 站内跳转只替换主内容区，页眉/侧栏保持不动，无整页刷新。
- **皮肤预览跟随主题** —— 衣柜/角色页的 WebGL 皮肤预览渲染器底色随明暗模式切换。

## 仓库结构

本仓库即站点部署源码（Laravel 应用）：

```
app/            Laravel 应用代码（控制器、Composer、模型…）
config/         配置，含 menu.php（侧栏默认定义）
plugins/        已安装插件（配置生成、Yggdrasil API 等）
public/app/     前端编译产物（无需构建）
public/theme/   主题源码资产（hutaomu-theme.css / .js）
resources/      视图（Twig）与语言文件
routes/         路由定义（含壁纸中继端点）
storage/        运行时存储 —— 仅占位文件，见下表
```

## 环境要求

与上游一致：PHP 8.1+（需 ctype、gd、imagick、json、mbstring、openssl、pdo、tokenizer、xml、zip 扩展）、MySQL/MariaDB 等受支持数据库、Composer。

## 部署

```bash
composer install
cp .env.example .env      # 填写数据库等配置
php artisan key:generate
php artisan migrate       # 首次部署
```

将 nginx/Apache 站点根目录指向 `public/`。前端编译产物已随仓库提交，无需 Node.js 构建。

## 不应上传 / 提交的文件

以下内容包含密钥或运行时用户数据，`.gitignore` 已排除，切勿强加（`git add -f`）：

| 路径 | 原因 |
|---|---|
| `.env` | `APP_KEY`、数据库与邮件凭据 |
| `storage/oauth-private.key` / `storage/oauth-public.key` | OAuth 签名密钥 |
| `storage/logs/` | 运行日志（含 IP、请求数据） |
| `storage/framework/` | 缓存、会话、编译视图 |
| `storage/textures/` | 用户上传的皮肤/披风文件 |
| `storage/install.lock`、`storage/options.php` | 安装标记与配置缓存 |
| `storage/*.db` / `*.sqlite` | 本地数据库 |
| `vendor/` | Composer 依赖（`composer install` 可还原） |

## 致谢与许可

基于 BS 社区的 [Blessing Skin Server](https://github.com/bs-community/blessing-skin-server) 构建。本仓库保留原项目 **MIT 许可证**，主题与交互相关的修改代码同样以 MIT 发布。
