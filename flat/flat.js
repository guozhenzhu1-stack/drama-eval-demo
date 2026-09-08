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

/* ---------- 4. 本期只做问题检测：抹掉共享组件里的修改建议与改稿入口 ---------- */
/* report-neo.js / annot.js / result-page.js 由风格 A 与 v1 共用，不能改；
   这里在 flat 皮肤内按渲染结果打补丁：删建议字段、删改稿按钮、正文转只读 */
const swap = (el, re, to) => {
  if (!el || !re.test(el.innerHTML)) return;
  el.innerHTML = el.innerHTML.replace(re, to);
};

function noFix(root) {
  /* 报告：分维度里的「建议：…」与合规里的「整改建议：…」 */
  root.querySelectorAll('.di-fix, .cmp-fix').forEach(n => n.remove());
  /* 分集问题标注：整本 / 本集 / 单条修复入口，划选下指令条 */
  root.querySelectorAll('#fixBook, #fixEp, [data-act="fix"], #selBar, .fix-summary').forEach(n => n.remove());
  /* 结果页：修改对比这一 tab 不再产出 */
  root.querySelectorAll('[role="tab"][data-rk="diff"], [data-res-jump="diff"]').forEach(n => n.remove());
  /* 标注卡里的「修改建议：」整行（判断依据要留着） */
  root.querySelectorAll('.iss-card .kv').forEach(kv => {
    const b = kv.querySelector('b');
    if (b && b.textContent.includes('修改建议')) kv.remove();
  });
  /* 剧本正文：本期不改稿，转为只读 */
  root.querySelectorAll('.script-body[contenteditable="true"]').forEach(body => {
    body.setAttribute('contenteditable', 'false');
    const h = body.parentElement && body.parentElement.querySelector('.sc-head .hint-inline');
    if (h) h.textContent = h.textContent.replace(/正文可直接编辑，划选可下发修改指令/, '本期只做问题检测，正文只读');
  });
  /* 文案里对建议与改稿的承诺 */
  root.querySelectorAll('.section-title h3').forEach(h => {
    if (h.textContent.trim() === '命中项与整改建议') h.textContent = '命中项与判断依据';
  });
  root.querySelectorAll('.ro-note').forEach(n =>
    swap(n, /评估报告 \/ 分集问题标注 \/ 修改对比 都在同一个结果页/, '评估报告 / 分集问题标注 都在同一个结果页'));
  root.querySelectorAll('.doc-foot > span').forEach(n =>
    swap(n, /所列问题、依据与建议/, '所列问题与判断依据'));
  root.querySelectorAll('.dn-row span, .up-tx span').forEach(n => {
    swap(n, /，\s*并给出判断依据与可执行的改写建议。?/, '，并给出每处问题的判断依据。');
    swap(n, /耗时与积分约为快速评估的 3 倍/, '耗时约为快速评估的 3 倍');
    swap(n, /速度快、积分省，/, '速度快，');
  });
}

function watchReports() {
  const tick = () => { pdfOnly(document); noFix(document); };
  tick();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 0);
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchReports);
} else watchReports();
})();
