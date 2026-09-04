/* ============ B 端：批量审稿筛选 ============ */
renderTopbar('批量审稿筛选');
initSplitter($('#splitter'), $('#paneChat'), { min: 320, max: 640 });

const N = Math.min(Math.max(+(qs.get('n') || BATCH.length) || BATCH.length, 1), BATCH.length);
const REQ = qs.get('req') || '';
const chat = $('#chatScroll');
/* 只取本批实际份数，所有统计都基于 DATA，避免 n<50 时百分比算错 */
const DATA = BATCH.slice(0, N);
const gCount = g => DATA.filter(b => b.grade === g).length;
const rCount = t => DATA.filter(b => b.reject === t).length;
let CHOSEN = { dims: DEFAULT_DIMS, req: '' }, annot = null, curId = null, READY = false;

/* 右侧 tab 从一开始就可切换；结果未出时给占位 */
initTabs($('#wtabs'), $('#workBody'));
$('#panelBatch').innerHTML = '<div class="empty-state">确认左侧审稿口径后，这里出批量评估结论。</div>';
$('#repHost').innerHTML = '<div class="empty-state">评完后可在这里逐份查看剧本评估报告。</div>';
$('#annotHost').innerHTML = '<div class="empty-state">评完后可在这里查看逐集问题标注与判断依据。</div>';

function say(role, html) {
  const m = document.createElement('div');
  m.className = 'msg ' + role;
  m.innerHTML = `<span class="avatar">${role === 'me' ? '我' : 'AI'}</span><div class="bubble">${html}</div>`;
  chat.appendChild(m);
  chat.parentElement.scrollTop = chat.scrollHeight;
  return m;
}
const scrollChat = () => { chat.parentElement.scrollTop = chat.scrollHeight; };

/* ---------- Brief 澄清 ---------- */
const DIM_KEYS = { 故事线: 'story', 主线: 'story', 逻辑: 'logic', 节奏: 'pace', 人设: 'role',
  人物: 'role', 台词: 'line', 伏笔: 'seed', 格式: 'fmt', 合规: 'risk', 洗稿: 'fmt', AI: 'fmt' };
const P = {
  mode: /AI仿真|仿真人/.test(REQ) ? 'AI仿真人剧' : /真人/.test(REQ) ? '真人短剧剧本' : '',
  pay: /付费/.test(REQ) ? '付费' : /免费/.test(REQ) ? '免费' : '',
  region: /北美|海外|英文/.test(REQ) ? '北美' : /中国|国内/.test(REQ) ? '中国' : '',
  dims: [...new Set(Object.keys(DIM_KEYS).filter(k => REQ.includes(k)).map(k => DIM_KEYS[k]))],
  req: REQ
};

