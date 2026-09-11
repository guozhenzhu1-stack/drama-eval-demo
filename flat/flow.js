/* ================================================================
   风格 B · 剧本诊断优化：按上传体量分流
     ≤9 集（片段 / 单集 / 少集）→ 对话框内直接给出评估结果，右栏不出现
     ≥10 集 + 快速评估          → 评估报告直接摊在对话框右边
     ≥10 集 + 深度评估          → 对话里给「查看完整评估结果」，正文在同页浮层里
   本期只做「问题检测与展示」：不出修改建议，也不提供任何改稿入口（一键修复 / 按建议
   改写 / 划选下指令 / 修改对比），FIXLOG 恒为空。
   替代 js/diagnose.js。顶层声明不能包进 IIFE：neo.js 的 neoStudio 桥以裸名读取
   SCRIPT / FIXLOG / annot / say / CHOSEN / updateCounters
   ================================================================ */
renderTopbar('剧本诊断优化');
initSplitter($('#splitter'), $('#paneChat'), { min: 380, max: 720 });

/* 本期不改稿：FIXLOG 恒为空，仅为 neoStudio 桥与结果页保留同名全局 */
const FIXLOG = [];
let annot = null;
let CHOSEN = { dims: DEFAULT_DIMS, platforms: [] };
let FLOW = '';                                  /* inline | quick | deep */
const chat = $('#chatScroll');
const SEVN = ['P0', 'P1', 'P2', 'P3'];

/* ---------- 本次上传的体量：首页把解析结果带在 URL 上 ---------- */
const REQ = qs.get('req') || '';
const STAGE = qs.get('stage') || '';
const UP = (() => {
  const eps = Math.max(0, +qs.get('eps') || 0);
  const part = qs.get('part') === '1';
  return {
    eps, part,
    file: qs.get('file') || SCRIPT.file,
    size: qs.get('size') || SCRIPT.size,
    words: Math.max(0, +qs.get('words') || 0) || (eps ? eps * 1780 : SCRIPT.meta.words),
    cover: Math.min(part ? 1 : eps || SCRIPT.meta.parsedEps, SCRIPT.meta.parsedEps)
  };
})();
/* 分流阈值 10 集；集数解析不出来的按多集处理（走 brief） */
const SMALL = !STAGE && UP.eps > 0 && UP.eps < 10;
const VOL = UP.part ? '第 1 集片段' : UP.eps ? `${UP.eps} 集` : '多集 · 集数未标注';
$('#volTag').textContent = `${VOL} · ${fmt(UP.words)} 字`;

/* ---------- 对话 ---------- */
function say(role, html) {
  const m = document.createElement('div');
  m.className = 'msg ' + role;
  m.innerHTML = `<span class="avatar">${role === 'me' ? '我' : 'AI'}</span><div class="bubble">${html}</div>`;
  chat.appendChild(m);
  chat.parentElement.scrollTop = chat.scrollHeight;
  return m;
}
const scrollChat = () => { chat.parentElement.scrollTop = chat.scrollHeight; };

/* ---------- 从首页那句要求里预解析 brief ---------- */
const DIM_KEYS = { 故事线: 'story', 主线: 'story', 逻辑: 'logic', 节奏: 'pace', 拖沓: 'pace',
  人设: 'role', 人物: 'role', 台词: 'line', 伏笔: 'seed', 信息: 'seed', 格式: 'fmt', 合规: 'risk', 风险: 'risk' };
function parseReq(t) {
  const p = { parsed: [] };
  if (/AI仿真|AI仿|仿真人/.test(t)) { p.mode = 'AI仿真人剧'; p.parsed.push('mode'); }
  else if (/真人/.test(t)) { p.mode = '真人短剧剧本'; p.parsed.push('mode'); }
  if (/付费/.test(t)) { p.pay = '付费'; p.parsed.push('pay'); }
  else if (/免费/.test(t)) { p.pay = '免费'; p.parsed.push('pay'); }
  if (/北美|海外|英文/.test(t)) { p.region = '北美'; p.parsed.push('region'); }
  else if (t) p.region = '中国';
  const pf = PLATFORMS[p.region || '中国'].filter(x => t.includes(x));
  if (pf.length) { p.platforms = pf; p.parsed.push('platforms'); }
  const dims = [...new Set(Object.keys(DIM_KEYS).filter(k => t.includes(k)).map(k => DIM_KEYS[k]))];
  if (dims.length) { p.dims = dims; p.parsed.push('dims'); }
  p.rest = t;
  return p;
}
const P = parseReq(REQ);
const pickDims = () => (P.dims && P.dims.length ? P.dims : DEFAULT_DIMS);

