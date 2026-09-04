/* ============ 入口页 ============ */
renderTopbar('剧本评估');

const MODE_CFG = {
  diagnose: {
    hint: '支持 pdf / word / txt / 纯文本，单个文件不超过 10 MB，单次 1 个剧本，中英文均可',
    ph: '可直接写清评估要求，例如：付费短剧，投红果，重点看逻辑和伏笔回收，帮我筛一遍合规风险',
    maxFiles: 1, cost: COST.diagnose, page: 'diagnose.html',
    sample: [{ n: SCRIPT.file, s: SCRIPT.size }],
    sampleReq: '这是付费真人短剧，主投红果和点众，重点帮我看剧情逻辑和伏笔回收，另外筛一遍合规风险。'
  },
  batch: {
    hint: '支持 pdf / word / txt，单个文件不超过 10 MB，单次最多 50 个剧本，中英文均可',
    ph: '可直接写清审稿要求，例如：都市甜宠+先婚后爱，女性成长向，女主不能是纯恋爱脑，60–80 集，杜绝 AI 拼稿和洗稿',
    maxFiles: 50, cost: COST.batch, page: 'batch.html',
    sample: BATCH.map(b => ({ n: `${b.title}-全${b.eps}集.docx`, s: (0.6 + (b.words % 1400) / 1000).toFixed(1) + ' MB' })),
    sampleReq: REVIEW_REQ
  }
};
const S_ = { mode: 'diagnose', files: [] };
const cfg = () => MODE_CFG[S_.mode];

function paint() {
  $$('.mode-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.mode === S_.mode)));
  $('#dzHint').textContent = cfg().hint;
  $('#reqInput').placeholder = cfg().ph;
  $('#loadSample').textContent = S_.mode === 'diagnose' ? '载入示例剧本' : '载入示例：50 份投稿';
  const shown = S_.files.slice(0, 8);
  $('#fileList').innerHTML = shown.map((f, i) => `
    <span class="file-chip"><span class="fn" title="${esc(f.n)}">${esc(f.n)}</span>
      <span class="sz">${f.s}</span><span class="x" data-i="${i}" title="移除">✕</span></span>`).join('')
    + (S_.files.length > shown.length ? `<span class="file-more">等共 ${S_.files.length} 个文件</span>` : '');
  $$('#fileList .x').forEach(x => x.onclick = () => { S_.files.splice(+x.dataset.i, 1); paint(); });
  $('#fileStat').textContent = S_.files.length
    ? `已选 ${S_.files.length} / ${cfg().maxFiles} 个文件` : '';
  $('#costHint').textContent = S_.files.length ? `预计消耗 ${fmt(cfg().cost)} 积分` : '';
  $('#startBtn').disabled = !S_.files.length;
}

/* 模式切换 */
$$('.mode-tab').forEach(t => t.onclick = () => {
  if (t.dataset.mode === S_.mode) return;
  S_.mode = t.dataset.mode; S_.files = []; $('#reqInput').value = ''; paint();
});

/* 选文件（Demo：只取文件名与大小，不读内容） */
const addFiles = list => {
  for (const f of list) {
    if (S_.files.length >= cfg().maxFiles) { toast(`当前模式单次最多 ${cfg().maxFiles} 个文件`); break; }
    if (f.size > 10 * 1024 * 1024) { toast(`${f.name} 超过 10 MB，已跳过`); continue; }
    if (!/\.(pdf|docx?|txt)$/i.test(f.name)) { toast(`${f.name} 格式不支持`); continue; }
    S_.files.push({ n: f.name, s: (f.size / 1048576).toFixed(1) + ' MB' });
  }
  paint();
};
$('#dropzone').onclick = () => $('#filePicker').click();
$('#filePicker').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => $('#dropzone').addEventListener(ev, e => {
  e.preventDefault(); $('#dropzone').classList.add('over');
}));
['dragleave', 'drop'].forEach(ev => $('#dropzone').addEventListener(ev, e => {
  e.preventDefault(); $('#dropzone').classList.remove('over');
}));
$('#dropzone').addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#reqInput').oninput = paint;

$('#loadSample').onclick = () => {
  S_.files = cfg().sample.slice(0, cfg().maxFiles);
  $('#reqInput').value = cfg().sampleReq;
  paint();
  toast('已载入示例，可直接发起评估');
};

$('#startBtn').onclick = () => {
  if (!S_.files.length) { toast('请先上传剧本文件'); return; }
  const p = new URLSearchParams({ stage: 'brief', req: $('#reqInput').value.trim(), n: S_.files.length });
  location.href = cfg().page + '?' + p;
};

/* 评估记录 */
let recFilter = 'all';
function paintRecords() {
  const list = RECORDS.filter(r => recFilter === 'all' || r.kind === recFilter);
  $('#recList').innerHTML = list.map(r => `
    <div class="rec-item" data-href="${r.href}">
      <span class="rec-kind">${r.kind === 'diagnose' ? '诊' : '批'}</span>
      <span class="rec-main">
        <span class="t">${esc(r.title)}</span>
        <span class="m">${r.kind === 'diagnose' ? '剧本诊断优化' : '批量审稿筛选'} · ${esc(r.sub)}</span>
      </span>
      <span class="hint-inline nowrap">${esc(r.time)}</span>
      <span class="muted">›</span>
    </div>`).join('') || '<div class="hint-inline" style="padding:16px">暂无记录</div>';
  $$('#recList .rec-item').forEach(it => it.onclick = () => location.href = it.dataset.href);
}
$('#recFilter').onclick = e => {
  const c = e.target.closest('.chip'); if (!c) return;
  $$('#recFilter .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
  recFilter = c.dataset.v; paintRecords();
};

paint(); paintRecords();
