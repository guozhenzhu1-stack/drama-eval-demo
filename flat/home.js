/* ================================================================
   风格 B 首页：标题 + 一个输入框 + 一行示例
   替代 js/entry.js —— 首页已去掉模式选择 / 载入示例 / 评估记录等元素，
   v1 的 entry.js 取不到那些节点会直接报错，故本页自带一份精简逻辑
   ================================================================ */
renderTopbar('');

/* 示例体量：让两条分流都能一键点出来（≤9 集对话内直答，≥10 集先出 brief 卡片） */
const T0 = '退婚当日，我闪婚了首富';
const SAMPLES = {
  seg:  { eps: 1, part: 1, file: `${T0}-第1集片段.docx`, size: '0.2 MB', words: 1180,
          req: '这是付费真人短剧的开场片段，帮我看看钩子够不够、有没有逻辑硬伤。' },
  one:  { eps: 1, file: `${T0}-第1集.docx`, size: '0.4 MB', words: 2180,
          req: '付费真人短剧第 1 集，重点看首集钩子、节奏与台词。' },
  few:  { eps: 8, file: `${T0}-第1-8集.docx`, size: '0.7 MB', words: 15240,
          req: '这是前 8 集，主投红果，重点看剧情逻辑与伏笔回收，再筛一遍合规风险。' },
  full: { eps: 24, file: SCRIPT.file, size: SCRIPT.size, words: SCRIPT.meta.words,
          req: '付费真人短剧，主投红果与点众，重点看剧情逻辑与伏笔回收，另外筛一遍合规风险。' }
};

const ta = $('#reqInput'), box = $('#uniBox'), picker = $('#filePicker');
let FILES = [];

/* 文件名里的集数：解析不出来就按「多集（≥10 集）」处理，走 brief 分流 */
function epsOf(name) {
  let m = name.match(/(\d+)\s*[-–~至]\s*(\d+)\s*集/);
  if (m) return Math.max(1, +m[2] - +m[1] + 1);
  m = name.match(/全\s*(\d+)\s*集|共\s*(\d+)\s*集|(\d+)\s*集全/);
  if (m) return +(m[1] || m[2] || m[3]);
  if (/片段|节选|选段/.test(name)) return 1;
  if (/第\s*\d+\s*集/.test(name)) return 1;
  m = name.match(/(\d+)\s*集/);
  return m ? +m[1] : 0;
}
const sizeOf = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; };

function paint() {
  const f = FILES[0];
  $('#fileList').innerHTML = f ? `
    <span class="file-chip"><i>📄</i>${esc(f.name)}
      <em class="fc-meta">${esc(f.size)}${f.eps ? ' · ' + f.eps + ' 集' : ' · 集数未标注'}</em>
      <b class="fc-x" id="fileX" title="移除">✕</b></span>` : '';
  $('#fileStat').textContent = f
    ? (f.eps && f.eps < 10 ? '体量较小，评估结果会直接回在对话里' : '多集剧本，会先确认评估口径与评估深度')
    : '';
  if (f) $('#fileX').onclick = () => { FILES = []; markSamp(null); paint(); };
}

function take(list) {
  const f = list && list[0];
  if (!f) return;
  if (list.length > 1) toast('Demo 中一次评估一个剧本文件，已取第一个');
  FILES = [{ name: f.name, size: sizeOf(f.size), eps: epsOf(f.name) }];
  markSamp(null);
  paint();
}

/* 附件：点按钮选文件，或直接拖进整个输入框 */
$('#dropzone').onclick = () => picker.click();
picker.onchange = () => { take(picker.files); picker.value = ''; };
const halt = e => { e.preventDefault(); e.stopPropagation(); };
['dragover', 'dragenter'].forEach(ev => box.addEventListener(ev, e => { halt(e); box.classList.add('over'); }));
['dragleave', 'dragend', 'drop'].forEach(ev => box.addEventListener(ev, () => box.classList.remove('over')));
box.addEventListener('drop', e => { halt(e); take(e.dataTransfer.files); });

/* 发起评估：体量随文件走，后续分流交给 diagnose.html */
function go() {
  const f = FILES[0];
  if (!f) { toast('先点下面的示例剧本，或添加一个剧本文件'); ta.focus(); return; }
  const p = new URLSearchParams({ file: f.name, size: f.size, eps: f.eps, req: ta.value.trim() });
  if (f.words) p.set('words', f.words);
  if (f.part) p.set('part', '1');
  location.href = 'diagnose.html?' + p;
}
$('#startBtn').onclick = go;
ta.addEventListener('input', fit);
ta.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); }
});

/* 示例只负责把剧本填进输入框，评估由用户自己点发送触发 */
const markSamp = b => $$('[data-samp]', $('#sampRow'))
  .forEach(x => x.setAttribute('aria-pressed', String(x === b)));

$('#sampRow').onclick = e => {
  const b = e.target.closest('[data-samp]');
  if (!b) return;
  const s = SAMPLES[b.dataset.samp];
  FILES = [{ name: s.file, size: s.size, eps: s.eps, words: s.words, part: s.part }];
  ta.value = s.req;
  markSamp(b);
  fit(); paint();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  toast('示例剧本已载入输入框，点右下角发送开始评估');
};

fit(); paint();