/* ---------- 进度条 ---------- */
function stepsHtml(list) {
  return `<div class="steps">${list.map((s, i) =>
    `<div class="step" data-i="${i}"><span class="ic">○</span><span>${s}</span></div>`).join('')}
    </div><div class="prog"><i style="width:0"></i></div>`;
}
async function runSteps(m, list, ms = 520) {
  const steps = $$('.step', m), bar = $('.prog > i', m);
  for (let i = 0; i < steps.length; i++) {
    steps[i].className = 'step run'; steps[i].querySelector('.ic').textContent = '◍';
    bar.style.width = ((i + 0.5) / list.length * 100) + '%';
    scrollChat();
    await sleep(ms);
    steps[i].className = 'step done'; steps[i].querySelector('.ic').textContent = '✓';
    bar.style.width = ((i + 1) / list.length * 100) + '%';
  }
}

/* ---------- ≥10 集：用自然语言问一句，而不是摆卡片 ---------- */
/* 只问两件真正会改变评估口径的事：评估维度 + 评估深度。
   胶囊组（dims/depth）还是要建出来——藏进隐藏槽位，好让 neo.js 的
   injectDepth/groupValue/setDepth 这套依赖 DOM 结构的机制照常工作；
   用户的自然语言回复解析后同步写回这两个胶囊组的 aria-pressed。
   制作方式 / 目标地区 / 目标投稿平台不再问，能从需求描述里解析就用，解析不到走默认 */
function hiddenGroups() {
  const box = document.createElement('div');
  box.className = 'neo-locked';
  box.hidden = true;
  box.innerHTML = chipGroup('dims', DIMS.map(d => ({ v: d.id, label: d.name, color: d.color })),
    { multi: true, selected: pickDims() })
    + chipGroup('depth', [DEPTH_Q, DEPTH_D], { selected: [DEPTH_D] });
  return box;
}
const DEPTH_Q = '快速评估', DEPTH_D = '深度评估';

function setDimsGroup(box, dims) {
  box.querySelectorAll('[data-group=dims] .chip').forEach(c =>
    c.setAttribute('aria-pressed', String(dims.includes(c.dataset.v))));
}
function setDepthGroup(box, deep) {
  box.querySelectorAll('[data-group=depth] .chip').forEach(c =>
    c.setAttribute('aria-pressed', String(c.dataset.v === (deep ? DEPTH_D : DEPTH_Q))));
}

/* 从用户那句自然语言回复里解析「维度」与「深度」，解析不到的返回 null 交给上层追问 */
function parseBriefReply(t) {
  const dims = [...new Set(Object.keys(DIM_KEYS).filter(k => t.includes(k)).map(k => DIM_KEYS[k]))];
  const all = /全部|所有|都要|都测|都评/.test(t);
  const useDefault = /默认维度|默认/.test(t);
  let deep = null;
  if (/快速评估|快速|不用深度|不用精读/.test(t) && !/深度评估/.test(t)) deep = false;
  else if (/深度评估|深度|精读|逐场|逐集/.test(t)) deep = true;
  return { dims: (all || useDefault) ? DEFAULT_DIMS : (dims.length ? dims : null), deep };
}

function askBriefHtml() {
  return `<p>这个体量先确认两件事：</p>
    <p>1. 想按哪些维度评估？可选：<b>${DIMS.map(d => d.name).join('、')}</b>
      ——不确定就直接说"按默认维度"，我用<b>${DEFAULT_DIMS.map(dimName).join('、')}</b>这 7 个。</p>
    <p>2. 想要<b>快速评估</b>（仅评估报告，速度快）还是<b>深度评估</b>
      （评估报告 + 分集问题标注，定位到「第几集 · 第几场 · 哪句台词」，耗时约 3 倍）？
      不确定就直接说"深度评估"，这也是默认档。</p>
    <p class="hint-inline">你可以一句话一起回，比如「按伏笔、逻辑、节奏几个维度，深度评估」；
      也可以补一句其他要求，比如「重点看前 3 集付费卡点」。</p>`;
}

