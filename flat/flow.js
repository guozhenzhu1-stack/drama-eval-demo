/* ================================================================
   风格 B · 剧本诊断优化：按上传体量分流
     ≤9 集（片段 / 单集 / 少集）→ 对话框内直接给出评估结果，右栏不出现
     ≥10 集 + 快速评估          → 评估报告直接摊在对话框右边
     ≥10 集 + 深度评估          → 对话里给「查看完整评估结果」，正文在新页面
   替代 js/diagnose.js。顶层声明不能包进 IIFE：neo.js 的 neoStudio 桥以裸名读取
   SCRIPT / FIXLOG / annot / say / CHOSEN / refreshDiff / updateCounters
   ================================================================ */
renderTopbar('剧本诊断优化');
initSplitter($('#splitter'), $('#paneChat'), { min: 380, max: 720 });
snapshotOrig(SCRIPT);

const FIXLOG = [];
let annot = null, diff = null;
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

/* ---------- ≥10 集：输入框上方出 brief 卡片（评估深度由 neo.js 注入） ---------- */
function briefCard() {
  const region = P.region || '中国';
  const tagP = k => P.parsed.includes(k) ? '<span class="parsed">已解析</span>' : '';
  return `
  <div class="card brief" id="briefCard">
    <div class="card-head">开始前先确认几项，评估口径会按这些设定收紧</div>
    <div class="card-body">
      <label class="fld"><span class="lbl">制作方式 <span class="req">*</span>${tagP('mode')}</span>
        ${chipGroup('mode', ['真人短剧剧本', 'AI仿真人剧'], { selected: P.mode ? [P.mode] : [] })}</label>
      <label class="fld"><span class="lbl">付费方式 <span class="req">*</span>${tagP('pay')}</span>
        ${chipGroup('pay', ['免费', '付费'], { selected: P.pay ? [P.pay] : [] })}</label>
      <label class="fld"><span class="lbl">目标地区 <span class="req">*</span>${tagP('region')}</span>
        ${chipGroup('region', ['中国', '北美'], { selected: [region] })}</label>
      <label class="fld"><span class="lbl">目标投稿平台（选填，可多选）${tagP('platforms')}</span>
        <span id="pfWrap">${chipGroup('platforms', PLATFORMS[region], { multi: true, selected: P.platforms || [] })}</span></label>
      <label class="fld"><span class="lbl">评估维度（可多选）${tagP('dims')}</span>
        ${chipGroup('dims', DIMS.map(d => ({ v: d.id, label: d.name, color: d.color })), { multi: true, selected: pickDims() })}</label>
      <label class="fld"><span class="lbl">其他评估要求</span>
        <textarea id="briefMore" rows="2" placeholder="例如：重点看前 3 集付费卡点，帮我核一遍伏笔是否都回收">${esc(P.rest)}</textarea></label>
      <div class="err" id="briefErr" hidden></div>
      <div class="brief-foot">
        <button class="btn btn-primary" id="briefGo">确认并开始评估 · 预计消耗 ${fmt(COST.diagnose)} 积分</button>
        <span class="cost">当前余额 ${fmt(CREDITS)}</span>
      </div>
    </div>
  </div>`;
}

