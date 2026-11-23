/* ==================================================================
   胡桃木皮肤站 · 管理后台交互（2026-11-24 全新重构）
   仅在新后台布局（admin/layout.twig）加载。
   职责：侧栏折叠(桌面)/抽屉(移动)/插件配置子菜单开合/设置页锚点高亮。
   不依赖 AdminLTE JS；React 与 blessing 桥接仍由 app bundle 负责。
   ================================================================== */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('ap-body')) return;

  var MINI_KEY = 'ht_admin_mini';

  /* ---------- 桌面折叠 ---------- */
  var collapseBtn = document.getElementById('ap-collapse-toggle');
  function applyMini(on) {
    body.classList.toggle('ap-mini', on);
    var btn = document.getElementById('ap-collapse-toggle');
    if (btn) btn.title = on ? '展开导航' : '收起导航';
  }
  if (collapseBtn) {
    /* 记忆用户偏好，但窄窗口不恢复折叠态 */
    if (window.innerWidth > 920 && localStorage.getItem(MINI_KEY) === '1') {
      applyMini(true);
    }
    collapseBtn.addEventListener('click', function () {
      var on = !body.classList.contains('ap-mini');
      applyMini(on);
      try { localStorage.setItem(MINI_KEY, on ? '1' : '0'); } catch (e) { /* 隐私模式忽略 */ }
    });
  }

  /* ---------- 移动端抽屉 ---------- */
  var drawerBtn = document.getElementById('ap-drawer-toggle');
  var scrim = document.getElementById('ap-scrim');
  function closeDrawer() { body.classList.remove('ap-drawer-open'); }
  if (drawerBtn) {
    drawerBtn.addEventListener('click', function () {
      body.classList.toggle('ap-drawer-open');
    });
  }
  if (scrim) scrim.addEventListener('click', closeDrawer);
  /* 抽屉内点击任意导航链接后自动收起 */
  document.querySelectorAll('.ap-sidebar .ap-nav-link').forEach(function (a) {
    if (a.tagName === 'A') a.addEventListener('click', closeDrawer);
  });

  /* ---------- 插件配置子菜单开合 ---------- */
  var groupToggle = document.querySelector('.ap-nav-group-toggle');
  if (groupToggle) {
    groupToggle.addEventListener('click', function () {
      var group = groupToggle.closest('.ap-nav-group');
      var open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      groupToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- 设置页锚点导航高亮（scrollspy） ---------- */
  var settingsNav = document.querySelector('.ap-settings-nav');
  if (settingsNav && 'IntersectionObserver' in window) {
    var links = Array.prototype.slice.call(settingsNav.querySelectorAll('a[href^="#"]'));
    var sections = links
      .map(function (a) {
        var el = document.getElementById(a.getAttribute('href').slice(1));
        return el ? { link: a, el: el } : null;
      })
      .filter(Boolean);
    var current = null;
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            current = entry.target;
          }
        });
        if (current) {
          links.forEach(function (a) { a.classList.remove('is-active'); });
          var hit = sections.filter(function (s) { return s.el === current; })[0];
          if (hit) hit.link.classList.add('is-active');
        }
      },
      { rootMargin: '-70px 0px -60% 0px', threshold: 0 }
    );
    sections.forEach(function (s) { spy.observe(s.el); });
  }
})();
