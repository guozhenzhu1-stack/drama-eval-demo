/* ================================================================
   评估结果独立页（neo/result.html）
   所有评估结果都在这里看：批量评估结果 / 剧本评估报告 / 分集问题标注 / 修改对比
   由评估页对话框里的结果摘要条在新窗口打开，本页不带对话区。
   状态全部编码进 URL（mock 数据是确定性的，同参数必得同一份结果）：
     from   diagnose | batch          来源流程
     tab    batch | report | annot | diff   打开时定位到哪一部分
     id     b01…b50                  仅 from=batch，指定哪一份投稿
     n      本批份数（默认 50）
     req    自定义审稿要求（B 端）
     dims   story,logic,…             本次评估维度
     pf     红果,点众                 定向投稿平台，缺省则不出匹配度章节
     depth  quick | deep              评估深度，quick 不产出分集问题标注
     note   符合审稿要求…             报告标题旁的判定标签
     ep,dim 打开分集问题标注时定位到第几集 / 哪个维度
     g,rj   批量结果表格的等级 / 拦截筛选
   ================================================================ */
(() => {

const P = new URLSearchParams(location.search);
const list = k => (P.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);

const FROM = P.get('from') === 'batch' ? 'batch' : 'diagnose';
const CAN_FIX = FROM === 'diagnose';
const dims = list('dims').filter(d => DIM[d]);
const platforms = list('pf');
const NOTE = P.get('note') || '';

/* renderReport / createAnnot 内部以裸名读取 CHOSEN / NEO_DEPTH，这里补齐同名全局 */
window.CHOSEN = { dims: dims.length ? dims : DEFAULT_DIMS, platforms, req: P.get('req') || '' };
window.NEO_DEPTH = P.get('depth') === 'quick' ? 'quick' : 'deep';
document.documentElement.dataset.depth = window.NEO_DEPTH;

/* ---------- 与评估页共享同一份剧本数据：改一处两边同步（无 opener 时退回本地副本） ---------- */
const studio = (() => {
  try {
    const op = window.opener;
    if (op && !op.closed && op.neoStudio && op.neoStudio.script) return op.neoStudio;
  } catch (e) { /* 跨窗口访问被拦（file:// 等）时用本地数据 */ }
  return null;
})();
const echo = html => { try { if (studio) studio.say(html); } catch (e) {} };
const sync = () => { try { if (studio) studio.sync(); } catch (e) {} };

const SRC = (CAN_FIX && studio && studio.script) || SCRIPT;
const FIXLOG = (CAN_FIX && studio && studio.fixlog) || [];
snapshotOrig(SRC);

const N = Math.min(Math.max(+(P.get('n') || BATCH.length) || BATCH.length, 1), BATCH.length);
const DATA = BATCH.slice(0, N);
const gCount = g => DATA.filter(b => b.grade === g).length;
const rCount = t => DATA.filter(b => b.reject === t).length;
const inDims = i => window.CHOSEN.dims.includes(i.dim);
const openIssues = () => SRC.episodes.flatMap(e => e.issues).filter(i => !i.fixed && !i.ignored && inDims(i)).length;

/* ---------- B 端：把批量条目映射成一份可渲染的报告 / 一套独立标注数据 ----------
   规则与 js/batch.js 的 viewOf() / annotData() 保持一致——那份属 v1 不可改动，故此处按同规则重建 */
function batchView(b) {
  const t = b.issues.total;
  return { ...SCRIPT, title: b.title, author: b.author, grade: b.grade, score: b.score,
    meta: { ...SCRIPT.meta, eps: b.eps, words: b.words },
    stats: { ...SCRIPT.stats, issues: t, p0: b.issues.p0, p1: b.issues.p1,
             p2: Math.max(0, t - b.issues.p0 - b.issues.p1 - 2), p3: 2 },
    verdict: (b.match ? `符合本次审稿要求：${b.why}` : b.reject
      ? `判定为无效投稿（${b.reject}）：${b.why}`
      : `未命中本次审稿要求：${b.why}`) + `　最弱维度为${dimName(b.weakDim)}，建议复审时重点核查。` };
}
const ANNOT_CACHE = {};
function annotData(b) {
  if (!ANNOT_CACHE[b.id]) ANNOT_CACHE[b.id] = {
    ...SCRIPT, title: b.title, author: b.author, grade: b.grade, score: b.score,
    episodes: SCRIPT.episodes.map(e => ({
      ...e, blocks: e.blocks.map(x => ({ ...x })), issues: e.issues.map(i => ({ ...i }))
    }))
  };
  return ANNOT_CACHE[b.id];
}
const entryOf = id => DATA.find(x => x.id === id);
let curId = FROM === 'batch'
  ? (entryOf(P.get('id')) || DATA.find(b => b.match) || DATA[0]).id : null;
const curEntry = () => (FROM === 'batch' ? entryOf(curId) : null);
const noteOf = b => b.match ? '符合审稿要求' : b.reject ? '已拦截 · ' + b.reject : '未命中要求';

/* ---------- 顶栏 ---------- */
const back = FROM === 'batch' ? 'batch.html?stage=result' : 'diagnose.html?stage=result';
renderTopbar(FROM === 'batch' ? '批量审稿筛选 · 评估结果' : '剧本诊断优化 · 评估结果',
  `<a class="btn btn-ghost btn-sm" href="${back}" title="返回评估页">↩ 返回评估页</a>`);
document.title = (FROM === 'batch' ? '批量评估结果' : `《${SRC.title}》评估结果`) + ' · 剧本智能评审 Neo';
$('#resMeta').textContent = (FROM === 'batch'
  ? `${N} 份稿件 · ${window.CHOSEN.dims.length} 个维度`
  : `《${SRC.title}》· ${window.CHOSEN.dims.length} 个维度`)
  + ` · ${window.NEO_DEPTH === 'quick' ? '快速评估' : '深度评估'}`;

/* ---------- 结果分页：tab 按可用产出动态增减 ---------- */
const TAB_T = {
  batch:  { p: 'panelBatch',  t: '批量评估结果' },
  report: { p: 'panelReport', t: '剧本评估报告' },
  annot:  { p: 'panelAnnot',  t: '分集问题标注' },
  diff:   { p: 'panelDiff',   t: '修改对比' }
};
let TAB = P.get('tab') || (FROM === 'batch' ? 'batch' : 'report');

function tabKeys() {
  const k = FROM === 'batch' ? ['batch', 'report'] : ['report'];
  if (window.NEO_DEPTH === 'deep') k.push('annot');
  if (CAN_FIX && FIXLOG.length) k.push('diff');
  return k;
}
function tabCount(k) {
  return k === 'batch' ? N : k === 'annot' ? openIssues() : k === 'diff' ? FIXLOG.length : '';
}

/* tab 只在「产出集合或计数变化」时重建，切换时仅改选中态——否则点击会打到刚被替换掉的旧节点 */
let TAB_SIG = '';
function paintTabs() {
  const keys = tabKeys();
  if (!keys.includes(TAB)) TAB = keys[0];
  const host = $('#wtabs');
  const sig = keys.map(k => k + ':' + tabCount(k)).join('|');
  if (sig !== TAB_SIG) {
    TAB_SIG = sig;
    host.querySelectorAll('[role=tab]').forEach(t => t.remove());
    host.insertAdjacentHTML('afterbegin', keys.map(k => {
      const n = tabCount(k);
      return `<button class="wtab" role="tab" type="button" data-rk="${k}"
        data-panel="${TAB_T[k].p}" aria-selected="false">${TAB_T[k].t}${
        n === '' ? '' : `<span class="cnt">${n}</span>`}</button>`;
    }).join(''));
  }
  host.querySelectorAll('[role=tab]').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.rk === TAB)));
  $$('.work-panel', $('#workBody')).forEach(p => p.classList.toggle('active', p.id === TAB_T[TAB].p));
  if (typeof window.neoTabIndicator === 'function') window.neoTabIndicator();
}

