/* ================================================================
   Neo 评估报告 v2 —— 整体评级 + 总结性评价 / 评级依据，再分 tab 展开
     tab1 定向投稿匹配度（按本次选定平台给针对性优化建议）
     tab2 合规性评估（仅当勾选了「合规风险」维度）
     tab3 分维度评估（定性总结 + 质量评级 + 具体问题与数量）
   覆盖 js/report.js 的 renderReport，只在 neo 页面加载
   ================================================================ */
(() => {

const BAND = { S: '90 分及以上', A: '80–89 分', B: '65–79 分', C: '50–64 分', D: '50 分以下' };
const SAY = {
  S: '可直接进入制作评估的头部稿',
  A: '达到投稿线且无结构性硬伤，小修即可投',
  B: '达到投稿线但存在明确硬伤，需定点修改后再投',
  C: '骨架成立但结构性问题较多，需较大幅度重写',
  D: '暂不具备投稿资格，建议重构题材外壳或退稿'
};
const QUAL = { S: '优秀', A: '优良', B: '良好', C: '待改进', D: '不达标' };
const SEV_ORDER = ['P0', 'P1', 'P2', 'P3'];

const issuesOf = (script, dim) =>
  (script.episodes || []).flatMap(e => e.issues).filter(i => i.dim === dim && !i.ignored);
const sevCount = list => Object.fromEntries(SEV_ORDER.map(s => [s, list.filter(i => i.sev === s).length]));

/* ---------- 200–300 字整体总结 + 评级依据（文档正文段落） ---------- */
function summaryParts(script, reports, cnt) {
  const by = [...reports].sort((a, b) => a.score - b.score);
  const weak = by.slice(0, 3), strong = by.slice(-2).reverse();
  const all = reports.flatMap(r => issuesOf(script, r.dim));
  const p0 = all.filter(i => i.sev === 'P0')[0];
  const wan = (script.meta.words / 10000).toFixed(1);
  const structural = weak.filter(r => ['logic', 'seed', 'story', 'pace'].includes(r.dim)).map(r => dimName(r.dim));
  const up = Math.min(script.grade === 'D' ? 62 : 89, script.score + 8 + weak.length * 2);
  const upGrade = up >= 90 ? 'S' : up >= 80 ? 'A' : up >= 65 ? 'B' : 'C';
  const fixList = weak.slice(0, 2).map(r => {
    const i = issuesOf(script, r.dim).sort((a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev))[0];
    return i ? `第 ${i.ep} 集「${i.title}」` : dimName(r.dim) + '维度';
  });

  return {
    lead: `《${esc(script.title)}》共 ${script.meta.eps} 集 / ${wan} 万字，按本次选定的 ${reports.length} 个维度加权综合
      <b>${script.score} 分</b>，整体评级 <b>${script.grade} 级</b>——${SAY[script.grade] || ''}。`,
    detail: `拉低评级的是${weak.slice(0, 2).map(r => `<b>${dimName(r.dim)}（${r.score} 分）</b>`).join('、')}${
      structural.length > 1 ? '这两个结构性维度' : '维度'}；已定位 <b>${all.length} 处</b>问题，致命 ${cnt.p0} 处、严重 ${cnt.p1} 处${
      p0 ? `，最致命的一处在第 ${p0.ep} 集「${esc(p0.title)}」` : '，无致命级问题'}。`,
    basis: `${script.grade} 级对应 ${BAND[script.grade] || ''}。扣分集中在${
      structural.length ? structural.slice(0, 2).join('、') : dimName(weak[0].dim)}这类<b>结构性维度</b>，
      而不是台词、格式这类可局部润色的项，${p0 ? '一处 P0 直接决定结局可信度，' : ''}必须动结构才能解决，因此不能上探更高一级；
      但主线目标清晰、人物动机链完整，最强项${dimName(strong[0].dim)}达 ${strong[0].score} 分，也未落到下一级区间。`,
    next: `优先修 ${fixList.join(' 与 ')}，都是改一处、连带修正后续多集的杠杆点；
      重算后综合分约 <b>${up} 分</b>，可进 <b>${upGrade} 级</b>。`
  };
}
/* ---------- tab1：定向投稿匹配度 + 针对性优化建议 ---------- */
const PF_TIP = {
  红果: [
    '前 3 集反转密度补到每集 2 个：第 1 集加一通催债电话把女主逼上车，第 2 集把「一年为期」改成到期倒计时，第 3 集用租约到期完成一次反打。',
    '首集钩子从 1 分 40 秒前移到 45 秒内：母亲劝签压成一句台词，豪车与闪婚邀约直接提到开场。',
    '打脸桥段要给可验证的证据：第 3 集把泼咖啡换成当场亮出贱卖协议签名，爽感不降，同时避开平台的以暴制暴退改点。'
  ],
  点众: [
    '女主成长弧线要独立成线：第 3 集让她自己拿到「股权协议在顾言手上」的抓手，第 5 集由她本人当众公布证据，而不是男主救场。',
    '付费卡点保留在第 3 集末，但卡点前的冲突改成女主主动出手，符合平台对「大女主」付费点的偏好。',
    '反派要证据而非贬损台词：给林静一张伪造接单截图，为第 5 集反打积压强度。'
  ],
  七猫: [
    '情感线占比从当前约六成压到四成，把第 4 集玄关戏的篇幅让给 72 小时交割危机。',
    '开局补一条家庭伦理悬念：苏父遗嘱与那 31% 股权的下落，第 1 集埋、第 3 集确认、第 6 集回收。',
    '若本季主投七猫，建议标题与前 3 集重心改为「遗嘱悬念」而不是「闪婚」。'
  ],
  听花岛: [
    '当前不建议投递：平台主打精品古装与悬疑，都市甜宠不在收稿方向内。',
    '如需转投，需要更换题材外壳（民国或古装替嫁），但可以保留先婚后爱结构与现有打脸节奏。',
    '或等平台开放都市线收稿窗口再投，届时需把单集时长与场次密度对齐精品线标准。'
  ]
};
const pfSay = p => p >= 75 ? '建议主投' : p >= 65 ? '可投，需按建议修改' : p >= 55 ? '匹配度偏低，谨慎投递' : '不建议投递';

function matchHtml(script) {
  const chosen = (typeof CHOSEN !== 'undefined' && CHOSEN.platforms) || [];
  const rows = [...(script.match || [])].sort((a, b) =>
    (chosen.includes(b.pf) ? 1 : 0) - (chosen.includes(a.pf) ? 1 : 0) || b.pct - a.pct);
  const best = rows[0];
  return `
  <div class="rp-note">本次定向投稿平台：<b>${chosen.length ? chosen.map(esc).join('、') : '未指定，按全平台估算'}</b>。
    ${best ? `匹配度最高的是 <b>${esc(best.pf)}（${best.pct}%）</b>，建议按下方各平台的针对性修改项分别出稿。` : ''}</div>
  <div class="pf-list">${rows.map(m => `
    <div class="card pf-card${chosen.includes(m.pf) ? ' on' : ''}">
      <div class="match-row">
        <span class="pf">${esc(m.pf)}${chosen.includes(m.pf) ? '<i class="pf-badge">定向</i>' : ''}</span>
        <span class="track"><i style="width:${m.pct}%"></i></span>
        <span class="pct">${m.pct}%</span>
        <span class="pf-say">${pfSay(m.pct)}</span>
      </div>
      <div class="pf-why">平台偏好与差距：${esc(m.why)}</div>
      <div class="pf-tip"><b>针对 ${esc(m.pf)} 的优化建议</b>
        <ol>${(PF_TIP[m.pf] || []).map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
    </div>`).join('')}</div>`;
}
/* ---------- tab2：合规性评估（勾选「合规风险」维度时出现） ---------- */
const RULES = [
  ['涉政与重大历史', /涉政|政治|领导|历史|军|警/, '未出现涉政表述、重大历史事件虚构与制服类身份滥用'],
  ['色情低俗', /涉黄|色情|裸|情色|低俗|性暗示/, '亲密戏止于拥抱与对话，无裸露、性暗示与低俗表达'],
  ['血腥暴力', /血腥|暴力|打斗|伤害|流血/, '无血腥镜头描写，冲突以言语与证据推进'],
  ['以暴制暴与私刑', /以暴制暴|泼|私刑|动手|报复|后果/, '需确认冲突桥段有制止动作与后续代价交代'],
  ['价值导向与三观', /三观|拜金|出轨|婚外|物化/, '闪婚设定有明确目的性，未出现拜金与物化表达'],
  ['未成年人保护', /未成年|儿童|校园|学生/, '无未成年人相关情节'],
  ['封建迷信与灵异', /迷信|灵异|鬼|算命|风水/, '无灵异与封建迷信元素'],
  ['违法犯罪细节', /犯罪|违法|毒|赌|诈骗|走私/, '涉及的商业欺压均在合法维权框架内解决']
];

function riskHtml(script, riskRep) {
  const hits = issuesOf(script, 'risk');
  const hitOf = re => hits.filter(i => re.test(i.title + i.why + i.quote));
  const c = sevCount(hits);
  const need = hits.length;
  return `
  <div class="cmp-head${need ? ' warn' : ' ok'}">
    <span class="cmp-dot"></span>
    <div>
      <b>${need ? `规则库判定：${need} 处需整改，未发现禁投级问题` : '规则库判定：未命中风险规则，可正常投递'}</b>
      <div class="hint-inline">合规风险维度 ${riskRep ? riskRep.score + ' 分 · ' + riskRep.grade + ' 级（' + QUAL[riskRep.grade] + '）' : '—'}
        · 规则库 v2.4（2026-08 更新，含平台退改高频项 41 条）</div>
    </div>
    <span class="spacer"></span>
    <span class="cmp-nums">${SEV_ORDER.filter(s => c[s]).map(s => `<i class="sev sev-${s}">${s} ${c[s]}</i>`).join('') || '<i class="sev sev-P3">无命中</i>'}</span>
  </div>
  <div class="tbl-wrap"><table class="tbl cmp-tbl">
    <thead><tr><th style="width:150px">规则项</th><th style="width:88px">判定</th><th>判断依据</th></tr></thead>
    <tbody>${RULES.map(([nm, re, ok]) => {
      const h = hitOf(re);
      return `<tr><td>${nm}</td>
        <td>${h.length ? `<span class="cmp-st bad">需整改 ${h.length}</span>` : '<span class="cmp-st good">通过</span>'}</td>
        <td class="cmp-why">${h.length
          ? h.map(i => `第 ${i.ep} 集：${esc(i.why)}`).join('<br>')
          : ok}</td></tr>`;
    }).join('')}</tbody>
  </table></div>
  ${hits.length ? `<div class="section-title"><h3>命中项与整改建议</h3></div>
  ${hits.map(i => `
    <div class="card cmp-item">
      <div class="card-head"><i class="sev sev-${i.sev}">${i.sev}</i>
        <a class="ep-link" data-ep="${i.ep}" data-dim="risk">第 ${i.ep} 集</a>
        <b>${esc(i.title)}</b></div>
      <div class="card-body">
        <div class="cmp-q">原文：${esc(i.quote)}</div>
        <div><b>判断依据：</b>${esc(i.why)}</div>
        <div class="cmp-fix"><b>整改建议：</b>${esc(i.fix)}</div>
      </div>
    </div>`).join('')}` : ''}`;
}
/* ---------- tab3：分维度评估（定性总结 + 质量评级 + 具体问题与数量） ---------- */
function dimBlock(script, r) {
  const list = issuesOf(script, r.dim).sort((a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev) || a.ep - b.ep);
  const c = sevCount(list);
  return `
  <div class="card dim-block">
    <div class="card-head">
      <span class="db-dot" style="background:${dimColor(r.dim)}"></span>
      <b>${dimName(r.dim)}</b>
      <span class="grade ${gradeCls(r.grade)} db-g">${r.grade}</span>
      <span class="db-q">质量评级 ${QUAL[r.grade] || ''} · ${r.score} 分</span>
      <span class="spacer"></span>
      <span class="db-cnt">问题 <b>${list.length}</b> 处</span>
      ${SEV_ORDER.filter(s => c[s]).map(s => `<i class="sev sev-${s}">${s} ${c[s]}</i>`).join('')}
    </div>
    <div class="card-body">
      <div class="db-sum"><span class="rs-tag">定性总结</span><p>${esc(r.text)}</p></div>
      ${list.length ? `<div class="db-list">${list.map(i => `
        <div class="db-iss${i.fixed ? ' fixed' : ''}">
          <div class="di-top"><i class="sev sev-${i.sev}">${i.sev}</i>
            <a class="ep-link" data-ep="${i.ep}" data-dim="${r.dim}">第 ${i.ep} 集</a>
            <b>${esc(i.title)}</b>${i.fixed ? '<span class="di-fixed">已修复</span>' : ''}</div>
          <div class="di-q">「${esc(i.quote)}」</div>
          <div class="di-why">${esc(i.why)}</div>
          <div class="di-fix">建议：${esc(i.fix)}</div>
        </div>`).join('')}</div>`
      : `<div class="db-list"><div class="db-none">已解析集内未发现该维度的显性问题，判断依据：${
          (r.evid || []).map(e => `第 ${e.ep} 集 ${esc(e.t)}`).join('；') || '无'}</div></div>`}
    </div>
  </div>`;
}

function dimsHtml(script, reports) {
  const all = reports.flatMap(r => issuesOf(script, r.dim));
  return `
  <div class="rp-note">按得分从低到高排列，共 ${reports.length} 个维度、${all.length} 处具体问题。
    点「第 N 集」可跳到分集问题标注对应位置。</div>
  ${[...reports].sort((a, b) => a.score - b.score).map(r => dimBlock(script, r)).join('')}`;
}
/* ---------- 主渲染：文档版式（封面信息 → 一 结论 → 二 得分 → 三 详细评估） ---------- */
const TAB_META = {
  match: { ico: '◎', sub: '各平台匹配度与针对性优化建议', unit: '个平台' },
  risk:  { ico: '⚖', sub: '规则库逐条判定 · 命中项整改建议', unit: '处需整改' },
  dims:  { ico: '◈', sub: '定性总结 + 质量评级 + 具体问题', unit: '处问题' }
};

const pad2 = n => String(n).padStart(2, '0');
const docNo = title => 'SE-' +
  Math.abs([...String(title)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) % 90000 + 10000);

/* ---------- 评估结果入口：所有评估结果都在独立的结果页展示 ---------- */
/* 状态全部编码进 URL，结果页用同一份 mock 数据还原出同样的结果 */
/* neo.js 的 PAGE 封在自身 IIFE 里取不到，这里从 body 上自行读取 */
const pageOf = () => (document.body && document.body.dataset.page) || '';

function resultLink(tab, use, showMatch, titleNote) {
  const pg = pageOf();
  const p = new URLSearchParams();
  p.set('from', pg === 'batch' ? 'batch' : 'diagnose');
  p.set('tab', tab);
  if (pg === 'batch') {
    if (typeof curId !== 'undefined' && curId) p.set('id', curId);
    if (typeof N !== 'undefined' && N) p.set('n', N);
    const req = (typeof CHOSEN !== 'undefined' && CHOSEN.req) || '';
    if (req) p.set('req', req);
  }
  p.set('dims', use.map(r => r.dim).join(','));
  const pf = (typeof CHOSEN !== 'undefined' && CHOSEN.platforms) || [];
  if (showMatch && pf.length) p.set('pf', pf.join(','));
  p.set('depth', window.NEO_DEPTH === 'quick' ? 'quick' : 'deep');
  if (titleNote) p.set('note', titleNote);
  return 'result.html?' + p.toString();
}

/* ---------- 本次评估的结果摘要 ----------
   报告 / 分集问题标注 / 批量结论是同一份结果的三个视角（结论层 / 证据层 / 集合层），
   拆成三张同级卡片会逼用户在看到任何内容之前先选一次，而答案几乎总是「先看结论」。
   这里只给一条带关键数字的摘要 + 一个主入口，深链降级为次级细链接。
   结果页状态全在 URL 里且各视角只差一个 tab 参数，所以一个基准链接就够。 */
function resultOut(script, use, cnt, stamp, showMatch, titleNote) {
  const pg = pageOf();
  const dp = window.NEO_DEPTH === 'quick' ? '快速评估' : '深度评估';
  const href = resultLink(pg === 'batch' ? 'batch' : 'report', use, showMatch, titleNote);

  if (pg === 'batch') {
    const data = (typeof DATA !== 'undefined' && DATA) || [];
    const n = (typeof N !== 'undefined' && N) || data.length || 1;
    const req = (typeof CHOSEN !== 'undefined' && CHOSEN.req) || '';
    const rj = data.filter(b => b.reject).length;
    const kpis = [];
    if (req) kpis.push({ v: `${data.filter(b => b.match).length} <small>部</small>`, t: '符合审稿要求' });
    kpis.push(
      { v: `${data.filter(b => b.grade === 'S' || b.grade === 'A').length} <small>部</small>`, t: 'S / A 级' },
      { v: `${rj} <small>份</small>`, t: '拦截无效投稿' },
      { v: `${Math.round((1 - rj / n) * 100)}<small>%</small>`, t: '有效稿占比' });
    return { k: 'batch', href, ico: '▩', go: '查看批量评估结果', kpis, links: [],
      head: `批量评估完成 · ${n} 份稿件`,
      sub: `${dp} · ${use.length} 个维度 · ${stamp}`,
      note: (req ? '' : '未设自定义审稿要求，按所选维度做通用分级。')
        + '批量结论、单份评估报告与逐集标注都在同一个结果页；在结果表里点任意一行即可展开该稿件的报告。' };
  }

  const weak = [...use].sort((a, b) => a.score - b.score)[0];
  return {
    k: 'report', href, grade: script.grade, go: '查看完整评估结果',
    head: `评估完成 · ${dp} · ${use.length} 个维度`,
    sub: `《${esc(script.title)}》· ${script.meta.eps} 集 / ${(script.meta.words / 10000).toFixed(1)} 万字
      · ${docNo(script.title)} · ${stamp}${titleNote ? ` · ${esc(titleNote)}` : ''}`,
    kpis: [
      { v: `${script.score} <small>分</small>`, t: `综合评分 · ${script.grade} 级` },
      { v: `${cnt.issues} <small>处</small>`, t: '已定位问题' },
      { v: `<i class="sev sev-P0">P0 ${cnt.p0}</i><i class="sev sev-P1">P1 ${cnt.p1}</i>`, t: '严重度分布' },
      { v: weak ? esc(dimName(weak.dim)) : '—', t: '最弱维度' }
    ],
    /* 标注的自然入口是报告里点「第 N 集」，这里只留一个轻量快捷方式 */
    links: window.NEO_DEPTH === 'quick' ? [] : [{ k: 'annot', t: '分集问题标注' }],
    note: '评估报告 / 分集问题标注 / 修改对比 都在同一个结果页，按 tab 切换；网址带全部状态，可直接分享。'
  };
}

/* 结果摘要条：投进对话框里，正文都在结果页 */
/* 主入口不加 rel=noopener——结果页要靠 window.opener 与评估页共享同一份剧本数据（同源本地页） */
window.neoResultBarHtml = (o, where) => `
  <div class="res-out${where === 'chat' ? ' in-chat' : ''}"${where === 'chat' ? ' id="neoResBar"' : ''}>
    <div class="ro-main">
      ${o.grade ? `<span class="grade ${gradeCls(o.grade)}">${o.grade}</span>`
                : `<span class="ro-ico">${o.ico}</span>`}
      <div class="ro-hd"><b>${esc(o.head)}</b><span>${o.sub}</span></div>
      <a class="btn btn-primary ro-go" href="${o.href}" target="_blank"
         title="在新页面打开评估结果">${esc(o.go)} <i>↗</i></a>
    </div>
    <div class="ro-kpi">${o.kpis.map(x => `
      <span class="rk"><span class="v">${x.v}</span><em>${esc(x.t)}</em></span>`).join('')}</div>
    <div class="ro-foot">
      ${o.links.length ? `<span class="ro-jump">直接跳到${o.links.map(l =>
        `<button class="res-jump" type="button" data-res-jump="${l.k}">${esc(l.t)} <i>↗</i></button>`).join('')}</span>` : ''}
      <span class="ro-note">${o.note}</span>
    </div>
  </div>`;


/* 导出格式菜单：点击空白处收起（模块级只注册一次） */
document.addEventListener('click', e => {
  document.querySelectorAll('.dl-menu:not([hidden])').forEach(m => {
    if (!m.parentElement.contains(e.target)) m.hidden = true;
  });
});

window.renderReport = function (host, script, opts = {}) {
  const {
    showMatch = true, dims = (typeof DEFAULT_DIMS !== 'undefined' ? DEFAULT_DIMS : []), onEpJump,
    titleNote = '', countByDims = false
  } = opts;
  const reports = (script.dimReports || []).filter(r => dims.includes(r.dim));
  const use = reports.length ? reports : (script.dimReports || []);
  const st = script.stats || {};
  const cnt = countByDims
    ? (() => {
        const all = use.flatMap(r => issuesOf(script, r.dim));
        const c = sevCount(all);
        return { issues: all.length, p0: c.P0, p1: c.P1 };
      })()
    : { issues: st.issues, p0: st.p0, p1: st.p1 };

  const hasRisk = use.some(r => r.dim === 'risk');
  const riskRep = use.find(r => r.dim === 'risk');
  const TABS = [];
  if (showMatch && (script.match || []).length)
    TABS.push({ k: 'match', t: '定向投稿匹配度', n: (script.match || []).length, build: () => matchHtml(script) });
  if (hasRisk)
    TABS.push({ k: 'risk', t: '合规性评估', n: issuesOf(script, 'risk').length, build: () => riskHtml(script, riskRep) });
  TABS.push({
    k: 'dims', t: '分维度评估',
    n: use.flatMap(r => issuesOf(script, r.dim)).length, build: () => dimsHtml(script, use)
  });

  const upsell = (window.NEO_DEPTH === 'quick' && typeof window.neoUpsellHtml === 'function')
    ? window.neoUpsellHtml('report') : '';

  const S = summaryParts(script, use, cnt);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const deep = window.NEO_DEPTH === 'quick' ? '快速评估（仅评估报告）' : '深度评估（评估报告 + 分集问题标注）';
  const pfList = (typeof CHOSEN !== 'undefined' && (CHOSEN.platforms || []).length)
    ? CHOSEN.platforms.map(esc).join('、') : '未指定';
  /* 题材 / 地区在 mock 里挂在 brief 上（meta 里没有这两项） */
  const bf = script.brief || {};

  /* 评估页不再内嵌任何结果：只把结果摘要条投进对话框，正文都在结果页看 */
  const PG = pageOf();
  if (PG !== 'report' && PG !== 'result') {
    host.innerHTML = '';
    /* 深度切换后摘要要重算（多一个「分集问题标注」锚点、href 里的 depth 也要改），
       故把构造过程留给 neo.js 按需重放 */
    window.neoResRebuild = () => {
      if (typeof window.neoResultOut === 'function')
        window.neoResultOut(resultOut(script, use, cnt, stamp, showMatch, titleNote));
    };
    window.neoResRebuild();
    return;
  }

  host.innerHTML = `
  <div class="report rep-doc">
    <div class="doc-bar">
      <span class="doc-bar-t">剧本评估报告</span>
      <span class="doc-bar-no">${docNo(script.title)}</span>
      <span class="spacer"></span>
      <div class="rep-dl">
        <span class="dl-wrap">
          <button class="btn btn-sm dl-main" data-dl="PDF" type="button" title="默认导出 PDF">⤓ 导出</button>
          <button class="btn btn-sm dl-more" type="button" aria-label="选择导出格式" title="选择其他格式">▾</button>
          <span class="dl-menu" hidden>
            <button type="button" data-dl="PDF">PDF<i>默认</i></button>
            <button type="button" data-dl="Word">Word</button>
          </span>
        </span>
      </div>
    </div>

    ${upsell}

    <article class="doc-page">
      <header class="doc-head">
        <div class="doc-kicker">短剧剧本评估报告</div>
        <h1 class="doc-title">《${esc(script.title)}》</h1>
        <div class="doc-byline">编剧 ${esc(script.author || '—')} · ${esc(bf.mode || '短剧剧本')} · ${esc(bf.region || '中国')}
          ${titleNote ? `<span class="tag">${esc(titleNote)}</span>` : ''}</div>
        <div class="doc-headline">
          <div class="grade ${gradeCls(script.grade)}">${script.grade}</div>
          <div class="dh-tx">
            <b>综合 ${script.score} 分 · 整体评级 ${script.grade} 级</b>
            <span>${esc(script.verdict)}</span>
          </div>
        </div>
        <table class="doc-info">
          <tbody>
            <tr><th>剧本体量</th><td>${script.meta.eps} 集 / ${fmt(script.meta.words)} 字</td>
                <th>评估深度</th><td>${deep}</td></tr>
            <tr><th>评估维度</th><td>${use.length} 个（${use.map(r => dimName(r.dim)).join('、')}）</td>
                <th>定向投稿平台</th><td>${pfList}</td></tr>
            <tr><th>问题总数</th><td>${cnt.issues} 处（致命 P0 ${cnt.p0} · 严重 P1 ${cnt.p1}）</td>
                <th>报告生成时间</th><td>${stamp}</td></tr>
          </tbody>
        </table>
      </header>

      <section class="doc-sec">
        <h2><i>一</i>评估结论与评级依据</h2>
        <p class="doc-lead">${S.lead}</p>
        <p>${S.detail}</p>
        <h3><i>1.1</i>评级依据</h3>
        <p>${S.basis}</p>
        <h3><i>1.2</i>上探路径</h3>
        <p>${S.next}</p>
      </section>

      <section class="doc-sec">
        <h2><i>二</i>分维度得分</h2>
        <p class="doc-note">本次共评估 ${use.length} 个维度，按维度得分与问题严重度加权得出综合分。</p>
        <div class="dim-bars">${use.map(r => `
          <div class="dim-bar">
            <span class="nm">${dimName(r.dim)}</span>
            <span class="track"><i class="fill" style="width:${r.score}%;background:${dimColor(r.dim)}"></i></span>
            <span class="sc"><b>${r.score}</b> <em class="${gradeCls(r.grade)}">${r.grade}</em></span>
          </div>`).join('')}</div>
      </section>

      <section class="doc-sec">
        <h2><i>三</i>详细评估</h2>
        <p class="doc-note">共 ${TABS.length} 部分，点下方标签切换查看。</p>
        <div class="rtabs-wrap">
          <div class="rtabs" role="tablist" aria-label="报告详情">
            ${TABS.map((x, i) => {
              const m = TAB_META[x.k] || {};
              return `<button class="rtab" role="tab" type="button" data-rt="${x.k}" aria-selected="${i === 0}">
                <span class="rt-ico">${m.ico || '◈'}</span>
                <span class="rt-main"><b>${x.t}</b><em>${m.sub || ''}</em></span>
                <span class="rt-cnt" title="${x.n} ${m.unit || ''}">${x.n}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        ${TABS.map((x, i) => `
          <div class="rpanel${i === 0 ? ' active' : ''}" data-rp="${x.k}">
            <h3 class="doc-h3"><i>3.${i + 1}</i>${x.t}<em>${x.n} ${(TAB_META[x.k] || {}).unit || ''}</em></h3>
            ${x.build()}
          </div>`).join('')}
      </section>

      <footer class="doc-foot">
        <span>本报告由 AI 依据所选维度与规则库 v2.4 自动生成，所列问题、依据与建议供创作与审稿参考，不构成最终评审结论。</span>
        <span class="doc-foot-no">${docNo(script.title)} · ${stamp}</span>
      </footer>
    </article>
  </div>`;

  host.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
    const menu = b.closest('.dl-menu');
    if (menu) menu.hidden = true;
    fakeDownload(b.dataset.dl, script.title);
  });
  const more = host.querySelector('.dl-more');
  if (more) more.onclick = e => {
    e.stopPropagation();
    const menu = more.parentElement.querySelector('.dl-menu');
    menu.hidden = !menu.hidden;
  };
  const tabs = host.querySelector('.rtabs');
  if (tabs) tabs.onclick = e => {
    const b = e.target.closest('.rtab');
    if (!b) return;
    tabs.querySelectorAll('.rtab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    host.querySelectorAll('.rpanel').forEach(p => p.classList.toggle('active', p.dataset.rp === b.dataset.rt));
  };
  if (onEpJump) host.querySelectorAll('.ep-link').forEach(a =>
    a.onclick = () => onEpJump(+a.dataset.ep, a.dataset.dim));
};
})();
