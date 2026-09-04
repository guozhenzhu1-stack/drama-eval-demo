/* ============ 分集问题标注工作台（B/C 端共用） ============
   opts: { canFix, dims, onFix(scope, payload), onInstruction(selText, instr), onEdit() } */
function createAnnot(host, script, opts = {}) {
  const st = { ep: script.episodes[0].no, dims: (opts.dims || DEFAULT_DIMS).slice(), focus: null };
  const canFix = !!opts.canFix;

  const ep = () => script.episodes.find(e => e.no === st.ep);
  const visible = list => list.filter(i => st.dims.includes(i.dim));
  const active = e => visible(e.issues).filter(i => !i.ignored);
  const sevRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

  host.innerHTML = `
    <div class="annot">
      <div class="annot-bar">
        <span class="lb">评估维度</span>
        <div class="chip-row" id="dimFilter"></div>
        <span class="spacer"></span>
        <span class="hint-inline" id="annotCount"></span>
        ${canFix ? '<button class="btn btn-sm btn-primary" id="fixBook">整本一键修复</button>' : ''}
        <button class="btn btn-sm" data-ex="word">导出 Word</button>
        <button class="btn btn-sm" data-ex="excel">导出 Excel</button>
      </div>
      <div class="annot-cols">
        <div class="ep-list" id="epList"></div>
        <div class="script-col" id="scriptCol"></div>
        <div class="issue-col" id="issueCol"></div>
      </div>
    </div>
    <div class="sel-bar" id="selBar" hidden>
      <span class="sb-lb">已选 <b id="selLen">0</b> 字</span>
      <input id="selInput" placeholder="输入修改指令，回车执行…">
      <button class="btn btn-sm btn-primary" id="selGo">执行</button>
    </div>`;

  const elEpList = $('#epList', host), elScript = $('#scriptCol', host), elIssue = $('#issueCol', host);

  /* ---- 维度筛选 ---- */
  $('#dimFilter', host).innerHTML = DIMS.filter(d => (opts.dims || DEFAULT_DIMS).includes(d.id))
    .map(d => `<button type="button" class="chip" aria-pressed="true" data-v="${d.id}">
      <span class="dot" style="background:${d.color}"></span>${d.name}</button>`).join('');
  $('#dimFilter', host).onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    const on = c.getAttribute('aria-pressed') !== 'true';
    c.setAttribute('aria-pressed', on);
    st.dims = $$('#dimFilter .chip[aria-pressed=true]', host).map(x => x.dataset.v);
    render();
  };

  $$('[data-ex]', host).forEach(b => b.onclick = () => fakeDownload(
    `《${script.title}》分集问题标注.${b.dataset.ex === 'word' ? 'docx' : 'xlsx'}`));
  if (canFix) $('#fixBook', host).onclick = () => opts.onFix('book');

  /* ---- 左：分集列表 ---- */
  function renderEpList() {
    elEpList.innerHTML = script.episodes.map(e => {
      const list = active(e);
      const dots = ['P0', 'P1', 'P2', 'P3'].flatMap(s =>
        list.filter(i => i.sev === s).map(() => `<i style="background:var(--sev-${s.toLowerCase()})"></i>`)).join('');
      const done = list.length && list.every(i => i.fixed);
      return `<div class="ep-item ${e.issues.some(i => i.fixed) ? 'modified' : ''}"
          role="option" aria-selected="${e.no === st.ep}" data-ep="${e.no}">
        <div class="en">第${e.no}集</div>
        <div class="et">${esc(e.title)}</div>
        <div class="ec ${list.length ? '' : 'zero'}">
          ${list.length ? `${done ? '已修复 ' : ''}${list.length} 处问题<span class="sev-dots">${dots}</span>`
                        : '无问题'}
        </div>
      </div>`;
    }).join('') + `<div class="hint-inline" style="padding:8px 12px">
      示例数据仅解析前 ${script.meta.parsedEps} 集</div>`;
    $$('.ep-item', elEpList).forEach(it => it.onclick = () => { st.ep = +it.dataset.ep; st.focus = null; render(); });
  }

  /* ---- 中：剧本正文（可编辑 + 问题高亮） ---- */
  function renderScript() {
    const e = ep();
    const marks = active(e);
    const html = e.blocks.map((b, bi) => {
      let txt = esc(b.x);
      marks.forEach(i => {
        const target = esc(i.fixed ? i.after : i.quote);
        if (txt.includes(target)) {
          txt = txt.replace(target, `<mark class="iss ${i.fixed ? 'fixed' : ''}" data-id="${i.id}"
            style="--mk:${dimColor(i.dim)}" title="${esc(dimName(i.dim))} · ${i.sev}">${target}</mark>`);
        }
      });
      if (b.t === 'scene') return `<div class="blk scene" data-bi="${bi}"><span class="tx">${txt}</span></div>`;
      if (b.t === 'act')   return `<div class="blk act" data-bi="${bi}"><span class="tx">${txt}</span></div>`;
      return `<div class="blk dlg" data-bi="${bi}"><span class="who">${esc(b.c)}：</span><span class="tx">${txt}</span></div>`;
    }).join('');

    elScript.innerHTML = `
      <div class="sc-head">
        <h3>第${e.no}集　${esc(e.title)}</h3>
        <span class="hint-inline">${fmt(e.words)} 字 · 正文可直接编辑，划选可下发修改指令</span>
        <span class="spacer"></span>
        ${canFix ? `<button class="btn btn-sm" id="fixEp">本集一键修复</button>` : ''}
      </div>
      <div class="script-body" id="scriptBody" contenteditable="true" spellcheck="false">${html}</div>`;

    if (canFix) $('#fixEp', elScript).onclick = () => opts.onFix('ep', e.no);

    const body = $('#scriptBody', elScript);
    $$('mark.iss', body).forEach(m => m.onclick = ev => { ev.preventDefault(); focusIssue(m.dataset.id, false); });
    body.addEventListener('blur', () => {
      $$('.blk', body).forEach(el => {
        const b = e.blocks[+el.dataset.bi], tx = $('.tx', el);
        if (b && tx && tx.textContent !== b.x) { b.x = tx.textContent; opts.onEdit && opts.onEdit(e.no); }
      });
    });
    bindSelection(body);
  }

  /* ---- 右：问题标注（按维度聚合） ---- */
  function renderIssues() {
    const e = ep();
    const list = visible(e.issues).sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);
    const live = list.filter(i => !i.ignored), dropped = list.filter(i => i.ignored);
    const groups = st.dims.map(d => ({ d, items: live.filter(i => i.dim === d) })).filter(g => g.items.length);

    elIssue.innerHTML = (groups.length ? groups.map(g => `
      <div class="dim-group">
        <div class="dg-head"><span class="dot" style="background:${dimColor(g.d)}"></span>
          ${dimName(g.d)}<span class="muted">（${g.items.length}）</span></div>
        ${g.items.map(i => issueCard(i)).join('')}
      </div>`).join('') : `<div class="hint-inline" style="padding:12px 4px">当前筛选下本集无问题。</div>`)
      + (dropped.length ? `
      <details class="ignored-zone">
        <summary>已忽略（${dropped.length}）</summary>
        <div style="margin-top:8px">${dropped.map(i => issueCard(i)).join('')}</div>
      </details>` : '');

    $$('.iss-card', elIssue).forEach(c => {
      c.onclick = ev => { if (!ev.target.closest('button')) focusIssue(c.dataset.id, true); };
    });
    $$('[data-act]', elIssue).forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const i = e.issues.find(x => x.id === b.dataset.id);
      if (b.dataset.act === 'fix') opts.onFix('issue', i);
      else if (b.dataset.act === 'ignore') { i.ignored = true; toast(`已忽略：${i.title}`); render(); opts.onChange && opts.onChange(); }
      else if (b.dataset.act === 'restore') { i.ignored = false; render(); opts.onChange && opts.onChange(); }
    });
    $('#annotCount', host).textContent =
      `本集 ${live.length} 处 · 全剧 ${visible(script.episodes.flatMap(x => x.issues)).filter(i => !i.ignored).length} 处`;
  }

  function issueCard(i) {
    return `<div class="iss-card ${i.fixed ? 'is-fixed' : ''} ${st.focus === i.id ? 'focus' : ''}"
        data-id="${i.id}" style="--mk:${dimColor(i.dim)}">
      <div class="ic-top">
        <span class="sev sev-${i.sev}" title="${SEVS[i.sev].hint}">${i.sev} ${SEVS[i.sev].name}</span>
        ${i.fixed ? '<span class="fixed-badge">✓ 已修复</span>' : ''}
      </div>
      <div class="ic-title">${esc(i.title)}</div>
      <div class="ic-quote">「${esc(i.fixed ? i.after : i.quote)}」</div>
      <div class="kv"><b>判断依据：</b>${esc(i.why)}</div>
      ${canFix ? `<div class="kv"><b>修改建议：</b>${esc(i.fix)}</div>` : ''}
      <div class="ic-foot">
        ${i.ignored ? `<button class="btn btn-sm" data-act="restore" data-id="${i.id}">恢复</button>`
        : canFix ? `
          <button class="btn btn-sm btn-primary" data-act="fix" data-id="${i.id}" ${i.fixed ? 'disabled' : ''}>
            ${i.fixed ? '已修复' : '一键修复'}</button>
          <button class="btn btn-sm" data-act="ignore" data-id="${i.id}">忽略</button>`
        : `<button class="btn btn-sm" data-act="ignore" data-id="${i.id}">忽略</button>`}
      </div>
    </div>`;
  }

  /* ---- 问题标签 ↔ 正文互相定位 ---- */
  function focusIssue(id, scrollScript) {
    st.focus = id;
    $$('.iss-card', elIssue).forEach(c => c.classList.toggle('focus', c.dataset.id === id));
    $$('mark.iss', elScript).forEach(m => m.classList.toggle('focus', m.dataset.id === id));
    const card = $(`.iss-card[data-id="${id}"]`, elIssue);
    const mark = $(`mark.iss[data-id="${id}"]`, elScript);
    if (scrollScript && mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!scrollScript && card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ---- 划选浮起指令条 ---- */
  const selBar = $('#selBar', host), selInput = $('#selInput', host);
  function hideSel() { selBar.hidden = true; selInput.value = ''; }
  function bindSelection(body) {
    body.addEventListener('mouseup', () => {
      const sel = getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 2 || !body.contains(sel.anchorNode)) return hideSel();
      const r = sel.getRangeAt(0).getBoundingClientRect();
      selBar.hidden = false;
      const w = selBar.offsetWidth || 400;
      selBar.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
      selBar.style.top = Math.max(60, r.top - selBar.offsetHeight - 8) + 'px';
      $('#selLen', host).textContent = text.length;
      selBar.dataset.sel = text;
      selInput.focus();
    });
  }
  const runSel = () => {
    const instr = selInput.value.trim();
    if (!instr) return selInput.focus();
    opts.onInstruction && opts.onInstruction(selBar.dataset.sel, instr, st.ep);
    hideSel();
  };
  $('#selGo', host).onclick = runSel;
  selInput.onkeydown = e => { if (e.key === 'Enter') runSel(); if (e.key === 'Escape') hideSel(); };
  const onDocDown = e => {
    if (!selBar.hidden && !selBar.contains(e.target) && !e.target.closest('.script-body')) hideSel();
  };
  document.addEventListener('mousedown', onDocDown);

  function render() { renderEpList(); renderScript(); renderIssues(); }
  render();

  return {
    render,
    destroy() { document.removeEventListener('mousedown', onDocDown); },
    goto(epNo, dim) {
      /* 只跳到已解析的集，越界时保持当前集，避免渲染空集报错 */
      if (epNo && script.episodes.some(e => e.no === epNo)) st.ep = epNo;
      if (dim && !st.dims.includes(dim)) {
        st.dims.push(dim);
        $$('#dimFilter .chip', host).forEach(c => { if (c.dataset.v === dim) c.setAttribute('aria-pressed', 'true'); });
      }
      render();
      if (dim) {
        const first = active(ep()).find(i => i.dim === dim);
        if (first) focusIssue(first.id, true);
      }
    },
    get state() { return st; }
  };
}



