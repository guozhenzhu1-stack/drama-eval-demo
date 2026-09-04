/* ============ C 端：剧本诊断优化 ============ */
renderTopbar('剧本诊断优化');
initSplitter($('#splitter'), $('#paneChat'), { min: 320, max: 640 });
snapshotOrig(SCRIPT);

const FIXLOG = [];
let annot = null, diff = null, pendingQuote = null;
const chat = $('#chatScroll');

/* 右侧 tab 从一开始就可切换；评估未完成时给占位 */
initTabs($('#wtabs'), $('#workBody'), p => { if (p === 'panelDiff' && diff) diff.render(); });
$('#panelReport').innerHTML = '<div class="empty-state">确认左侧评估口径后，这里出完整评估报告。</div>';
$('#panelAnnot').innerHTML = '<div class="empty-state">评估完成后，这里按集、按维度列出问题与判断依据。</div>';

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

/* ---------- 从初始输入里解析 brief ---------- */
const REQ = qs.get('req') || '';
const DIM_KEYS = { 故事线: 'story', 主线: 'story', 逻辑: 'logic', 节奏: 'pace', 拖沓: 'pace',
  人设: 'role', 人物: 'role', 台词: 'line', 伏笔: 'seed', 信息: 'seed', 格式: 'fmt', 合规: 'risk', 风险: 'risk' };
function parseReq(t) {
  const p = { parsed: [] };
  if (/AI仿真|AI仿|仿真人/.test(t)) { p.mode = 'AI仿真人剧'; p.parsed.push('mode'); }
  else if (/真人/.test(t)) { p.mode = '真人短剧剧本'; p.parsed.push('mode'); }
  if (/付费/.test(t)) { p.pay = '付费'; p.parsed.push('pay'); }
  else if (/免费/.test(t)) { p.pay = '免费'; p.parsed.push('pay'); }
  if (/北美|海外|英文/.test(t)) { p.region = '北美'; p.parsed.push('region'); }
  else if (/中国|国内/.test(t) || t) { p.region = '中国'; if (/中国|国内/.test(t)) p.parsed.push('region'); }
  const pf = PLATFORMS[p.region || '中国'].filter(x => t.includes(x));
  if (pf.length) { p.platforms = pf; p.parsed.push('platforms'); }
  const dims = [...new Set(Object.keys(DIM_KEYS).filter(k => t.includes(k)).map(k => DIM_KEYS[k]))];
  if (dims.length) { p.dims = dims; p.parsed.push('dims'); }
  p.rest = t;
  return p;
}
const P = parseReq(REQ);

