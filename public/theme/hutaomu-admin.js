/* ==================================================================
   胡桃木皮肤站 · 管理后台交互 v2（2026-11-24 二次重构，无侧栏布局）
   职责：顶栏分组下拉点击开合(触屏)/外点关闭/Esc、移动端全屏抽屉、设置页锚点高亮。
   桌面下拉的悬停展开由纯 CSS 完成；这里只补点击行为。
   ================================================================== */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('ap-body')) return;

  /* ---------- 顶栏分组下拉：点击开合(触屏友好) ---------- */
  var navItems = document.querySelectorAll('.ap-nav-item[data-ap-dropdown]');
  function closeAll(except) {
    navItems.forEach(function (item) {
      if (item !== except) {
        item.classList.remove('is-open');
        var btn = item.querySelector('.ap-nav-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
  navItems.forEach(function (item) {
    var btn = item.querySelector('.ap-nav-btn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !item.classList.contains('is-open');
      closeAll(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* 鼠标离开分组时收起(悬停展开由 CSS :hover 完成) */
    item.addEventListener('mouseleave', function () {
      item.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.ap-nav-item')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });

  /* ---------- 移动端全屏抽屉 ---------- */
  var drawer = document.getElementById('ap-drawer');
  var openBtn = document.getElementById('ap-drawer-toggle');
  var closeBtn = document.getElementById('ap-drawer-close');
  var scrim = document.getElementById('ap-scrim');
  function openDrawer() {
    body.classList.add('ap-drawer-open');
    if (drawer) drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    body.classList.remove('ap-drawer-open');
    if (drawer) drawer.setAttribute('aria-hidden', 'true');
  }
  if (openBtn) openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (scrim) scrim.addEventListener('click', closeDrawer);
  if (drawer) {
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeDrawer);
    });
  }

  /* ---------- 设置页锚点导航高亮(scrollspy) ---------- */
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
          if (entry.isIntersecting) current = entry.target;
        });
        if (current) {
          links.forEach(function (a) { a.classList.remove('is-active'); });
          var hit = sections.filter(function (s) { return s.el === current; })[0];
          if (hit) hit.link.classList.add('is-active');
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );
    sections.forEach(function (s) { spy.observe(s.el); });
  }
})();