function startBrief() {
  const box = hiddenGroups();
  document.body.appendChild(box);

  say('ai', `已解析剧本结构：<b>${UP.eps ? UP.eps + ' 集' : '多集'} / 约 ${fmt(UP.words)} 字</b>${
    UP.eps > SCRIPT.meta.parsedEps ? `（示例仅展开前 ${SCRIPT.meta.parsedEps} 集）` : ''}。` + askBriefHtml());

  function confirmAndRun(dims, deep, extra) {
    setDimsGroup(box, dims);
    setDepthGroup(box, deep);
    window.NEO_DEPTH = deep ? 'deep' : 'quick';
    document.documentElement.dataset.depth = window.NEO_DEPTH;
    CHOSEN = { mode: P.mode || '真人短剧剧本', pay: P.pay || '付费', region: P.region || '中国',
      platforms: P.platforms || [], dims, more: extra || '' };
    say('ai', `已确认：<b>${dims.map(dimName).join('、')}</b> · 评估深度 <b>${deep ? DEPTH_D : DEPTH_Q}</b>
      ${extra ? `<br>补充要求：${esc(extra)}` : ''}`);
    runEval();
  }

  /* 首次上传要求里已经带出维度/深度信息，能一次问够就不追问 */
  BRIEF_PENDING = { dims: P.dims || null, deep: null, more: P.rest && !P.dims ? P.rest : '' };

  BRIEF_ANSWER = t => {
    const r = parseBriefReply(t);
    if (r.dims) BRIEF_PENDING.dims = r.dims;
    if (r.deep !== null) BRIEF_PENDING.deep = r.deep;
    if (!/^(按默认维度|默认维度|默认)$/.test(t.trim())) BRIEF_PENDING.more = t;

    const missing = [];
    if (!BRIEF_PENDING.dims) missing.push('评估维度（不确定就说"按默认维度"）');
    if (BRIEF_PENDING.deep === null) missing.push('评估深度（快速评估 / 深度评估，不确定就说"深度评估"）');
    if (missing.length) {
      say('ai', `还差一点：${missing.join('、')}。`);
      return;
    }
    BRIEF_ANSWER = null;
    confirmAndRun(BRIEF_PENDING.dims, BRIEF_PENDING.deep, BRIEF_PENDING.more);
  };
}
let BRIEF_ANSWER = null;
let BRIEF_PENDING = null;


const BIG_STEPS = ['剧本结构化解析', '分集分维度问题检测', '合规规则库比对（更新至 2026-08-28）',
  '定向投稿匹配度计算', '汇总评估报告'];

async function runEval() {
  const quick = window.NEO_DEPTH === 'quick';
  const list = quick ? BIG_STEPS.slice(0, 2).concat(BIG_STEPS.slice(3)) : BIG_STEPS;
  const m = say('ai', `<div>开始${quick ? '快速' : '深度'}评估，共 ${list.length} 步。</div>` + stepsHtml(list));
  await runSteps(m, list, quick ? 380 : 520);
  FLOW = quick ? 'quick' : 'deep';
  document.documentElement.dataset.flow = FLOW;
  showResult();
  const c = scoped();
  say('ai', quick
    ? `快速评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，
       按 ${CHOSEN.dims.length} 个维度给出了得分、评级依据${
         (CHOSEN.platforms || []).length ? '与平台匹配度' : ''}。
       <br><span class="hint-inline">快速评估不逐场精读，因此没有「第几集 · 第几场 · 哪句台词」级别的标注；
       想升级为深度评估的话，直接在下面回复"深度评估"即可。</span>`
      + reportFileHtml()
    : `深度评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，共 <b>${c.issues} 处</b>问题：
       致命 ${c.p0}、严重 ${c.p1}、一般 ${c.p2}、轻微 ${c.p3}。
       最该先看的是第 6 集「31% 股权凭空落地」（P0），它决定观众会不会觉得结局是硬翻盘；
       其次是伏笔维度 ${SCRIPT.dimReports.find(r => r.dim === 'seed').score} 分，3 条钩子级伏笔全部没闭环；
       第 3 集泼咖啡属平台常见退改点，命中合规规则库。
       <br><span class="hint-inline">本期只做问题检测与展示，不产出改写建议、也不代改剧本。</span>`);
  if (quick) bindReportFile();
}