/* ---------- Brief 澄清卡片 ---------- */
function briefCard() {
  const region = P.region || '中国';
  const dims = P.dims && P.dims.length ? P.dims : DEFAULT_DIMS;
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
        ${chipGroup('dims', DIMS.map(d => ({ v: d.id, label: d.name, color: d.color })), { multi: true, selected: dims })}</label>
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

/* ---------- 流程：brief → 评估中 → 结果 ---------- */
let CHOSEN = { dims: DEFAULT_DIMS, platforms: [] };

function startBrief() {
  say('me', `<div>上传了 <b>${esc(SCRIPT.file)}</b>　<span class="hint-inline">${SCRIPT.size} · ${SCRIPT.meta.eps} 集 · ${fmt(SCRIPT.meta.words)} 字</span></div>
    ${REQ ? `<div style="margin-top:4px">${esc(REQ)}</div>` : ''}`);
  const m = say('ai', `已解析剧本结构：<b>${SCRIPT.meta.eps} 集 / ${SCRIPT.meta.scenes} 场</b>（示例仅展开前 ${SCRIPT.meta.parsedEps} 集）。
    ${P.parsed.length ? '我从你的描述里提取了部分设定，已预填在下面，确认或改一下即可。' : '还需要确认几项评估口径。'}` + briefCard());
  bindChipGroups(m);
  /* 地区切换时刷新平台库 */
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
      ${CHOSEN.more ? `<br>补充要求：${esc(CHOSEN.more)}` : ''}
      <br><span class="hint-inline">已扣除 ${fmt(COST.diagnose)} 积分</span></div>`;
    runEval();
  };
}

const STEPS = ['剧本结构化解析（24 集 / 61 场）', '分集分维度问题检测', '合规规则库比对（更新至 2026-08-28）',
  '定向投稿匹配度计算', '汇总评估报告'];

async function runEval() {
  const m = say('ai', `<div>开始评估，共 ${STEPS.length} 步。</div>
    <div class="steps">${STEPS.map((s, i) => `<div class="step" data-i="${i}"><span class="ic">○</span><span>${s}</span></div>`).join('')}</div>
    <div class="prog"><i style="width:0"></i></div>`);
  const steps = $$('.step', m), bar = $('.prog > i', m);
  for (let i = 0; i < steps.length; i++) {
    steps[i].className = 'step run'; steps[i].querySelector('.ic').textContent = '◍';
    bar.style.width = ((i + 0.5) / steps.length * 100) + '%';
    scrollChat();
    await sleep(560);
    steps[i].className = 'step done'; steps[i].querySelector('.ic').textContent = '✓';
    bar.style.width = ((i + 1) / steps.length * 100) + '%';
  }
  showResult();
  say('ai', `评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，共 <b>${SCRIPT.stats.issues} 处</b>问题：
    致命 ${SCRIPT.stats.p0}、严重 ${SCRIPT.stats.p1}、一般 ${SCRIPT.stats.p2}、轻微 ${SCRIPT.stats.p3}。
    <ul>
      <li>最该先改的是第 6 集「31% 股权凭空落地」（P0），它决定观众会不会觉得结局是硬翻盘。</li>
      <li>其次是伏笔维度 ${SCRIPT.dimReports.find(r => r.dim === 'seed').score} 分：3 条钩子级伏笔全部没闭环。</li>
      <li>第 3 集泼咖啡属平台常见退改点，建议改成证据反制。</li>
    </ul>
    右侧可以看完整报告与逐集标注，需要我直接动手就说「整本修复」，或点问题卡上的「一键修复」。`);
}

/* ---------- 结果：报告 + 标注 + 对比 ---------- */
function showResult() {
  $('#workMeta').textContent = `《${SCRIPT.title}》· ${CHOSEN.dims.length} 个维度`;
  renderReport($('#panelReport'), SCRIPT, {
    dims: CHOSEN.dims,
    countByDims: true,
    showMatch: (CHOSEN.platforms || []).length > 0,
    onEpJump: (ep, dim) => { activateTab($('#wtabs'), 'panelAnnot'); annot.goto(ep, dim); }
  });
  annot = createAnnot($('#panelAnnot'), SCRIPT, {
    canFix: true, dims: CHOSEN.dims,
    onFix: doFix,
    onInstruction: applyCustom,
    onChange: updateCounters,
    onEdit: epNo => { toast(`第${epNo}集正文已保存，可在「修改对比」中核对`); refreshDiff(); }
  });
  updateCounters();
}

function updateCounters() {
  const open = ALL_ISSUES().filter(i => !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim)).length;
  $('#tabIssueCnt').textContent = open;
  $('#tabDiffCnt').textContent = FIXLOG.length;
  $('#tabDiff').hidden = !FIXLOG.length;
}

/* ---------- 一键修复 ---------- */
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

function doFix(scope, payload) {
  let targets = [];
  if (scope === 'issue') targets = [payload];
  else if (scope === 'ep') targets = SCRIPT.episodes.find(e => e.no === annot.state.ep).issues
    .filter(i => !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim));
  else targets = ALL_ISSUES().filter(i => !i.fixed && !i.ignored && CHOSEN.dims.includes(i.dim));

  const done = targets.filter(applyFix);
  if (!done.length) { toast('当前范围内没有待修复的问题'); return; }

  const dims = [...new Set(done.map(i => i.dim))];
  const eps = [...new Set(done.map(i => i.ep))].sort((a, b) => a - b);
  say('me', scope === 'issue' ? `修复这个问题：${esc(payload.title)}`
    : scope === 'ep' ? `第${annot.state.ep}集一键修复` : '整本一键修复');
  say('ai', `已改完 <b>${done.length} 处</b>，覆盖 ${dims.length} 个维度（${dims.map(dimName).join('、')}）、
    第 ${eps.join('、')} 集。
    <ul>${done.slice(0, 4).map(i => `<li>第${i.ep}集 · ${dimName(i.dim)}：${esc(i.title)}</li>`).join('')}
    ${done.length > 4 ? `<li class="muted">…另有 ${done.length - 4} 处</li>` : ''}</ul>
    改动都在「修改对比」里逐条列出了，确认后可以按问题 / 按集 / 整本采纳。`);

  annot.render();
  refreshDiff();
  activateTab($('#wtabs'), 'panelDiff');
  if (scope !== 'book') diff.goto(done[0].ep);
}

/* ---------- 采纳 / 撤销 ---------- */
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
  diff.render();
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
  annot.render(); refreshDiff();
  if (!FIXLOG.length) activateTab($('#wtabs'), 'panelAnnot');
}

/* ---------- 划选内容 + 自定义指令 ---------- */
function paintQuote() {
  $('#quoteRef').innerHTML = pendingQuote ? `
    <div class="quote-ref"><span class="qt">第${pendingQuote.ep}集选区：${esc(pendingQuote.sel)}</span>
      <span class="x" style="cursor:pointer" id="qx">✕</span></div>` : '';
  if (pendingQuote) $('#qx').onclick = () => { pendingQuote = null; paintQuote(); };
}
function applyCustom(sel, instr, epNo) {
  pendingQuote = { sel, ep: epNo };
  paintQuote();
  $('#chatInput').value = instr;
  send();
}

function rewriteSelection(sel, instr, epNo) {
  const ep = SCRIPT.episodes.find(e => e.no === epNo);
  const hit = ep.issues.find(i => !i.fixed && !i.ignored && (sel.includes(i.quote) || i.quote.includes(sel)));
  if (hit && applyFix(hit)) return { kind: 'issue', issue: hit };
  const bi = ep.blocks.findIndex(b => b.x.includes(sel));
  if (bi < 0) return null;
  const before = ep.blocks[bi].x;
  ep.blocks[bi].x = before.replace(sel, () => `${sel}【按指令改写：${instr}】`);
  FIXLOG.push({ id: 'manual-' + Date.now(), ep: epNo, bi, dim: 'line', sev: 'P2',
    title: '自定义指令改写', before, after: ep.blocks[bi].x, adopted: false });
  return { kind: 'custom' };
}

/* ---------- 对话发送 ---------- */
function send() {
  const t = $('#chatInput').value.trim();
  if (!t) return;
  const q = pendingQuote;
  say('me', (q ? `<div class="quote-ref" style="margin:0 0 6px"><span class="qt">选区：${esc(q.sel)}</span></div>` : '') + esc(t));
  $('#chatInput').value = ''; pendingQuote = null; paintQuote();

  if (!annot) return say('ai', '先在上面的卡片里确认评估口径并开始评估，评完我就能定位问题、直接改稿了。');

  if (q) {
    const r = rewriteSelection(q.sel, t, q.ep);
    if (!r) { say('ai', '这段选区跨了多个段落，Demo 里只支持单段落改写，麻烦重新选一段。'); return; }
    say('ai', r.kind === 'issue'
      ? `这段正好命中一处已识别问题（第${r.issue.ep}集 · ${dimName(r.issue.dim)} · ${r.issue.sev}）：<b>${esc(r.issue.title)}</b>。
         已按你的指令改写，同时把这处问题标为已修复，改前改后见右侧「修改对比」。`
      : `已按指令改写这段（Demo 未内置该段落的改写样本，用占位文本标出改动位置），改动已进入「修改对比」。`);
    annot.render(); refreshDiff(); activateTab($('#wtabs'), 'panelDiff'); diff.goto(q.ep);
    return;
  }

  /* 无选区：意图路由 */
  const epMatch = t.match(/第\s*(\d+)\s*集/);
  if (/整本|全部|所有/.test(t) && /修复|改/.test(t)) return doFix('book');
  if (epMatch && /修复|改/.test(t)) {
    const no = +epMatch[1];
    if (!SCRIPT.episodes.some(e => e.no === no)) return say('ai', `示例数据只解析了前 ${SCRIPT.meta.parsedEps} 集。`);
    annot.state.ep = no; annot.render(); return doFix('ep');
  }
  if (epMatch) {
    const no = +epMatch[1];
    if (!SCRIPT.episodes.some(e => e.no === no))
      return say('ai', `示例数据只解析了前 ${SCRIPT.meta.parsedEps} 集，第 ${no} 集在 Demo 里没有正文，换 1–${SCRIPT.meta.parsedEps} 集里的任意一集试试。`);
    activateTab($('#wtabs'), 'panelAnnot'); annot.goto(no);
    return say('ai', `已切到第 ${no} 集的标注视图。`);
  }
  if (/伏笔/.test(t)) {
    activateTab($('#wtabs'), 'panelAnnot'); annot.goto(2, 'seed');
    return say('ai', `伏笔与信息释放 <b>52 分</b>，是本稿最弱维度：一年契约（第2集）、代驾误会（第5集）、男主持股（第6集）三条钩子级伏笔都没闭环，后两条还与已写设定冲突。已在右侧定位到第一条。`);
  }
  if (/合规|风险|过审/.test(t)) {
    activateTab($('#wtabs'), 'panelAnnot'); annot.goto(3, 'risk');
    return say('ai', `合规维度 <b>74 分</b>，无涉政涉黄内容。唯一风险点是第 3 集当众泼咖啡后无制止无后果，属平台常见退改点，建议改成证据反制——爽感其实更强。`);
  }
  if (/报告|评级|总结|怎么样/.test(t)) {
    activateTab($('#wtabs'), 'panelReport');
    return say('ai', `综合 <b>${SCRIPT.grade} 级 / ${SCRIPT.score} 分</b>。最强项是格式规范（88）与台词（76），最弱是伏笔（52）与逻辑（55）。
      按当前投稿平台，红果匹配度 78%、点众 71%，卡在前三集反转密度只有 0.8 个/集。`);
  }
  if (/导出|下载/.test(t)) return say('ai', '报告右上角可下载 PDF / Word，分集标注支持导出 Word / Excel，采纳后的正文在「修改对比」里导出。');
  say('ai', `我可以做这几件事：<ul>
    <li>说「整本修复」或「第 3 集修复」，我直接改</li>
    <li>问某个维度（如「伏笔怎么样」「有没有合规风险」），我定位到具体位置</li>
    <li>在右侧正文划选一段再下指令，做定点改写</li></ul>`);
}

$('#sendBtn').onclick = send;
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

/* ---------- 启动 ---------- */
if (qs.get('stage') === 'result') {
  CHOSEN = { mode: '真人短剧剧本', pay: '付费', region: '中国', platforms: SCRIPT.brief.platforms, dims: DEFAULT_DIMS, more: '' };
  say('me', `上传了 <b>${esc(SCRIPT.file)}</b>`);
  say('ai', `已确认：<b>真人短剧剧本 · 付费 · 中国</b> · 投稿平台 <b>${SCRIPT.brief.platforms.join('、')}</b><br>
    评估完成，综合评级 <b>${SCRIPT.grade}（${SCRIPT.score} 分）</b>，共 ${SCRIPT.stats.issues} 处问题。右侧查看报告与逐集标注。`);
  showResult();
} else {
  startBrief();
}
$('#chatHint').textContent = 'Enter 发送 · Shift+Enter 换行';



