/* ================================================================
   Neo 交互层 — 顶栏 / 星链背景 / 命令面板 / 数字动效 / 流式对话
   在 ui.js 之后、页面脚本之前加载：覆盖 renderTopbar，并挂载全局观察者
   ================================================================ */
(() => {
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const raf = requestAnimationFrame;
const PAGE = document.body && document.body.dataset.page ? document.body.dataset.page
  : /diagnose/.test(location.pathname) ? 'diagnose'
  : /batch/.test(location.pathname) ? 'batch' : 'entry';
/* 让过渡从起始值开始：提交一次样式计算 */
const flush = el => void el.offsetWidth;

/* ---------- 主题（neo 独立存储，白底优先） ---------- */
const THEME_KEY = 'neo-theme';
document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || 'light';

/* ---------- 顶栏：⌘K + 积分（页面导航走 ⌘K 与内页 ↩ 按钮） ---------- */
window.renderTopbar = function (sub, extra = '') {
  const host = document.querySelector('#topbar');
  if (!host) return;
  host.className = 'topbar';
  host.innerHTML = `
    <a class="brand" href="index.html">
      <span class="logo">评</span><span>剧本<b>智能评审</b></span>
    </a>
    <span class="muted" style="font-size:12px">${sub ? '· ' + esc(sub) : ''}</span>
    <span class="spacer"></span>
    ${extra}
    <button class="btn btn-ghost btn-sm" id="cmdBtn" type="button" title="命令面板">⌘ <span class="kbd">K</span></button>
    <span class="credits" title="Demo 数据">积分 <b>${fmt(CREDITS)}</b></span>
    <button class="btn btn-ghost btn-sm" id="themeBtn" type="button" title="切换深浅色">◐</button>`;
  host.querySelector('#themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    toast(next === 'dark' ? '已切到深空模式' : '已切到极光浅色');
  };
  host.querySelector('#cmdBtn').onclick = () => openCmd();
};

/* ---------- 星链背景：粒子 + 近邻连线（颜色随主题） ---------- */
const STAR = {
  light: { dot: 'rgba(38, 104, 180, .40)', line: '40, 105, 190', a: .13 },
  dark:  { dot: 'rgba(150, 215, 255, .55)', line: '110, 190, 255', a: .16 }
};
const starSkin = () => STAR[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
function stars() {
  if (RM) return;
  const cv = document.createElement('canvas');
  cv.id = 'neoStars';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, ps = [];
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    const n = Math.min(76, Math.round(innerWidth * innerHeight / 26000));
    ps = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .14 * dpr, vy: (Math.random() - .5) * .14 * dpr,
      r: (Math.random() * 1.3 + .5) * dpr
    }));
  };
  addEventListener('resize', resize);
  resize();
  const D = 130 * dpr;
  (function tick() {
    const sk = starSkin();
    ctx.clearRect(0, 0, w, h);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.284);
      ctx.fillStyle = sk.dot; ctx.fill();
    });
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y;
        const d = Math.hypot(dx, dy);
        if (d < D) {
          ctx.strokeStyle = `rgba(${sk.line},${(1 - d / D) * sk.a})`;
          ctx.lineWidth = dpr * .6;
          ctx.beginPath(); ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y); ctx.stroke();
        }
      }
    }
    raf(tick);
  })();
}
/* ---------- 指针高光 + 点击波纹 ---------- */
const SPOT = '.card,.kpi,.iss-card,.mode-tab,.match-row,.rec-item,.batch .conclusion,.tbl-wrap';
function spotlight() {
  let pending = false, last = null;
  addEventListener('pointermove', e => {
    last = e;
    if (pending) return;
    pending = true;
    raf(() => {
      pending = false;
      const el = last.target.closest && last.target.closest(SPOT);
      if (!el) return;
      el.classList.add('neo-spot');
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((last.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((last.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });
}
function ripples() {
  addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.btn');
    if (!b || RM) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const d = document.createElement('span');
    d.className = 'neo-ripple';
    d.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${s}px;height:${s}px`;
    b.appendChild(d);
    setTimeout(() => d.remove(), 600);
  }, { passive: true });
}

/* ---------- 数字滚动 ---------- */
function countUp(el) {
  if (RM || el.dataset.neoCnt) return;
  const m = el.firstChild;
  if (!m || m.nodeType !== 3) return;
  const target = parseFloat(String(m.textContent).replace(/[^\d.]/g, ''));
  if (!isFinite(target) || target <= 0) return;
  el.dataset.neoCnt = '1';
  const dec = /\./.test(m.textContent) ? 1 : 0;
  const suffix = String(m.textContent).replace(/[\d.]+/, '###');
  const t0 = performance.now(), dur = 900;
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const v = (target * (1 - Math.pow(1 - k, 3))).toFixed(dec);
    m.textContent = suffix.replace('###', v);
    if (k < 1) raf(step);
  })(t0);
  /* 兜底：若逐帧回调被环境挂起，动画时长后直接落到终值 */
  setTimeout(() => { m.textContent = suffix.replace('###', target.toFixed(dec)); }, dur + 260);
}
const COUNTABLE = '.kpi .v,.match-row .pct,.dim-bar .sc b,.grade-dist .seg';
const countAll = root => root.querySelectorAll && root.querySelectorAll(COUNTABLE).forEach(countUp);

/* ---------- 分维度进度条：从 0 生长 ---------- */
function growBars(root) {
  if (RM || !root.querySelectorAll) return;
  root.querySelectorAll('.dim-bar .fill,.match-row .track > i').forEach(el => {
    if (el.dataset.neoGrow) return;
    el.dataset.neoGrow = '1';
    const w = el.style.width;
    el.style.width = '0';
    flush(el);
    el.style.width = w;
  });
}
/* ---------- 综合分环形仪表：包住报告页的等级牌 ---------- */
function gauge(root) {
  if (!root.querySelectorAll) return;
  root.querySelectorAll('.rep-hero, .doc-headline').forEach(hero => {
    const g = hero.querySelector(':scope > .grade');
    if (!g) return;
    const m = (hero.textContent.match(/综合\s*(\d+)\s*分/) || [])[1];
    const score = Math.max(0, Math.min(100, +m || 0));
    const box = document.createElement('div');
    box.className = 'neo-gauge';
    hero.insertBefore(box, g);
    box.appendChild(g);
    box.insertAdjacentHTML('beforeend', `<span class="gv">${score} 分</span>`);
    if (RM) box.style.setProperty('--p', score);
    else { box.style.setProperty('--p', 0); flush(box); box.style.setProperty('--p', score); }
  });
}

/* ---------- 工作台 tab 滑动指示器 ---------- */
function tabIndicator() {
  const host = document.querySelector('#wtabs');
  if (!host) return;
  const ind = document.createElement('i');
  ind.className = 'neo-ind';
  host.appendChild(ind);
  const move = () => {
    const on = host.querySelector('[role=tab][aria-selected="true"]');
    if (!on || on.hidden) { ind.style.width = '0'; return; }
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = `translateX(${on.offsetLeft - 3}px)`;
  };
  new MutationObserver(move).observe(host, { attributes: true, subtree: true, attributeFilter: ['aria-selected', 'hidden'] });
  addEventListener('resize', move);
  setTimeout(move, 0);
  setTimeout(move, 400);
}

/* ---------- 对话：AI 气泡流式揭示 ---------- */
function chatStream() {
  const box = document.querySelector('#chatScroll');
  if (!box) return;
  const mark = n => {
    if (n.nodeType !== 1 || !n.classList.contains('msg')) return;
    if (n.classList.contains('ai') && !RM) n.classList.add('neo-stream');
  };
  box.querySelectorAll('.msg').forEach(mark);        /* 已存在的开场消息 */
  new MutationObserver(recs => {
    recs.forEach(r => r.addedNodes.forEach(n => {
      mark(n);
      box.parentElement.scrollTop = box.scrollHeight;
    }));
  }).observe(box, { childList: true });
}

/* ---------- 表格行错帧进场 ---------- */
function rows(root) {
  if (RM || !root.querySelectorAll) return;
  root.querySelectorAll('.tbl tbody').forEach(tb => {
    [...tb.rows].forEach((tr, i) => {
      if (tr.dataset.neoRow || i > 24) return;
      tr.dataset.neoRow = '1';
      tr.classList.add('neo-row');
      tr.style.animationDelay = (i * 18) + 'ms';
    });
  });
}
/* ---------- ⌘K 命令面板 ---------- */
const ask = t => {
  const inp = document.querySelector('#chatInput');
  if (!inp) return;
  inp.value = t;
  document.querySelector('#sendBtn').click();
};
const goTab = p => { const h = document.querySelector('#wtabs'); if (h) activateTab(h, p); };
function actions() {
  const A = [
    { i: '⌂', t: '回到入口', s: 'index.html', run: () => location.href = 'index.html' },
    { i: '◐', t: '切换深浅色', s: '深空 / 极光浅色', run: () => document.querySelector('#themeBtn').click() }
  ];
  if (PAGE === 'entry') A.unshift(
    { i: '✎', t: '剧本诊断优化 · 载入示例并发起评估', s: 'C 端 · 逐场找问题、一键改剧本', run: () => {
      document.querySelector('.mode-tab[data-mode=diagnose]').click();
      document.querySelector('#loadSample').click(); document.querySelector('#startBtn').click(); } },
    { i: '⛃', t: '批量审稿筛选 · 载入 50 份示例并发起', s: 'B 端 · 海量初筛、自定义审稿标准', run: () => {
      document.querySelector('.mode-tab[data-mode=batch]').click();
      document.querySelector('#loadSample').click(); document.querySelector('#startBtn').click(); } },
    { i: '⏱', t: '查看评估记录', s: '按两类分开、最新在前', run: () =>
      document.querySelector('.records').scrollIntoView({ behavior: 'smooth' }) });
  if (PAGE === 'diagnose') A.unshift(
    { i: '◱', t: '打开评估报告', s: 'Alt+1', run: () => goTab('panelReport') },
    { i: '◲', t: '打开分集问题标注', s: 'Alt+2', run: () => goTab('panelAnnot') },
    { i: '◳', t: '打开修改对比', s: 'Alt+3', run: () => goTab('panelDiff') },
    { i: '✦', t: '整本一键修复', s: '按维度批量改写全剧', run: () => ask('整本修复') },
    { i: '◎', t: '问：伏笔回收怎么样', s: '定位到伏笔维度的问题', run: () => ask('伏笔怎么样') },
    { i: '⚠', t: '问：有没有合规风险', s: '规则库判定 + 判断依据', run: () => ask('有没有合规风险') },
    { i: '⤓', t: '导出评估结果', s: 'PDF / Word / Excel', run: () => ask('导出') });
  if (PAGE === 'batch') A.unshift(
    { i: '◱', t: '打开批量评估结果', s: 'Alt+1', run: () => goTab('panelBatch') },
    { i: '◲', t: '打开剧本评估报告', s: 'Alt+2', run: () => goTab('panelReport') },
    { i: '◳', t: '打开分集问题标注', s: 'Alt+3', run: () => goTab('panelAnnot') },
    { i: '★', t: '只看 S/A 级', s: '筛出头部稿件', run: () => ask('只看 S/A 级') },
    { i: '⛔', t: '只看拦截稿', s: 'AI 拼凑 / 洗稿 / 同质化 / 格式混乱', run: () => ask('只看拦截稿') },
    { i: '✓', t: '问：符合审稿要求的有哪些', s: '按自定义要求收敛', run: () => ask('符合要求的有哪些') },
    { i: '⤓', t: '导出评估结论', s: 'Excel / PDF / Word', run: () => ask('导出') });
  return A;
}
let cmdEl = null;
function openCmd() {
  if (cmdEl) { closeCmd(); return; }
  const list = actions();
  cmdEl = document.createElement('div');
  cmdEl.className = 'neo-cmd open';
  cmdEl.innerHTML = `
    <div class="box" role="dialog" aria-modal="true" aria-label="命令面板">
      <input id="cmdInp" placeholder="输入指令或问题…  例如：报告 / 修复 / 导出 / 主题" autocomplete="off">
      <div class="list" id="cmdList" role="listbox"></div>
      <div class="foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> 选择</span>
        <span><span class="kbd">⏎</span> 执行</span><span><span class="kbd">Esc</span> 关闭</span></div>
    </div>`;
  document.body.appendChild(cmdEl);
  const inp = cmdEl.querySelector('#cmdInp'), box = cmdEl.querySelector('#cmdList');
  let cur = 0, view = list;
  const draw = () => {
    box.innerHTML = view.length ? view.map((a, i) => `
      <div class="it" role="option" data-i="${i}" ${i === cur ? 'aria-selected="true"' : ''}>
        <span class="ico">${a.i}</span>
        <span style="display:grid;gap:2px"><b>${esc(a.t)}</b><span class="sub">${esc(a.s || '')}</span></span>
      </div>`).join('') : `<div class="it"><span class="ico">⌕</span>
        <span style="display:grid;gap:2px"><b>没有匹配的指令</b>
        <span class="sub">⏎ 直接把这句话发给 AI 助手</span></span></div>`;
    const on = box.querySelector('[aria-selected]');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const filter = () => {
    const k = inp.value.trim().toLowerCase();
    view = !k ? list : list.filter(a => (a.t + a.s).toLowerCase().includes(k));
    cur = 0; draw();
  };
  const fire = () => {
    const a = view[cur];
    closeCmd();
    if (a) a.run();
    else if (inp.value.trim() && document.querySelector('#chatInput')) ask(inp.value.trim());
  };
  inp.oninput = filter;
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { cur = Math.min(view.length - 1, cur + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { fire(); e.preventDefault(); }
    else if (e.key === 'Escape') closeCmd();
  };
  box.onclick = e => { const it = e.target.closest('.it[data-i]'); if (it) { cur = +it.dataset.i; fire(); } };
  cmdEl.onclick = e => { if (e.target === cmdEl) closeCmd(); };
  draw();
  inp.focus();
}
function closeCmd() { if (cmdEl) { cmdEl.remove(); cmdEl = null; } }
/* ---------- 入口页：副标题打字机轮播 ---------- */
const LINES = [
  '上传剧本，逐场找问题 · 一键改剧本 · 海量初筛',
  '八大维度打分，问题定位到「第几集·第几场·哪句台词」',
  '给出判断依据，也给出可执行的改写建议',
  '50 份稿件一次评完，S/A 级与拦截稿自动分层'
];
function typer() {
  const p = document.querySelector('.entry-hero p');
  if (!p) return;
  if (RM) { p.textContent = LINES[0]; return; }
  const t = document.createElement('span'), c = document.createElement('i');
  c.className = 'caret';
  p.textContent = ''; p.append(t, c);
  let li = 0, ci = 0, del = false;
  (function loop() {
    const s = LINES[li];
    ci += del ? -1 : 1;
    t.textContent = s.slice(0, ci);
    let d = del ? 26 : 46;
    if (!del && ci === s.length) { del = true; d = 2100; }
    else if (del && ci === 0) { del = false; li = (li + 1) % LINES.length; d = 260; }
    setTimeout(loop, d);
  })();
}

/* ---------- 工作台滚动进度条 ---------- */
function scrollBar() {
  const head = document.querySelector('.pane-work > .pane-head'), body = document.querySelector('#workBody');
  if (!head || !body) return;
  const bar = document.createElement('i');
  bar.className = 'neo-scrollbar';
  head.style.position = 'relative';
  head.appendChild(bar);
  const upd = el => {
    if (!el || !el.scrollHeight) return;
    const max = el.scrollHeight - el.clientHeight;
    bar.style.setProperty('--sp', max > 20 ? (el.scrollTop / max).toFixed(3) : 0);
  };
  body.addEventListener('scroll', e => upd(e.target), { capture: true, passive: true });
  const reset = new MutationObserver(() => bar.style.setProperty('--sp', 0));
  body.querySelectorAll('.work-panel').forEach(p =>
    reset.observe(p, { attributes: true, attributeFilter: ['class'] }));
}
/* ---------- 入口页：合并输入框——整块可拖入文件 ---------- */
function uniBox() {
  const box = document.querySelector('#uniBox');
  if (!box) return;
  const dz = box.querySelector('#dropzone');
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragover', 'dragenter'].forEach(ev => box.addEventListener(ev, e => { stop(e); box.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach(ev => box.addEventListener(ev, e => {
    if (e.target === box || !box.contains(e.relatedTarget)) box.classList.remove('over');
  }));
  box.addEventListener('drop', e => {
    box.classList.remove('over');
    if (e.target.closest('#dropzone')) return;        /* 交给 entry.js 原有监听 */
    stop(e);
    dz.dispatchEvent(new DragEvent('drop', { dataTransfer: e.dataTransfer, bubbles: false }));
  });
  const ta = box.querySelector('#reqInput');
  if (ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', fit);
    setTimeout(fit, 0);
  }
}

/* ---------- 澄清阶段全屏对话，出结果后自动分栏 ---------- */
const HAS_RESULT = '.report,.batch,.annot,.tbl';
function soloChat() {
  const studio = document.querySelector('.studio');
  if (!studio) return;
  const panels = [...document.querySelectorAll('#workBody .work-panel')];
  if (!panels.length) return;
  let first = true;
  const ready = () => panels.some(p => p.querySelector(HAS_RESULT));
  const sync = () => {
    const on = ready();
    if (on === !studio.classList.contains('solo')) { first = false; return; }
    studio.classList.toggle('solo', !on);
    if (on && !first) {
      studio.classList.add('splitting');
      setTimeout(() => studio.classList.remove('splitting'), 900);
      toast('评估完成，已展开右侧结果区');
    }
    first = false;
  };
  studio.classList.add('solo');
  panels.forEach(p => new MutationObserver(sync).observe(p, { childList: true, subtree: true }));
  sync();
}

/* ---------- 评估深度：brief 卡片注入「快速 / 深度」+ 快速模式引导 ---------- */
const DEPTH = { quick: '快速评估', deep: '深度评估' };
window.NEO_DEPTH = 'deep';
document.documentElement.dataset.depth = 'deep';

const depthField = () => `
  <label class="fld neo-depth-fld">
    <span class="lbl">评估深度 <span class="req">*</span>
      <span class="hint-inline">决定这次产出哪些结果</span></span>
    ${chipGroup('depth', [DEPTH.quick, DEPTH.deep], { selected: [DEPTH.deep] })}
    <div class="depth-note">
      <div class="dn-row">
        <b>快速评估</b><i class="dn-out">仅评估报告</i>
        <span>整本通读后按所选维度打分：整体评级、总结性评价与评级依据、分维度得分与定性结论、平台匹配度。
          速度快、积分省，适合先摸底或大批量初筛。</span>
      </div>
      <div class="dn-row on">
        <b>深度评估</b><i class="dn-out">评估报告 + 分集问题标注</i>
        <span>在快速评估之上逐集逐场精读，额外产出分集问题标注：问题定位到「第几集 · 第几场 · 哪句台词」，
          并给出判断依据与可执行的改写建议。耗时与积分约为快速评估的 3 倍。</span>
      </div>
    </div>
  </label>`;

function injectDepth(card) {
  if (!card || card.dataset.neoDepth) return;
  const body = card.querySelector('.card-body');
  if (!body) return;
  card.dataset.neoDepth = '1';
  const box = document.createElement('div');
  box.innerHTML = depthField();
  const fld = box.firstElementChild;
  body.insertBefore(fld, body.querySelector('#briefErr') || body.querySelector('.brief-foot'));
  bindChipGroups(fld, (_g, v) => syncDepthNote(v[0]));
}

/* 说明行高亮跟随所选（v1 在切地区时会重绑整卡的 chip 组，故另走事件委托兜底） */
function syncDepthNote(v) {
  document.querySelectorAll('.neo-depth-fld .dn-row').forEach(r =>
    r.classList.toggle('on', r.querySelector('b').textContent === (v || DEPTH.deep)));
}

/* ---------- brief 卡片精简：去掉「付费方式」与「已解析」标签 ---------- */
const PAY_FIX = '付费';

function trimBrief(card) {
  if (!card || card.dataset.neoTrim) return;
  const body = card.querySelector('.card-body');
  if (!body) return;
  card.dataset.neoTrim = '1';
  card.querySelectorAll('.parsed').forEach(n => n.remove());
  /* 付费方式不再让用户选：分组挪到隐藏槽位并锁定默认值，v1 的必填校验才不会拦下 */
  const pay = body.querySelector('[data-group=pay]');
  if (!pay) return;
  const fld = pay.closest('.fld');
  let slot = body.querySelector('.neo-locked');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'neo-locked';
    slot.hidden = true;
    body.appendChild(slot);
  }
  slot.appendChild(pay);
  pay.querySelectorAll('.chip').forEach(c =>
    c.setAttribute('aria-pressed', String(c.dataset.v === PAY_FIX)));
  if (fld) fld.remove();
}

/* 确认后的「已确认：真人短剧剧本 · 付费 · 中国」里也去掉付费方式 */
function stripPay(root) {
  root.querySelectorAll('.brief-done b, .msg.ai .bubble b').forEach(b => {
    if (b.dataset.neoPay || !/·\s*(付费|免费)\s*·/.test(b.textContent)) return;
    b.dataset.neoPay = '1';
    b.textContent = b.textContent.replace(/·\s*(付费|免费)\s*(?=·)/, '');
  });
}

function setDepth(d) {
  window.NEO_DEPTH = d;
  document.documentElement.dataset.depth = d;
  const host = document.querySelector('#wtabs');
  const tab = host && host.querySelector('[data-panel="panelAnnot"]');
  if (!tab) return;
  tab.hidden = d === 'quick';
  if (d === 'quick' && tab.getAttribute('aria-selected') === 'true') {
    const first = [...host.querySelectorAll('[role=tab]')].find(x => !x.hidden);
    if (first) first.click();
  }
}

window.neoUpsellHtml = where => `
  <div class="neo-upsell${where === 'chat' ? ' in-chat' : ''}"${where === 'chat' ? ' id="neoUpsellChat"' : ''}>
    <span class="up-ico">✦</span>
    <div class="up-tx">
      <b>本次是快速评估：只产出了评估报告</b>
      <span>升级为深度评估，可逐集逐场精读，额外产出<b>分集问题标注</b>——问题定位到「第几集 · 第几场 · 哪句台词」，
        并给出判断依据与可执行的改写建议。</span>
    </div>
    <button class="btn btn-primary btn-sm" type="button" data-neo-upgrade>升级为深度评估</button>
  </div>`;

function upsellChat() {
  if (window.NEO_DEPTH !== 'quick') return;
  if (!document.querySelector('#workBody .report, #workBody .batch')) return;
  if (document.querySelector('#neoUpsellChat')) return;
  const bs = document.querySelectorAll('#chatScroll .msg.ai .bubble');
  const b = bs[bs.length - 1];
  if (!b || b.querySelector('.steps') || b.querySelector('#briefCard')) return;
  b.insertAdjacentHTML('beforeend', window.neoUpsellHtml('chat'));
}

window.neoUpgrade = function () {
  if (window.NEO_DEPTH === 'deep') return;
  setDepth('deep');
  document.querySelectorAll('.neo-upsell').forEach(n => n.remove());
  toast('已升级为深度评估，分集问题标注已生成');
  if (typeof say === 'function')
    say('ai', `已按<b>深度评估</b>重新精读全本：在原评估报告之上补出<b>分集问题标注</b>，
      每处问题都落到「第几集 · 第几场 · 哪句台词」，并给判断依据与改写建议。
      右侧「分集问题标注」已解锁，报告里的「第 N 集」也可以直接跳过去了。`);
  const host = document.querySelector('#wtabs');
  if (host) activateTab(host, 'panelAnnot');
};

function depth() {
  const chat = document.querySelector('#chatScroll');
  if (!chat) return;
  const scan = () => {
    const card = chat.querySelector('#briefCard');
    trimBrief(card);
    injectDepth(card);
    stripPay(chat);
    upsellChat();
  };
  new MutationObserver(scan).observe(chat, { childList: true, subtree: true });
  scan();
  addEventListener('click', e => {
    const dc = e.target.closest && e.target.closest('.neo-depth-fld [data-group=depth] .chip');
    if (dc) setTimeout(() => syncDepthNote(dc.dataset.v), 0);
    const t = e.target.closest && e.target.closest('#briefGo, [data-neo-upgrade], .ep-link');
    if (!t) return;
    if (t.id === 'briefGo') {
      const card = t.closest('#briefCard');
      const v = card ? (groupValue(card, 'depth')[0] || DEPTH.deep) : DEPTH.deep;
      setDepth(v === DEPTH.quick ? 'quick' : 'deep');
      return;
    }
    if (t.hasAttribute('data-neo-upgrade')) {
      e.preventDefault(); e.stopPropagation();
      window.neoUpgrade();
      return;
    }
    if (window.NEO_DEPTH === 'quick' && t.classList.contains('ep-link')) {
      e.preventDefault(); e.stopPropagation();
      toast('分集问题标注是深度评估的产物，升级后即可跳到具体台词');
    }
  }, true);
}

/* ---------- 内容重绘后统一补动效（幂等） ---------- */
function enhance(root) {
  if (!root || root.nodeType !== 1) return;
  countAll(root); growBars(root); gauge(root); rows(root);
}
function watch() {
  let pend = 0;
  const targets = [
    ...document.querySelectorAll('#workBody .work-panel, #repHost, #annotHost, #recList, .composer-card')
  ].filter(Boolean);
  if (!targets.length) return;
  const ob = new MutationObserver(recs => {
    if (pend) return;
    pend = setTimeout(() => {
      pend = 0;
      const seen = new Set();
      recs.forEach(r => {
        const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (t && !seen.has(t)) { seen.add(t); enhance(t); }
      });
    }, 16);
  });
  targets.forEach(t => ob.observe(t, { childList: true, subtree: true }));
  enhance(document.body);
}

/* ---------- 快捷键 ---------- */
function keys() {
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
    if (e.key === 'Escape' && cmdEl) { closeCmd(); return; }
    const ae = document.activeElement || document.body;
    const typing = /^(INPUT|TEXTAREA)$/.test(ae.tagName) || ae.isContentEditable;
    if (e.altKey && /^[123]$/.test(e.key)) {
      const tabs = [...document.querySelectorAll('#wtabs [role=tab]')].filter(t => !t.hidden);
      const t = tabs[+e.key - 1];
      if (t) { e.preventDefault(); t.click(); }
      return;
    }
    if (e.key === '/' && !typing) {
      const inp = document.querySelector('#chatInput') || document.querySelector('#reqInput');
      if (inp) { e.preventDefault(); inp.focus(); }
    }
  });
}

/* ---------- 启动 ---------- */
function boot() {
  stars(); spotlight(); ripples(); keys();
  tabIndicator(); chatStream(); scrollBar(); watch(); soloChat(); depth();
  if (PAGE === 'entry') { typer(); uniBox(); }
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();



})();