/* ---------- 快速评估：像文件附件一样的一行卡片 ---------- */
/* 默认已经在右栏摊开报告（showResult 做的）；用户关掉右栏后，点这张卡片能再摊开一次，
   不用重新触发评估 —— 右栏的关闭状态记在 studio 的 class 上，同一个 #panelReport 复用 */
const reportFileHtml = () => `
  <button class="rep-file" type="button" id="repFile">
    <i class="rf-ico">📄</i>
    <span class="rf-tx"><b>《${esc(SCRIPT.title)}》评估报告</b>
      <em>${CHOSEN.dims.length} 个维度 · ${SCRIPT.grade} 级 / ${SCRIPT.score} 分</em></span>
    <i class="rf-go">›</i>
  </button>`;

function openReportPane() {
  const studio = $('.studio');
  if (studio) studio.classList.remove('wide');
  activateTab($('#wtabs'), 'panelReport');
}

function bindReportFile(root = document) {
  $$('#repFile:not([data-rf])', root).forEach(btn => {
    btn.dataset.rf = '1';
    btn.onclick = openReportPane;
  });
}


const repOpts = () => ({
  dims: CHOSEN.dims,
  countByDims: true,
  showMatch: (CHOSEN.platforms || []).length > 0
});

/* 报告与摘要条只统计所选维度内的问题（countByDims），对话里的口径要跟它一致，
   不能直接用 SCRIPT.stats.issues —— 默认维度不含「格式规范」，会多算 */
function scoped() {
  const list = ALL_ISSUES().filter(i => !i.ignored && CHOSEN.dims.includes(i.dim));
  const n = s => list.filter(i => i.sev === s).length;
  return { issues: list.length, p0: n('P0'), p1: n('P1'), p2: n('P2'), p3: n('P3') };
}

/* 快速评估：报告直接摊在右边；深度评估：右栏整块收起，只在对话里给入口 */
function showResult() {
  $('#workMeta').textContent = `《${SCRIPT.title}》· ${CHOSEN.dims.length} 个维度 · ${
    window.NEO_DEPTH === 'quick' ? '快速评估' : '深度评估'}`;
  if (window.NEO_DEPTH === 'quick') {
    /* report-neo 在「非结果页」上只产出对话里的摘要条，这里临时改一下 page 让它把正文渲染出来 */
    const pg = document.body.dataset.page;
    document.body.dataset.page = 'result';
    try { renderReport($('#panelReport'), SCRIPT, repOpts()); }
    finally { document.body.dataset.page = pg; }
    $('#tabReport').hidden = false;
    initTabs($('#wtabs'), $('#workBody'));
    activateTab($('#wtabs'), 'panelReport');
    return;
  }
  $('#tabReport').hidden = true;
  $('#panelReport').innerHTML = '';
  renderReport($('#panelReport'), SCRIPT, repOpts());   /* 只产出对话里的结果摘要条 */
  /* canFix: false —— 本期只做检测：标注里不出修改建议，也不出一键修复 */
  annot = createAnnot($('#panelAnnot'), SCRIPT, {
    canFix: false, dims: CHOSEN.dims, onChange: updateCounters
  });
  updateCounters();
}

/* 快速评估里点「升级为深度评估」：右栏收起，改成浮层入口 */
/* neo.js 在调用这里之前已经把摘要条贴到了「快速评估完成」那条旧消息上，
   先摘掉它，再说新回复、再重算 —— placeResBar 会把入口挂到最新那条回复下方 */