function startBrief() {
  say('me', `<div>上传了 <b>${N} 份</b>投稿剧本　<span class="hint-inline">9 月第 1 批 · pdf/word 混合</span></div>
    ${REQ ? `<div style="margin-top:4px">${esc(REQ)}</div>` : ''}`);
  const m = say('ai', `已接收 <b>${N} 份</b>稿件并完成结构化解析。${REQ ? '你的审稿要求我已解析进下面的卡片，确认一下口径。' : '先确认审稿口径。'}`
    + `<div class="card brief" id="briefCard">
      <div class="card-head">审稿口径确认</div>
      <div class="card-body">
        <label class="fld"><span class="lbl">制作方式 <span class="req">*</span>${P.mode ? '<span class="parsed">已解析</span>' : ''}</span>
          ${chipGroup('mode', ['真人短剧剧本', 'AI仿真人剧'], { selected: P.mode ? [P.mode] : [] })}</label>
        <label class="fld"><span class="lbl">付费方式 <span class="req">*</span>${P.pay ? '<span class="parsed">已解析</span>' : ''}</span>
          ${chipGroup('pay', ['免费', '付费'], { selected: P.pay ? [P.pay] : [] })}</label>
        <label class="fld"><span class="lbl">目标地区 <span class="req">*</span>${P.region ? '<span class="parsed">已解析</span>' : ''}</span>
          ${chipGroup('region', ['中国', '北美'], { selected: P.region ? [P.region] : [] })}</label>
        <label class="fld"><span class="lbl">评估维度（可多选，维度库可扩充）</span>
          ${chipGroup('dims', DIMS.map(d => ({ v: d.id, label: d.name, color: d.color })), { multi: true, selected: DEFAULT_DIMS })}</label>
        <label class="fld"><span class="lbl">自定义审稿要求${REQ ? '<span class="parsed">已解析</span>' : ''}
            <span class="hint-inline">优先级高于通用评估标准</span></span>
          <textarea id="briefReq" rows="3" placeholder="例如：都市甜宠+先婚后爱，女性成长向；60–80 集；杜绝 AI 拼稿与洗稿">${esc(REQ)}</textarea></label>
        <div class="err" id="briefErr" hidden></div>
        <div class="brief-foot">
          <button class="btn btn-primary" id="briefGo">确认并开始批量审稿 · 预计消耗 ${fmt(COST.batch)} 积分</button>
          <span class="cost">${N} 份 × 96 积分 / 份</span>
        </div>
      </div></div>`);
  bindChipGroups(m);
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
    CHOSEN = { mode, pay, region, dims, req: $('#briefReq', m).value.trim() };
    $('#briefCard').outerHTML = `<div class="brief-done">已确认：<b>${mode} · ${pay} · ${region}</b>
      · 评估维度 <b>${dims.map(dimName).join('、')}</b>
      ${CHOSEN.req ? `<br>自定义审稿要求：${esc(CHOSEN.req)}` : '<br>未设自定义要求，按通用质量等级分类'}
      <br><span class="hint-inline">已扣除 ${fmt(COST.batch)} 积分</span></div>`;
    runBatch();
  };
}

/* ---------- 批量评估进度 ---------- */
async function runBatch() {
  const m = say('ai', `<div>开始批量审稿，共 ${N} 份。</div>
    <div class="steps">
      <div class="step run"><span class="ic">◍</span><span id="bStep">结构化解析与去重指纹计算</span></div>
    </div>
    <div class="prog"><i style="width:0"></i></div>
    <div class="hint-inline" style="margin-top:6px">已完成 <b id="bDone">0</b> / ${N}</div>`);
  const bar = $('.prog > i', m), done = $('#bDone', m), label = $('#bStep', m);
  const phases = [[.24, '结构化解析与去重指纹计算'], [.52, 'AI 生成特征与洗稿比对'],
                  [.8, '分维度质量评估'], [.96, '自定义审稿要求匹配'], [1, '汇总批量结论']];
  let n = 0;
  for (const [ratio, text] of phases) {
    const target = Math.max(1, Math.round(N * ratio));
    label.textContent = text;
    while (n < target) {
      n += Math.max(1, Math.ceil((target - n) / 4));
      done.textContent = Math.min(n, N);
      bar.style.width = Math.min(100, n / N * 100) + '%';
      await sleep(120);
    }
  }
  $('.step', m).className = 'step done';
  $('.ic', m).textContent = '✓';
  label.textContent = `${N} 份全部评估完成`;
  showResult();
  const picks = DATA.filter(b => b.match);
  say('ai', `${N} 份稿件评完。${CHOSEN.req ? `符合你这条审稿要求的有 <b>${picks.length} 部</b>` : `S/A 级共 <b>${gCount('S') + gCount('A')} 部</b>`}，
    另外精准拦截无效投稿 <b>${DATA.filter(b => b.reject).length} 份</b>（AI 拼凑 ${rCount('AI拼凑')}、洗稿 ${rCount('洗稿')}、同质化 ${rCount('同质化')}、格式混乱 ${rCount('格式混乱')}）。
    <ul>${picks.slice(0, 3).map(b => `<li>${esc(b.title)}（${b.grade} 级）：${esc(b.why)}</li>`).join('')}</ul>
    右侧可以按剧本查看评估报告和逐集标注。`);
}

