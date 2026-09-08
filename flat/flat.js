/* ================================================================
   视觉风格 B（flat）交互补丁
   只做三件事：固定浅色主题 / 侧栏激活态与收起 / 未开放项提示
   在 neo.js 与页面脚本之后加载，不改动任何既有逻辑
   ================================================================ */
(() => {
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const say = m => (window.toast ? toast(m) : void 0);

/* ---------- 1. 本皮肤只有浅色：压住 neo 的深空主题 ---------- */
const light = () => { document.documentElement.dataset.theme = 'light'; };
light();
try { localStorage.setItem('neo-theme', 'light'); } catch (e) {}

/* 顶栏由 neo.js 的 renderTopbar 渲染，包一层以便每次渲染后都补丁 */
const origTopbar = window.renderTopbar;
if (typeof origTopbar === 'function') {
  window.renderTopbar = function (...a) {
    origTopbar.apply(this, a);
    light();
    const b = $('#themeBtn');
    if (b) b.onclick = () => { light(); say('风格 B 为单一浅色视觉，未提供深色模式'); };
  };
}

/* ---------- 2. 侧栏：激活态 / 收起 / 未开放项 ---------- */
function sidebar() {
  const sb = $('#sbar');
  if (!sb) return;
  document.body.classList.add('has-sbar');

  const page = document.body.dataset.nav || document.body.dataset.page || 'entry';
  const on = sb.querySelector(`.sb-item[data-nav="${page}"]`);
  if (on) { on.classList.add('on'); on.setAttribute('aria-current', 'page'); }

  const fold = $('#sbFold');
  if (fold) fold.onclick = () => {
    const f = document.body.classList.toggle('sb-fold');
    fold.textContent = f ? '▶' : '◀';
    fold.title = f ? '展开侧栏' : '收起侧栏';
  };

  $$('[data-soon]', sb).forEach(el => {
    el.onclick = () => say(el.dataset.soon);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sidebar);
} else sidebar();

/* ---------- 3. 报告导出：Demo 只出 PDF，去掉 Word 与格式菜单 ---------- */
/* 报告由 report-neo.js 在多处按需重绘（快速评估的右栏、结果页切 tab、升级后重建），
   这里用观察器兜住每一次重绘，而不是包装 renderReport —— flat.js 之后才加载，
   flow.js 启动时的首次渲染包装不到 */
function pdfOnly(root) {
  root.querySelectorAll('.rep-dl:not([data-flat-dl])').forEach(box => {
    box.dataset.flatDl = '1';
    box.querySelectorAll('.dl-more, .dl-menu').forEach(n => n.remove());
    const b = box.querySelector('.dl-main');
    if (!b) return;
    b.dataset.dl = 'PDF';
    b.textContent = '⤓ 导出 PDF';
    b.title = 'Demo 中报告只支持导出 PDF';
    b.onclick = () => {
      if (b.dataset.dlBusy) return;
      b.dataset.dlBusy = '1';
      const tx = b.textContent;
      b.textContent = '⤓ 正在生成…';
      setTimeout(() => {
        delete b.dataset.dlBusy;
        b.textContent = tx;
        say('评估报告 PDF 已生成（Demo 不产出真实文件）');
      }, 900);
    };
  });
}

function watchReports() {
  pdfOnly(document);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; pdfOnly(document); });
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchReports);
} else watchReports();
})();