window.neoOnUpgrade = function () {
  FLOW = 'deep';
  document.documentElement.dataset.flow = 'deep';
  const old = document.querySelector('#neoResBar');
  if (old) old.remove();
  say('ai', `已按<b>深度评估</b>重新精读全本：在原评估报告之上补出<b>分集问题标注</b>，
    每处问题都落到「第几集 · 第几场 · 哪句台词」，并给出判断依据。
    完整结果在浮层里看，入口就在下面。`);
  showResult();
  scrollChat();
};

/* ---------- ≤9 集：结果直接回在对话框里 ---------- */
/* 小体量不出综合评分与评级，也不摆卡片：按维度用自然语言把问题与判断依据讲完 */
const SMALL_STEPS = ['剧本结构化解析', '分维度问题检测', '合规规则库比对', '汇总问题清单'];

function covered() {
  const all = SCRIPT.episodes.filter(e => e.no <= UP.cover)
    .flatMap(e => e.issues)
    .filter(i => !i.ignored && CHOSEN.dims.includes(i.dim))
    .sort((a, b) => SEVN.indexOf(a.sev) - SEVN.indexOf(b.sev) || a.ep - b.ep);
  return UP.part ? all.slice(0, 2) : all;
}
/* 对话里用词不用代号：P0→致命 */
const SEVW = { P0: '致命', P1: '严重', P2: '一般', P3: '轻微' };
const sevText = list => SEVN.filter(s => list.some(i => i.sev === s))
  .map(s => `${SEVW[s]} ${list.filter(i => i.sev === s).length} 处`).join('、');
/* 维度排序：先看有没有致命级，再看问题条数 —— 不再按维度得分排 */
const dimsOf = list => {
  const rank = d => {
    const own = list.filter(i => i.dim === d)
      .sort((a, b) => SEVN.indexOf(a.sev) - SEVN.indexOf(b.sev));
    return [SEVN.indexOf(own[0].sev), -own.length];
  };
  return [...new Set(list.map(i => i.dim))]
    .sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; })
    .map(d => ({ dim: d, list: list.filter(i => i.dim === d) }));
};

/* 深度评估的追问答案也走自然语言（与小体量一致），不再用卡片；
   函数声明会提升，issLine 在下面定义也不影响调用顺序 */
function issHtml(i) { return issLine(i); }

/* ---------- 小体量：结果写成自然语言，不出卡片 ---------- */
/* 一处问题就是一段话：落在第几集 → 原文是哪句 → 我为什么这么判断 */
const issLine = i => `<p class="fp-i">第 ${i.ep} 集<b>${esc(i.title)}</b>（${SEVW[i.sev]}）。
  原文是「${esc(i.quote)}」。${esc(i.why)}</p>`;

const DIM_LEAD = ['最要紧的是', '其次是', '再就是', '接着是', '另外是', '还有'];
const dimProse = (g, idx, total) => {
  const lead = idx > 1 && idx === total - 1 ? '最后是' : (DIM_LEAD[idx] || '还有');
  return `<p class="fp-d">${lead}<b>${dimName(g.dim)}</b>这个维度，读到 ${g.list.length} 处问题（${
    sevText(g.list)}）：</p>` + g.list.map(issLine).join('');
};

function inlineProse(list) {
  if (!list.length) return `<div class="fp"><p>按你选的 ${CHOSEN.dims.length} 个维度把这${VOL}（约 ${
    fmt(UP.words)} 字）读完了，没有读到需要改的地方，这一段可以直接进下一环。</p></div>`;
  const groups = dimsOf(list);
  const head = groups.slice(0, 2), rest = groups.slice(2);
  const restN = rest.reduce((n, g) => n + g.list.length, 0);
  return `
  <div class="fp">
    <p>读完了。${VOL}、约 ${fmt(UP.words)} 字，按你选的 ${CHOSEN.dims.length} 个维度过了一遍，
      一共定位到 <b>${list.length} 处</b>问题，其中${sevText(list)}。体量不大，就不出综合评分和评级了，
      我直接说问题在哪、以及为什么这么判断。</p>
    ${head.map((g, i) => dimProse(g, i, groups.length)).join('')}
    ${rest.length ? `<p class="fp-rest">除此之外，${rest.map(g => dimName(g.dim)).join('、')}${
        rest.length > 1 ? `这 ${rest.length} 个维度` : '这个维度'}还有 ${restN} 处问题，严重度都更低一些。
        <button class="fp-more" type="button" id="fresMore">也一并说完</button></p>
      <div id="fresRest" hidden>${rest.map((g, k) => dimProse(g, k + 2, groups.length)).join('')}</div>` : ''}
    <p class="fp-foot">以上就是全部问题与判断依据，这个体量不用再单独开报告页。
      本期只做问题检测与展示，暂不产出修改建议、也不代改剧本。</p>
  </div>`;
}