/* ---------- 结果 ---------- */
function showResult() {
  READY = true;
  $('#workMeta').textContent = `${N} 份稿件 · ${CHOSEN.dims.length} 个维度`;
  $('#tabBatchCnt').textContent = N;
  renderBatchPanel();
  const opts = DATA.map(b => `<option value="${b.id}">${esc(b.title)}（${b.grade} 级 / ${b.score} 分）</option>`).join('');
  $('#repPick').innerHTML = opts;
  $('#annotPick').innerHTML = opts;
  $('#repPick').onchange = e => showReport(e.target.value);
  $('#annotPick').onchange = e => showAnnot(e.target.value);
  const first = (DATA.find(b => b.match) || DATA[0]).id;
  $('#repPick').value = first; $('#annotPick').value = first;
  showReport(first); showAnnot(first);
}

/* 把批量条目映射成一份可渲染的报告（明细复用示例数据） */
function viewOf(b) {
  const t = b.issues.total;
  return { ...SCRIPT, title: b.title, author: b.author, grade: b.grade, score: b.score,
    meta: { ...SCRIPT.meta, eps: b.eps, words: b.words },
    stats: { ...SCRIPT.stats, issues: t, p0: b.issues.p0, p1: b.issues.p1,
             p2: Math.max(0, t - b.issues.p0 - b.issues.p1 - 2), p3: 2 },
    verdict: (b.match ? `符合本次审稿要求：${b.why}` : b.reject
      ? `判定为无效投稿（${b.reject}）：${b.why}`
      : `未命中本次审稿要求：${b.why}`) + `　最弱维度为${dimName(b.weakDim)}，建议复审时重点核查。` };
}

function showReport(id) {
  const b = DATA.find(x => x.id === id); if (!b) return;
  curId = id;
  renderReport($('#repHost'), viewOf(b), {
    dims: CHOSEN.dims, showMatch: false,
    titleNote: b.match ? '符合审稿要求' : b.reject ? '已拦截 · ' + b.reject : '未命中要求',
    onEpJump: (ep, dim) => { $('#annotPick').value = id; showAnnot(id); activateTab($('#wtabs'), 'panelAnnot'); annot.goto(ep, dim); }
  });
}

/* 每份稿件独立一套标注状态：深拷贝分集数据，忽略/定位互不影响 */
const ANNOT_CACHE = {};
function annotData(b) {
  if (!ANNOT_CACHE[b.id]) {
    ANNOT_CACHE[b.id] = {
      ...SCRIPT, title: b.title, author: b.author, grade: b.grade, score: b.score,
      episodes: SCRIPT.episodes.map(e => ({
        ...e, blocks: e.blocks.map(x => ({ ...x })), issues: e.issues.map(i => ({ ...i }))
      }))
    };
  }
  return ANNOT_CACHE[b.id];
}

function showAnnot(id) {
  const b = DATA.find(x => x.id === id); if (!b) return;
  if (annot) annot.destroy();
  annot = createAnnot($('#annotHost'), annotData(b), {
    canFix: false, dims: CHOSEN.dims,
    onInstruction: (sel, instr) => say('ai', 'B 端批量审稿为只读标注，如需改写请把稿件转入「剧本诊断优化」流程。')
  });
}

/* ---------- 批量评估结果 ---------- */
const GRADE_COLOR = { S: '#7a3ea8', A: 'var(--good)', B: 'var(--accent)', C: 'var(--warning)', D: 'var(--critical)' };
const FS = { grade: 'all', reject: 'all', kw: '' };