function show(k) {
  if (!tabKeys().includes(k)) return;
  TAB = k;
  build(k);
  paintTabs();
  const u = new URL(location.href);
  u.searchParams.set('tab', k);
  history.replaceState(null, '', u);
}
$('#wtabs').addEventListener('click', e => {
  const b = e.target.closest('[role=tab]');
  if (b) show(b.dataset.rk);
});

/* ---------- 各部分内容（按需构建，切回来不重复渲染） ---------- */
const BUILT = {};
function build(k) {
  if (k === 'report') return renderRep();
  if (k === 'annot') return renderAnnot();
  if (k === 'diff') return refreshDiff();
  if (k === 'batch' && !BUILT.batch) { BUILT.batch = 1; renderBatch(); }
}

function renderRep() {
  const b = curEntry();
  if (BUILT.report === (b ? b.id : 'c')) return;
  BUILT.report = b ? b.id : 'c';
  renderReport($('#repHost'), b ? batchView(b) : SRC, {
    dims: window.CHOSEN.dims,
    countByDims: !b,
    showMatch: !b && platforms.length > 0,
    titleNote: b ? noteOf(b) : NOTE,
    onEpJump: epJump
  });
}

let ANNOT = null;
function renderAnnot() {
  const b = curEntry();
  const key = b ? b.id : 'c';
  if (ANNOT && BUILT.annot === key) { ANNOT.render(); return; }
  if (ANNOT) ANNOT.destroy();
  BUILT.annot = key;
  ANNOT = createAnnot($('#annotHost'), b ? annotData(b) : SRC, {
    canFix: CAN_FIX, dims: window.CHOSEN.dims,
    onFix: doFix,
    onInstruction: CAN_FIX ? rewriteSel
      : () => toast('B 端批量审稿为只读标注，如需改写请把稿件转入「剧本诊断优化」流程'),
    onChange: paintTabs,
    onEdit: epNo => { toast(`第${epNo}集正文已保存，可在「修改对比」里核对`); afterChange(); }
  });
}