function startBrief() {
  const m = say('ai', `已解析剧本结构：<b>${UP.eps ? UP.eps + ' 集' : '多集'} / 约 ${fmt(UP.words)} 字</b>${
    UP.eps > SCRIPT.meta.parsedEps ? `（示例仅展开前 ${SCRIPT.meta.parsedEps} 集）` : ''}。
    这个体量建议先定口径再评：${P.parsed.length
      ? '我从你的描述里提取了部分设定，已预填在下面，确认或改一下即可。'
      : '还需要确认几项评估口径。'}` + briefCard());
  bindChipGroups(m);
  $('[data-group=region]', m).addEventListener('click', e => {
    if (!e.target.closest('.chip')) return;
    const r = groupValue(m, 'region')[0] || '中国';
    $('#pfWrap', m).innerHTML = chipGroup('platforms', PLATFORMS[r], { multi: true });
    bindChipGroups(m);
  });
  $('#briefGo', m).onclick = () => {
    const mode = groupValue(m, 'mode')[0], pay = groupValue(m, 'pay')[0], region = groupValue(m, 'region')[0];
    const dims = groupValue(m, 'dims');
    const miss = [['制作方式', mode], ['付费方式', pay], ['目标地区', region]].filter(x => !x[1]).map(x => x[0]);
    const err = $('#briefErr', m);
    if (miss.length || !dims.length) {
      err.hidden = false;
      err.textContent = miss.length ? `请先选择：${miss.join('、')}` : '请至少选择一个评估维度';
      return;
    }
    CHOSEN = { mode, pay, region, platforms: groupValue(m, 'platforms'), dims, more: $('#briefMore', m).value.trim() };
    $('#briefCard').outerHTML = `<div class="brief-done">已确认：<b>${mode} · ${pay} · ${region}</b>
      ${CHOSEN.platforms.length ? `· 投稿平台 <b>${CHOSEN.platforms.join('、')}</b>` : ''}
      · 评估维度 <b>${dims.map(dimName).join('、')}</b>
      · 评估深度 <b>${window.NEO_DEPTH === 'quick' ? '快速评估' : '深度评估'}</b>
      ${CHOSEN.more ? `<br>补充要求：${esc(CHOSEN.more)}` : ''}
      <br><span class="hint-inline">已扣除 ${fmt(COST.diagnose)} 积分</span></div>`;
    runEval();
  };
}

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
       按 ${CHOSEN.dims.length} 个维度给出了得分、评级依据与平台匹配度——报告就在右边，可以直接往下读。
       <br><span class="hint-inline">快速评估不逐场精读，因此没有「第几集 · 第几场 · 哪句台词」级别的标注；需要的话可以升级为深度评估。</span>`
    : `深度评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，共 <b>${c.issues} 处</b>问题：
       致命 ${c.p0}、严重 ${c.p1}、一般 ${c.p2}、轻微 ${c.p3}。
       <ul>
         <li>最该先改的是第 6 集「31% 股权凭空落地」（P0），它决定观众会不会觉得结局是硬翻盘。</li>
         <li>其次是伏笔维度 ${SCRIPT.dimReports.find(r => r.dim === 'seed').score} 分：3 条钩子级伏笔全部没闭环。</li>
         <li>第 3 集泼咖啡属平台常见退改点，建议改成证据反制。</li>
       </ul>
       评估报告与分集问题标注都在下面这个入口里，点开是一个新页面；要我直接动手就说「整本修复」。`);
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
  annot = createAnnot($('#panelAnnot'), SCRIPT, {
    canFix: true, dims: CHOSEN.dims,
    onFix: doFix, onChange: updateCounters,
    onEdit: () => refreshDiff()
  });
  updateCounters();
}

/* 快速评估里点「升级为深度评估」：右栏收起，改成结果页入口 */
window.neoOnUpgrade = function () {
  FLOW = 'deep';
  document.documentElement.dataset.flow = 'deep';
  showResult();
  say('ai', `已按<b>深度评估</b>重新精读全本：在原评估报告之上补出<b>分集问题标注</b>，
    每处问题都落到「第几集 · 第几场 · 哪句台词」，并给判断依据与改写建议。
    完整结果改在新页面看，入口就在下面这条摘要里。`);
};

/* ---------- ≤9 集：结果直接回在对话框里 ---------- */
const SMALL_STEPS = ['剧本结构化解析', '分维度问题检测', '合规规则库比对', '汇总结论'];
/* 体量小的样本按覆盖到的问题重算一个分数，其余沿用示例数据 */
const SUB = UP.part ? { score: 71, grade: 'B' }
  : UP.eps === 1 ? { score: 68, grade: 'B' }
  : { score: SCRIPT.score, grade: SCRIPT.grade };

function covered() {
  const all = SCRIPT.episodes.filter(e => e.no <= UP.cover)
    .flatMap(e => e.issues)
    .filter(i => !i.ignored && CHOSEN.dims.includes(i.dim))
    .sort((a, b) => SEVN.indexOf(a.sev) - SEVN.indexOf(b.sev) || a.ep - b.ep);
  return UP.part ? all.slice(0, 2) : all;
}
const sevBits = list => SEVN.filter(s => list.some(i => i.sev === s))
  .map(s => `<i class="sev sev-${s}">${s} ${list.filter(i => i.sev === s).length}</i>`).join('');
const dimsOf = list => {
  const ds = [...new Set(list.map(i => i.dim))];
  return SCRIPT.dimReports.filter(r => ds.includes(r.dim)).sort((a, b) => a.score - b.score);
};

function issHtml(i) {
  return `
  <div class="fres-iss" data-iss="${i.id}">
    <div class="fi-top"><i class="sev sev-${i.sev}">${i.sev}</i>
      <b>第 ${i.ep} 集 · ${dimName(i.dim)}｜${esc(i.title)}</b>
      <span class="spacer"></span>
      <button class="fi-btn" type="button" data-fixid="${i.id}">按建议改写</button></div>
    <div class="fi-q">原文「${esc(i.quote)}」</div>
    <div class="fi-why"><b>判断依据：</b>${esc(i.why)}</div>
    <div class="fi-fix"><b>修改建议：</b>${esc(i.fix)}</div>
  </div>`;
}

function inlineResult(list) {
  const reps = dimsOf(list), w = reps[0], p0 = list.find(i => i.sev === 'P0');
  const head = list.slice(0, 3), rest = list.slice(3);
  return `
  <div class="fres">
    <div class="fres-top">
      <span class="grade ${gradeCls(SUB.grade)}">${SUB.grade}</span>
      <div class="ft-tx"><b>综合 ${SUB.score} 分 · ${SUB.grade} 级</b>
        <span>${VOL} · ${fmt(UP.words)} 字 · 已定位 ${list.length} 处问题</span></div>
      <span class="spacer"></span>
      <span class="ft-sev">${sevBits(list) || '<i class="sev sev-P3">无显性问题</i>'}</span>
    </div>
    <p class="fres-say">最弱的是<b>${dimName(w.dim)}（${w.score} 分）</b>——${esc(w.text)}
      ${p0 ? `其中第 ${p0.ep} 集「${esc(p0.title)}」是致命级，必须先改。`
           : '没有致命级问题，按下面的顺序定点修即可。'}</p>
    <div class="dim-bars">${reps.map(r => `
      <div class="dim-bar">
        <span class="nm">${dimName(r.dim)}</span>
        <span class="track"><i class="fill" style="width:${r.score}%;background:${dimColor(r.dim)}"></i></span>
        <span class="sc"><b>${r.score}</b> <em class="${gradeCls(r.grade)}">${r.grade}</em></span>
      </div>`).join('')}</div>
    <div class="fres-list">${head.map(issHtml).join('')}</div>
    ${rest.length ? `<button class="fres-more" type="button" id="fresMore">展开其余 ${rest.length} 处问题</button>
      <div class="fres-list" id="fresRest" hidden>${rest.map(issHtml).join('')}</div>` : ''}
    <div class="fres-foot">这个体量的剧本不用再开报告页：以上就是完整结论。
      想让我直接动手，说「全部改掉」或点单条上的「按建议改写」。</div>
  </div>`;
}

async function runSmall() {
  CHOSEN = { mode: P.mode || '真人短剧剧本', pay: P.pay || '付费', region: P.region || '中国',
    platforms: P.platforms || [], dims: pickDims(), more: '' };
  const m = say('ai', `<div>体量不大（${VOL}），不用先确认口径，我直接读完给结论，共 ${SMALL_STEPS.length} 步。</div>`
    + stepsHtml(SMALL_STEPS));
  await runSteps(m, SMALL_STEPS, 420);
  FLOW = 'inline';
  document.documentElement.dataset.flow = 'inline';
  const list = covered();
  const mm = say('ai', `读完了，结果直接放在这儿：` + inlineResult(list));
  const more = $('#fresMore', mm);
  if (more) more.onclick = () => { $('#fresRest', mm).hidden = false; more.remove(); scrollChat(); };
}

/* ---------- 改稿（对话内直接改；深度评估下同时同步给结果页） ---------- */
function updateCounters() {
  const open = ALL_ISSUES().filter(i => !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim)).length;
  const c = $('#tabIssueCnt'), d = $('#tabDiffCnt'), t = $('#tabDiff');
  if (c) c.textContent = open;
  if (d) d.textContent = FIXLOG.length;
  if (t) t.hidden = !FIXLOG.length;
}

function applyFix(i) {
  if (i.fixed || i.ignored) return false;
  const ep = SCRIPT.episodes.find(e => e.no === i.ep);
  const bi = ep.blocks.findIndex(b => b.x.includes(i.quote));
  if (bi < 0) return false;
  const before = ep.blocks[bi].x;
  ep.blocks[bi].x = before.replace(i.quote, () => i.after);
  i.fixed = true;
  FIXLOG.push({ id: i.id, ep: i.ep, bi, dim: i.dim, title: i.title, sev: i.sev,
    before, after: ep.blocks[bi].x, adopted: false });
  return true;
}

function refreshDiff() {
  if (!diff) diff = createDiff($('#panelDiff'), SCRIPT, FIXLOG, { onAdopt: doAdopt, onRevert: doRevert });
  else diff.render();
  updateCounters();
}

const diffHtml = i => `
  <div class="fdiff">
    <div class="fd-row del"><em>改前</em><span>${esc(i.quote)}</span></div>
    <div class="fd-row add"><em>改后</em><span>${esc(i.after)}</span></div>
  </div>`;

/* 对话内的单条改写（≤9 集路径的主要改稿方式） */
chat.addEventListener('click', e => {
  const b = e.target.closest('[data-fixid]');
  if (!b) return;
  const i = ALL_ISSUES().find(x => x.id === b.dataset.fixid);
  if (!i) return;
  if (!applyFix(i)) { toast('这处已经改过了'); return; }
  b.disabled = true; b.textContent = '已改写';
  say('me', `按建议改写：第 ${i.ep} 集「${i.title}」`);
  say('ai', `已改完这处（${dimName(i.dim)} · ${i.sev}）：` + diffHtml(i));
  refreshDiff();
});

function fixMany(targets, label) {
  const done = targets.filter(applyFix);
  if (!done.length) { say('me', label); say('ai', '当前范围内没有待改写的问题了。'); return; }
  say('me', label);
  $$('[data-fixid]', chat).forEach(b => {
    if (done.some(i => i.id === b.dataset.fixid)) { b.disabled = true; b.textContent = '已改写'; }
  });
  const dims = [...new Set(done.map(i => i.dim))], eps = [...new Set(done.map(i => i.ep))].sort((a, b) => a - b);
  say('ai', `已改完 <b>${done.length} 处</b>，覆盖 ${dims.length} 个维度（${dims.map(dimName).join('、')}）、第 ${eps.join('、')} 集。`
    + done.slice(0, 3).map(diffHtml).join('')
    + (done.length > 3 ? `<div class="hint-inline">另有 ${done.length - 3} 处改动，形式相同。</div>` : '')
    + (FLOW === 'deep' ? `<div class="hint-inline">全部改前改后可在结果页的「修改对比」里逐条采纳或撤销。</div>
        <button class="res-jump" type="button" data-res-jump="diff">在结果页查看修改对比 <i>↗</i></button>` : ''));
  if (annot) annot.render();
  refreshDiff();
}

function doFix(scope, payload) {
  const pool = () => ALL_ISSUES().filter(i => !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim));
  if (scope === 'issue') return fixMany([payload], `修复这个问题：${payload.title}`);
  if (scope === 'ep') {
    const no = typeof payload === 'number' ? payload : (annot && annot.state.ep);
    return fixMany(pool().filter(i => i.ep === no), `第 ${no} 集一键修复`);
  }
  return fixMany(pool(), '整本一键修复');
}

function doAdopt(scope, payload) {
  let n = 0;
  const mark = l => { if (!l.adopted) { l.adopted = true; n++; } };
  if (scope === 'change') FIXLOG.filter(l => l.ep === payload.ep && l.bi === payload.i).forEach(mark);
  else if (scope === 'ep') FIXLOG.filter(l => l.ep === payload).forEach(mark);
  else FIXLOG.forEach(mark);
  if (!n) { toast('该范围内的修改已全部采纳'); return; }
  toast(`已采纳 ${n} 处修改`);
  say('ai', `已采纳 <b>${n} 处</b>修改${scope === 'book' ? '（整本）' : scope === 'ep' ? `（第${payload}集）` : ''}，
    采纳后的正文可以在「修改对比」右上角导出。`);
  if (diff) diff.render();
}

function doRevert(payload) {
  const ep = SCRIPT.episodes.find(e => e.no === payload.ep);
  ep.blocks[payload.i].x = ep.orig[payload.i].x;
  const idx = FIXLOG.findIndex(l => l.ep === payload.ep && l.bi === payload.i);
  if (idx > -1) {
    const iss = ALL_ISSUES().find(i => i.id === FIXLOG[idx].id);
    if (iss) iss.fixed = false;
    FIXLOG.splice(idx, 1);
  }
  toast('已撤销该处修改');
  if (annot) annot.render();
  refreshDiff();
}

/* ---------- 对话路由 ---------- */
const jump = (k, t) => `<button class="res-jump" type="button" data-res-jump="${k}">在结果页查看${t} <i>↗</i></button>`;
const upsell = () => (typeof window.neoUpsellHtml === 'function' ? window.neoUpsellHtml('chat') : '');

function answer(t) {
  const ep = t.match(/第\s*(\d+)\s*集/);

  if (/整本|全部|所有|都改|全改/.test(t) && /修复|改/.test(t)) {
    if (FLOW === 'inline') return fixMany(covered().filter(i => !i.fixed), '全部改掉');
    if (FLOW === 'quick') return say('ai', `快速评估只产出了评估报告，没有逐场标注，因此还改不了具体台词。` + upsell());
    return doFix('book');
  }
  if (ep && /修复|改/.test(t)) {
    const no = +ep[1];
    if (FLOW === 'quick') return say('ai', `快速评估没有逐集标注，改不到具体台词。` + upsell());
    const pool = (FLOW === 'inline' ? covered() : ALL_ISSUES())
      .filter(i => i.ep === no && !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim));
    if (!pool.length) return say('ai', `第 ${no} 集在本次评估范围内没有待改写的问题。`);
    return fixMany(pool, `第 ${no} 集一键修复`);
  }
  if (ep) {
    const no = +ep[1];
    const list = (FLOW === 'inline' ? covered() : ALL_ISSUES()).filter(i => i.ep === no && !i.ignored);
    if (!list.length) return say('ai', `第 ${no} 集不在本次评估范围内${
      FLOW === 'inline' ? `（这次只评了${VOL}）` : `，示例数据只展开了前 ${SCRIPT.meta.parsedEps} 集`}。`);
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
      属平台常见退改点，建议改成证据反制——爽感其实更强。`
      + (FLOW === 'deep' ? jump('report', '合规性评估') : ''));
  }
  if (/报告|评级|总结|得分|怎么样/.test(t)) {
    const base = `综合 <b>${FLOW === 'inline' ? SUB.grade + ' 级 / ' + SUB.score + ' 分' : SCRIPT.grade + ' 级 / ' + SCRIPT.score + ' 分'}</b>。
      最强项是格式规范（88）与台词（76），最弱是伏笔（52）与逻辑（55）。`;
    if (FLOW === 'quick') return say('ai', base + '完整报告就在右边，含评级依据、分维度得分与平台匹配度。');
    if (FLOW === 'deep') return say('ai', base + '完整报告在结果页。' + jump('report', '评估报告'));
    return say('ai', base + '这次体量小，结论都已经在上面那条结果里了。');
  }
  if (/导出|下载/.test(t)) return say('ai', FLOW === 'inline'
    ? '这次是对话内直接出结果，Demo 暂不提供导出；多集剧本走报告页时可导出 PDF / Word。'
    : '报告右上角可导出 PDF / Word；采纳后的正文在「修改对比」里导出。');

  say('ai', `我可以做这几件事：<ul>
    <li>说「全部改掉」或「第 3 集修复」，我直接改</li>
    <li>问某个维度（如「伏笔怎么样」「有没有合规风险」），我给判断依据</li>
    <li>问「报告怎么样」，我给整体结论</li></ul>`);
}

function send() {
  const t = $('#chatInput').value.trim();
  if (!t) return;
  say('me', esc(t));
  $('#chatInput').value = '';
  if (!FLOW) return say('ai', '先在上面的卡片里确认评估口径与评估深度，评完我就能定位问题、直接改稿了。');
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
  say('ai', `已确认：<b>真人短剧剧本 · 付费 · 中国</b> · 投稿平台 <b>${SCRIPT.brief.platforms.join('、')}</b>
    · 评估深度 <b>深度评估</b><br>
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