function renderBatchPanel() {
  const host = $('#panelBatch');
  const picks = DATA.filter(b => b.match), rejects = DATA.filter(b => b.reject);
  const hasReq = !!CHOSEN.req;
  host.innerHTML = `
  <div class="batch" style="flex:1">
    <div class="conclusion">
      <div style="display:flex;align-items:flex-start;gap:16px">
        <div style="flex:1">
          <h2>${hasReq ? `共评估 ${N} 部，符合自定义审稿要求 ${picks.length} 部` : `共评估 ${N} 部，S/A 级 ${gCount('S') + gCount('A')} 部`}</h2>
          <div class="lead">${hasReq
            ? `审稿要求：${esc(CHOSEN.req)}<br>拦截无效投稿 ${rejects.length} 份，需人工复审的稿件从 ${N} 部收敛到 ${picks.length} 部，人工审读量下降 ${Math.round((1 - picks.length / N) * 100)}%。`
            : `未设自定义审稿要求，按所选 ${CHOSEN.dims.length} 个维度做通用质量分级；拦截无效投稿 ${rejects.length} 份。`}</div>
        </div>
        <button class="btn btn-sm" id="expConc">导出评估结论</button>
      </div>
      <div class="grade-dist">
        ${GRADE_ORDER.map(g => { const n = gCount(g); return n ? `
          <div class="seg" style="flex:${n};background:${GRADE_COLOR[g]}${g === 'C' ? ';color:#3a2a00' : ''}"
               title="${g} 级 ${n} 部">${g} ${n}</div>` : ''; }).join('')}
      </div>
      <div class="dist-legend">
        ${GRADE_ORDER.map(g => `<span class="lg"><span class="sw" style="background:${GRADE_COLOR[g]}"></span>
          ${g} 级 ${gCount(g)} 部</span>`).join('')}
      </div>
      <div class="reject-grid">
        ${REJECT_TYPES.map(t => `<div class="kpi"><div class="k">${t}</div><div class="v">${rCount(t)}<small> 份</small></div></div>`).join('')}
        <div class="kpi"><div class="k">有效稿占比</div><div class="v" style="color:var(--good-text)">${Math.round((1 - rejects.length / N) * 100)}%</div></div>
      </div>
    </div>

    ${hasReq ? `
    <div class="section-title"><h3>符合审稿要求的剧本（${picks.length}）</h3>
      <span class="hint">点击任意一行跳转到该剧本的评估报告</span></div>
    <div class="tbl-wrap">
      <table class="tbl"><thead><tr>
        <th>剧本</th><th>作者</th><th class="num">集数</th><th>评级</th><th class="num">分数</th><th>匹配理由</th>
      </tr></thead><tbody>
        ${picks.map(b => `<tr class="is-clickable" data-id="${b.id}">
          <td><b>${esc(b.title)}</b></td><td class="secondary">${esc(b.author)}</td>
          <td class="num">${b.eps}</td><td><span class="grade sm ${gradeCls(b.grade)}">${b.grade}</span></td>
          <td class="num">${b.score}</td><td class="reason">${esc(b.why)}</td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}

    <div class="section-title"><h3>全部稿件（${N}）</h3><span class="spacer"></span>
      <div class="filter-bar">
        <div class="chip-row" id="fGrade">
          ${['all', ...GRADE_ORDER].map(g => `<button type="button" class="chip" aria-pressed="${FS.grade === g}" data-v="${g}">${g === 'all' ? '全部等级' : g + ' 级'}</button>`).join('')}
        </div>
        <div class="chip-row" id="fReject">
          <button type="button" class="chip" aria-pressed="${FS.reject === 'all'}" data-v="all">不限</button>
          <button type="button" class="chip" aria-pressed="${FS.reject === 'valid'}" data-v="valid">仅有效稿</button>
          <button type="button" class="chip" aria-pressed="${FS.reject === 'rejected'}" data-v="rejected">仅拦截稿</button>
        </div>
      </div>
    </div>
    <div class="tbl-wrap" id="allWrap"></div>
    <p class="hint-inline" style="margin-top:12px">判定口径：自定义审稿要求优先于通用评估标准；拦截结论均给出可核查依据。</p>
  </div>`;

  $('#expConc').onclick = () => fakeDownload(`9月第1批投稿评估结论（${N}份）.xlsx`);
  $$('#panelBatch tr.is-clickable').forEach(tr => tr.onclick = () => jumpReport(tr.dataset.id));
  ['fGrade', 'fReject'].forEach(id => {
    const box = $('#' + id); if (!box) return;
    box.onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return;
      $$('.chip', box).forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      FS[id === 'fGrade' ? 'grade' : 'reject'] = c.dataset.v;
      renderAllTable();
    };
  });
  renderAllTable();
}

function renderAllTable() {
  const rows = DATA.filter(b => (FS.grade === 'all' || FS.grade.includes(b.grade))
    && (FS.reject === 'all' || (FS.reject === 'valid' ? !b.reject : !!b.reject)));
  $('#allWrap').innerHTML = `
    <table class="tbl"><thead><tr>
      <th>剧本</th><th>作者</th><th class="num">集数</th><th class="num">字数</th>
      <th>评级</th><th class="num">分数</th><th>判定</th><th>最弱维度</th><th class="num">问题</th>
    </tr></thead><tbody>
      ${rows.map(b => `<tr class="is-clickable" data-id="${b.id}">
        <td><b>${esc(b.title)}</b></td><td class="secondary">${esc(b.author)}</td>
        <td class="num">${b.eps}</td><td class="num">${fmt(b.words)}</td>
        <td><span class="grade sm ${gradeCls(b.grade)}">${b.grade}</span></td>
        <td class="num">${b.score}</td>
        <td>${b.match ? '<span class="pick-flag">✓ 符合要求</span>'
          : b.reject ? `<span class="sev sev-P1">${b.reject}</span>` : '<span class="muted">未命中</span>'}</td>
        <td><span class="tag"><span class="dot" style="background:${dimColor(b.weakDim)}"></span>${dimName(b.weakDim)}</span></td>
        <td class="num">${b.issues.total}</td></tr>`).join('')
      || '<tr><td colspan="9" class="muted" style="padding:20px">当前筛选下没有稿件</td></tr>'}
    </tbody></table>`;
  $$('#allWrap tr.is-clickable').forEach(tr => tr.onclick = () => jumpReport(tr.dataset.id));
}

function jumpReport(id) {
  $('#repPick').value = id;
  showReport(id);
  activateTab($('#wtabs'), 'panelReport');
}

/* ---------- 对话追问 ---------- */
function setFilter(grade, reject) {
  FS.grade = grade; FS.reject = reject;
  activateTab($('#wtabs'), 'panelBatch');
  renderBatchPanel();
}

function findByTitle(t) {
  const hit = DATA.filter(b => t.includes(b.title) || (b.title.length > 3 && t.includes(b.title.slice(0, 4))));
  return hit[0] || null;
}

function send() {
  const t = $('#chatInput').value.trim();
  if (!t) return;
  say('me', esc(t));
  $('#chatInput').value = '';
  if (!READY) return say('ai', '先在上面确认审稿口径并开始批量审稿，评完我再回答筛选和单部稿件的问题。');

  const b = findByTitle(t);
  if (b) {
    jumpReport(b.id);
    return say('ai', `《${esc(b.title)}》：<b>${b.grade} 级 / ${b.score} 分</b>，${b.reject ? `判定为无效投稿（${b.reject}）` : b.match ? '符合本次审稿要求' : '未命中本次审稿要求'}。<br>
      判断依据：${esc(b.why)}　最弱维度 <b>${dimName(b.weakDim)}</b>，共 ${b.issues.total} 处问题（致命 ${b.issues.p0}、严重 ${b.issues.p1}）。
      已在右侧打开它的评估报告。`);
  }

  /* 支持「只看 S 级」「只看 S/A 级」这类多等级筛选 */
  const gm = t.match(/([SABCD](?:\s*[\/、]\s*[SABCD])*)\s*级/i);
  const gs = gm ? [...new Set(gm[1].toUpperCase().replace(/[^SABCD]/g, '').split(''))] : [];
  if (/只看|筛|过滤/.test(t) && gs.length) {
    setFilter(gs.join(''), 'all');
    return say('ai', `已把「全部稿件」筛成 <b>${gs.join(' / ')} 级</b>，共 ${gs.reduce((n, g) => n + gCount(g), 0)} 部。`);
  }
  if (/拦截|无效|拼凑|洗稿|同质化|格式混乱|为什么拦/.test(t)) {
    setFilter('all', 'rejected');
    const rj = DATA.filter(x => x.reject);
    return say('ai', `拦截 <b>${rj.length} 份</b>无效投稿：AI 拼凑 ${rCount('AI拼凑')}、洗稿 ${rCount('洗稿')}、同质化 ${rCount('同质化')}、格式混乱 ${rCount('格式混乱')}。
      每条都给了可核查依据，例如：
      <ul>${rj.slice(0, 3).map(x => `<li>《${esc(x.title)}》（${x.reject}）：${esc(x.why)}</li>`).join('')}</ul>
      已把表格切到「仅拦截稿」。`);
  }
  if (/有效稿|通过|可用/.test(t)) {
    setFilter('all', 'valid');
    return say('ai', `有效稿 <b>${DATA.filter(x => !x.reject).length} 份</b>，已切到「仅有效稿」视图。`);
  }
  if (/符合|命中|入围|推荐/.test(t)) {
    const picks = DATA.filter(x => x.match);
    activateTab($('#wtabs'), 'panelBatch');
    return say('ai', `符合本次审稿要求的 <b>${picks.length} 部</b>：
      <ul>${picks.map(x => `<li>《${esc(x.title)}》${x.grade} 级 / ${x.score} 分：${esc(x.why)}</li>`).join('')}</ul>
      点列表任意一行可以直接看该剧本的评估报告。`);
  }
  if (/维度|标准|口径/.test(t)) {
    return say('ai', `本批按 <b>${CHOSEN.dims.map(dimName).join('、')}</b> ${CHOSEN.dims.length} 个维度评估${CHOSEN.req ? `，并以你的审稿要求「${esc(CHOSEN.req)}」优先于通用标准` : '，未设自定义审稿要求，因此按通用质量等级分级'}。维度库可扩充，下批可在口径卡片里增减。`);
  }
  if (/标注|逐集|分集/.test(t)) {
    activateTab($('#wtabs'), 'panelAnnot');
    return say('ai', 'B 端标注是只读的：给出问题位置与判断依据，不做 AI 改写。需要改稿请把稿件转入「剧本诊断优化」。');
  }
  if (/导出|下载/.test(t)) return say('ai', '批量结论可导出 Excel，单份报告可下载 PDF / Word，分集标注支持 Word / Excel。');
  const eg = DATA.find(x => x.reject) || DATA[0];
  say('ai', `我可以这样帮你：<ul>
    <li>问某一部（如「为什么拦了《${esc(eg.title)}》」），我打开它的报告并说明依据</li>
    <li>说「只看 S 级」「只看拦截稿」，我筛表格</li>
    <li>问「符合要求的有哪些」「按什么维度评的」</li></ul>`);
}

$('#sendBtn').onclick = send;
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
$('#chatHint').textContent = 'Enter 发送 · Shift+Enter 换行';

/* ---------- 启动 ---------- */
if (qs.get('stage') === 'result') {
  CHOSEN = { mode: '真人短剧剧本', pay: '付费', region: '中国', dims: DEFAULT_DIMS, req: REVIEW_REQ };
  say('me', `上传了 <b>${N} 份</b>投稿剧本　<span class="hint-inline">9 月第 1 批</span><div style="margin-top:4px">${esc(REVIEW_REQ)}</div>`);
  say('ai', `已确认：<b>真人短剧剧本 · 付费 · 中国</b><br>${N} 份稿件评估完成，符合审稿要求 <b>${DATA.filter(b => b.match).length} 部</b>，拦截无效投稿 <b>${DATA.filter(b => b.reject).length} 份</b>。右侧查看批量结论、单份报告与逐集标注。`);
  showResult();
} else {
  startBrief();
}