async function runSmall() {
  CHOSEN = { mode: P.mode || '真人短剧剧本', pay: P.pay || '付费', region: P.region || '中国',
    platforms: P.platforms || [], dims: pickDims(), more: '' };
  const m = say('ai', `<div>体量不大（${VOL}），不用先确认口径，我直接读完把问题挑出来，共 ${SMALL_STEPS.length} 步。</div>`
    + stepsHtml(SMALL_STEPS));
  await runSteps(m, SMALL_STEPS, 420);
  FLOW = 'inline';
  document.documentElement.dataset.flow = 'inline';
  const list = covered();
  const mm = say('ai', inlineProse(list));
  const more = $('#fresMore', mm);
  if (more) more.onclick = () => { $('#fresRest', mm).hidden = false; more.remove(); scrollChat(); };
}

/* ---------- 计数：本期只有「待看问题数」，没有改稿产物 ---------- */
function updateCounters() {
  const open = ALL_ISSUES().filter(i => !i.ignored && CHOSEN.dims.includes(i.dim)).length;
  const c = $('#tabIssueCnt'), t = $('#tabDiff');
  if (c) c.textContent = open;
  if (t) t.hidden = true;                       /* 修改对比不再产出 */
}

/* ---------- 对话路由 ---------- */
const jump = (k, t) => `<button class="res-jump" type="button" data-res-jump="${k}">直接看${t} <i>⤢</i></button>`;

/* 快速评估完成后，用户在对话框里直接回复"深度评估"即可原地升级——
   不需要再摆一个单独的按钮；升级动作复用 neo.js 的 window.neoUpgrade()，
   它会把 window.NEO_DEPTH 设为 deep、摘掉页面上所有 .neo-upsell 节点，
   再调用 flow.js 自己的 window.neoOnUpgrade（下面定义）接手对话与右栏重绘 */
const DEEP_UPGRADE_RE = /^(深度评估|升级为?深度评估|升级评估|要深度评估|换成?深度评估)$/;