function epJump(ep, dim) {
  if (window.NEO_DEPTH !== 'deep') {
    toast('分集问题标注是深度评估的产物，升级后即可跳到具体台词');
    return;
  }
  show('annot');
  if (ANNOT) ANNOT.goto(ep, dim);
}

/* ---------- 一键修复 / 采纳 / 撤销（C 端）----------
   逻辑与 js/diagnose.js 一致，改写结果直接落在共享的剧本数据上；
   本页没有对话区，改动小结落在「修改对比」上方，并同步回评估页的对话框。 */
function note(html) {
  $('#fixNote').innerHTML = `<div class="fix-note"><span class="fn-ico">✎</span><div>${html}</div></div>`;
}
function applyFix(i) {
  if (i.fixed || i.ignored) return false;
  const ep = SRC.episodes.find(e => e.no === i.ep);
  const bi = ep.blocks.findIndex(b => b.x.includes(i.quote));
  if (bi < 0) return false;
  const before = ep.blocks[bi].x;
  ep.blocks[bi].x = before.replace(i.quote, () => i.after);
  i.fixed = true;
  FIXLOG.push({ id: i.id, ep: i.ep, bi, dim: i.dim, title: i.title, sev: i.sev,
    before, after: ep.blocks[bi].x, adopted: false });
  return true;
}

let DIFF = null;
function refreshDiff() {
  if (!DIFF) DIFF = createDiff($('#diffHost'), SRC, FIXLOG, { onAdopt: doAdopt, onRevert: doRevert });
  else DIFF.render();
}
function afterChange() {
  if (DIFF || FIXLOG.length) refreshDiff();
  paintTabs();
  sync();
}

function doFix(scope, payload) {
  const pool = SRC.episodes.flatMap(e => e.issues);
  const targets = scope === 'issue' ? [payload]
    : scope === 'ep' ? pool.filter(i => i.ep === ANNOT.state.ep && !i.fixed && !i.ignored && inDims(i))
    : pool.filter(i => !i.fixed && !i.ignored && inDims(i));
  const done = targets.filter(applyFix);
  if (!done.length) { toast('当前范围内没有待修复的问题'); return; }

  const ds = [...new Set(done.map(i => i.dim))];
  const eps = [...new Set(done.map(i => i.ep))].sort((a, b) => a - b);
  const html = `已改完 <b>${done.length} 处</b>，覆盖 ${ds.length} 个维度（${ds.map(dimName).join('、')}）、第 ${eps.join('、')} 集。
    <ul>${done.slice(0, 4).map(i => `<li>第${i.ep}集 · ${dimName(i.dim)}：${esc(i.title)}</li>`).join('')}
    ${done.length > 4 ? `<li class="muted">…另有 ${done.length - 4} 处</li>` : ''}</ul>
    改动都在下面逐条列出，确认后可以按问题 / 按集 / 整本采纳。`;
  ANNOT.render();
  afterChange();
  note(html);
  show('diff');
  if (scope !== 'book') DIFF.goto(done[0].ep);
  echo(html.replace('下面', '结果页的「修改对比」里'));
}

