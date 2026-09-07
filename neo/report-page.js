/* ================================================================
   独立评估报告页（neo/report.html）
   由评估页「评估结果文档」卡片在新窗口打开，只渲染报告正文，无对话区。
   全部状态从 URL 参数还原（mock 数据是确定性的，同参数必得同一份报告）：
     from   diagnose | batch   来源流程
     id     b01…b50           仅 from=batch 时有效，指定哪一份投稿
     dims   story,logic,…     本次评估维度
     pf     红果,点众          定向投稿平台，缺省则不出匹配度章节
     depth  quick | deep      评估深度
     note   符合审稿要求…      B 端标题旁的判定标签
   ================================================================ */
(() => {

const P = new URLSearchParams(location.search);
const list = k => (P.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);

const FROM = P.get('from') === 'batch' ? 'batch' : 'diagnose';
const dims = list('dims').filter(d => DIM[d]);
const platforms = list('pf');
const depth = P.get('depth') === 'quick' ? 'quick' : 'deep';

/* renderReport 内部以裸名读取 CHOSEN / NEO_DEPTH，这里补齐同名全局 */
window.CHOSEN = { dims: dims.length ? dims : DEFAULT_DIMS, platforms };
window.NEO_DEPTH = depth;
document.documentElement.dataset.depth = depth;

/* B 端：把批量条目映射成一份可渲染的报告。
   与 js/batch.js 的 viewOf() 保持一致——那份在 v1 里不可改动，故此处按同规则重建。 */
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

const entry = FROM === 'batch' ? (BATCH.find(x => x.id === P.get('id')) || BATCH[0]) : null;
const script = entry ? batchView(entry) : SCRIPT;
const back = FROM === 'batch' ? 'batch.html?stage=result' : 'diagnose.html?stage=result';

renderTopbar(FROM === 'batch' ? '批量审稿筛选 · 评估报告' : '剧本诊断优化 · 评估报告',
  `<a class="btn btn-ghost btn-sm" href="${back}" title="返回评估页">↩ 返回评估页</a>`);
document.title = `《${script.title}》评估报告 · 剧本智能评审 Neo`;

/* 「第 N 集」跳转：本页没有标注面板，优先驱动打开本页的那个评估页 */
function epJump(ep, dim) {
  try {
    const op = window.opener;
    if (op && !op.closed && typeof op.neoEpJump === 'function' && op.neoEpJump(ep, dim)) {
      op.focus();
      return;
    }
  } catch (e) { /* 跨窗口访问被拦时走兜底提示 */ }
  toast(`分集问题标注在评估页的「分集问题标注」面板，回到评估页可定位到第 ${ep} 集`);
}

renderReport(document.querySelector('#repHost'), script, {
  dims: window.CHOSEN.dims,
  countByDims: FROM !== 'batch',
  showMatch: FROM !== 'batch' && platforms.length > 0,
  titleNote: P.get('note') || '',
  onEpJump: epJump
});

})();
