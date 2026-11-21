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
    function fetchRandomWallpaper() {
      var bust = (WALLPAPER_API.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
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
            return fetchRandomWallpaper();
          }
          pfDup = 0;
          return b64;
        });
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
      if (isHome) setTimeout(prefetchNextWallpaper, 300); /* 主页也预取(用户中心可即时换) */
    } else if (acOn) {
      body.classList.add('ht-panel');
      ensureAcWallpaper();
      setTimeout(prefetchNextWallpaper, 300); /* 静默预取下一张 */
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
      fetchRandomWallpaper().then(function (b64) { wpPrefetch = b64; })
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
      /* 直接走服务端中继(多源随机+可落盘), 通常 1~2 秒到手 */
      fetchRandomWallpaper().then(function (b64) {
        wpBusy = false;
        if (btn) btn.classList.remove('busy');
        setWallpaper(b64);
        prefetchNextWallpaper();
      }, function () {
        /* 中继失败(全部源挂): 立即恢复按钮并提示, 不留死窗口 */
        wpBusy = false;
        if (btn) btn.classList.remove('busy');
        if (toast) toast.warning('图源暂时都挂了，稍后再试');
        setTimeout(prefetchNextWallpaper, 3000);
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

    /* ---------- 主题切换器(仅登录用户) ---------- */
    function applyModeButtons() {
      var dark = body.classList.contains('dark-mode');
      var buttons = document.querySelectorAll('.ts-mode-btn');
      for (var m = 0; m < buttons.length; m++) {
        var want = buttons[m].getAttribute('data-mode') === 'dark';
        buttons[m].classList.toggle('active', want === dark);
      }
    }

    function renderFavs() {
      var favs = store.favs;
      var box = document.getElementById('ts-favs');
      var empty = document.getElementById('ts-fav-empty');
      var count = document.getElementById('ts-fav-count');
      if (!box) return;
      if (count) count.textContent = String(favs.length);
      if (empty) empty.style.display = favs.length ? 'none' : 'block';
      box.innerHTML = '';
      for (var f = 0; f < favs.length; f++) {
        (function (b64) {
          var item = document.createElement('div');
          item.className = 'ts-fav-item';
          item.title = '点击应用';
          var prev = document.createElement('div');
          prev.className = 'ts-fav-preview';
          prev.style.backgroundImage = 'url("' + b64 + '")';
          var del = document.createElement('button');
          del.className = 'ts-fav-remove';
          del.type = 'button';
          del.textContent = '✕';
          del.title = '删除';
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            var rest = store.favs.filter(function (x) { return x !== b64; });
            store.favs = rest;
            renderFavs();
          });
          item.appendChild(prev);
          item.appendChild(del);
          item.addEventListener('click', function () {
            setWallpaper(b64);
          });
          box.appendChild(item);
        })(favs[f]);
      }
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
      floatBtn.title = '主题设置';
      floatBtn.innerHTML = '<i class="fas fa-palette"></i>';
      floatBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation(); /* 否则冒泡到「点面板外关闭」处理器, 刚开就被关掉 */
        setPanel(!panel.classList.contains('open'));
      });
      body.appendChild(floatBtn);

      refreshDownloadLink();
      applyModeButtons();
      renderFavs();

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
          if (toast) toast.warning('壁纸还没准备好，稍后再收藏');
          return;
        }
        var favs = store.favs;
        if (favs.indexOf(store.bg) !== -1) {
          if (toast) toast.info('这张已经在收藏里了');
          return;
        }
        if (favs.length >= 9) favs = favs.slice(0, 8);
        favs.push(store.bg);
        store.favs = favs;
        renderFavs();
        if (toast) toast.success('已收藏当前壁纸');
      });

      var autoToggle = document.getElementById('ts-auto-toggle');
      if (autoToggle) autoToggle.addEventListener('click', function () {
        store.auto = !store.auto;
        autoToggle.setAttribute('aria-checked', store.auto ? 'true' : 'false');
        autoToggle.classList.toggle('active', store.auto);
        setAutoTimer();
      });

      var ivs = document.querySelectorAll('.ts-iv');
      for (var v = 0; v < ivs.length; v++) {
        ivs[v].addEventListener('click', function (e) {
          var minutes = parseInt(e.currentTarget.getAttribute('data-min'), 10) || 30;
          store.iv = minutes;
          setAutoTimer();
          var all = document.querySelectorAll('.ts-iv');
          for (var q = 0; q < all.length; q++) {
            all[q].classList.toggle('active', parseInt(all[q].getAttribute('data-min'), 10) === minutes);
          }
        });
      }
      var currentIv = root.querySelector('.ts-iv[data-min="' + store.iv + '"]');
      if (currentIv) currentIv.classList.add('active');
      var acBtnState = document.getElementById('ts-ac-toggle');
      if (acBtnState) {
        acBtnState.setAttribute('aria-checked', acOn ? 'true' : 'false');
        acBtnState.classList.toggle('active', acOn);
      }
      var autoBtn = document.getElementById('ts-auto-toggle');
      if (autoBtn) {
        autoBtn.setAttribute('aria-checked', store.auto ? 'true' : 'false');
        autoBtn.classList.toggle('active', store.auto);
      }

      setAutoTimer();
    }
    bindSwitcher();

    /* ---------- 皮肤库列表页(服务端渲染): 委托绑定, PJAX 换页后仍生效 ---------- */
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.sl-privacy-toggle') : null;
      if (!btn || btn.disabled) return;
      var toPublic = btn.dataset.public !== '1';
      if (!window.confirm('确定将此材质设为「' + (toPublic ? '公开' : '私密') + '」？切换会按站点规则增减积分。')) return;
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
        else { window.alert(d.message || '操作失败'); btn.disabled = false; }
      }).catch(function () { window.alert('网络错误'); btn.disabled = false; });
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
          notify.showModal({ text: '确定要退出登录吗？', center: true }).then(doLogout, function () { /* 取消 */ });
        } catch (err) {
          if (window.confirm('确定要退出登录吗？')) doLogout();
        }
      } else if (window.confirm('确定要退出登录吗？')) {
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
                ? '<i class="fas fa-globe mr-1"></i>公开 · 所有人可见'
                : '<i class="fas fa-lock mr-1"></i>私密 · 仅' + (isAdmin && !isOwner ? '上传者与管理员' : '自己') + '可见';
              var t = document.createElement('button');
              t.className = 'btn btn-sm ht-privacy-toggle-btn';
              t.type = 'button';
              t.textContent = info.public ? '设为私密' : '设为公开';
              t.addEventListener('click', function () {
                var toPublic = !info.public;
                if (!window.confirm('确定设为「' + (toPublic ? '公开' : '私密') + '」？切换会按站点规则增减积分。')) return;
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
                  else { window.alert(d.message || '操作失败'); }
                  t.disabled = false;
                }).catch(function () { window.alert('网络错误'); t.disabled = false; });
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

    /* ---------- Bootstrap 弹窗层级修复 ---------- */
    /* 玻璃卡的 backdrop-filter 会成为 fixed 弹窗的包含块+层叠上下文,
       弹窗的 z1050 被困在卡片内部, 画不过 body 级 z1040 的遮罩 →
       遮罩盖住一切且真实点击全打在遮罩上, 页面锁死(与页眉同一陷阱)。
       show 前把弹窗搬到 body 顶层与遮罩同层比较(Bootstrap 官方建议) */
    (function () {
      var jq = window.jQuery || window.$;
      if (!jq || !jq.fn || !jq.fn.on) return;
      /* 只搬「真的被玻璃祖先困住」的弹窗。无条件搬到 body 会拆散 React 弹窗
         (blessing.notify.showModal 确认框等)——React 事件托管在渲染容器上,
         搬出容器后确定按钮点击失联(取消按钮走 jQuery data-dismiss 不受影响) */
      function trappedInGlass(el) {
        var p = el.parentElement;
        while (p && p !== document.body) {
          var cs = getComputedStyle(p);
          var bf = cs.backdropFilter || cs.webkitBackdropFilter;
          if (bf && bf !== 'none') return true;
          p = p.parentElement;
        }
        return false;
      }
      jq(document).on('show.bs.modal', function (e) {
        var el = e.target;
        if (!el || el === document.body || !el.parentElement || el.parentElement === document.body) return;
        if (trappedInGlass(el)) document.body.appendChild(el);
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
    var HT_STATIC = ['/user/config', '/user/reports', '/about', '/skinlib', '/skinlib/upload'];

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
    function htPjaxGo(url, push) {
      if (htPjaxBusy) return;
      htPjaxBusy = true;
      var u = new URL(url, location.href);
      fetch(u.href, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' }, redirect: 'follow' })
        .then(function (r) {
          if (!r.ok || !r.url || new URL(r.url).pathname !== u.pathname) throw new Error('bad response');
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newCW = doc.querySelector('.content-wrapper');
          var oldCW = document.querySelector('.content-wrapper');
          if (!doc.body.classList.contains('sidebar-mini') || !newCW || !oldCW) throw new Error('layout mismatch');
          if (doc.body.classList.contains('dark-mode') !== body.classList.contains('dark-mode')) {
            body.classList.toggle('dark-mode', doc.body.classList.contains('dark-mode'));
          }
          var newTitle = doc.querySelector('title');
          if (newTitle) document.title = newTitle.textContent;
          var newExtra = doc.querySelector('#blessing-extra');
          var oldExtra = document.querySelector('#blessing-extra');
          if (newExtra && oldExtra) oldExtra.textContent = newExtra.textContent;
          oldCW.parentNode.replaceChild(document.importNode(newCW, true), oldCW);
          if (window.blessing) { blessing.route = u.pathname.replace(/^\//, ''); }
          window.scrollTo(0, 0);
          if (push) history.pushState({ htPjax: true }, '', u.href);
          htMarkSidebar(u.pathname);
          htPjaxBusy = false;
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

    if (authed && document.querySelector('.main-sidebar')) {
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#' || a.target === '_blank' || a.hasAttribute('download')) return;
        var u = new URL(a.href, location.href);
        if (u.origin !== location.origin || u.search || u.hash) return;
        var path = u.pathname.replace(/\/$/, '');
        if (path === location.pathname.replace(/\/$/, '')) return;
        var known = !!HT_PAGES[path] || HT_STATIC.indexOf(path) !== -1 ||
          /^\/skinlib\/show\/\d+$/.test(path);
        if (!known) return; /* 只在已知的同布局页面间 PJAX, 其余原生跳转 */
        e.preventDefault();
        htPjaxGo(u.href, true);
      }, true);
      window.addEventListener('popstate', function (e) {
        if (document.querySelector('.content-wrapper')) htPjaxGo(location.href, false);
      });
    }
  } catch (e) {
    /* 主题装饰失败时不影响站点功能 */
  }
})();