function doAdopt(scope, payload) {
  let n = 0;
  const mark = l => { if (!l.adopted) { l.adopted = true; n++; } };
  if (scope === 'change') FIXLOG.filter(l => l.ep === payload.ep && l.bi === payload.i).forEach(mark);
  else if (scope === 'ep') FIXLOG.filter(l => l.ep === payload).forEach(mark);
  else FIXLOG.forEach(mark);
  if (!n) { toast('该范围内的修改已全部采纳'); return; }
  toast(`已采纳 ${n} 处修改`);
  const s = scope === 'book' ? '（整本）' : scope === 'ep' ? `（第${payload}集）` : '';
  note(`已采纳 <b>${n} 处</b>修改${s}，采纳后的正文可以在右上角「导出修改后正文」拿到。`);
  echo(`已采纳 <b>${n} 处</b>修改${s}，采纳后的正文可以在结果页的「修改对比」里导出。`);
  refreshDiff();
  sync();
}

function doRevert(payload) {
  const ep = SRC.episodes.find(e => e.no === payload.ep);
  ep.blocks[payload.i].x = ep.orig[payload.i].x;
  const idx = FIXLOG.findIndex(l => l.ep === payload.ep && l.bi === payload.i);
  if (idx > -1) {
    const iss = SRC.episodes.flatMap(e => e.issues).find(i => i.id === FIXLOG[idx].id);
    if (iss) iss.fixed = false;
    FIXLOG.splice(idx, 1);
  }
  toast('已撤销该处修改');
  if (ANNOT) ANNOT.render();
  afterChange();
  if (!FIXLOG.length) { $('#fixNote').innerHTML = ''; show('annot'); }
}

/* 正文划选 + 自定义指令：命中已识别问题就按建议改，否则占位标出改动位置 */
function rewriteSel(sel, instr, epNo) {
  const ep = SRC.episodes.find(e => e.no === epNo);
  const hit = ep.issues.find(i => !i.fixed && !i.ignored && (sel.includes(i.quote) || i.quote.includes(sel)));
  let html;
  if (hit && applyFix(hit)) {
    html = `这段正好命中一处已识别问题（第${hit.ep}集 · ${dimName(hit.dim)} · ${hit.sev}）：<b>${esc(hit.title)}</b>。
      已按指令「${esc(instr)}」改写，同时把这处问题标为已修复。`;
  } else {
    const bi = ep.blocks.findIndex(b => b.x.includes(sel));
    if (bi < 0) { toast('这段选区跨了多个段落，Demo 里只支持单段落改写'); return; }
    const before = ep.blocks[bi].x;
    ep.blocks[bi].x = before.replace(sel, () => `${sel}【按指令改写：${instr}】`);
    FIXLOG.push({ id: 'manual-' + Date.now(), ep: epNo, bi, dim: 'line', sev: 'P2',
      title: '自定义指令改写', before, after: ep.blocks[bi].x, adopted: false });
    html = `已按指令「${esc(instr)}」改写第 ${epNo} 集这段（Demo 未内置该段落的改写样本，用占位文本标出改动位置）。`;
  }
  if (ANNOT) ANNOT.render();
  afterChange();
  note(html);
  show('diff');
  DIFF.goto(epNo);
  echo(html + '改前改后见结果页的「修改对比」。');
}

/* ---------- 批量评估结果（B 端）----------
   版式与 js/batch.js 的 renderBatchPanel() 保持一致，点行跳到该剧本的评估报告 */
const GRADE_COLOR = { S: '#7a3ea8', A: 'var(--good)', B: 'var(--accent)', C: 'var(--warning)', D: 'var(--critical)' };
const FS = { grade: P.get('g') || 'all', reject: P.get('rj') || 'all' };

