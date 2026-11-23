- [简体中文](./README-zh.md)
- **English**

<p align="center"><b>胡桃木皮肤站 · Hutaomu Skin Server</b></p>

<p align="center">A personalized Minecraft skin hosting site, built on <a href="https://github.com/bs-community/blessing-skin-server">Blessing Skin Server</a>.</p>

Hutaomu Skin Server is a self-hosted Minecraft skin station forked from the open-source [Blessing Skin Server](https://github.com/bs-community/blessing-skin-server) (v6 branch), redesigned with a hand-made cherry-blossom theme and a set of UX upgrades.

## Features

Everything from Blessing Skin Server, plus:

- **暖樱白 theme** — a cherry-blossom-pink glassmorphism redesign across the whole site, with light (暖樱白) / dark (暗夜樱) modes and smooth cross-page view transitions.
- **Theme settings panel** — a slide-in panel from the header palette button:
  - Appearance switching (persisted per account)
  - Random anime wallpaper powered by a **server-side multi-source relay** (`GET /theme/wallpaper`): the backend picks a random source from the configured list, fetches it and serves it same-origin so wallpapers can be cached locally, favorited and downloaded
  - Auto wallpaper rotation (5/15/30/60 min), favorites (up to 9), one-click download
  - Sakura petals animation
- **Showcase mode** — one click and all UI elements slide away, leaving only the wallpaper and a floating palette button (great as an auto-rotating wallpaper screen).
- **Sidebar customizer** (admin panel → Personalization): drag-and-drop editing of the sidebar tree — cross-level dragging (top-level items can be nested and vice versa), groups, hide/show, rename, and custom link entries. Saved structure drives the sidebar everywhere.
- **PJAX navigation** — in-site page switches only replace the content area; the header/sidebar stay untouched with zero full-page reloads.
- **Themed skin preview** — the WebGL skin viewer on closet/player pages follows the current theme colors.

## Repository layout

This repository contains the deployed site source (Laravel application):

```
app/            Laravel application code (controllers, composers, models…)
config/         Configuration, including menu.php (default sidebar definition)
plugins/        Installed plugins (config-generator, yggdrasil-api, …)
public/app/     Compiled frontend assets (no build step required)
public/theme/   Theme source assets (hutaomu-theme.css / .js)
resources/      Views (Twig) and language files
routes/         Route definitions (incl. the wallpaper relay)
storage/        Runtime storage — placeholders only, see below
```

## Requirements

Same as upstream: PHP 8.1+ (with ctype, gd, imagick, json, mbstring, openssl, pdo, tokenizer, xml, zip), MySQL/MariaDB (or other supported databases), Composer.

## Deployment

```bash
composer install
cp .env.example .env      # then fill in database credentials
php artisan key:generate
php artisan migrate       # on first deployment
```

Point your web server (nginx/Apache) to `public/` as the document root. The compiled frontend assets are committed, so no Node.js build is needed.

## Files that must NOT be uploaded / committed

The following contain secrets or runtime user data. They are excluded by `.gitignore` — never force-add them:

| Path | Why |
|---|---|
| `.env` | `APP_KEY`, database credentials, mail credentials |
| `storage/oauth-private.key` / `storage/oauth-public.key` | OAuth signing keys |
| `storage/logs/` | Runtime logs (may contain IPs and request data) |
| `storage/framework/` | Cache, sessions, compiled views |
| `storage/textures/` | User-uploaded skin/cape files |
| `storage/install.lock`, `storage/options.php` | Installation marker & options cache |
| `storage/*.db` / `*.sqlite` | Local databases |
| `vendor/` | Composer dependencies (restore via `composer install`) |

## Credits & License

Built on [Blessing Skin Server](https://github.com/bs-community/blessing-skin-server) by the BS community. This fork keeps the original **MIT license**; all modified theme/UX code in this repository is released under the same license.