function answer(t) {
  if (FLOW === 'quick' && DEEP_UPGRADE_RE.test(t.trim())) {
    window.neoUpgrade();
    return;
  }

  const ep = t.match(/第\s*(\d+)\s*集/);

  /* 本期只做检测：所有改稿类指令统一说明边界，不再动剧本 */
  if (/修复|改写|改稿|润色|重写|都改|全改|帮我改/.test(t))
    return say('ai', `本期只做<b>剧本问题检测与展示</b>，不产出修改建议、也不代改剧本。
      我可以把问题定位、判断依据和严重度给全${FLOW === 'deep' ? '，并落到「第几集 · 第几场 · 哪句台词」' : ''}，
      改写留给你自己拿主意。`);

  if (ep) {
    const no = +ep[1];
    const list = (FLOW === 'inline' ? covered() : ALL_ISSUES()).filter(i => i.ep === no && !i.ignored);
    if (!list.length) return say('ai', `第 ${no} 集不在本次评估范围内${
      FLOW === 'inline' ? `（这次只评了${VOL}）` : `，示例数据只展开了前 ${SCRIPT.meta.parsedEps} 集`}。`);
    if (FLOW === 'inline')
      return say('ai', `<div class="fp"><p>第 ${no} 集我读到 <b>${list.length} 处</b>问题（${sevText(list)}），逐条说：</p>
        ${list.map(issLine).join('')}</div>`);
    return say('ai', `第 ${no} 集有 <b>${list.length} 处</b>问题：` + list.map(issHtml).join('')
      + (FLOW === 'deep' ? jump('annot', '分集问题标注') : ''));
  }
  if (/伏笔/.test(t)) {
    const r = SCRIPT.dimReports.find(x => x.dim === 'seed');
    return say('ai', `伏笔与信息释放 <b>${r.score} 分</b>，是本稿最弱维度：${esc(r.text)}`
      + (FLOW === 'deep' ? jump('annot', '伏笔相关标注') : ''));
  }
  if (/合规|风险|过审/.test(t)) {
    const r = SCRIPT.dimReports.find(x => x.dim === 'risk');
    return say('ai', `合规维度 <b>${r.score} 分</b>，无涉政涉黄内容。唯一风险点是第 3 集当众泼咖啡后无制止无后果，
      命中规则库里的平台常见退改项。`
      + (FLOW === 'deep' ? jump('report', '合规性评估') : ''));
  }
  if (/报告|评级|总结|得分|怎么样/.test(t)) {
    if (FLOW === 'inline') {
      const list = covered(), ds = dimsOf(list);
      return say('ai', `这次体量小，只给了问题定位、没有出综合评分：${
        ds.length ? `问题集中在<b>${ds.map(r => dimName(r.dim)).join('、')}</b>，共 ${list.length} 处，`
                  : ''}逐条依据都在上面那条结果里。`);
    }
    const base = `综合 <b>${SCRIPT.grade} 级 / ${SCRIPT.score} 分</b>。
      最强项是格式规范（88）与台词（76），最弱是伏笔（52）与逻辑（55）。`;
    if (FLOW === 'quick') return say('ai', base + `完整报告就在右边，含评级依据、分维度得分${
      (CHOSEN.platforms || []).length ? '与平台匹配度' : ''}。`);
    return say('ai', base + '完整报告在结果浮层里。' + jump('report', '评估报告'));
  }
  if (/导出|下载/.test(t)) return say('ai', FLOW === 'inline'
    ? '这次是对话内直接出结果，Demo 暂不提供导出；多集剧本走报告页时可导出 PDF。'
    : '报告右上角可导出 PDF（Demo 只支持 PDF）。');

  say('ai', `本期只做剧本问题检测，我可以做这几件事：<ul>
    <li>问某一集（如「第 3 集有什么问题」），我按维度列出问题与依据</li>
    <li>问某个维度（如「伏笔怎么样」「有没有合规风险」），我给判断依据</li>
    <li>问「报告怎么样」，我给整体结论</li></ul>`);
}

function send() {
  const t = $('#chatInput').value.trim();
  if (!t) return;
  say('me', esc(t));
  $('#chatInput').value = '';
  if (BRIEF_ANSWER) return BRIEF_ANSWER(t);
  if (!FLOW) return say('ai', '先回答上面的两个问题（评估维度、评估深度），确认后我就能开始评估。');
  answer(t);
}
$('#sendBtn').onclick = send;
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
$('#chatHint').textContent = 'Enter 发送 · Shift+Enter 换行';

/* ---------- 启动 ---------- */
if (STAGE === 'result') {
  /* 侧栏「最近评估」直接进已完成的深度评估结果 */
  CHOSEN = { mode: '真人短剧剧本', pay: '付费', region: '中国',
    platforms: SCRIPT.brief.platforms, dims: DEFAULT_DIMS, more: '' };
  $('#volTag').textContent = `${SCRIPT.meta.eps} 集 · ${fmt(SCRIPT.meta.words)} 字`;
  say('me', `上传了 <b>${esc(SCRIPT.file)}</b>　<span class="hint-inline">${SCRIPT.size} · ${SCRIPT.meta.eps} 集</span>`);
  say('ai', `已确认：<b>${DEFAULT_DIMS.map(dimName).join('、')}</b> · 评估深度 <b>深度评估</b><br>
    深度评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，共 ${scoped().issues} 处问题。`);
  FLOW = 'deep';
  document.documentElement.dataset.flow = 'deep';
  showResult();
} else {
  say('me', `<div>上传了 <b>${esc(UP.file)}</b>　<span class="hint-inline">${esc(UP.size)} · ${VOL} · ${fmt(UP.words)} 字</span></div>
    ${REQ ? `<div style="margin-top:4px">${esc(REQ)}</div>` : ''}`);
  if (SMALL) runSmall();
  else startBrief();
}