function renderBatch() {
  const picks = DATA.filter(b => b.match), rejects = DATA.filter(b => b.reject);
  const req = window.CHOSEN.req;
  $('#panelBatch').innerHTML = `
  <div class="batch" style="flex:1">
    <div class="conclusion">
      <div style="display:flex;align-items:flex-start;gap:16px">
        <div style="flex:1">
          <h2>${req ? `共评估 ${N} 部，符合自定义审稿要求 ${picks.length} 部`
                    : `共评估 ${N} 部，S/A 级 ${gCount('S') + gCount('A')} 部`}</h2>
          <div class="lead">${req
            ? `审稿要求：${esc(req)}<br>拦截无效投稿 ${rejects.length} 份，需人工复审的稿件从 ${N} 部收敛到 ${picks.length} 部，人工审读量下降 ${Math.round((1 - picks.length / N) * 100)}%。`
            : `未设自定义审稿要求，按所选 ${window.CHOSEN.dims.length} 个维度做通用质量分级；拦截无效投稿 ${rejects.length} 份。`}</div>
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

    ${req ? `
    <div class="section-title"><h3>符合审稿要求的剧本（${picks.length}）</h3>
      <span class="hint">点击任意一行查看该剧本的评估报告</span></div>
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
          ${[['all', '不限'], ['valid', '仅有效稿'], ['rejected', '仅拦截稿']].map(([v, t]) =>
            `<button type="button" class="chip" aria-pressed="${FS.reject === v}" data-v="${v}">${t}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="tbl-wrap" id="allWrap"></div>
    <p class="hint-inline" style="margin-top:12px">判定口径：自定义审稿要求优先于通用评估标准；拦截结论均给出可核查依据。</p>
  </div>`;

  $('#expConc').onclick = () => fakeDownload(`9月第1批投稿评估结论（${N}份）.xlsx`);
  $$('#panelBatch tr.is-clickable').forEach(tr => tr.onclick = () => pickScript(tr.dataset.id, 'report'));
  [['fGrade', 'grade'], ['fReject', 'reject']].forEach(([id, key]) => {
    const box = $('#' + id);
    box.onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return;
      $$('.chip', box).forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      FS[key] = c.dataset.v;
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
  $$('#allWrap tr.is-clickable').forEach(tr => tr.onclick = () => pickScript(tr.dataset.id, 'report'));
  const u = new URL(location.href);
  u.searchParams.set('g', FS.grade); u.searchParams.set('rj', FS.reject);
  history.replaceState(null, '', u);
}

/* ---------- B 端选稿：报告与标注共用一个当前剧本 ---------- */
function pickScript(id, tab) {
  if (!entryOf(id)) return;
  curId = id;
  const u = new URL(location.href);
  u.searchParams.set('id', id);
  history.replaceState(null, '', u);
  ['#repPick', '#annotPick'].forEach(s => { if ($(s)) $(s).value = id; });
  $('#resMeta').textContent = `${N} 份稿件 · 当前《${entryOf(id).title}》· ${window.CHOSEN.dims.length} 个维度`;
  show(tab || TAB);
}

function initPicks() {
  if (FROM !== 'batch') return;
  const opts = DATA.map(b => `<option value="${b.id}">${esc(b.title)}（${b.grade} 级 / ${b.score} 分）</option>`).join('');
  ['rep', 'annot'].forEach(k => {
    $('#' + k + 'Bar').hidden = false;
    const sel = $('#' + k + 'Pick');
    sel.innerHTML = opts;
    sel.value = curId;
    sel.onchange = e => pickScript(e.target.value, k === 'rep' ? 'report' : 'annot');
  });
}

/* ---------- 快速评估在本页直接升级：解锁分集问题标注 ---------- */
window.neoOnUpgrade = () => {
  document.documentElement.dataset.depth = 'deep';
  const u = new URL(location.href);
  u.searchParams.set('depth', 'deep');
  history.replaceState(null, '', u);
  paintTabs();
  show('annot');
};

/* 评估页那边（对话框里说「整本修复」等）改了数据后，回调本页重绘 */
window.neoResultRefresh = () => {
  if (ANNOT) ANNOT.render();
  if (DIFF || FIXLOG.length) refreshDiff();
  paintTabs();
};

/* ---------- 启动 ---------- */
initPicks();
paintTabs();
build(TAB);
const ep0 = +P.get('ep');
if (TAB === 'annot' && ep0 && ANNOT) ANNOT.goto(ep0, P.get('dim') || '');
try { if (studio) studio.attach(window); } catch (e) {}

})();
