/* ============ 通用 UI 工具 ============ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n.toLocaleString('zh-CN');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const qs = new URLSearchParams(location.search);

/* ---------- 顶栏 ---------- */
function renderTopbar(sub, extra = '') {
  const host = $('#topbar');
  if (!host) return;
  host.className = 'topbar';
  host.innerHTML = `
    <a class="brand" href="index.html">
      <span class="logo">评</span>
      <span>剧本智能评审</span>
    </a>
    <span class="muted" style="font-size:12px">${sub ? '· ' + esc(sub) : ''}</span>
    <span class="spacer"></span>
    ${extra}
    <span class="credits" title="Demo 数据">积分 <b>${fmt(CREDITS)}</b></span>
    <button class="btn btn-ghost btn-sm" id="themeBtn" type="button" title="切换深浅色">◐</button>`;
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('dse-theme', next);
  };
}
(() => { const t = localStorage.getItem('dse-theme'); if (t) document.documentElement.dataset.theme = t; })();

/* ---------- 轻提示 ---------- */
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
/* 导出/下载在 Demo 中只反馈结果 */
const fakeDownload = name => toast(`已生成 ${name}（Demo 不产出真实文件）`);

/* ---------- 左右分栏拖拽 ---------- */
function initSplitter(splitter, leftPane, { min = 300, max = 620 } = {}) {
  if (!splitter) return;
  const saved = +localStorage.getItem('dse-chat-w');
  if (saved >= min && saved <= max) leftPane.style.width = saved + 'px';
  let startX = 0, startW = 0, dragging = false;
  const onMove = e => {
    if (!dragging) return;
    const w = Math.min(max, Math.max(min, startW + e.clientX - startX));
    leftPane.style.width = w + 'px';
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    localStorage.setItem('dse-chat-w', parseInt(leftPane.style.width, 10));
  };
  splitter.addEventListener('pointerdown', e => {
    dragging = true; startX = e.clientX; startW = leftPane.offsetWidth;
    splitter.classList.add('dragging');
    document.body.classList.add('col-resizing');
    splitter.setPointerCapture(e.pointerId);
  });
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
  splitter.addEventListener('pointercancel', onUp);
  splitter.addEventListener('dblclick', () => {
    leftPane.style.width = leftPane.offsetWidth > min + 40 ? min + 'px' : '480px';
    localStorage.setItem('dse-chat-w', parseInt(leftPane.style.width, 10));
  });
}

/* ---------- tab 组 ---------- */
function initTabs(tabHost, panelHost, onSwitch) {
  const tabs = $$('[role=tab]', tabHost);
  tabs.forEach(tab => tab.onclick = () => {
    if (tab.hidden) return;
    tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    $$('.work-panel', panelHost).forEach(p => p.classList.toggle('active', p.id === tab.dataset.panel));
    onSwitch && onSwitch(tab.dataset.panel);
  });
}
function activateTab(tabHost, panelId) {
  const t = $$('[role=tab]', tabHost).find(x => x.dataset.panel === panelId);
  if (t) t.click();
}

/* ---------- 维度色 ---------- */
const dimColor = id => (DIM[id] || {}).color || 'var(--accent)';
const dimName  = id => (DIM[id] || {}).name || id;
const gradeCls = g => 'grade-' + (g || 'B').replace('+', '').replace('-', '');

/* ---------- 单选 / 多选 chip 组 ---------- */
function chipGroup(name, options, { multi = false, selected = [] } = {}) {
  return `<div class="chip-row" data-group="${name}" data-multi="${multi}">` +
    options.map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const on = selected.includes(v);
      const dot = (typeof o === 'object' && o.color) ? `<span class="dot" style="background:${o.color}"></span>` : '';
      return `<button type="button" class="chip" role="${multi ? 'checkbox' : 'radio'}"
        aria-pressed="${on}" data-v="${esc(v)}">${dot}${esc(typeof o === 'string' ? o : o.label || o.v)}</button>`;
    }).join('') + '</div>';
}
function bindChipGroups(root, onChange) {
  $$('[data-group]', root).forEach(g => {
    g.onclick = e => {
      const c = e.target.closest('.chip');
      if (!c) return;
      if (g.dataset.multi === 'true') {
        c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true');
      } else {
        $$('.chip', g).forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      }
      onChange && onChange(g.dataset.group, chipValue(g));
    };
  });
}
const chipValue = g => $$('.chip[aria-pressed=true]', g).map(c => c.dataset.v);
const groupValue = (root, name) => chipValue($(`[data-group="${name}"]`, root));
