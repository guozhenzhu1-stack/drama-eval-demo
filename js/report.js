/* ============ 评估报告渲染（B/C 端共用） ============ */
function renderReport(host, script, { showMatch = true, dims = DEFAULT_DIMS, onEpJump, titleNote = '', countByDims = false } = {}) {
  const st = script.stats;
  const reports = script.dimReports.filter(r => dims.includes(r.dim));
  /* C 端按所选维度统计问题数，和「分集问题标注」里的数字保持一致 */
  const sel = countByDims && script.episodes
    ? script.episodes.flatMap(e => e.issues).filter(i => dims.includes(i.dim)) : null;
  const cnt = sel && sel.length
    ? { issues: sel.length, p0: sel.filter(i => i.sev === 'P0').length, p1: sel.filter(i => i.sev === 'P1').length }
    : st;
  host.innerHTML = `
  <div class="report">
    <div class="rep-hero">
      <span class="grade ${gradeCls(script.grade)}">${script.grade}</span>
      <div class="rh-main">
        <h2>《${esc(script.title)}》评估报告
          <span class="tag">综合 ${script.score} 分</span>
          ${titleNote ? `<span class="tag tag-accent">${esc(titleNote)}</span>` : ''}
        </h2>
        <div class="hint-inline">${esc(script.author)} · ${script.meta.eps} 集 · ${fmt(script.meta.words)} 字 ·
          已结构化解析 ${script.meta.parsedEps} 集 / ${script.meta.scenes} 场 · ${script.meta.lang}</div>
        <p class="rep-verdict">${esc(script.verdict)}</p>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" data-dl="报告">下载 PDF</button>
        <button class="btn btn-sm" data-dl="word">下载 Word</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k">问题总数<span class="hint-inline">（所选 ${reports.length} 个维度）</span></div><div class="v">${cnt.issues}<small> 处</small></div></div>
      <div class="kpi"><div class="k">致命 / 严重</div><div class="v">${cnt.p0}<small> / ${cnt.p1}</small></div></div>
      <div class="kpi"><div class="k">首集钩子位置</div><div class="v" style="font-size:15px">${st.hookAt}<small>（安全线 45 秒）</small></div></div>
      <div class="kpi"><div class="k">单集反转密度</div><div class="v">${st.twistPerEp}<small> 个/集</small></div></div>
    </div>

    <div class="section-title"><h3>分维度得分</h3>
      <span class="hint">共 ${reports.length} 个维度（按本次选择）</span></div>
    <div class="dim-bars">
      ${reports.map(r => `
        <div class="dim-bar">
          <span class="nm">${dimName(r.dim)}</span>
          <span class="track"><i class="fill" style="width:${r.score}%;background:${dimColor(r.dim)}"></i></span>
          <span class="sc"><b>${r.score}</b> · ${r.grade}</span>
        </div>`).join('')}
    </div>

    ${showMatch ? `
    <div class="section-title"><h3>定向投稿匹配度</h3>
      <span class="hint">基于平台收稿要求库 · 更新至 2026-08-28</span></div>
    <div class="match-list">
      ${script.match.map(m => `
        <div class="match-row">
          <span class="pf">${esc(m.pf)}</span>
          <span class="track"><i style="width:${m.pct}%"></i></span>
          <span class="pct">${m.pct}%</span>
          <span class="why">${esc(m.why)}</span>
        </div>`).join('')}
    </div>` : ''}

    <div class="section-title"><h3>分维度评价与判断依据</h3>
      <span class="hint">点击集数可跳转到分集问题标注</span></div>
    ${reports.map(r => `
      <div class="card dim-card">
        <div class="card-head">
          <span class="dc-name"><span class="dot" style="background:${dimColor(r.dim)}"></span>${dimName(r.dim)}</span>
          <span class="spacer"></span>
          <span class="grade sm ${gradeCls(r.grade)}">${r.grade}</span>
          <span class="hint-inline">${r.score} 分</span>
        </div>
        <div class="card-body">
          <div>${esc(r.text)}</div>
          <ul class="evid">
            ${r.evid.map(e => `<li><span class="ep-link" data-ep="${e.ep}" data-dim="${r.dim}">第${e.ep}集</span>
              <span>${esc(e.t)}</span></li>`).join('')}
          </ul>
        </div>
      </div>`).join('')}
    <div class="divider"></div>
    <p class="hint-inline">评估口径：由收稿机构侧沉淀的维度标准生成，采纳记录会回流用于持续校准。</p>
  </div>`;

  $$('[data-dl]', host).forEach(b => b.onclick = () =>
    fakeDownload(`《${script.title}》评估报告.${b.dataset.dl === 'word' ? 'docx' : 'pdf'}`));
  $$('.ep-link', host).forEach(l => l.onclick = () =>
    onEpJump && onEpJump(+l.dataset.ep, l.dataset.dim));
}
