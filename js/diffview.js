/* ============ 修改前后对比（改前 vs 改后） ============ */
/* 依赖 ep.orig（原始正文快照）：applyFix / 手动编辑都会让 orig 与当前正文产生差异 */
function snapshotOrig(script) {
  script.episodes.forEach(e => { if (!e.orig) e.orig = e.blocks.map(b => ({ ...b })); });
}

/* 极简 diff：抽掉公共前后缀，中间段标 del / ins */
function inlineDiff(a, b) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const pre = esc(a.slice(0, s)), suf = esc(a.slice(a.length - e));
  const da = esc(a.slice(s, a.length - e)), db = esc(b.slice(s, b.length - e));
  return {
    before: pre + (da ? `<del class="dv">${da}</del>` : '') + suf,
    after:  pre + (db ? `<ins class="dv">${db}</ins>` : '') + suf
  };
}

function createDiff(host, script, fixLog, opts = {}) {
  const st = { ep: null };
  const changedEps = () => script.episodes.filter(e => e.blocks.some((b, i) => b.x !== e.orig[i].x));
  const changesOf = e => e.blocks.map((b, i) => ({ i, before: e.orig[i].x, after: b.x, blk: b }))
                                  .filter(c => c.before !== c.after);
  const logOf = (epNo, bi) => fixLog.find(l => l.ep === epNo && l.bi === bi);

  function render() {
    const eps = changedEps();
    if (!eps.length) {
      host.innerHTML = `<div class="empty-state">还没有修改。<br>在「分集问题标注」里点「一键修复」，或直接编辑正文后回到这里查看改前改后对比。</div>`;
      return;
    }
    if (!st.ep || !eps.some(e => e.no === st.ep)) st.ep = eps[0].no;
    const dims = [...new Set(fixLog.map(l => l.dim))];
    const total = eps.reduce((n, e) => n + changesOf(e).length, 0);
    const adopted = fixLog.filter(l => l.adopted).length;

    host.innerHTML = `
      <div class="fix-summary">
        <div class="fs-main">整体修改了 <b>${dims.length}</b> 个维度的 <b>${total}</b> 处内容，
          覆盖 <b>${eps.length}</b> 集${dims.length ? ` · ${dims.map(dimName).join('、')}` : ''}</div>
        <span class="spacer"></span>
        <span class="hint-inline">已采纳 ${adopted}/${fixLog.length}</span>
        <button class="btn btn-sm btn-primary" id="adoptBook">整本一键采纳</button>
        <button class="btn btn-sm" id="expScript">导出修改后正文</button>
      </div>
      <div class="diff-cols">
        <div class="ep-list" id="dEpList">
          ${script.episodes.map(e => {
            const n = changesOf(e).length;
            return `<div class="ep-item ${n ? 'modified' : ''}" role="option"
                aria-selected="${e.no === st.ep}" data-ep="${e.no}" ${n ? '' : 'style="opacity:.5"'}>
              <div class="en">第${e.no}集</div>
              <div class="et">${esc(e.title)}</div>
              <div class="ec ${n ? '' : 'zero'}">${n ? `修改 ${n} 处` : '未修改'}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="diff-pane" id="paneBefore"></div>
        <div class="diff-pane" id="paneAfter"></div>
      </div>`;

    $$('#dEpList .ep-item', host).forEach(it => it.onclick = () => { st.ep = +it.dataset.ep; render(); });
    $('#adoptBook', host).onclick = () => opts.onAdopt && opts.onAdopt('book');
    $('#expScript', host).onclick = () => fakeDownload(`《${script.title}》修改后正文.docx`);
    renderPanes();
  }

  function renderPanes() {
    const e = script.episodes.find(x => x.no === st.ep);
    const chs = changesOf(e);
    const line = (b, txt) => b.t === 'dlg' ? `<span class="who">${esc(b.c)}：</span>${txt}` : txt;

    $('#paneBefore', host).innerHTML = `<div class="diff-head">修改前 · 第${e.no}集</div>` +
      e.orig.map((b, i) => {
        const c = chs.find(x => x.i === i);
        return `<div class="diff-blk ${c ? 'changed' : ''} ${b.t}">${line(b, c ? inlineDiff(c.before, c.after).before : esc(b.x))}</div>`;
      }).join('');

    $('#paneAfter', host).innerHTML = `<div class="diff-head">修改后 · 第${e.no}集
        <button class="btn btn-sm" id="adoptEp" style="float:right;margin-top:-4px">本集一键采纳</button></div>` +
      e.blocks.map((b, i) => {
        const c = chs.find(x => x.i === i);
        if (!c) return `<div class="diff-blk ${b.t}">${line(b, esc(b.x))}</div>`;
        const log = logOf(e.no, c.i);
        return `<div class="diff-blk changed ${b.t}">
          ${line(b, inlineDiff(c.before, c.after).after)}
          <div class="ic-foot">
            ${log ? `<span class="tag" style="border-color:transparent;background:color-mix(in srgb, ${dimColor(log.dim)} 14%, transparent);color:${dimColor(log.dim)}">${dimName(log.dim)} · ${esc(log.title)}</span>` : '<span class="tag">手动编辑</span>'}
            <span class="spacer"></span>
            ${log && log.adopted ? '<span class="fixed-badge">✓ 已采纳</span>'
              : `<button class="btn btn-sm btn-primary" data-adopt="${i}">采纳</button>
                 <button class="btn btn-sm" data-revert="${i}">撤销</button>`}
          </div>
        </div>`;
      }).join('');

    $('#adoptEp', host).onclick = () => opts.onAdopt && opts.onAdopt('ep', e.no);
    $$('[data-adopt]', host).forEach(b => b.onclick = () => opts.onAdopt && opts.onAdopt('change', { ep: e.no, i: +b.dataset.adopt }));
    $$('[data-revert]', host).forEach(b => b.onclick = () => opts.onRevert && opts.onRevert({ ep: e.no, i: +b.dataset.revert }));
  }

  render();
  return { render, goto(epNo) { if (epNo) st.ep = epNo; render(); }, get changedCount() { return changedEps().reduce((n, e) => n + changesOf(e).length, 0); } };
}
