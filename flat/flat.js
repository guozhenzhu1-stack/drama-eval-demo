/* ================================================================
   视觉风格 B（flat）交互补丁
   只做三件事：固定浅色主题 / 侧栏激活态与收起 / 未开放项提示
   在 neo.js 与页面脚本之后加载，不改动任何既有逻辑
   ================================================================ */
(() => {
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const say = m => (window.toast ? toast(m) : void 0);

/* ---------- 1. 本皮肤只有浅色：压住 neo 的深空主题 ---------- */
const light = () => { document.documentElement.dataset.theme = 'light'; };
light();
try { localStorage.setItem('neo-theme', 'light'); } catch (e) {}

/* 顶栏由 neo.js 的 renderTopbar 渲染，包一层以便每次渲染后都补丁 */
const origTopbar = window.renderTopbar;
if (typeof origTopbar === 'function') {
  window.renderTopbar = function (...a) {
    origTopbar.apply(this, a);
    light();
    const b = $('#themeBtn');
    if (b) b.onclick = () => { light(); say('风格 B 为单一浅色视觉，未提供深色模式'); };
  };
}

/* ---------- 2. 侧栏：激活态 / 收起 / 未开放项 ---------- */
function sidebar() {
  const sb = $('#sbar');
  if (!sb) return;
  document.body.classList.add('has-sbar');

  const page = document.body.dataset.nav || document.body.dataset.page || 'entry';
  const on = sb.querySelector(`.sb-item[data-nav="${page}"]`);
  if (on) { on.classList.add('on'); on.setAttribute('aria-current', 'page'); }

  const fold = $('#sbFold');
  if (fold) fold.onclick = () => {
    const f = document.body.classList.toggle('sb-fold');
    fold.textContent = f ? '▶' : '◀';
    fold.title = f ? '展开侧栏' : '收起侧栏';
  };

  $$('[data-soon]', sb).forEach(el => {
    el.onclick = () => say(el.dataset.soon);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sidebar);
} else sidebar();

/* ---------- 3. 报告导出：Demo 只出 PDF，去掉 Word 与格式菜单 ---------- */
/* 报告由 report-neo.js 在多处按需重绘（快速评估的右栏、结果页切 tab、升级后重建），
   这里用观察器兜住每一次重绘，而不是包装 renderReport —— flat.js 之后才加载，
   flow.js 启动时的首次渲染包装不到 */
function pdfOnly(root) {
  root.querySelectorAll('.rep-dl:not([data-flat-dl])').forEach(box => {
    box.dataset.flatDl = '1';
    box.querySelectorAll('.dl-more, .dl-menu').forEach(n => n.remove());
    const b = box.querySelector('.dl-main');
    if (!b) return;
    b.dataset.dl = 'PDF';
    b.textContent = '⤓ 导出 PDF';
    b.title = 'Demo 中报告只支持导出 PDF';
    b.onclick = () => {
      if (b.dataset.dlBusy) return;
      b.dataset.dlBusy = '1';
      const tx = b.textContent;
      b.textContent = '⤓ 正在生成…';
      setTimeout(() => {
        delete b.dataset.dlBusy;
        b.textContent = tx;
        say('评估报告 PDF 已生成（Demo 不产出真实文件）');
      }, 900);
    };
  });
}

/* ---------- 4. 本期只做问题检测：抹掉共享组件里的修改建议与改稿入口 ---------- */
/* report-neo.js / annot.js / result-page.js 由风格 A 与 v1 共用，不能改；
   这里在 flat 皮肤内按渲染结果打补丁：删建议字段、删改稿按钮、正文转只读 */
const swap = (el, re, to) => {
  if (!el || !re.test(el.innerHTML)) return;
  el.innerHTML = el.innerHTML.replace(re, to);
};

function noFix(root) {
  /* 报告：分维度里的「建议：…」与合规里的「整改建议：…」 */
  root.querySelectorAll('.di-fix, .cmp-fix').forEach(n => n.remove());
  /* 分集问题标注：整本 / 本集 / 单条修复入口，划选下指令条 */
  root.querySelectorAll('#fixBook, #fixEp, [data-act="fix"], #selBar, .fix-summary').forEach(n => n.remove());
  /* 结果页：修改对比这一 tab 不再产出 */
  root.querySelectorAll('[role="tab"][data-rk="diff"], [data-res-jump="diff"]').forEach(n => n.remove());
  /* 标注卡里的「修改建议：」整行（判断依据要留着） */
  root.querySelectorAll('.iss-card .kv').forEach(kv => {
    const b = kv.querySelector('b');
    if (b && b.textContent.includes('修改建议')) kv.remove();
  });
  /* 剧本正文：本期不改稿，转为只读 */
  root.querySelectorAll('.script-body[contenteditable="true"]').forEach(body => {
    body.setAttribute('contenteditable', 'false');
    const h = body.parentElement && body.parentElement.querySelector('.sc-head .hint-inline');
    if (h) h.textContent = h.textContent.replace(/正文可直接编辑，划选可下发修改指令/, '本期只做问题检测，正文只读');
  });
  /* 文案里对建议与改稿的承诺 */
  root.querySelectorAll('.section-title h3').forEach(h => {
    if (h.textContent.trim() === '命中项与整改建议') h.textContent = '命中项与判断依据';
  });
  root.querySelectorAll('.ro-note').forEach(n =>
    swap(n, /评估报告 \/ 分集问题标注 \/ 修改对比 都在同一个结果页/, '评估报告 / 分集问题标注 都在同一个结果页'));
  root.querySelectorAll('.doc-foot > span').forEach(n =>
    swap(n, /所列问题、依据与建议/, '所列问题与判断依据'));
  root.querySelectorAll('.dn-row span, .up-tx span').forEach(n => {
    swap(n, /，\s*并给出判断依据与可执行的改写建议。?/, '，并给出每处问题的判断依据。');
    swap(n, /耗时与积分约为快速评估的 3 倍/, '耗时约为快速评估的 3 倍');
    swap(n, /速度快、积分省，/, '速度快，');
  });
}

/* ---------- 5. 报告瘦身：只留必要信息 ---------- */
/* 报告由 report-neo.js 生成（与风格 A 共用，不能改源码），这里在渲染后摘掉重复与冗余：
   封面信息表、评级依据与上探路径、各处「共 N 部分…」式的说明句、合规里全部通过的规则行 */
function slimReport(root) {
  root.querySelectorAll('.rep-doc:not([data-flat-slim])').forEach(doc => {
    doc.dataset.flatSlim = '1';

    /* 封面：标题上方那行小字与左上角的「剧本评估报告」重复；
       信息表里的体量、维度、问题数在结论段里都说了，生成时间与报告号在页脚 */
    doc.querySelectorAll('.doc-kicker, .doc-info').forEach(n => n.remove());
    /* 结论那句评级判词已经在上面的评级卡里，段首不用再说一遍 */
    const lead = doc.querySelector('.doc-lead');
    if (lead) lead.innerHTML = lead.innerHTML.replace(/——[^。]*。\s*$/, '。');

    /* 一：只留结论。评级依据是对结论段的复述，上探路径属于改法建议，本期不出 */
    const sec = doc.querySelector('.doc-sec');
    if (sec) {
      const h2 = sec.querySelector('h2');
      if (h2) h2.innerHTML = '<i>一</i>评估结论';
      sec.querySelectorAll('h3').forEach(h => {
        let n = h.nextElementSibling;
        while (n && n.tagName === 'P') { const x = n.nextElementSibling; n.remove(); n = x; }
        h.remove();
      });
    }

    /* 二、三：「本次共评估 N 个维度…」「共 N 部分，点下方标签切换查看」这类话不用写出来 */
    doc.querySelectorAll('.doc-note').forEach(n => n.remove());
    /* tab 上的副标题，以及 tab 下与 tab 同名的小节标题 */
    doc.querySelectorAll('.rtab .rt-main em, .rpanel > .doc-h3').forEach(n => n.remove());
    /* 只剩一个部分时不用摆 tab：「三 详细评估」这个标题就够了 */
    if (doc.querySelectorAll('.rtab').length < 2)
      doc.querySelectorAll('.rtabs-wrap').forEach(n => n.remove());
    /* 平台优化建议属于改法建议 */
    doc.querySelectorAll('.pf-tip').forEach(n => n.remove());

    /* 合规：8 行规则表里大多是「通过」，只留命中的行，其余用一句话交代 */
    const tbl = doc.querySelector('.cmp-tbl');
    if (tbl) {
      const tb = tbl.tBodies[0], wrap = tbl.closest('.tbl-wrap');
      const pass = [...tb.rows].filter(r => r.querySelector('.cmp-st.good'));
      pass.forEach(r => r.remove());
      if (pass.length && wrap) {
        wrap.insertAdjacentHTML('afterend', `<p class="cmp-pass">规则库其余 ${pass.length} 项均未命中。</p>`);
        if (!tb.rows.length) wrap.remove();
      }
    }
    const ch = doc.querySelector('.cmp-head .hint-inline');
    if (ch) ch.textContent = ch.textContent
      .replace(/\s*·\s*[SABCD]\s*级（[^）]*）/, '')
      .replace(/（2026-08[^）]*）/, '')
      .replace(/\s+/g, ' ').trim();

    /* 分维度：一行里同时给等级、质量评级、分数与严重度分布，留分数与问题数就够 */
    doc.querySelectorAll('.dim-block > .card-head').forEach(hd => {
      hd.querySelectorAll('.db-g, .sev').forEach(n => n.remove());
      const q = hd.querySelector('.db-q');
      if (q) q.textContent = q.textContent.replace(/^\s*质量评级[^·]*·\s*/, '');
    });
    doc.querySelectorAll('.db-sum .rs-tag').forEach(n => n.remove());
    const dn = doc.querySelector('.rpanel[data-rp="dims"] .rp-note');
    if (dn) dn.textContent = '点「第 N 集」可跳到分集问题标注对应位置。';
  });
}

/* ---------- 6. 对话框按参考稿对齐：点赞点踩 / 可展开的进度清单 / 标题栏 ---------- */
/* 说话的组件是共享的（flow.js、js/batch.js 的 say()），这里只在渲染后补交互 */
const THUMB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5V20H4.6A1.6 1.6 0 0 1 3 18.4v-6.3A1.6 1.6 0 0 1 4.6 10.5H7Z"/><path d="M7 10.5l4-6.2a1.4 1.4 0 0 1 2.6.75V9.4h4.2a2 2 0 0 1 2 2.45l-1.2 5.9A2 2 0 0 1 16.6 20H7"/></svg>`;

const STEP_NOTE = {
  '结构化解析与去重指纹计算': '先把每份稿子拆成集 / 场 / 人物，再算一份去重指纹，用来找洗稿与重复投递',
  'AI 生成特征与洗稿比对': '比对句式分布与桥段序列，判断是否 AI 批量生成或改写自同一母本',
  '剧本结构化解析': '已按集 / 场 / 人物把剧本拆成结构，后面每一步的定位都落在这套坐标上',
  '分集分维度问题检测': '逐集逐场比对所选维度的检测规则，命中就记下「第几集 · 第几场 · 哪句台词」',
  '分维度问题检测': '按所选维度逐段比对检测规则，命中就记下位置与判断依据',
  '分维度质量评估': '按维度给每份稿子评分，用于后面的分级与拦截判断',
  '合规规则库比对': '与平台常见退改项规则库比对，只标风险点，本期不改内容',
  '自定义审稿要求匹配': '把你填的审稿口径当成额外规则跑一遍，不满足的单独标出来',
  '定向投稿匹配度计算': '按题材、节奏与卡点密度估算与目标平台的匹配度',
  '汇总问题清单': '按维度归并去重，严重度高的排在前面',
  '汇总评估报告': '结论、得分与逐条依据合成一份可导出的报告',
  '汇总批量结论': '按分级与拦截结论汇总成一张可筛选的清单'
};
const stepNote = t => {
  const k = Object.keys(STEP_NOTE).find(x => t.includes(x));
  return k ? STEP_NOTE[k] : 'Demo 中这一步为模拟执行，不产出中间文件';
};

function chatSkin(root) {
  /* 进度清单：多步的那种不用气泡承载，每行可点开看这步做了什么 */
  root.querySelectorAll('.steps:not([data-sx])').forEach(box => {
    box.dataset.sx = '1';
    const msg = box.closest('.msg');
    const rows = [...box.querySelectorAll('.step')];
    if (rows.length < 2) return;                  /* 批量页只有一行滚动进度，保持原样 */
    if (msg) {
      msg.classList.add('steps-msg');
      const av = msg.querySelector('.avatar');
      if (av) av.textContent = '✦';
    }
    rows.forEach(st => {
      const x = document.createElement('i');
      x.className = 'sx';
      x.textContent = '›';
      st.appendChild(x);
      st.onclick = () => {
        if (!st.classList.contains('done')) return;
        const open = st.classList.toggle('open');
        let n = st.nextElementSibling;
        if (!n || !n.classList.contains('step-note')) {
          n = document.createElement('p');
          n.className = 'step-note';
          n.textContent = stepNote(st.textContent);
          st.after(n);
        }
        n.hidden = !open;
      };
    });
  });

  /* 回复下方的点赞 / 点踩 */
  root.querySelectorAll('#chatScroll .msg.ai:not([data-fb])').forEach(m => {
    const b = m.querySelector('.bubble');
    if (!b || b.querySelector('.steps') || b.querySelector('.card')) return;
    m.dataset.fb = '1';
    const row = document.createElement('div');
    row.className = 'msg-fb';
    row.innerHTML = ['up', 'down'].map(k =>
      `<button class="fb-btn" type="button" data-fb="${k}" aria-pressed="false"
        title="${k === 'up' ? '这条回复有用' : '这条回复没帮上忙'}">${THUMB}</button>`).join('');
    m.appendChild(row);
    $$('.fb-btn', row).forEach(btn => {
      btn.onclick = () => {
        const on = btn.getAttribute('aria-pressed') === 'true';
        $$('.fb-btn', row).forEach(o => o.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (on) return;
        say(btn.dataset.fb === 'up' ? '已记下：这条回复有用' : '已记下：会用来改进后续的评估口径');
      };
    });
  });
}

/* 标题栏：返回胶囊 + 居中标题 + 右侧 » 收起工作台 */
function chatHead() {
  const hd = $('.pane-chat .pane-head');
  if (!hd || hd.dataset.ph) return;
  hd.dataset.ph = '1';
  const h3 = $('h3', hd);
  if (h3) {
    const mid = document.createElement('span');
    mid.className = 'ph-mid';
    hd.insertBefore(mid, h3);
    mid.appendChild(h3);
    $$(':scope > .tag', hd).forEach(t => mid.appendChild(t));
  }
  const studio = $('.studio');
  if (!studio) return;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'ph-x';
  const label = w => (w ? '恢复左右分栏' : '收起右侧工作台，让对话占满');
  x.textContent = '»';
  x.title = label(false);
  x.onclick = () => {
    const w = studio.classList.toggle('wide');
    x.textContent = w ? '«' : '»';
    x.title = label(w);
  };
  hd.appendChild(x);
}

function watchReports() {
  const tick = () => { pdfOnly(document); noFix(document); slimReport(document); chatSkin(document); };
  chatHead();
  tick();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 0);
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchReports);
} else watchReports();
})();
