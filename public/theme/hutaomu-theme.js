/* ============================================================
   胡桃木皮肤站 · 暖樱白主题 动效脚本
   位置: site/public/theme/hutaomu-theme.js (源码资产, 随分支发布)
   加载: resources/views/shared/foot.twig 以 script 标签直连
   作用:
     1. 主题设置面板(页眉调色板触发, 右侧滑入): 亮/暗外观、二次元主题
        开关、换一张、收藏当前、下载壁纸、自动切换、我的收藏
     2. 壁纸管线: 上游图源经 images.weserv.nl 代理(CORS 可读)预取下载,
        dataURL 存 localStorage——刷新页面直接复用本地壁纸, 零闪烁零请求
     3. 樱花飘落(主页与登录页)
   ============================================================ */
(function () {
  try {
    var body = document.body;
    /* 翻译: app bundle 已把 blessing.t 挂到 window.trans(本脚本在 foot 中晚于其加载); 缺失时回退键名 */
    var T = typeof window.trans === 'function' ? window.trans : function (k) { return k; };
    if (!body) return;

    /* ---------- 本地存储 ---------- */
    var KEY = { ac: 'ht_ac', bg: 'ht_saved_bg', favs: 'ht_fav_bgs', auto: 'ht_auto', iv: 'ht_auto_iv' };
    try { localStorage.removeItem('ht_dbg'); localStorage.removeItem('ht_dbg2'); localStorage.removeItem('ht_dbg3'); } catch (e) { /* 旧调试痕迹清理 */ }
    var store = {
      get ac() { return localStorage.getItem(KEY.ac) !== '0'; },
      set ac(v) { localStorage.setItem(KEY.ac, v ? '1' : '0'); },
      get bg() { return localStorage.getItem(KEY.bg) || ''; },
      set bg(v) { if (v) { localStorage.setItem(KEY.bg, v); } else { localStorage.removeItem(KEY.bg); } },
      get favs() { try { return JSON.parse(localStorage.getItem(KEY.favs)) || []; } catch (e) { return []; } },
      set favs(a) { localStorage.setItem(KEY.favs, JSON.stringify(a)); },
      get auto() { return localStorage.getItem(KEY.auto) !== '0'; },
      set auto(v) { localStorage.setItem(KEY.auto, v ? '1' : '0'); },
      get iv() { var n = parseInt(localStorage.getItem(KEY.iv), 10); return n > 0 ? n : 30; },
      set iv(m) { localStorage.setItem(KEY.iv, String(m)); }
    };

    /* ---------- 页面形态 ---------- */
    var isHome = !!document.querySelector('.hp-wrapper');
    var isAuth = body.classList.contains('login-page');
    /* 壁纸载体: 主页 #fixed-bg(固定背景层) / 登录页 body; 面板页为 null(走专用
       壁纸层)。旧版 target/overlay 从未定义, 主页/登录页一调 applyBgImage 就
       ReferenceError, 整段脚本(含面板绑定)当场死掉 */
    var target = isHome
      ? (document.getElementById('fixed-bg') || document.querySelector('.hp-wrapper'))
      : (isAuth ? body : null); /* fixed_bg 选项关闭时主页回退到 .hp-wrapper */
    var globalsEl = document.getElementById('blessing-globals');
    var cfg = { panel_wallpaper: true, petals: true, panel_dim: 0.5, sources: [] };
    if (globalsEl) {
      try {
        var t = JSON.parse(globalsEl.textContent).theme;
        if (t) cfg = t;
      } catch (err) { /* 配置解析失败时用默认值 */ }
    }
    var acOn = store.ac && cfg.panel_wallpaper;
    var isPanel = !isHome && !isAuth && !!cfg.panel_wallpaper && acOn;
    var authed = !!document.getElementById('theme-switcher');

    /* ---------- 纯享展示状态(尽早套用, 刷新时不闪现完整页面) ---------- */
    var htShowcaseOn = function () { return localStorage.getItem('ht_showcase') === '1'; };
    var htShowcaseTimer = null;
    if (authed && htShowcaseOn()) {
      body.classList.add('ht-showcase');
      body.classList.add('ht-showcase-done');
    }

    /* ---------- 图源 ---------- */
    /* 多源真适配: 浏览器直连图源没有 CORS 头(图无法转 dataURL 落盘/收藏),
       weserv 代理又只放行 paugram——改由本站后端中继 /theme/wallpaper:
       服务端随机挑一个后台「个性化」配置的源抓图, 同源返回(逐源回退)。
       前端一次请求即得「多源随机 + 可持久化」的壁纸, 无临时图、无死窗口 */
    var WALLPAPER_API = '/theme/wallpaper';

    /* ---------- 皮肤预览设备(WebGL 渲染器)底色跟随主题 ---------- */
    /* 衣柜/角色页的 skinview3d 用不透明 canvas, 灰底烘焙在 WebGL 缓冲里,
       DOM 样式够不到——钩住 getContext 给 clearColor 包一层: 中性灰底
       改写为当前模式的主题底色, 每帧清屏都会走这里, 切换模式下一帧生效;
       换底色按钮的白(1,1,1)/黑(0,0,0)在区间外; 默认灰(0.42,0.46,0.49)实测自 __htClearLog */
    try {
      var origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        var ctx = origGetContext.apply(this, arguments);
        if (ctx && (type === 'webgl' || type === 'webgl2') && !ctx.__htBgHook) {
          ctx.__htBgHook = true;
          var origClear = ctx.clearColor.bind(ctx);
          ctx.clearColor = function (r, g, b, a) {
            /* 首屏清屏色自录(前 12 条): 供调整灰底判定区间用 */
            var log = (window.__htClearLog = window.__htClearLog || []);
            if (log.length < 12) log.push([+r.toFixed(3), +g.toFixed(3), +b.toFixed(3), +a.toFixed(2)]);
            if (Math.abs(r - g) < 0.06 && Math.abs(g - b) < 0.06 && r > 0.35 && r < 0.97) {
              if (body.classList.contains('dark-mode')) return origClear(0.169, 0.145, 0.204, a); /* 暗夜樱 #2b2534 */
              return origClear(0.988, 0.937, 0.957, a); /* 暖樱白 #fceff4 */
            }
            return origClear(r, g, b, a);
          };
        }
        return ctx;
      };
    } catch (e) { /* 钩子失败不影响站点 */ }

    /* ---------- 壁纸应用 ---------- */
    var wpActive = null; /* 当前可见的壁纸层: 'a' / 'b' */

    function ensureWallpaperLayers() {
      if (document.getElementById('ht-wp-a')) return;
      for (var n of ['a', 'b']) {
        var el = document.createElement('div');
        el.id = 'ht-wp-' + n;
        el.className = 'ht-wp-layer';
        el.style.opacity = '0';
        body.insertBefore(el, body.firstChild);
      }
    }

    /* 面板页: 壁纸画到专用固定层上, 换壁纸时双层交叉淡入(有过程动画) */
    function applyWallpaperLayer(b64) {
      ensureWallpaperLayers();
      var show = wpActive === 'a' ? 'b' : 'a';
      var showEl = document.getElementById('ht-wp-' + show);
      var hideEl = document.getElementById('ht-wp-' + (show === 'a' ? 'b' : 'a'));
      showEl.style.backgroundImage = 'url("' + b64 + '")';
      showEl.style.opacity = '1';
      hideEl.style.opacity = '0';
      wpActive = show;
    }

    function applyBgImage(b64) {
      if (isHome || isAuth) {
        if (!target) return;
        target.style.backgroundImage = 'url("' + b64 + '")';
        target.style.backgroundSize = 'cover';
        target.style.backgroundPosition = 'center';
        target.style.backgroundAttachment = 'fixed';
        target.style.backgroundRepeat = 'no-repeat';
        if (isAuth) target.style.backgroundColor = '#fbc2d8'; /* 登录页兜底樱粉 */
        return;
      }
      applyWallpaperLayer(b64);
    }

    function clearWallpaper() {
      if (isHome || isAuth) {
        if (!target) return;
        target.style.backgroundImage = '';
        target.style.backgroundSize = '';
        target.style.backgroundPosition = '';
        target.style.backgroundAttachment = '';
        /* 清掉内联后回退到模板/CSS 的兜底链(主页 home_pic_url, 登录页樱粉罩) */
        return;
      }
      /* 面板页: 两层淡出, 回落到 body 的主题底色 */
      ensureWallpaperLayers();
      document.getElementById('ht-wp-a').style.opacity = '0';
      document.getElementById('ht-wp-b').style.opacity = '0';
      wpActive = null;
    }

    /* 下载链接与当前壁纸同步(base64 dataURL 可直接另存) */
    function refreshDownloadLink() {
      var dl = document.getElementById('ts-download');
      if (!dl) return;
      var bg = store.bg;
      if (bg) {
        dl.setAttribute('href', bg);
        dl.setAttribute('download', 'wallpaper-' + Date.now() + '.jpg');
        dl.classList.remove('disabled');
      } else {
        dl.removeAttribute('href');
        dl.classList.add('disabled');
      }
    }

    /* 换新壁纸: 走本站中继随机取一个源的图(同源响应可转 dataURL 落盘)。
       重复图由服务端轮换 + 前端 htRecent 指纹双重规避; 一次请求即换一张 */
    function fetchRandomWallpaper(fresh) {
      /* 移动端宽度段带 mobile=1: 服务端改用「移动端图源」配置(管理面板可配);
         fresh=1: 手动换一张要真新图(服务端同步抓新); 缺省走服务端缓存/后台刷新
         —— 慢图源下载在独立进程完成, 预取不再阻塞 php -S 单线程的页面切换 */
      var isMobile = window.matchMedia('(max-width: 767.98px)').matches;
      var bust = (WALLPAPER_API.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now() + (isMobile ? '&mobile=1' : '') + (fresh ? '&fresh=1' : '');
      return fetch(WALLPAPER_API + bust, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.blob();
        })
        .then(blobToDataURL)
        .then(function (b64) {
          if (b64.indexOf('data:image/') !== 0) throw new Error('not an image');
          if (htRecent.indexOf(htHash(b64)) !== -1 && pfDup < 2) {
            pfDup++; /* 抽到最近看过的图: 再抽一次(服务端会换源), 最多 2 次 */
            return fetchRandomWallpaper(fresh);
          }
          pfDup = 0;
          return b64;
        });
    }

    /* 预取推迟到页面自身资源加载完(load + 400ms): php -S 单线程, 壁纸中继
       (最坏 8s/源)会占住唯一 worker——300ms 就跑会把本页几十张预览图全部
       堵在队尾(用户反馈「皮肤图片加载非常非常慢」的根因)。首帧壁纸来自
       localStorage 缓存(setWallpaper(store.bg)), 预取只为下一次换一张瞬时 */
    function htIdlePrefetch() {
      if (document.readyState === 'complete') {
        setTimeout(prefetchNextWallpaper, 400);
        return;
      }
      window.addEventListener('load', function () { setTimeout(prefetchNextWallpaper, 400); }, { once: true });
    }

    /* ---------- 樱花 ---------- */
    function spawnPetals() {
      if (document.querySelector('.ht-petals')) return;
      var box = document.createElement('div');
      box.className = 'ht-petals';
      var total = window.innerWidth < 768 ? 10 : 18;
      for (var k = 0; k < total; k++) {
        var petal = document.createElement('i');
        petal.style.setProperty('--l', (Math.random() * 100).toFixed(2) + '%');
        petal.style.setProperty('--d', (Math.random() * 9 + 7).toFixed(2) + 's');
        petal.style.setProperty('--p', (-Math.random() * 16).toFixed(2) + 's');
        petal.style.setProperty('--s', (Math.random() * 7 + 7).toFixed(1) + 'px');
        petal.style.setProperty('--o', (Math.random() * 0.35 + 0.3).toFixed(2));
        box.appendChild(petal);
      }
      body.appendChild(box);
    }
    function removePetals() {
      var old = document.querySelector('.ht-petals');
      if (old) old.remove();
    }

    /* ---------- 壁纸状态(必须先于启动块初始化) ---------- */
    var htRecent = []; /* 最近图指纹(长度+等距采样), 换一张避开最近 6 张 */

    /* ---------- 启动: 壁纸与樱花 ---------- */
    /* 面板页: AC 开启时必须补 ht-panel 遮罩类(旧版漏加, 壁纸被内容底色盖住),
       无存图时现取而不是静默失败 */
    if (isHome || isAuth) {
      if (acOn) {
        if (cfg.petals) spawnPetals();
        if (store.bg) setWallpaper(store.bg); /* 首帧即壁纸, 零闪烁; 空图不动模板兜底 */
      }
      if (isHome) htIdlePrefetch(); /* 主页也预取(用户中心可即时换) */
    } else if (acOn) {
      /* 管理后台(v2 无侧栏布局)与前台同一套壁纸+柔光管线, 不再跳过 */
      body.classList.add('ht-panel');
      ensureAcWallpaper();
      htIdlePrefetch(); /* 静默预取下一张 */
    }

    /* ---------- 自动切换与预取交换 ---------- */
    function blobToDataURL(blob) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    }
    /* 预取机制: 后台先把下一张壁纸下载好(dataURL), 「换一张/自动切换」时瞬时交换
       零等待; 交换后立即在后台预取再下一张, 始终保持有一张备用 */
    var wpPrefetch = null;
    var pfDup = 0; /* 连续重复图计数, 最多重取 2 次 */
    /* 指纹去重: htRecent 初始化见上方壁纸状态区(必须先于启动块, 曾因顺序暴毙) */
    function htHash(b64) {
      var s = String(b64), h = s.length + ':';
      for (var k = 1; k <= 10; k++) h += s.charAt(Math.floor(k * s.length / 12));
      return h;
    }
    function prefetchNextWallpaper() {
      if (wpPrefetch) return;
      fetchRandomWallpaper(false).then(function (b64) { wpPrefetch = b64; })
        .catch(function () { /* 中继失败: 3 秒后重试, 预取不断档 */
          setTimeout(prefetchNextWallpaper, 3000);
        });
    }

    /* 壁纸唯一变更点: 铺图+落盘+下载链接+最近图指纹一起处理。
       「收藏当前」读 store.bg——有了这个不变量(显示==落盘), 收藏永远等于背景 */
    function setWallpaper(b64) {
      applyBgImage(b64);
      store.bg = b64;
      htRecent.push(htHash(b64));
      if (htRecent.length > 6) htRecent.shift();
      refreshDownloadLink();
    }

    var wpBusy = false;
    function swapOrFetchWallpaper() {
      if (wpPrefetch) {
        /* 有预取: 瞬时交换 */
        var b64 = wpPrefetch;
        wpPrefetch = null;
        setWallpaper(b64);
        prefetchNextWallpaper();
        return;
      }
      if (wpBusy) return; /* 一张图已在路上 */
      wpBusy = true;
      var btn = document.getElementById('ts-refresh');
      if (btn) btn.classList.add('busy');
      var toast = (window.blessing && blessing.notify && blessing.notify.toast) || null;
      /* 异步化「换一张」: 派发后台刷新(独立进程) → 轮询缓存版本 → 新图落盘后
         缓存 HIT 瞬时回源。慢源下载全程不占 php -S 主 worker, 等待期间切页零影响 */
      var isMobileSwap = window.matchMedia('(max-width: 767.98px)').matches;
      var swapQ = isMobileSwap ? '?mobile=1' : '';
      var fail = function () {
        /* 全部图源挂: 立即恢复按钮并提示, 不留死窗口 */
        wpBusy = false;
        if (btn) btn.classList.remove('busy');
        if (toast) toast.warning(T('ht.sources-down'));
        setTimeout(prefetchNextWallpaper, 3000);
      };
      fetch(WALLPAPER_API + '/refresh' + swapQ, { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.code !== 0) throw new Error('dispatch failed');
          var from = d.from;
          var tries = 0;
          var poll = function () {
            fetch(WALLPAPER_API + '/refresh/status' + swapQ + '&from=' + from, { cache: 'no-store' })
              .then(function (r) { return r.json(); })
              .then(function (s) {
                if (s.ready) {
                  /* 新图已落盘: 缓存 HIT 瞬时回源 */
                  fetchRandomWallpaper(false).then(function (b64) {
                    wpBusy = false;
                    if (btn) btn.classList.remove('busy');
                    setWallpaper(b64);
                    prefetchNextWallpaper();
                  }, fail);
                } else if (++tries > 30) {
                  /* 15 秒还没换到: 按全源挂处理 */
                  throw new Error('timeout');
                } else {
                  setTimeout(poll, 500);
                }
              })
              .catch(function (e3) { throw e3; });
          };
          poll();
        })
        .catch(function () {
          /* 派发失败: 回退缓存直取(服务端仍是缓存/后台刷新语义, 瞬时) */
          fetchRandomWallpaper(false).then(function (b64) {
            wpBusy = false;
            if (btn) btn.classList.remove('busy');
            setWallpaper(b64);
            prefetchNextWallpaper();
          }, function () {
            fail();
          });
        });
    }

    var autoTimer = null;
    function setAutoTimer() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      if (!store.auto) return;
      autoTimer = setInterval(function () {
        if (document.hidden) return; /* 后台标签页不浪费请求 */
        swapOrFetchWallpaper();
      }, store.iv * 60 * 1000);
    }

    /* ---------- 二次元开关应用 ---------- */
    /* 面板页判定必须是函数而非启动时算好的 isPanel——开关在会话中途切换,
       旧值会让 ht-panel 遮罩补不上(isPanel 是加载时的快照) */
    function panelPage() { return !isHome && !isAuth; }

    /* 确保 AC 开启时有壁纸: 有存图直接铺; 没有就换一张(中继取图, 可落盘可收藏) */
    function ensureAcWallpaper() {
      if (store.bg) { setWallpaper(store.bg); return; }
      swapOrFetchWallpaper();
    }

    function applyAcState() {
      var tsAc = document.getElementById('ts-ac-toggle');
      if (tsAc) {
        tsAc.setAttribute('aria-checked', acOn ? 'true' : 'false');
        tsAc.classList.toggle('active', acOn);
      }
      if (acOn) {
        if (panelPage()) body.classList.add('ht-panel');
        ensureAcWallpaper();
        if ((isHome || isAuth) && cfg.petals) spawnPetals();
        setTimeout(prefetchNextWallpaper, 300); /* 预取管线随手跑起来 */
      } else {
        body.classList.remove('ht-panel');
        clearWallpaper();
        removePetals();
      }
    }

    /* 自动切换 ↔ 时间档联动: 关 → 时间档整行隐藏; 开 → 必有有效档位 */
    function syncAutoUI() {
      var toggle = document.getElementById('ts-auto-toggle');
      var row = document.querySelector('.ts-intervals');
      if (toggle) {
        toggle.setAttribute('aria-checked', store.auto ? 'true' : 'false');
        toggle.classList.toggle('active', store.auto);
      }
      if (row) row.hidden = !store.auto;
      var all = document.querySelectorAll('.ts-iv');
      for (var q = 0; q < all.length; q++) {
        all[q].classList.toggle('active', store.auto && parseInt(all[q].getAttribute('data-min'), 10) === store.iv);
      }
    }

    /* ---------- 主题切换器(仅登录用户) ---------- */
    function applyModeButtons() {
      var dark = body.classList.contains('dark-mode');
      var buttons = document.querySelectorAll('.ts-mode-btn');
      for (var m = 0; m < buttons.length; m++) {
        var want = buttons[m].getAttribute('data-mode') === 'dark';
        buttons[m].classList.toggle('active', want === dark);
      }
    }

    /* ---------- 壁纸收藏: 云端随账号走(另一设备登录同一账号即同步) ----------
       索引在 users.wallpaper_favorites, 图片字节在服务端私有磁盘;
       本地 localStorage(ht_fav_bgs) 只作旧数据迁移源, 迁完即删 */
    var favsCache = [];
    function renderFavs() {
      var box = document.getElementById('ts-favs');
      var empty = document.getElementById('ts-fav-empty');
      var count = document.getElementById('ts-fav-count');
      if (!box) return;
      if (count) count.textContent = String(favsCache.length);
      if (empty) empty.style.display = favsCache.length ? 'none' : 'block';
      box.innerHTML = '';
      for (var f = 0; f < favsCache.length; f++) {
        (function (entry) {
          var item = document.createElement('div');
          item.className = 'ts-fav-item';
          item.title = T('ht.click-apply');
          var prev = document.createElement('div');
          prev.className = 'ts-fav-preview';
          prev.style.backgroundImage = 'url("' + entry.url + '")';
          var del = document.createElement('button');
          del.className = 'ts-fav-remove';
          del.type = 'button';
          del.textContent = '✕';
          del.title = T('ht.delete');
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            del.disabled = true;
            fetch('/theme/wallpaper/favorites/' + entry.id, {
              method: 'DELETE',
              credentials: 'same-origin',
              headers: { 'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '', 'Accept': 'application/json' },
            })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                if (d.code === 0) {
                  favsCache = favsCache.filter(function (x) { return x.id !== entry.id; });
                  renderFavs();
                } else {
                  del.disabled = false;
                }
              })
              .catch(function () { del.disabled = false; });
          });
          item.appendChild(prev);
          item.appendChild(del);
          /* 点击应用: 服务端文件取回转 dataURL, 走唯一变更点(铺图+落盘+下载链接) */
          item.addEventListener('click', function () {
            fetch(entry.url, { credentials: 'same-origin' })
              .then(function (r) { return r.blob(); })
              .then(blobToDataURL)
              .then(function (b64) { setWallpaper(b64); })
              .catch(function () { /* 取图失败保持现状 */ });
          });
          box.appendChild(item);
        })(favsCache[f]);
      }
    }
    function loadFavs() {
      fetch('/theme/wallpaper/favorites', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.code === 0) {
            favsCache = d.data || [];
            renderFavs();
            migrateLegacyFavs();
          }
        })
        .catch(function () { /* 拉取失败保持空态, 面板可用 */ });
    }
    function migrateLegacyFavs() {
      var legacy;
      try { legacy = JSON.parse(localStorage.getItem(KEY.favs)) || []; } catch (e) { legacy = []; }
      if (!legacy.length) return;
      var token = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
      var queue = legacy.slice(0, 9);
      var idx = 0;
      /* 顺序慢速上传: POST 走 5 次/分钟限流, 并发会被 429 掐掉;
         全部传完才删本地键——中途失败下次启动还能续迁 */
      var step = function () {
        if (idx >= queue.length) { localStorage.removeItem(KEY.favs); return; }
        fetch('/theme/wallpaper/favorites', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-TOKEN': token, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: queue[idx] }),
        })
          .then(function (r) {
            if (r.status === 429) { setTimeout(step, 6500); return; } /* 限流: 等一个窗口, 不推进 */
            idx += 1;
            setTimeout(step, 1300);
          })
          .catch(function () { setTimeout(step, 4000); });
      };
      step();
    }

    function bindSwitcher() {
      if (!authed) return;
      var root = document.getElementById('theme-switcher');
      if (!root) return;

      var panel = document.getElementById('ts-panel');
      var trigger = document.getElementById('ts-trigger');
      /* 页眉的 backdrop-filter 会成为 fixed 后代的包含块并裁剪, 面板必须搬到 body 下 */
      if (panel && panel.parentElement !== body) body.appendChild(panel);

      /* 面板开合 */
      function setPanel(open) {
        panel.classList.toggle('open', open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (trigger) trigger.addEventListener('click', function (e) {
        e.preventDefault();
        setPanel(!panel.classList.contains('open'));
      });
      var closeBtn = document.getElementById('ts-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { setPanel(false); });
      /* 点击面板与触发钮以外的区域时关闭 */
      document.addEventListener('click', function (e) {
        if (!panel.classList.contains('open')) return;
        if (panel.contains(e.target) || (trigger && trigger.contains(e.target))) return;
        setPanel(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setPanel(false);
      });

      /* ---------- 纯享展示 ---------- */
      /* 开: 控件动画退场(页眉上滑/侧栏左滑/内容下沉淡出), 620ms 后彻底退出
         命中测试; 关: 移除类让控件过渡归位。浮动调色板按钮负责唤回面板 */
      var showcaseToggle = document.getElementById('ts-showcase-toggle');
      var htSyncShowcase = function () {
        var on = htShowcaseOn();
        if (showcaseToggle) {
          showcaseToggle.setAttribute('aria-checked', on ? 'true' : 'false');
          showcaseToggle.classList.toggle('active', on);
        }
      };
      var htSetShowcase = function (on) {
        localStorage.setItem('ht_showcase', on ? '1' : '0');
        clearTimeout(htShowcaseTimer);
        if (on) {
          body.classList.remove('ht-showcase-done'); /* 先恢复可见性才有过渡 */
          body.classList.add('ht-showcase');
          htShowcaseTimer = setTimeout(function () { body.classList.add('ht-showcase-done'); }, 620);
        } else {
          body.classList.remove('ht-showcase');
          body.classList.remove('ht-showcase-done');
        }
        htSyncShowcase();
      };
      htSyncShowcase();
      if (showcaseToggle) showcaseToggle.addEventListener('click', function () {
        htSetShowcase(!htShowcaseOn());
      });

      /* 纯享模式下的浮动设置入口: 页眉已退场, 用独立按钮唤回面板 */
      var floatBtn = document.createElement('button');
      floatBtn.id = 'ts-trigger-float';
      floatBtn.className = 'ts-float-trigger';
      floatBtn.type = 'button';
      floatBtn.title = T('ht.sw-title');
      floatBtn.innerHTML = '<i class="fas fa-palette"></i>';
      floatBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation(); /* 否则冒泡到「点面板外关闭」处理器, 刚开就被关掉 */
        setPanel(!panel.classList.contains('open'));
      });
      body.appendChild(floatBtn);

      refreshDownloadLink();
      applyModeButtons();
      loadFavs(); /* 收藏随登录态: 启动拉取服务端列表(+旧本地收藏一次性迁移) */

      /* 明暗切换: PUT /user/dark-mode 是「翻转」语义, 仅在目标态 != 当前态时调用一次 */
      var modeBtns = document.querySelectorAll('.ts-mode-btn');
      for (var m = 0; m < modeBtns.length; m++) {
        modeBtns[m].addEventListener('click', function (e) {
          var wantDark = e.currentTarget.getAttribute('data-mode') === 'dark';
          var isDark = body.classList.contains('dark-mode');
          if (wantDark === isDark) return;
          var token = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
          fetch('/user/dark-mode', {
            method: 'PUT',
            headers: { 'X-CSRF-TOKEN': token },
            credentials: 'same-origin'
          }).then(function () {
            body.classList.toggle('dark-mode', wantDark);
            applyModeButtons();
          }).catch(function () { /* 网络失败保持原状态 */ });
        });
      }

      var acToggle = document.getElementById('ts-ac-toggle');
      if (acToggle) acToggle.addEventListener('click', function () {
        acOn = !acOn;
        store.ac = acOn;
        applyAcState();
      });

      var refresh = document.getElementById('ts-refresh');
      if (refresh) refresh.addEventListener('click', function () {
        swapOrFetchWallpaper();
      });

      var favBtn = document.getElementById('ts-fav-current');
      if (favBtn) favBtn.addEventListener('click', function () {
        var toast = (window.blessing && blessing.notify && blessing.notify.toast) || null;
        if (!store.bg) {
          /* 开机还没取到任何壁纸: 无可收藏对象 */
          if (toast) toast.warning(T('ht.fav-not-ready'));
          return;
        }
        favBtn.disabled = true;
        var token = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
        fetch('/theme/wallpaper/favorites', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-TOKEN': token, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: store.bg }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.code !== 0) { if (toast) toast.warning(d.message || T('ht.fav-failed')); return; }
            if (d.duplicate) { if (toast) toast.info(T('ht.fav-dup')); }
            else {
              favsCache.push(d.entry);
              renderFavs();
              if (toast) toast.success(T('ht.fav-done'));
            }
          })
          .catch(function () { if (toast) toast.warning(T('ht.net-error')); })
          .finally(function () { favBtn.disabled = false; });
      });

      var autoToggle = document.getElementById('ts-auto-toggle');
      if (autoToggle) autoToggle.addEventListener('click', function () {
        store.auto = !store.auto;
        /* 联动规则: 开着就必须有有效时间档(默认 15 分), 关着时间档整行隐藏 */
        if (store.auto && [5, 15, 30, 60].indexOf(store.iv) === -1) store.iv = 15;
        syncAutoUI();
        setAutoTimer();
      });

      var ivs = document.querySelectorAll('.ts-iv');
      for (var v = 0; v < ivs.length; v++) {
        ivs[v].addEventListener('click', function (e) {
          var minutes = parseInt(e.currentTarget.getAttribute('data-min'), 10) || 30;
          store.iv = minutes;
          /* 选时间 = 自动切换必然开着(时间档只在开着时可见, 双保险) */
          if (!store.auto) { store.auto = true; }
          syncAutoUI();
          setAutoTimer();
        });
      }
      var acBtnState = document.getElementById('ts-ac-toggle');
      if (acBtnState) {
        acBtnState.setAttribute('aria-checked', acOn ? 'true' : 'false');
        acBtnState.classList.toggle('active', acOn);
      }
      syncAutoUI();
      setAutoTimer();
    }
    bindSwitcher();

    /* ---------- 皮肤库列表页(服务端渲染): 委托绑定, PJAX 换页后仍生效 ---------- */
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.sl-privacy-toggle') : null;
      if (!btn || btn.disabled) return;
      var toPublic = btn.dataset.public !== '1';
      if (!window.confirm(window.trans('ht.confirm-privacy', { type: toPublic ? window.trans('ht.privacy-public') : window.trans('ht.privacy-private') }))) return;
      btn.disabled = true;
      fetch(btn.dataset.base + '/' + btn.dataset.tid + '/privacy', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
          'Accept': 'application/json',
        },
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.code === 0) { location.reload(); }
        else { window.alert(d.message || T('ht.failed')); btn.disabled = false; }
      }).catch(function () { window.alert(T('ht.net-err')); btn.disabled = false; });
    });
    document.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('.sl-sort') : null;
      if (sel && sel.form) sel.form.submit();
    });

    /* ---------- 退出登录: 确定性处理 ----------
       bundle 的退出链路依赖 React 确认框(showModal), 该链路在玻璃拟态站点
       上过于脆弱(层叠陷阱/事件失联)——这里在捕获阶段拦截, 确认 UI 用站点自带 React 弹窗(主题化样式), 注销 fetch 由主题 JS 直发;
       stopImmediatePropagation 阻断 bundle 同按钮的旧确认链路(其 fetch 不受控) */
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('#logout-button') : null;
      if (!btn) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      var finish = function () {
        window.location.href = (window.blessing && blessing.base_url) || '/';
      };
      var doLogout = function () {
        fetch('/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
            'Accept': 'application/json',
          },
        }).then(function (r) { return r.json(); }).then(function () {
          finish();
        }).catch(function () { finish(); });
      };
      /* 确认 UI 用站点自带 React 弹窗(v20261122g 已修复其事件失联), 无该 API 时回退原生 confirm */
      var notify = window.blessing && blessing.notify;
      if (notify && typeof notify.showModal === 'function') {
        try {
          notify.showModal({ text: T('ht.confirm-logout'), center: true }).then(doLogout, function () { /* 取消 */ });
        } catch (err) {
          if (window.confirm(T('ht.confirm-logout'))) doLogout();
        }
      } else if (window.confirm(T('ht.confirm-logout'))) {
        doLogout();
      }
    }, true);

    /* ---------- 皮肤库详情页: 私密状态徽章 + 快捷切换 ---------- */
    /* 详情页 React 侧栏没有隐私开关——注入到 #side 同级, 不干扰 React 渲染 */
    if (/^\/skinlib\/show\/\d+/.test(location.pathname)) {
      body.classList.add('ht-skin-show'); /* 详情页专属: 卡片浅白玻璃化(见主题 CSS) */
      try {
        var tid = location.pathname.match(/(\d+)/)[1];
        var extra = (function () {
          try { return window.blessing && blessing.extra ? blessing.extra : {}; } catch (e) { return {}; }
        })();
        fetch('/texture/' + tid, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (info) {
            var isOwner = extra.currentUid && extra.currentUid === info.uploader;
            var isAdmin = !!extra.admin;
            if (!isOwner && !isAdmin) return;
            var side = document.getElementById('side');
            if (!side) return;
            var box = document.createElement('div');
            box.className = 'ht-privacy-box';
            function draw() {
              box.innerHTML = '';
              var badge = document.createElement('span');
              badge.className = 'ht-privacy-badge' + (info.public ? ' pub' : ' pri');
              badge.innerHTML = info.public
                ? '<i class="fas fa-globe mr-1"></i>' + T('ht.desc-public')
                : '<i class="fas fa-lock mr-1"></i>' + (isAdmin && !isOwner ? T('ht.desc-private-admin') : T('ht.desc-private-owner'));
              var t = document.createElement('button');
              t.className = 'btn btn-sm ht-privacy-toggle-btn';
              t.type = 'button';
              t.textContent = info.public ? T('ht.set-private') : T('ht.set-public');
              t.addEventListener('click', function () {
                var toPublic = !info.public;
                if (!window.confirm(window.trans('ht.confirm-privacy', { type: toPublic ? window.trans('ht.privacy-public') : window.trans('ht.privacy-private') }))) return;
                t.disabled = true;
                fetch('/texture/' + tid + '/privacy', {
                  method: 'PUT',
                  credentials: 'same-origin',
                  headers: {
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
                    'Accept': 'application/json',
                  },
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (d.code === 0) { info.public = toPublic; draw(); }
                  else { window.alert(d.message || T('ht.failed')); }
                  t.disabled = false;
                }).catch(function () { window.alert(T('ht.net-err')); t.disabled = false; });
              });
              box.appendChild(badge);
              box.appendChild(t);
            }
            draw();
            side.parentNode.insertBefore(box, side.nextSibling);
          })
          .catch(function () { /* 详情信息拉取失败不影响页面 */ });
      } catch (e) { /* 注入失败不影响站点 */ }
    }

    /* ---------- 移动端底部 Tab 栏: 原生 App 式主导航(≤767px 显示, CSS 控制) ----------
       高频目的地进底栏(首页/皮肤库/衣柜/我的), 低频项留抽屉; 游客变体换 关于/登录。
       追加在 body 上(PJAX 只换 .content-wrapper, 底栏常驻), 高亮随路由更新;
       登录/注册页与纯享展示模式自动隐藏 */
    var htTabTabs = [
      { match: function (p) { return p === '/'; }, link: '/', icon: 'fa-home', label: T('ht.tab-home'), auth: null },
      { match: function (p) { return p.indexOf('/skinlib') === 0; }, link: '/skinlib', icon: 'fa-archive', label: T('ht.tab-skinlib'), auth: null },
      { match: function (p) { return p.indexOf('/user/closet') === 0; }, link: '/user/closet', icon: 'fa-star', label: T('ht.tab-closet'), auth: true },
      { match: function (p) { return p.indexOf('/user') === 0; }, link: '/user', icon: 'fa-user', label: T('ht.tab-me'), auth: true },
      { match: function (p) { return p.indexOf('/about') === 0; }, link: '/about', icon: 'fa-info-circle', label: T('ht.tab-about'), auth: false },
      { match: function (p) { return p.indexOf('/auth') === 0; }, link: '/auth/login', icon: 'fa-sign-in-alt', label: T('ht.tab-login'), auth: false },
    ];
    function htUpdateTabbar() {
      var bar = document.getElementById('ht-tabbar');
      if (!bar) return;
      var path = location.pathname.replace(/\/$/, '') || '/';
      var guest = !document.getElementById('theme-switcher'); /* 与主题 boot 的 authed 判定同源 */
      /* 登录/注册页隐藏底栏(模态式页面) */
      bar.style.display = /^\/auth(\/|$)/.test(path) ? 'none' : '';
      var tabs = bar.children;
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        var def = htTabTabs.filter(function (d) { return d.label === tab.dataset.label; })[0];
        if (!def) continue;
        if (def.auth === true && guest) { tab.style.display = 'none'; continue; }
        if (def.auth === false && !guest) { tab.style.display = 'none'; continue; }
        tab.style.display = '';
        if (def.match(path === '/' ? '/' : path)) tab.classList.add('active');
        else tab.classList.remove('active');
      }
    }
    function htBuildTabbar() {
      var bar = document.getElementById('ht-tabbar');
      if (!bar) {
        bar = document.createElement('nav');
        bar.id = 'ht-tabbar';
        htTabTabs.forEach(function (d) {
          var a = document.createElement('a');
          a.href = d.link;
          a.dataset.label = d.label;
          a.innerHTML = '<i class="fas ' + d.icon + '"></i><span>' + d.label + '</span>';
          bar.appendChild(a);
        });
        document.body.appendChild(bar);
      }
      htUpdateTabbar();
    }
    document.addEventListener('ht:pjax:navigated', htUpdateTabbar);
    htBuildTabbar();

    /* ---------- 移动端抽屉: sidebar-open(≤767px) 时点侧栏外任意处收起 ----------
       捕获阶段拦截, 放行抽屉内部与汉堡按钮自身的点击(AdminLTE 负责开合);
       桌面端(>767px)不受影响(桌面 pushmenu 走 sidebar-collapse 折叠轨道) */
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (window.innerWidth > 767.98) return;
      var t = e.target;
      if (t && t.closest && (t.closest('.main-sidebar') || t.closest('[data-widget="pushmenu"]'))) return;
      document.body.classList.remove('sidebar-open');
    }, true);

    /* ---------- 材质评论区(详情页): 服务端渲染首屏, 本模块负责增量 ----------
       首屏内容由 shared.comments.twig 输出(twig autoescape 已转义), 增量渲染
       全部 createElement + textContent, 不拼接任何含用户内容的 HTML(XSS 红线)。
       按钮事件走 list 上的事件委托(首屏 twig 项与 JS 增量项统一处理);
       容器 data-ht-init 防重入; PJAX 切页后由 ht:pjax:navigated 重新初始化 */
    function htInitComments() {
      var box = document.getElementById('ht-comments');
      if (!box || box.dataset.htInit) return;
      box.dataset.htInit = '1';
      var tid = box.getAttribute('data-tid');
      var list = box.querySelector('.ht-c-list');
      var moreBtn = box.querySelector('.ht-c-more');
      var form = box.querySelector('.ht-c-form');
      var input = box.querySelector('.ht-c-input');
      var counter = box.querySelector('.ht-c-counter');
      var submitBtn = box.querySelector('.ht-c-submit');
      var toast = (window.blessing && blessing.notify && blessing.notify.toast) || null;
      var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
      var page = 1;

      function setCount(delta) {
        var n = box.querySelector('.ht-c-count');
        if (!n) return;
        var cur = parseInt(n.textContent.replace(/[^\d-]/g, ''), 10) || 0;
        n.textContent = '(' + (cur + delta) + ')';
      }
      function refreshEmpty() {
        var empty = list.querySelector('.ht-c-empty');
        var has = list.querySelector('.ht-c-item');
        if (has && empty) empty.remove();
        if (!has && !empty) {
          var d = document.createElement('div');
          d.className = 'ht-c-empty';
          d.textContent = T('ht.c-empty');
          list.appendChild(d);
        }
      }
      function actionBtn(cls, text) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ht-c-mini-btn ' + cls;
        b.textContent = text;
        return b;
      }
      function postComment(payload, btn, onOk) {
        btn.disabled = true;
        fetch('/skinlib/show/' + tid + '/comments', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) { return r.json().catch(function () { throw new Error(T('ht.net-err')); }); })
          .then(function (d) {
            if (d.code !== 0) throw new Error(d.message || T('ht.c-post-failed'));
            onOk(d);
            if (toast) toast.info(d.message || (d.pending ? T('ht.c-post-pending') : T('ht.c-posted')));
          })
          .catch(function (e2) { if (toast) toast.warning(e2.message || T('ht.net-err')); })
          .finally(function () { btn.disabled = false; });
      }
      function appendReply(comment) {
        /* 回复(含回复的回复)统一挂到其顶层线的 .ht-c-replies 容器 */
        var topId = comment.parent_id;
        var topItem = topId ? list.querySelector('.ht-c-item[data-id="' + topId + '"]') : null;
        if (!topItem) return;
        var repliesBox = topItem.querySelector(':scope > .ht-c-replies');
        if (!repliesBox) {
          repliesBox = document.createElement('div');
          repliesBox.className = 'ht-c-replies';
          topItem.appendChild(repliesBox);
        }
        repliesBox.appendChild(renderComment(comment));
        refreshEmpty();
      }
      function renderComment(c) {
        var item = document.createElement('div');
        item.className = c.parent_id ? 'ht-c-item ht-c-reply-item' : 'ht-c-item';
        item.id = 'comment-' + c.id;
        item.setAttribute('data-id', c.id);
        var img = document.createElement('img');
        img.className = 'ht-c-avatar';
        img.src = c.avatar;
        img.alt = '';
        img.loading = 'lazy';
        item.appendChild(img);
        var main = document.createElement('div');
        main.className = 'ht-c-main';
        var meta = document.createElement('div');
        meta.className = 'ht-c-meta';
        var name = document.createElement('span');
        name.className = 'ht-c-name';
        name.textContent = c.name;
        meta.appendChild(name);
        if (c.reply_name) {
          var rt = document.createElement('span');
          rt.className = 'ht-c-replyto';
          rt.textContent = T('ht.c-reply-prefix') + c.reply_name;
          meta.appendChild(rt);
        }
        if (c.status === 0) {
          var badge = document.createElement('span');
          badge.className = 'badge badge-warning ht-c-pending-badge';
          badge.textContent = T('ht.c-pending');
          meta.appendChild(badge);
        }
        var time = document.createElement('span');
        time.className = 'ht-c-time';
        time.textContent = c.time_text;
        if (c.time_full) time.title = c.time_full;
        meta.appendChild(time);
        main.appendChild(meta);
        var body = document.createElement('div');
        body.className = 'ht-c-content';
        body.textContent = c.content;
        main.appendChild(body);
        item.appendChild(main);
        var actions = document.createElement('div');
        actions.className = 'ht-c-actions';
        if (c.can_approve) actions.appendChild(actionBtn('ht-c-approve', T('ht.c-approve')));
        if (c.can_delete) actions.appendChild(actionBtn('ht-c-del', T('ht.c-delete')));
        if (c.can_reply) actions.appendChild(actionBtn('ht-c-reply', T('ht.c-reply')));
        if (c.can_report) actions.appendChild(actionBtn('ht-c-report', T('ht.c-report')));
        if (actions.children.length) item.appendChild(actions);
        /* 顶层评论预挂回复容器(JS 追加回复时直接用; 空容器 CSS 隐藏) */
        if (!c.parent_id) {
          var repliesBox = document.createElement('div');
          repliesBox.className = 'ht-c-replies';
          item.appendChild(repliesBox);
        }
        return item;
      }
      function openReplyForm(item, targetId) {
        var old = box.querySelector('.ht-c-reply-form');
        if (old) old.remove();
        var replyForm = document.createElement('form');
        replyForm.className = 'ht-c-form ht-c-reply-form mt-2';
        var ta = document.createElement('textarea');
        ta.className = 'form-control ht-c-input';
        ta.rows = 2;
        ta.maxLength = 500;
        ta.placeholder = T('ht.c-reply-ph');
        var row = document.createElement('div');
        row.className = 'd-flex justify-content-end align-items-center mt-2';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn btn-sm btn-outline-secondary mr-2';
        cancel.textContent = T('ht.c-cancel');
        var submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'btn btn-sm btn-primary';
        submit.textContent = T('ht.c-reply');
        row.appendChild(cancel);
        row.appendChild(submit);
        replyForm.appendChild(ta);
        replyForm.appendChild(row);
        item.appendChild(replyForm);
        ta.focus();
        cancel.addEventListener('click', function () { replyForm.remove(); });
        replyForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var content = ta.value.trim();
          if (!content) { if (toast) toast.warning(T('ht.c-empty-reply')); return; }
          postComment({ content: content, reply_to: targetId }, submit, function (d) {
            replyForm.remove();
            appendReply(d.comment);
          });
        });
      }
      function reportComment(id) {
        var doReport = function (reason) {
          reason = (reason || '').trim();
          if (!reason) { if (toast) toast.warning(T('ht.c-report-empty')); return; }
          fetch('/comments/' + id + '/report', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.slice(0, 200) }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.code === 0) { if (toast) toast.success(d.message || T('ht.c-report-done')); }
              else { if (toast) toast.warning(d.message || T('ht.c-report-failed')); }
            })
            .catch(function () { if (toast) toast.warning(T('ht.net-err')); });
        };
        var notify = window.blessing && blessing.notify;
        if (notify && typeof notify.showModal === 'function') {
          try {
            notify.showModal({ mode: 'prompt', title: T('ht.c-report-title'), text: T('ht.c-report-ph') })
              .then(function (res) { doReport(res && res.value); }, function () { /* 取消 */ });
          } catch (err) {
            doReport(window.prompt(T('ht.c-report-prompt')));
          }
        } else {
          doReport(window.prompt(T('ht.c-report-prompt')));
        }
      }

      /* 事件委托: 首屏 twig 渲染的按钮与 JS 增量项统一处理 */
      list.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest
          ? e.target.closest('.ht-c-del, .ht-c-approve, .ht-c-reply, .ht-c-report')
          : null;
        if (!btn || !list.contains(btn)) return;
        var item = btn.closest('.ht-c-item');
        if (!item) return;
        var id = btn.dataset.id || item.getAttribute('data-id');
        if (btn.classList.contains('ht-c-del')) {
          var isTop = item.parentElement === list;
          if (!window.confirm(isTop ? T('ht.c-confirm-del-thread') : T('ht.c-confirm-del-reply'))) return;
          btn.disabled = true;
          fetch('/comments/' + id, {
            method: 'DELETE', credentials: 'same-origin',
            headers: { 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json' },
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.code === 0) {
                item.remove();
                if (isTop) setCount(-1); /* 计数只统计顶层评论 */
                refreshEmpty();
              } else {
                if (toast) toast.warning(d.message || T('ht.failed'));
                btn.disabled = false;
              }
            })
            .catch(function () { btn.disabled = false; });
        } else if (btn.classList.contains('ht-c-approve')) {
          btn.disabled = true;
          fetch('/admin/comments/' + id + '/approve', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json' },
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.code === 0) {
                if (toast) toast.success(d.message || T('ht.c-approved'));
                var badge = item.querySelector('.ht-c-pending-badge');
                if (badge) badge.remove();
                btn.remove();
              } else {
                if (toast) toast.warning(d.message || T('ht.failed'));
                btn.disabled = false;
              }
            })
            .catch(function () { btn.disabled = false; });
        } else if (btn.classList.contains('ht-c-reply')) {
          openReplyForm(item, id);
        } else if (btn.classList.contains('ht-c-report')) {
          reportComment(id);
        }
      });

      if (moreBtn) {
        moreBtn.addEventListener('click', function () {
          moreBtn.disabled = true;
          fetch('/skinlib/show/' + tid + '/comments?page=' + (page + 1), {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.code !== 0) throw new Error(d.message || T('ht.c-load-fail'));
              page += 1;
              d.data.items.forEach(function (c) { list.appendChild(renderComment(c)); });
              refreshEmpty();
              moreBtn.hidden = !d.data.has_more;
            })
            .catch(function (e) { if (toast) toast.warning(e.message || T('ht.net-err')); })
            .finally(function () { moreBtn.disabled = false; });
        });
      }

      if (form) {
        input.addEventListener('input', function () { counter.textContent = String(input.value.length); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var content = input.value.trim();
          if (!content) { if (toast) toast.warning(T('ht.c-empty-comment')); return; }
          if (content.length > 500) { if (toast) toast.warning(T('ht.c-too-long')); return; }
          postComment({ content: content }, submitBtn, function (d) {
            list.insertBefore(renderComment(d.comment), list.firstChild);
            setCount(1);
            refreshEmpty();
            input.value = '';
            counter.textContent = '0';
          });
        });
      }
    }
    document.addEventListener('ht:pjax:navigated', htInitComments);
    htInitComments();

    /* 皮肤库预览图加载淡入: img load 事件不冒泡但捕获阶段能收到;
       PJAX 换页后新图未 load 时淡入, 缓存图立即显示 */
    document.addEventListener('load', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('sl-preview')) {
        e.target.classList.add('loaded');
      }
    }, true);

    /* ---------- Bootstrap 弹窗层级修复 ---------- */
    /* 玻璃卡的 backdrop-filter 会成为 fixed 弹窗的包含块+层叠上下文,
       弹窗的 z1050 被困在卡片内部, 画不过 body 级 z1040 的遮罩 →
       遮罩盖住一切且真实点击全打在遮罩上, 页面锁死(与页眉同一陷阱)。
       show 前把弹窗搬到 body 顶层与遮罩同层比较(Bootstrap 官方建议) */
    (function () {
      var jq = window.jQuery || window.$;
      if (!jq || !jq.fn || !jq.fn.on) return;
      /* Bootstrap 弹窗语义上应与遮罩同为 body 直挂(backdrop 就是 body 直挂,
         Bootstrap 官方也建议 modal 放 body 末尾)。旧的「只搬 backdrop-filter 被困」
         判定不够: PJAX 重挂载后存在更隐蔽的层叠困死(实测遮罩盖住弹窗, 链上
         无任何 bf/transform 特征)。现改为「非 body 直挂即搬」兜底所有场景。
         React portal 弹窗(blessing.notify.showModal)不经 show.bs.modal, 不受影响 */
      jq(document).on('show.bs.modal', function (e) {
        var el = e.target;
        if (!el || el === document.body || !el.parentElement || el.parentElement === document.body) return;
        document.body.appendChild(el);
      });
    })();

    /* ---------- PJAX 主区切换 ---------- */
    /* 站内页间跳转只换 .content-wrapper, 页眉/侧栏/壁纸层原封不动(零重排);
       React 内容页按 bundle 路由表重新挂载。任何一步失败都回退原生跳转,
       保证最坏情况 == 现状。表数据取自 app.672e119.js 的路由挂载表
       (path= blessing.route, chunks/module= webpack 模块, el= 挂载点) */
    var HT_PAGES = {
      '/user':            { route: 'user',            chunks: [786, 395],       module: 7395, el: '#usage-box' },
      '/user/closet':     { route: 'user/closet',     chunks: [786, 390, 115],  module: 1115, el: '#closet-list' },
      '/user/player':     { route: 'user/player',     chunks: [786, 390, 403],  module: 403,  el: '#players-list' },
      '/user/profile':    { route: 'user/profile',    chunks: [45],             module: 8045, el: null },
      '/skinlib/upload':  { route: 'skinlib/upload',  chunks: [414],            module: 5414, el: '#file-input' }
    };
    /* 纯服务端渲染页: 只换 DOM 不需要重挂载 */
    var HT_STATIC = ['/user/config', '/user/reports', '/about', '/skinlib', '/skinlib/upload', '/docs'];

    function htWebpackRequire() {
      if (window.__htWR) return window.__htWR;
      try {
        (self.webpackChunkblessing_skin_server = self.webpackChunkblessing_skin_server || [])
          .push([['ht-pjax'], {}, function (r) { window.__htWR = r; }]);
      } catch (e) { return null; }
      return window.__htWR || null;
    }

    function htRemount(page) {
      var req = htWebpackRequire();
      if (!req || typeof req.e !== 'function') return Promise.reject(new Error('webpack require unavailable'));
      blessing.route = page.route; /* 挂载组件可能读 route, 必须先改 */
      return Promise.all(page.chunks.map(function (id) { return req.e(id); })).then(function () {
        if (!page.el) { req(page.module); return; } /* 纯副作用模块(如 profile 上传器) */
        var el = document.querySelector(page.el);
        if (!el) throw new Error('mount el missing: ' + page.el);
        var mod = req(page.module);
        var Comp = mod && mod.default ? mod.default : mod;
        window.ReactDOM.render(
          window.React.createElement(
            window.React.StrictMode,
            null,
            window.React.createElement(window.React.Suspense, { fallback: '' }, window.React.createElement(Comp))
          ),
          el
        );
      });
    }

    function htMarkSidebar(pathname) {
      var best = null;
      document.querySelectorAll('.nav-sidebar a.nav-link').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var p = href.replace(location.origin, '').split('?')[0];
        a.classList.remove('active');
        if (p === pathname) best = a;
      });
      if (best) {
        best.classList.add('active');
        var li = best.closest('li');
        if (li) li.classList.add('active');
      }
    }

    var htPjaxBusy = false;
    /* 动画代际: 连续快速切换时, 上一次动画的清理定时器不得清掉
       这一次动画的容器样式(共享容器样式串扰会让 overlay 失去包含块、错位) */
    var htPjaxGen = 0;

    /* 克隆子树冻结入场动画: .content .card 挂着 ht-rise(translateY(14px)→0, 0.45s),
       克隆节点一插入 DOM 就重播——CSS 动画优先级高于普通声明, 会压掉 PJAX
       enter 类的 translateX(新卡纵向"掉下来"而非横向滑入), 还叠加出多余纵移。
       只冻结卡片/页脚/标题这几个带入场动画的元素本身, 不动子树其它元素
       (下拉菜单等后续交互动画不受影响)。必须保持内联 animation:none 直到卸载——
       改回非 none 会让动画在那一刻重新开播 */
    function htPjaxFreezeAnim(root) {
      if (!root || !root.style) return;
      var sel = '.card, .main-footer, .content-header h1';
      /* .content-wrapper 自身的 ht-fade 是 opacity 动画(fill both 锁死终值),
         整区路径克隆时必须连同冻结, 否则 enter/exit 的淡入淡出全被锁成 1 */
      if (root.matches(sel) || root.classList.contains('content-wrapper')) root.style.animation = 'none';
      var els = root.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) els[i].style.animation = 'none';
    }

    /* 把绝对定位的叠层落到目标元素(旧内容)的 border-box 位置。
       关键: 扣掉叠层自身的 margin——登录后侧栏布局 .content-wrapper 自带
       margin-left:250px(折叠 4.6rem !important)+ 固定顶栏 margin-top:calc(3.5rem+1px),
       绝对定位时 margin 仍会叠加在 left/top 上, 不抵扣就是整页双倍偏移
       (右移 250、下移 57)。不能改为把 margin 清零: 还原时 margin 变化会触发
       AdminLTE 的 margin-left 过渡, 清理瞬间再跳一次。
       margin 必须从「已挂载的旧元素」读: 叠层是 detached 克隆, 还没插入文档时
       getComputedStyle 拿不到样式表里的 margin(返回空串)。 */
    function htPjaxSpot(el, rect, box, scrollX, scrollY, width, marginSource) {
      var cs = getComputedStyle(marginSource || el);
      var ml = parseFloat(cs.marginLeft) || 0;
      var mt = parseFloat(cs.marginTop) || 0;
      el.style.left = Math.round(rect.left - box.left + (scrollX || 0) - ml) + 'px';
      el.style.top = Math.round(rect.top - box.top + (scrollY || 0) - mt) + 'px';
      if (width != null) el.style.width = Math.round(width) + 'px';
      el.style.right = 'auto';
    }

    /* 滑动方向判定: 被点项与当前 active 项在同组(筛选 chips/侧栏菜单/文档目录/
       分页/标签页)里的位置关系——被点项在当前项之后 → 向前(旧左滑出新右滑入);
       之前 → 向后(反向)。无同组 active 项时默认向前 */
    function htPjaxDirFor(a) {
      var scope = a.closest('.sl-chip-group, .nav-sidebar, .doc-side, .pagination, .nav-tabs, .ap-nav');
      if (!scope) return 'left';
      var curEl = scope.querySelector('.active, .is-active');
      if (!curEl || curEl === a || !curEl.closest) return 'left';
      /* compareDocumentPosition: curEl 在 a 之后(FOLLOWING) = a 在前 = 向后 */
      /* compareDocumentPosition: curEl 在 a 之后(FOLLOWING) = 被点项在当前项之前 = 向后滑 */
      return (a.compareDocumentPosition(curEl) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'right' : 'left';
    }

    function htPjaxGo(url, push, dir) {
      if (htPjaxBusy) return;
      htPjaxBusy = true;
      var u = new URL(url, location.href);
      if (dir === undefined) dir = push ? 'left' : 'right';
      /* 点击后到数据到位前页面完全不动: 旧内容若提前滑出会脱离文档流,
         fetch 等待期(单线程下可达 0.5s+)整页塌陷——用户视频里的"顶栏消失/
         撕裂"就是它。动画只在数据到位后开始。 */
      fetch(u.href, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' }, redirect: 'follow' })
        .then(function (r) {
          if (!r.ok || !r.url || new URL(r.url).pathname !== u.pathname) throw new Error('bad response');
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newCW = doc.querySelector('.content-wrapper');
          var oldCW = document.querySelector('.content-wrapper');
          /* 布局校验放宽(2026-11-25): 只要求内容区存在——此前要求 body 必有
             sidebar-mini(登录态面板布局类), 游客/顶栏布局(layout-top-nav, 如皮肤库
             游客视角)直接校验失败回退整页刷新, 用户看到的"切换裸露壁纸"正是整页
             跳转的白屏期 */
          if (!newCW || !oldCW) throw new Error('layout mismatch');
          if (doc.body.classList.contains('dark-mode') !== body.classList.contains('dark-mode')) {
            body.classList.toggle('dark-mode', doc.body.classList.contains('dark-mode'));
          }
          /* 页面专属 body 类必须在这里显式同步: ht-skin-show 只在整页加载时由
             启动逻辑添加(约 614 行), PJAX 进/出详情页若不同步, 玻璃化和
             背景控件隐藏会随访问入口不同时有时无 */
          body.classList.toggle('ht-skin-show', /^\/skinlib\/show\/\d+$/.test(u.pathname));
          var newTitle = doc.querySelector('title');
          if (newTitle) document.title = newTitle.textContent;
          var newExtra = doc.querySelector('#blessing-extra');
          var oldExtra = document.querySelector('#blessing-extra');
          if (newExtra && oldExtra) oldExtra.textContent = newExtra.textContent;
          /* 换页过渡: 方向性滑动——前进: 旧内容左滑出, 新内容从右滑入;
             后退(popstate)反向。旧内容 absolute 不占高度(容器高=新内容高),
             位移拉满容器宽度(100%)保证新旧完全不重叠; 播完移除旧节点还原样式。
             起始态类挂载后第二帧移除, 保证 transition 有起始帧可播 */
          /* 局部化: 皮肤库筛选/分页(新旧内容都是材质网格页)只滑网格区,
             标题与筛选栏保持不动——它们内容没变, 跟着滑既多余又打断。
             筛选栏 chips 的 active 态用类名同步(渐变由 transition 完成),
             计数文字直接替换文本 */
          var newGrid = newCW.querySelector('.sl-grid');
          var oldGrid = oldCW.querySelector('.sl-grid');
          if (newGrid && oldGrid) {
            /* 复位连贯起点挂在整区上的 exit 类: 局部路径只滑网格,
               整区(content-wrapper)保持不动 */
            oldCW.classList.remove('ht-pjax-exit-' + dir);
            var newFilter = newCW.querySelector('.sl-filter-card');
            var oldFilter = oldCW.querySelector('.sl-filter-card');
            if (newFilter && oldFilter) {
              var newChips = newFilter.querySelectorAll('.sl-chip');
              var oldChips = oldFilter.querySelectorAll('.sl-chip');
              newChips.forEach(function (nc, i) {
                var oc = oldChips[i];
                if (oc) oc.className = nc.className;
              });
              var oldSort = oldFilter.querySelector('.sl-sort');
              var newSort = newFilter.querySelector('.sl-sort');
              if (oldSort && newSort) oldSort.value = newSort.value;
            }
            /* 计数文字在滑动时同步(放在预加载之后, 避免"标题已是新数、网格还是旧内容"的中间态) */
            var syncCount = function () {
              var oldCount = oldCW.querySelector('.content-header .text-muted');
              var newCount = newCW.querySelector('.content-header .text-muted');
              if (oldCount && newCount) oldCount.textContent = newCount.textContent;
            };
            /* 分页区直接替换(不滑) */
            var oldPag = oldCW.querySelector('.sl-pagination');
            var newPag = newCW.querySelector('.sl-pagination');
            if (oldPag && newPag) oldPag.parentNode.replaceChild(newPag, oldPag);
            else if (!oldPag && newPag) {
              /* 从无分页变有分页: 插到网格后 */
              oldGrid.parentNode.insertBefore(newPag, oldGrid.nextSibling);
            } else if (oldPag && !newPag) {
              oldPag.parentNode.removeChild(oldPag);
            }
            /* 网格区滑动: 先预加载新网格图片(最多等 350ms)——否则滑入的是
               一片空白卡片, 图片懒加载在动画后才慢慢填(用户观感的"切换后空一下");
               预加载完成后: 旧网格保持占位滑出, 新网格 absolute 叠层滑入,
               播完新网格转正常流、旧网格移除(页面高度全程稳定) */
            var imgs = newGrid.querySelectorAll('img[src]');
            var waiters = [];
            for (var wi = 0; wi < imgs.length && wi < 36; wi++) {
              (function (im) {
                waiters.push(new Promise(function (res) {
                  var probe = new Image();
                  probe.onload = probe.onerror = res;
                  probe.src = im.getAttribute('src');
                }));
              })(imgs[wi]);
            }
            var imgBarrier = new Promise(function (res) { setTimeout(res, 350); });
            Promise.race([Promise.all(waiters), imgBarrier]).then(function () {
              syncCount();
              var gen = ++htPjaxGen;
              var gp = oldGrid.parentNode;
              gp.style.position = 'relative';
              gp.style.overflow = 'hidden';
              oldGrid.classList.add('ht-pjax-exit-' + dir);
              var importGrid = document.importNode(newGrid, true);
              htPjaxFreezeAnim(importGrid);
              importGrid.classList.add('ht-pjax-enter-' + dir);
              importGrid.classList.add('ht-pjax-overlay');
              /* overlay 必须落在旧网格的实际位置: 网格在容器里位于标题+筛选栏之后,
                 absolute 默认 top:0 会跑到容器顶部与标题文字重叠, 动画完再"掉下来"。
                 水平方向也取旧网格的实际几何——父容器有 padding 时 left:0/right:0
                 会比旧网格宽出两侧 padding, 动画结束会横跳 */
              var gpRect = gp.getBoundingClientRect();
              var gridRect = oldGrid.getBoundingClientRect();
              htPjaxSpot(importGrid, gridRect, gpRect, gp.scrollLeft, gp.scrollTop, gridRect.width, oldGrid);
              gp.insertBefore(importGrid, oldGrid.nextSibling);
              void importGrid.offsetWidth; /* 强制 reflow 固定起始态 */
              importGrid.classList.remove('ht-pjax-enter-' + dir);
              setTimeout(function () {
                importGrid.classList.remove('ht-pjax-overlay');
                if (oldGrid.parentNode) oldGrid.parentNode.removeChild(oldGrid);
                if (gen !== htPjaxGen) return; /* 已有更新的动画接管, 容器样式归它管 */
                gp.style.position = '';
                gp.style.overflow = '';
                importGrid.style.top = '';
                importGrid.style.left = '';
                importGrid.style.width = '';
                importGrid.style.right = '';
                htPjaxBusy = false; /* 动画结束才放行下一次切换 */
              }, 420);
            });
            /* 非网格部分(侧栏高亮/标题/地址栏)照旧处理, 但不换 content-wrapper */
            if (window.blessing) { blessing.route = u.pathname.replace(/^\//, ''); }
            if (push) history.pushState({ htPjax: true }, '', u.href);
            htMarkSidebar(u.pathname);
            document.body.classList.remove('sidebar-open');
            document.dispatchEvent(new CustomEvent('ht:pjax:navigated'));
            /* busy 持有到动画彻底结束(在 barrier 的清理定时器里复位)——
               fetch 完成就复位会让预加载/动画期间的连续点击叠加执行 */
            window.scrollTo(0, 0);
            return;
          }
          /* 文档详情→详情局部化(2026-11-26): 目录与标题不动, 只滑正文卡——
             与皮肤库同一理念(不变的部分不参与动画)。索引→详情结构变化,
             仍走整区路径 */
          var newArticle = newCW.querySelector('.col-md-9 > .card');
          var oldArticle = oldCW.querySelector('.col-md-9 > .card');
          if (newArticle && oldArticle) {
            oldCW.classList.remove('ht-pjax-exit-' + dir);
            /* 目录: 类名同步(active 高亮渐变), 目录内容本身不变 */
            var newSide = newCW.querySelector('.doc-side');
            var oldSide = oldCW.querySelector('.doc-side');
            if (newSide && oldSide) {
              var naLinks = newSide.querySelectorAll('.doc-side-link');
              var oaLinks = oldSide.querySelectorAll('.doc-side-link');
              naLinks.forEach(function (na, i) {
                var oa = oaLinks[i];
                if (oa) oa.className = na.className;
              });
            }
            /* 标题原地换文本 */
            var oldH1 = oldCW.querySelector('.content-header h1');
            var newH1 = newCW.querySelector('.content-header h1');
            if (oldH1 && newH1) oldH1.innerHTML = newH1.innerHTML;
            /* 正文卡: 卡片级推入(同页 wipe 的缩小版)——旧卡原地占位, 新卡带
               近实心底从侧面整幅滑入盖住。不滑+交叉淡化会让两套正文文字
               叠在一起(用户录屏点名), 推入则新旧内容永远不相叠 */
            var ap = oldArticle.parentNode;
            ap.style.position = 'relative';
            ap.style.overflow = 'hidden'; /* 裁住列外部分(滑入起点在列缘外) */
            var importArticle = document.importNode(newArticle, true);
            htPjaxFreezeAnim(importArticle);
            importArticle.classList.add('ht-pjax-overlay');
            /* 新卡底色提到不透明(颜色从旧卡读——detached 克隆拿不到样式),
               落地后短过渡回落半透明玻璃 */
            var cBgM = getComputedStyle(oldArticle).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
            var cDim = cBgM && cBgM[4] !== undefined ? parseFloat(cBgM[4]) : 0.75;
            if (cBgM && cDim > 0) importArticle.style.setProperty('background-color', 'rgba(' + cBgM[1] + ',' + cBgM[2] + ',' + cBgM[3] + ',0.97)', 'important');
            var apRect = ap.getBoundingClientRect();
            var artRect = oldArticle.getBoundingClientRect();
            /* 水平同样取旧卡几何: .col-md-9 有 15px padding, left:0/right:0
               会让卡片比旧卡宽出两侧 padding, 动画结束横跳 */
            htPjaxSpot(importArticle, artRect, apRect, ap.scrollLeft, ap.scrollTop, artRect.width, oldArticle);
            /* 滑入距离=列宽: 从列缘外整幅推入, 旧卡不被露出残条 */
            var cSweep = Math.round(apRect.width);
            importArticle.style.transform = 'translateX(' + (dir === 'left' ? cSweep : -cSweep) + 'px)';
            ap.insertBefore(importArticle, oldArticle.nextSibling);
            void importArticle.offsetWidth;
            importArticle.style.transform = 'translateX(0)';
            var artGen = ++htPjaxGen;
            setTimeout(function () {
              importArticle.classList.remove('ht-pjax-overlay');
              if (oldArticle.parentNode) oldArticle.parentNode.removeChild(oldArticle);
              if (artGen !== htPjaxGen) return;
              ap.style.position = '';
              ap.style.overflow = '';
              importArticle.style.top = '';
              importArticle.style.left = '';
              importArticle.style.width = '';
              importArticle.style.right = '';
              /* 底色回落: 卡片没有自带 background-color 过渡, 冻结其余过渡后
                 补一个短过渡落到原玻璃值, 下一拍解除冻结 */
              importArticle.style.setProperty('transition', 'background-color .25s ease', 'important');
              if (cBgM && cDim > 0) importArticle.style.setProperty('background-color', 'rgba(' + cBgM[1] + ',' + cBgM[2] + ',' + cBgM[3] + ',' + cDim + ')', 'important');
              htPjaxBusy = false;
              setTimeout(function () {
                importArticle.style.removeProperty('transition');
                importArticle.style.removeProperty('background-color');
              }, 300);
            }, 460);
            if (window.blessing) { blessing.route = u.pathname.replace(/^\//, ''); }
            if (push) history.pushState({ htPjax: true }, '', u.href);
            htMarkSidebar(u.pathname);
            document.body.classList.remove('sidebar-open');
            document.dispatchEvent(new CustomEvent('ht:pjax:navigated'));
            window.scrollTo(0, 0);
            return;
          }
          /* 文档索引↔文章: 目录面板 FLIP 形变(2026-11-28, 用户点名转场)——
             索引页的目录框平移缩小到文章页左侧目录位, 右侧正文卡流畅淡入;
             反向(文章→索引)目录框放大回索引面板位, 正文卡淡出。
             不走整幅推入: 背景静止(壁纸层视口对齐+不位移), 只有面板与内容动 */
          var oldIdxPanel = oldCW.querySelector('.doc-groups');
          var oldSide = oldCW.querySelector('.doc-side');
          var newIdxPanel = newCW.querySelector('.doc-groups');
          var newSide = newCW.querySelector('.doc-side');
          if ((oldIdxPanel && newSide) || (oldSide && newIdxPanel)) {
            var mImport = document.importNode(newCW, true);
            htPjaxFreezeAnim(mImport);
            mImport.classList.add('ht-pjax-overlay');
            /* 面板底色与壁纸层: 与整幅推入同款(实心底+视口对齐壁纸), 但不位移 */
            var mBg = getComputedStyle(oldCW).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
            var mDim = mBg && mBg[4] !== undefined ? parseFloat(mBg[4]) : 0.5;
            if (mBg && mDim > 0) mImport.style.setProperty('background-color', 'rgba(' + mBg[1] + ',' + mBg[2] + ',' + mBg[3] + ',1)', 'important');
            var mWp = null;
            var mLayers = document.querySelectorAll('.ht-wp-layer');
            for (var mi = 0; mi < mLayers.length; mi++) {
              var mBi = getComputedStyle(mLayers[mi]).backgroundImage;
              if (mBi && mBi !== 'none') { mWp = mBi; break; }
            }
            var mParent = oldCW.parentNode;
            mParent.style.position = 'relative';
            mParent.style.overflow = 'hidden';
            var mParentRect = mParent.getBoundingClientRect();
            var mOldRect = oldCW.getBoundingClientRect();
            htPjaxSpot(mImport, mOldRect, mParentRect, mParent.scrollLeft, mParent.scrollTop, mOldRect.width, oldCW);
            mImport.style.minHeight = Math.round(mOldRect.height) + 'px';
            mImport.style.overflow = 'hidden';
            mImport.style.transform = 'translateX(0)'; /* 维持叠层语境(z:-1 壁纸层依赖) */
            if (mWp) {
              var mWpDiv = document.createElement('div');
              mWpDiv.style.cssText = 'position:absolute;left:' + Math.round(-mOldRect.left) + 'px;top:' + Math.round(-mOldRect.top) + 'px;' +
                'width:' + Math.round(window.innerWidth) + 'px;height:' + Math.round(window.innerHeight) + 'px;' +
                'z-index:-1;pointer-events:none;background-repeat:no-repeat;background-size:cover;' +
                'background-position:center center;background-image:' + mWp + ';opacity:' + Math.min(0.9, Math.max(0, 1 - mDim)).toFixed(3) + ';';
              mImport.insertBefore(mWpDiv, mImport.firstChild);
            }
            /* 新页对应面板藏起来(ghost 顶替), 新标题走 ht-fade 淡入(解冻它) */
            var mTarget = mImport.querySelector(newSide ? '.doc-side' : '.doc-groups');
            if (mTarget) mTarget.style.visibility = 'hidden';
            var mH1 = mImport.querySelector('.content-header h1');
            if (mH1) mH1.style.animation = '';
            /* 右侧正文卡: 索引→文章 淡入+右移归位; 文章→索引 由旧卡 ghost 淡出 */
            var mContent = mImport.querySelector('.col-md-9 > .card');
            if (newSide && mContent) {
              mContent.style.opacity = '0';
              mContent.style.transform = 'translateX(36px)';
              mContent.style.transition = 'opacity .3s ease .1s, transform .3s ease .1s';
            }
            /* 叠层自身淡入: 直接一帧盖上去是硬切(用户录屏"瞬时割裂")。
               壁纸层视口对齐=淡入前后壁纸逐像素相同, ghost 又恰好垫住旧面板——
               淡入过程无任何内容跳变 */
            mImport.style.opacity = '0';
            mParent.insertBefore(mImport, oldCW.nextSibling);
            void mImport.offsetWidth;
            mImport.style.opacity = '1';
            if (newSide && mContent) { mContent.style.opacity = '1'; mContent.style.transform = 'none'; }
            /* ghost: 旧面板克隆, fixed 在旧位置, FLIP 到新面板位置(translate+scale,
               transform-origin 左上)。面板内容两侧几乎一致, 形变读作"目录框挪过去缩小" */
            var mFrom = oldIdxPanel || oldSide;
            var mFromRect = mFrom.getBoundingClientRect();
            var mToRect = mTarget.getBoundingClientRect();
            var mGhost = mFrom.cloneNode(true);
            /* ghost 必须挂进叠层的 #docs-page: 面板样式(#docs-page .doc-groups /
               .doc-side)是作用域限定的, 挂到 body 会丢样式(链接变默认蓝色、
               玻璃底消失)。ghost 的 absolute 包含块=叠层, 坐标用叠层相对值。
               形变直接过渡 left/top/width/height——不能用 scale FLIP: 盒子按
               目标窄宽排版再放大数倍, 文字会变巨字并乱折行(#34 录屏) */
            var mDocsPage = mImport.querySelector('#docs-page') || mImport;
            var mOvRect = mImport.getBoundingClientRect();
            var mRel = function (r) { return { x: r.left - mOvRect.left, y: r.top - mOvRect.top }; };
            var oRel = mRel(mFromRect), tRel = mRel(mToRect);
            mGhost.style.cssText = 'position:absolute;left:' + oRel.x + 'px;top:' + oRel.y + 'px;' +
              'width:' + Math.round(mFromRect.width) + 'px;height:' + Math.round(mFromRect.height) + 'px;margin:0;overflow:hidden;' +
              'z-index:3000;pointer-events:none;' +
              'transition:left .38s cubic-bezier(.4,0,.2,1), top .38s cubic-bezier(.4,0,.2,1), ' +
              'width .38s cubic-bezier(.4,0,.2,1), height .38s cubic-bezier(.4,0,.2,1)';
            mDocsPage.appendChild(mGhost);
            void mGhost.offsetWidth;
            mGhost.style.left = tRel.x + 'px';
            mGhost.style.top = tRel.y + 'px';
            mGhost.style.width = Math.round(mToRect.width) + 'px';
            mGhost.style.height = Math.round(mToRect.height) + 'px';
            /* 文章→索引: 旧正文卡克隆淡出(新页没有正文卡, 直接消失会跳) */
            var mOldContent = oldCW.querySelector('.col-md-9 > .card');
            if (!newSide && mOldContent) {
              var ocR = mOldContent.getBoundingClientRect();
              var ocRel = mRel(ocR);
              var mOcGhost = mOldContent.cloneNode(true);
              mOcGhost.style.cssText = 'position:absolute;left:' + ocRel.x + 'px;top:' + ocRel.y + 'px;width:' +
                Math.round(ocR.width) + 'px;height:' + Math.round(ocR.height) + 'px;margin:0;overflow:hidden;z-index:2999;' +
                'pointer-events:none;transition:opacity .24s ease';
              mDocsPage.appendChild(mOcGhost);
              void mOcGhost.offsetWidth;
              mOcGhost.style.opacity = '0';
              setTimeout(function () { if (mOcGhost.parentNode) mOcGhost.parentNode.removeChild(mOcGhost); }, 300);
            }
            var mGen = ++htPjaxGen;
            setTimeout(function () {
              /* 揭示改交叉淡化: 真面板淡入、ghost 淡出后移除——两者内容有差异
                 (目录标题/active 高亮), 瞬时切换会"凭空多东西"(用户录屏点名)。
                 busy 在交叉淡化结束后才放行 */
              if (mTarget) {
                mTarget.style.visibility = 'visible';
                mTarget.style.transition = 'opacity .2s ease';
                mTarget.style.opacity = '0';
                void mTarget.offsetWidth;
                mTarget.style.opacity = '1';
                setTimeout(function () {
                  mTarget.style.removeProperty('transition');
                  mTarget.style.removeProperty('opacity');
                }, 240);
              }
              if (mGhost.parentNode) {
                mGhost.style.transition = 'opacity .2s ease';
                mGhost.style.opacity = '0';
                setTimeout(function () { if (mGhost.parentNode) mGhost.parentNode.removeChild(mGhost); }, 230);
              }
              mImport.classList.remove('ht-pjax-overlay');
              if (oldCW.parentNode) oldCW.parentNode.removeChild(oldCW);
              if (mGen !== htPjaxGen) return;
              mParent.style.position = '';
              mParent.style.overflow = '';
              mImport.style.top = '';
              mImport.style.left = '';
              mImport.style.width = '';
              mImport.style.right = '';
              mImport.style.minHeight = '';
              mImport.style.overflow = '';
              mImport.style.transform = '';
              if (mWpDiv && mWpDiv.parentNode) mWpDiv.parentNode.removeChild(mWpDiv);
              mImport.style.setProperty('transition', 'none', 'important');
              if (mBg && mDim > 0) mImport.style.setProperty('background-color', 'rgba(' + mBg[1] + ',' + mBg[2] + ',' + mBg[3] + ',' + mDim + ')', 'important');
              htPjaxBusy = false;
              setTimeout(function () {
                mImport.style.removeProperty('transition');
                mImport.style.removeProperty('background-color');
              }, 60);
            }, 560);
            if (window.blessing) { blessing.route = u.pathname.replace(/^\//, ''); }
            if (push) history.pushState({ htPjax: true }, '', u.href);
            htMarkSidebar(u.pathname);
            document.body.classList.remove('sidebar-open');
            document.dispatchEvent(new CustomEvent('ht:pjax:navigated'));
            window.scrollTo(0, 0);
            return;
          }
          var pjaxDir = dir;
          var parent = oldCW.parentNode;
          parent.style.position = 'relative';
          parent.style.overflow = 'hidden'; /* 裁住越界部分 */
          /* 注意: 不能给 .wrapper 复制旧页底色做"保险垫"——wrapper 铺满整页,
             那层半透明柔光会垫到毛玻璃侧栏/页眉背后, 它们会先变浅再变深
             (清理撤掉时)。推入面板自带实心底+壁纸, 旧页原地不动占位,
             中间不再需要任何垫底。 */
          var importNode = document.importNode(newCW, true);
          htPjaxFreezeAnim(importNode);
          importNode.classList.add('ht-pjax-overlay'); /* absolute 叠层 */
          /* 动画期间把柔光底提到不透明: 半透明底会让旧页面透过新页显形(双影)。
             颜色从已挂载的旧元素读(detached 克隆 getComputedStyle 拿不到样式),
             且必须 inline !important——body.ht-panel .content-wrapper 的
             background 是 !important 声明, 普通 inline 压不过它 */
          var bgM = getComputedStyle(oldCW).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
          var dimA = bgM && bgM[4] !== undefined ? parseFloat(bgM[4]) : 0.5;
          /* 旧页底色全透明(dimA=0, 如皮肤详情页)时不刷底色, 否则会变成黑板 */
          if (bgM && dimA > 0) importNode.style.setProperty('background-color', 'rgba(' + bgM[1] + ',' + bgM[2] + ',' + bgM[3] + ',1)', 'important');
          /* 给推入的页面铺上"和落地后一模一样"的壁纸底: 纯色板上叠一层壁纸纹理,
             透明度取柔光浓度的补数——纯色 C 上叠壁纸×o 视觉上等于壁纸上加 C×dimA
             的柔光(C*dimA + img*(1-dimA) == C*(1-o) + img*o, 取 o=1-dimA)。
             壁纸图从固定层 .ht-wp-layer 读(可能是 base64 data URL)。
             没开壁纸功能时就没有这层, 面板为纯色底 */
          var wpSrc = null;
          var wpLayers = document.querySelectorAll('.ht-wp-layer');
          for (var wi = 0; wi < wpLayers.length; wi++) {
            var bi = getComputedStyle(wpLayers[wi]).backgroundImage;
            if (bi && bi !== 'none') { wpSrc = bi; break; }
          }
          /* overlay 按旧内容实际偏移定位: top:0 相对 .wrapper 顶部, 会在动画期
             跑到页面最顶(与顶栏/标题错位), 播完才落回原位; 水平同理——
             有侧栏时 .content-wrapper 带 margin-left, left:0/right:0 会铺到侧栏底下。
             htPjaxSpot 内部还会抵扣克隆体自带的布局 margin(见函数注释) */
          var parentRect = parent.getBoundingClientRect();
          var oldRect = oldCW.getBoundingClientRect();
          htPjaxSpot(importNode, oldRect, parentRect, parent.scrollLeft, parent.scrollTop, oldRect.width, oldCW);
          /* 高度至少盖满旧内容: 新页更矮时, 下方露出的旧页残条不用淡出,
             直接由实心底盖住(避免 oldCW 上的 opacity 内联被既有 transition
             的级联优先级拖住不生效) */
          importNode.style.minHeight = Math.round(oldRect.height) + 'px';
          /* 整幅推入: 位移用像素(壁纸层要反向抵消, % 各自参照不同宽度会对不齐)。
             前进(pjaxDir=left)从右侧屏外推入, 后退从左侧 */
          var sweep = Math.round(oldRect.width);
          var sweepSign = pjaxDir === 'left' ? 1 : -1;
          importNode.style.transform = 'translateX(' + (sweepSign * sweep) + 'px)';
          /* 壁纸层(视口对齐): 尺寸=视口、在叠层坐标系里偏移到视口原点。
             关键是反向位移与推入同曲线同步抵消——壁纸在滑动全程与 body 壁纸
             逐像素对齐, 面板边界两侧壁纸无缝(元素对齐裁切与视口裁切不一致
             会造成重影/错位/落地闪变)。面板底色不透明, 旧内容被盖住不显形 */
          var wpDiv = null;
          if (wpSrc) {
            wpDiv = document.createElement('div');
            wpDiv.style.cssText = 'position:absolute;' +
              'left:' + Math.round(-oldRect.left) + 'px;top:' + Math.round(-oldRect.top) + 'px;' +
              'width:' + Math.round(window.innerWidth) + 'px;height:' + Math.round(window.innerHeight) + 'px;' +
              'z-index:-1;pointer-events:none;' +
              'background-repeat:no-repeat;background-size:cover;background-position:center center;' +
              'background-image:' + wpSrc + ';opacity:' + Math.min(0.9, Math.max(0, 1 - dimA)).toFixed(3) + ';' +
              'transition:transform 0.24s ease-out;' +
              'transform:translateX(' + (-sweepSign * sweep) + 'px)';
          }
          if (wpDiv) importNode.insertBefore(wpDiv, importNode.firstChild);
          /* 裁住伸出叠层框外的壁纸层(只露与面板框相交的部分) */
          importNode.style.overflow = 'hidden';
          parent.insertBefore(importNode, oldCW.nextSibling);
          /* 强制 reflow 固定起始态(整幅屏外)后双双落到 0 触发 transition——
             同一任务、同一曲线, 反向位移严格抵消; 保留 translateX(0) 维持
             stacking context(z:-1 壁纸层依赖它) */
          void importNode.offsetWidth;
          importNode.style.transform = 'translateX(0)';
          if (wpDiv) wpDiv.style.transform = 'translateX(0)';
          var gen = ++htPjaxGen;
          setTimeout(function () {
            importNode.classList.remove('ht-pjax-overlay'); /* 新内容回到正常流 */
            if (oldCW.parentNode) oldCW.parentNode.removeChild(oldCW);
            if (gen !== htPjaxGen) return; /* 已有更新的动画接管, 容器样式归它管 */
            parent.style.position = '';
            parent.style.overflow = '';
            importNode.style.top = '';
            importNode.style.left = '';
            importNode.style.width = '';
            importNode.style.right = '';
            importNode.style.minHeight = '';
            importNode.style.overflow = '';
            importNode.style.transform = ''; /* 叠层语境结束, 壁纸层一并移除 */
            if (wpDiv && wpDiv.parentNode) wpDiv.parentNode.removeChild(wpDiv);
            /* 落地即落定: 面板壁纸(视口对齐)与 body 壁纸逐像素相同, 移除壁纸层
               前后观感不变——但要从不透明底瞬时切回半透明, 若走 background-color
               过渡, 过渡期底色偏亮会闪。冻结过渡直接跳到落定值, 下一拍解除冻结 */
            importNode.style.setProperty('transition', 'none', 'important');
            if (bgM && dimA > 0) importNode.style.setProperty('background-color', 'rgba(' + bgM[1] + ',' + bgM[2] + ',' + bgM[3] + ',' + dimA + ')', 'important');
            htPjaxBusy = false; /* 动画结束才放行下一次切换 */
            setTimeout(function () {
              importNode.style.removeProperty('transition');
              importNode.style.removeProperty('background-color');
            }, 60);
          }, 560);
          if (window.blessing) { blessing.route = u.pathname.replace(/^\//, ''); }
          window.scrollTo(0, 0);
          if (push) history.pushState({ htPjax: true }, '', u.href);
          htMarkSidebar(u.pathname);
          /* 移动端抽屉随导航收起 */
          document.body.classList.remove('sidebar-open');
          /* 通知页面级增量模块(评论区等)按新内容重新初始化 */
          document.dispatchEvent(new CustomEvent('ht:pjax:navigated'));
          /* busy 在动画清理定时器里复位(见上), 这里不再提前放行 */
          var page = HT_PAGES[u.pathname.replace(/\/$/, '')] || HT_PAGES[u.pathname];
          /* 皮肤详情页: 路径带 tid(正则路由), 挂载表用动态条目——
             漏了它会导致 PJAX 进入详情页时 #previewer/#side 空壳(需手动刷新) */
          var showMatch = u.pathname.match(/^\/skinlib\/show\/(\d+)$/);
          if (!page && showMatch) {
            page = { route: 'skinlib/show/' + showMatch[1], chunks: [390, 512], module: 8512, el: '#side' };
          }
          if (page) {
            htRemount(page).catch(function () { location.href = u.href; });
          }
        })
        .catch(function () {
          htPjaxBusy = false;
          location.href = u.href; /* 兜底: 任何失败回退原生跳转 */
        });
    }

    /* PJAX 启用条件放宽(2026-11-25): 有内容区(.content-wrapper)即可——皮肤库/文档
       等顶栏布局(layout-top-nav)没有侧栏, 此前被挡在 PJAX 外导致筛选/分页整页刷新 */
    if (document.querySelector('.content-wrapper')) {
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#' || a.target === '_blank' || a.hasAttribute('download')) return;
        var u = new URL(a.href, location.href);
        if (u.origin !== location.origin || u.hash) return;
        var path = u.pathname.replace(/\/$/, '');
        var known = !!HT_PAGES[path] || HT_STATIC.indexOf(path) !== -1 ||
          /^\/skinlib\/show\/\d+$/.test(path) || /^\/docs\/[a-z0-9-]+$/.test(path);
        if (!known) return; /* 只在已知的同布局页面间 PJAX, 其余原生跳转 */
        /* 同路径无 query = 原地不动; 带 query 的同路径是筛选/分页切换(如皮肤库
           ?filter= ?page=), 要 PJAX 刷新内容区——此前带 search 直接整页刷新的根因 */
        var cur = location.pathname.replace(/\/$/, '');
        if (path === cur && !u.search) return;
        /* 例外: lang= 是整页语言切换(侧栏/页眉/底部都要换), 必须原生跳转 */
        if (u.search && u.search.indexOf('lang=') !== -1) return;
        e.preventDefault();
        htPjaxGo(u.href, true, htPjaxDirFor(a));
      }, true);
      window.addEventListener('popstate', function (e) {
        if (document.querySelector('.content-wrapper')) htPjaxGo(location.href, false);
      });
    }
  } catch (e) {
    /* 主题装饰失败时不影响站点功能 */
  }
})();
