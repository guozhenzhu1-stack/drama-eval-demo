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

/* ---------- 3. 报告与标注：导出改成分享，点一下生成分享链接 ---------- */
/* 报告由 report-neo.js 在多处按需重绘（快速评估的右栏、结果页切 tab、升级后重建），
   这里用观察器兜住每一次重绘，而不是包装 renderReport —— flat.js 之后才加载，
   flow.js 启动时的首次渲染包装不到。
   结果状态本来就全编码在网址里，所以「生成分享链接」= 取这份结果的链接：
   结果页用自己的 location，评估页右栏用对话里摘要条的基准链接 */
const SHARE_HINT = '链接带本次评估的全部状态，打开就是同一份结果（Demo 数据为演示用）。';

function shareHref(tab) {
  const go = document.querySelector('.res-out .ro-go');
  const base = document.body.dataset.page === 'result'
    ? location.href
    : (go && go.getAttribute('href')) || location.href;
  const u = new URL(base, location.href);
  if (tab) u.searchParams.set('tab', tab);
  return u.href;
}

function copyUrl(input, first) {
  const ok = () => say(first ? '分享链接已生成并复制到剪贴板' : '分享链接已复制');
  const manual = () => {
    try { input.focus(); input.select(); } catch (e) {}
    say('分享链接已生成，按 ⌘C 即可复制');
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(input.value).then(ok, manual);
    else manual();
  } catch (e) { manual(); }
}

function sharePop(btn, tab) {
  const wrap = btn.closest('.sh-wrap');
  let pop = wrap.querySelector('.sh-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'sh-pop';
    pop.innerHTML = `<b>分享链接已生成</b>
      <span class="sh-row"><input class="sh-url" readonly aria-label="分享链接">
        <button class="btn btn-sm sh-cp" type="button">复制</button></span>
      <span class="hint-inline">${SHARE_HINT}</span>`;
    wrap.appendChild(pop);
    pop.onclick = e => e.stopPropagation();
    pop.querySelector('.sh-cp').onclick = () => copyUrl(pop.querySelector('.sh-url'));
  }
  pop.querySelector('.sh-url').value = shareHref(tab);
  pop.hidden = false;
  copyUrl(pop.querySelector('.sh-url'), true);
}

const shareBtn = t => `<span class="sh-wrap"><button class="btn btn-sm sh-btn" type="button"
  data-sh="${t}" title="生成这份结果的分享链接">⤴ 分享</button></span>`;
const bindShare = box => {
  const b = box.querySelector('.sh-btn');
  b.onclick = e => { e.stopPropagation(); sharePop(b, b.dataset.sh); };
};

function shareBox(root) {
  /* 评估报告工具条：本期不提供分享/导出入口，整块摘掉——
     .rep-dl 前面是 .spacer（flex:1），摘掉后标题仍靠左，不留空档 */
  root.querySelectorAll('.rep-dl:not([data-flat-sh])').forEach(box => {
    box.dataset.flatSh = '1';
    box.remove();
  });
  /* 分集问题标注：本期不提供分享/导出入口，导出 Word / 导出 Excel 直接摘掉，也不换成分享按钮 */
  root.querySelectorAll('.annot-bar:not([data-flat-sh])').forEach(bar => {
    const ex = bar.querySelectorAll('[data-ex]');
    if (!ex.length) return;
    bar.dataset.flatSh = '1';
    ex.forEach(n => n.remove());
  });
  /* 分集列表底部「示例数据仅解析前 N 集」提示摘掉——annot.js 每次 render 会重建 #epList，
     所以不打持久标记，靠 tick 每轮把新出现的这条直接子级 .hint-inline 再删一次 */
  root.querySelectorAll('.ep-list > .hint-inline').forEach(n => n.remove());
}

/* 点别处收起分享气泡 */
document.addEventListener('click', () =>
  document.querySelectorAll('.sh-pop:not([hidden])').forEach(p => p.hidden = true));

/* ---------- 4. 本期只做问题检测：抹掉共享组件里的修改建议与改稿入口 ---------- */
/* report-neo.js / annot.js / result-page.js 由风格 A 与 v1 共用，不能改；
   这里在 flat 皮肤内按渲染结果打补丁：删建议字段、删改稿按钮、正文转只读 */
const swap = (el, re, to) => {
  if (!el || !re.test(el.innerHTML)) return;
  el.innerHTML = el.innerHTML.replace(re, to);
};

/* ---------- 评估报告：三级评分体系（S/A/B）+ 定性结论重写 + 详细评估去 tab 化 ----------
   评级映射改为 S(90-100) / A(80-89) / B(0-79)，从既有 score 数字重新计算，
   覆盖 mock 数据里按旧五级（S/A/B/C/D）给的字母；定性结论文字（整体 + 每个维度）
   全部换成新写的一段话，含判断依据与方向性建议，不做逐句改写级别的建议（那部分仍由 noFix 去掉） */
const gradeFromScore = s => s >= 90 ? 'S' : s >= 80 ? 'A' : 'B';

const OVERALL_SUM = '综合 66 分（B 级）。伏笔（52 分）与剧情逻辑（55 分）是本稿最弱的两个维度，均低于及格线，需优先修：伏笔（一年契约、代驾误会、男主持股）三条钩子均未闭环，逻辑上第 6 集「31% 股权」凭空取胜，是结局最大硬伤。节奏（62 分）与故事线（68 分）次要，格式规范（88 分）与台词（76 分）已达标，暂不用动。';

const DIM_SUM = {
  story: '「苏晚拿回苏氏」主线在第 1 集立住，但第 3、5 两集高潮场都由男主完成动作，女主在自己的爽点里全程被动，主线在这两集出现空转。判断依据：第 3 集冲突未产出主线抓手，第 5 集身份揭穿由陆决主导。建议：把这两场的关键动作改成女主自己完成，男主只做背书或助攻。',
  logic: '三处动机与能力断裂，最严重的是第 6 集「31% 股权」——前五集从未出现，且与第 1 集「苏家一夜破产」直接冲突，结局靠观众没见过的新信息取胜，弃剧风险最高。判断依据：第 1、3、6 集均有能力与资源上的断层。建议：把股权线索提前到第 1、3 集分两次埋，第 6 集只做回收。',
  pace: '首集钩子落在 1 分 40 秒，晚于付费短剧 45 秒的安全线；第 4 集资金危机在同一场内被情绪戏消解，未形成倒计时压力。判断依据：第 1 集退婚戏铺陈过长，第 4 集危机缺少后续进度提示。建议：母亲劝签压成一句前置钩子，交割危机加 72 小时倒计时并在第 5、6 集各提示一次。',
  role: '陆决的克制人设在第 2 集立得漂亮，但第 4 集越界行为没有触发事件，读起来是为了名场面强行改行为，人物不自洽。判断依据：第 2 集「我不碰你」与第 4 集玄关强吻之间无情感递进。建议：把董事会羞辱写成触发点，让第 4 集的破界是失控而非套路，并补一句自我确认台词。',
  line: '女主台词有锋利度，但男主与反派仍有「靠嘴说人设」的功能化表达，反派崩溃词偏套路，缺少个性与可信证据。判断依据：第 1 集男主自报能力过白，第 3 集反派台词只贬损不推进，第 5 集崩溃词为通用模板。建议：让反派台词落到具体证据上，崩溃场改用画面代替台词。',
  seed: '本稿最弱维度：三条钩子级伏笔（一年契约、代驾误会、男主持股）均未闭环，其中两条与已写设定直接冲突，是全稿性价比最低的浪费。判断依据：第 2 集契约后续 4 集未再提及，第 6 集男主持股来源与第 4 集设定矛盾。建议：三条伏笔各安排一次中途回收，男主持股改成第 4 集危机的直接结果。',
  fmt: '场景头、时间内外景、人物出场标注基本规范，唯一问题是少量动作描写混入了演员的内心判断，拍摄指向不够明确。判断依据：第 1 集「低头笑了一下」属内心判断而非可拍摄动作。建议：把这类描写换成镜别加动作的可执行写法，其余场次基本无需改动，是本稿最强项。',
  risk: '无涉政涉黄内容，唯一风险点在第 3 集：当众泼咖啡后没有第三方制止、也没有后果交代，命中平台「以暴制暴」常见退改项。判断依据：第 3 集冲突桥段缺少制止动作与代价承担。建议：把「泼咖啡」换成当场亮出证据的证据反制，爽感不降，同时避开退改风险。'
};

function gradeReport(root) {
  root.querySelectorAll('.rep-doc:not([data-flat-grade])').forEach(doc => {
    doc.dataset.flatGrade = '1';

    /* 顶部评级圆环整块去掉（.doc-headline 由 flat.css 隐藏）：评级与评分改成
       「总评结论」标题下单独加粗的一行。先从 .dh-tx 文本里读出分数（headline 虽被
       隐藏，文本还在 DOM 上），按新三级标准算出评级 */
    const scoreM = doc.querySelector('.dh-tx > b');
    const scoreNum = scoreM ? parseInt((scoreM.textContent.match(/综合\s*(\d+)\s*分/) || [])[1], 10) : NaN;
    const overallGrade = isNaN(scoreNum) ? '' : gradeFromScore(scoreNum);

    const lead = doc.querySelector('.doc-lead');
    if (lead) lead.textContent = OVERALL_SUM;
    const sec = doc.querySelector('.doc-sec');
    if (sec) {
      const p2 = sec.querySelectorAll('p')[1]; if (p2) p2.remove();
      /* 评级 + 评分单独加粗一行，放在「总评结论」标题下、结论正文之前 */
      if (overallGrade && !sec.querySelector('.rep-grade')) {
        const gl = document.createElement('div');
        gl.className = 'rep-grade';
        gl.innerHTML = `<b>综合评级 ${overallGrade} 级 · ${scoreNum} 分</b>`;
        const h2 = sec.querySelector('h2');
        if (h2) h2.insertAdjacentElement('afterend', gl);
        else sec.prepend(gl);
      }
    }

    /* 分维度得分条：每一行的 <em> 等级字母同样按新三级重算 */
    doc.querySelectorAll('.dim-bar').forEach(bar => {
      const b = bar.querySelector('.sc > b'), em = bar.querySelector('.sc > em');
      if (!b || !em) return;
      const s = parseInt(b.textContent, 10);
      if (isNaN(s)) return;
      const g = gradeFromScore(s);
      em.className = 'grade-' + g;
      em.textContent = g;
    });

    /* 分维度详细卡片：等级徽章按新三级重算，定性总结换成新写文案（先于 slimReport 移除 .db-g 之前处理）
       用维度名文字反查 dim id（DIM_NAME_TO_ID 由 js/mock.js 的 DIMS 生成），不依赖内联颜色字符串 */
    doc.querySelectorAll('.dim-block').forEach(card => {
      const nameEl = card.querySelector('.card-head > b');
      const dimId = nameEl ? DIM_NAME_TO_ID[nameEl.textContent.trim()] : null;
      const g = card.querySelector('.db-g');
      const q = card.querySelector('.db-q');
      let scoreNum = NaN;
      if (q) scoreNum = parseInt((q.textContent.match(/(\d+)\s*分/) || [])[1], 10);
      if (g && !isNaN(scoreNum)) {
        const nl = gradeFromScore(scoreNum);
        g.className = 'grade ' + gradeClsLocal(nl) + ' db-g';
        g.textContent = nl;
      }
      const sumP = card.querySelector('.db-sum p');
      if (sumP && dimId && DIM_SUM[dimId]) sumP.textContent = DIM_SUM[dimId];
    });
  });
}
const gradeClsLocal = g => 'grade-' + String(g || 'B').replace('+', '').replace('-', '');
const DIM_NAME_TO_ID = (typeof DIMS !== 'undefined' ? DIMS : []).reduce((m, d) => (m[d.name] = d.id, m), {});

/* ---------- 评估报告：两段式重排 ----------
   总评结论（评级卡 + 一 评估结论与评级依据，去掉分维度得分条）
   分维度详细评估（去掉定向投稿匹配度，只留分维度评估卡片）
   合规性评估整段不要——本期报告不再单独出这一节
   三块内容原来分散在「二」「三」两个 section 里，所以直接动 DOM 节点 */
function restructureReport(root) {
  root.querySelectorAll('.rep-doc:not([data-flat-restruct])').forEach(doc => {
    doc.dataset.flatRestruct = '1';
    const page = doc.querySelector('.doc-page');
    if (!page) return;
    const secs = [...page.querySelectorAll(':scope > .doc-sec')];
    const secDims = secs[1];   /* 二 分维度得分 */
    const secDetail = secs[2]; /* 三 详细评估：定向投稿匹配度 / 合规性评估 / 分维度评估 */
    if (!secDetail) return;

    /* 总评结论：不需要分维度得分条 */
    if (secDims) secDims.remove();

    /* 详细评估：定向投稿匹配度整块不要 */
    const matchPanel = secDetail.querySelector('.rpanel[data-rp="match"]');
    if (matchPanel) matchPanel.remove();

    /* 合规性评估整段不要 */
    const riskPanel = secDetail.querySelector('.rpanel[data-rp="risk"]');
    if (riskPanel) riskPanel.remove();

    /* 分维度评估留在「三」里，标题不用再说「三」（前面的匹配度/合规已经搬走或消失） */
    const h2 = secDetail.querySelector(':scope > h2');
    if (h2) h2.innerHTML = '<i>二</i>分维度详细评估';

    /* dims 面板自己的 <h3><i>3.x</i>分维度评估…</h3> 是旧的三级 tab 编号，
       现在这个面板是「二」里唯一剩下的内容，h2 已经带了「二」，h3 不需要
       再重复一层编号，否则会跟 h2 重叠成「二 / 3.3」两套序号 —— 直接摘掉 <i> */
    const dimsPanel = secDetail.querySelector('.rpanel[data-rp="dims"]');
    const dimsH3 = dimsPanel ? dimsPanel.querySelector(':scope > .doc-h3') : null;
    if (dimsH3) {
      const i = dimsH3.querySelector('i');
      if (i) i.remove();
    }
  });
}

/* ---------- 评估结果只展示 P0/P1 ----------
   分维度详细评估的问题卡片只保留致命(P0)/严重(P1)，一般(P2)/轻微(P3)不再列出；
   卡头「问题 N 处」跟着只算保留下来的 P0/P1；某维度全被过滤空了，给一句占位说明 */
function majorOnly(root) {
  root.querySelectorAll('.rep-doc:not([data-flat-major])').forEach(doc => {
    doc.dataset.flatMajor = '1';
    doc.querySelectorAll('.dim-block').forEach(block => {
      const list = block.querySelector('.db-list');
      if (!list) return;
      list.querySelectorAll('.db-iss').forEach(iss => {
        const sev = (iss.querySelector('.sev') || {}).textContent || '';
        if (!/P0|P1/.test(sev)) iss.remove();
      });
      const cnt = block.querySelector('.db-cnt b');
      if (cnt) cnt.textContent = list.querySelectorAll('.db-iss').length;
      if (!list.querySelector('.db-iss') && !list.querySelector('.db-none'))
        list.innerHTML = '<div class="db-none">本维度无致命（P0）或严重（P1）级问题。</div>';
    });
  });
}

function noFix(root) {
  /* 报告：分维度里的「建议：…」与合规里的「整改建议：…」 */
  root.querySelectorAll('.di-fix, .cmp-fix').forEach(n => n.remove());
  /* 分集问题标注：整本 / 本集 / 单条修复入口，划选下指令条 */
  root.querySelectorAll('#fixBook, #fixEp, [data-act="fix"], #selBar, .fix-summary').forEach(n => n.remove());
  /* 问题卡「忽略」/「恢复」按钮：本期只做检测展示，不做筛选管理 */
  root.querySelectorAll('[data-act="ignore"], [data-act="restore"]').forEach(n => n.remove());
  /* 已忽略的问题不再是一个可操作的状态，折叠区也没有意义了 */
  root.querySelectorAll('.ignored-zone').forEach(n => n.remove());
  /* 问题标签定位：去掉正文里的下划线/跳转锚点与右侧问题卡的点击定位，两边各自静态展示 */
  root.querySelectorAll('mark.iss:not([data-flat-mk])').forEach(m => {
    m.dataset.flatMk = '1';
    m.onclick = null;
    m.classList.add('iss-static');
  });
  root.querySelectorAll('.iss-card:not([data-flat-ic])').forEach(c => {
    c.dataset.flatIc = '1';
    c.onclick = null;
    c.classList.add('no-jump');
  });
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
  /* 页脚只保留报告号与生成时间，AI 免责/说明那句整条撤掉 */
  root.querySelectorAll('.doc-foot > span:not(.doc-foot-no)').forEach(n => n.remove());
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
       信息表里的体量、维度、问题数在结论段里都说了，生成时间与报告号在页脚；
       剧本名下方的「编剧 … · 制作方式 · 地区」署名行也不再展示 */
    doc.querySelectorAll('.doc-kicker, .doc-info, .doc-byline').forEach(n => n.remove());
    /* 结论那句评级判词已经在上面的评级卡里，段首不用再说一遍 */
    const lead = doc.querySelector('.doc-lead');
    if (lead) lead.innerHTML = lead.innerHTML.replace(/——[^。]*。\s*$/, '。');

    /* 一：只留结论。评级依据是对结论段的复述，上探路径属于改法建议，本期不出 */
    const sec = doc.querySelector('.doc-sec');
    if (sec) {
      const h2 = sec.querySelector('h2');
      if (h2) h2.innerHTML = '<i>一</i>总评结论';
      sec.querySelectorAll('h3').forEach(h => {
        let n = h.nextElementSibling;
        while (n && n.tagName === 'P') { const x = n.nextElementSibling; n.remove(); n = x; }
        h.remove();
      });
    }

    /* 「本次共评估 N 个维度…」「共 N 部分，点下方标签切换查看」这类话不用写出来 */
    doc.querySelectorAll('.doc-note').forEach(n => n.remove());
    /* 详细评估的去 tab 化（标签栏隐藏、.rpanel 顺序摊开）由 flat.css 的 CSS 规则统一处理，
       两段式重排（去掉分维度得分条 / 匹配度 / 合规搪位）由 restructureReport 处理，
       这里不再摘 .doc-h3 */
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

    /* 分维度：一行里同时给等级、质量评级、分数与严重度分布；等级徽章（.db-g）现在由 gradeReport
       按新三级标准重算后保留展示，这里只去掉「质量评级...·」前缀文字与严重度分布图标 */
    doc.querySelectorAll('.dim-block > .card-head').forEach(hd => {
      hd.querySelectorAll('.sev').forEach(n => n.remove());
      const q = hd.querySelector('.db-q');
      if (q) q.textContent = q.textContent.replace(/^\s*质量评级[^·]*·\s*/, '');
    });
    doc.querySelectorAll('.db-sum .rs-tag').forEach(n => n.remove());
    /* 本期不做分集问题标注的跳转入口，这句提示没有落点，直接摘掉整个 .rp-note */
    const dn = doc.querySelector('.rpanel[data-rp="dims"] .rp-note');
    if (dn) dn.remove();
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

/* 右侧工作台自带的关闭按钮（快速评估默认摊开报告，用户可以自己收起）：
   与 »/« 走同一套 .wide 机制，收起后点对话里的报告文件卡片（reportFileHtml）再摊开 */
function pwClose() {
  const btn = $('#pwClose');
  if (!btn || btn.dataset.pwx) return;
  btn.dataset.pwx = '1';
  btn.onclick = () => {
    const studio = $('.studio');
    if (studio) studio.classList.add('wide');
  };
}

/* ---------- 7. 评估深度：说明文案本身就是选项，去掉上方的胶囊按钮 ---------- */
/* 字段由 neo.js 的 injectDepth 注入（与风格 A 共用，不能改）：
   .lbl + [data-group=depth] 胶囊组 + .depth-note 里两段说明。
   v17：改成一行开关——label 只留"评估深度"+ 当前选中项的说明句，右边一个两态switch；
   胶囊组仍整块搬进隐藏槽位保活 groupValue，两段 .dn-row 说明文字挪进 switch 下面的一行提示里，
   不再各占一段、不再需要点说明块选择 */
function depthPick(root) {
  root.querySelectorAll('.neo-depth-fld:not([data-flat-dp])').forEach(fld => {
    const grp = fld.querySelector('[data-group=depth]');
    const note = fld.querySelector('.depth-note');
    const rows = note ? [...note.querySelectorAll('.dn-row')] : [];
    if (!grp || !rows.length) return;
    fld.dataset.flatDp = '1';

    const body = fld.closest('.card-body') || fld.parentElement;
    let slot = body.querySelector('.neo-locked');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'neo-locked';
      slot.hidden = true;
      body.appendChild(slot);
    }
    slot.appendChild(grp);

    const info = rows.map(r => ({
      name: r.querySelector('b').textContent.trim(),
      out: r.querySelector('.dn-out').textContent.trim(),
      text: r.querySelector('span').textContent.trim()
    }));
    const quick = info.find(x => x.name === '快速评估') || info[0];
    const deep = info.find(x => x.name === '深度评估') || info[1];

    const lbl = fld.querySelector('.lbl');
    note.remove();
    const sw = document.createElement('div');
    sw.className = 'dp-sw';
    sw.innerHTML = `
      <div class="dp-seg" role="group" id="dpSeg">
        <button class="dp-opt" type="button" aria-pressed="false" data-k="quick">
          <span class="dp-opt-n">${quick.name}</span><span class="dp-opt-o" id="dpOutQ"></span>
        </button>
        <button class="dp-opt" type="button" aria-pressed="false" data-k="deep">
          <span class="dp-opt-n">${deep.name}</span><span class="dp-opt-o" id="dpOutD"></span>
        </button>
      </div>
      <p class="dp-tx" id="dpTx"></p>`;
    fld.appendChild(sw);
    const optQ = $('.dp-opt[data-k=quick]', sw), optD = $('.dp-opt[data-k=deep]', sw), tx = $('#dpTx', sw);
    $('#dpOutQ', sw).textContent = quick.out;
    $('#dpOutD', sw).textContent = deep.out;

    const paint = deepOn => {
      const cur = deepOn ? deep : quick;
      optQ.setAttribute('aria-pressed', String(!deepOn));
      optD.setAttribute('aria-pressed', String(deepOn));
      tx.textContent = cur.text;
    };
    const pick = deepOn => {
      paint(deepOn);
      grp.querySelectorAll('.chip').forEach(c =>
        c.setAttribute('aria-pressed', String(c.dataset.v === (deepOn ? deep.name : quick.name))));
    };
    optQ.onclick = () => pick(false);
    optD.onclick = () => pick(true);

    /* 默认选中项以胶囊组的现值为准（neo.js 默认深度评估） */
    const cur = grp.querySelector('.chip[aria-pressed=true]');
    paint(!cur || cur.dataset.v === deep.name);
    if (lbl) {
      const req = lbl.querySelector('.req'), hint = lbl.querySelector('.hint-inline');
      lbl.textContent = '评估深度 ';
      if (req) lbl.appendChild(req);
      if (hint) lbl.appendChild(hint);
    }
  });
}


/* ---------- 8. 深度评估的完整结果：不再开新页面，改成对话上方的浮层 ---------- */
/* 结果正文仍由结果页那套代码渲染（result.html + result-page.js，与风格 A 共用），
   这里把它嵌进浮层的 iframe：状态本来就全在网址里，换个容器即可。
   neo.js 的 openResHref 是顶层函数声明（即 window 上的属性），改写它就同时接住了
   摘要条主入口、「直接跳到…」按钮与 ⌘K 面板三处入口 */
const inResult = () => document.body.dataset.page === 'result';
const embedded = () => window.parent !== window && inResult();

function layer() {
  let el = $('#resLayer');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'res-layer';
  el.id = 'resLayer';
  el.hidden = true;
  el.innerHTML = `
    <div class="rl-mask" data-rl-close></div>
    <div class="rl-panel" role="dialog" aria-modal="true" aria-label="评估结果">
      <div class="rl-head">
        <b class="rl-t">完整评估结果</b>
        <span class="rl-sub">报告与分集问题标注按上方 tab 切换</span>
        <span class="spacer"></span>
        <button class="rl-x" type="button" data-rl-close title="关闭（Esc）">✕ 关闭</button>
      </div>
      <iframe class="rl-frame" id="rlFrame" title="完整评估结果"></iframe>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target.closest('[data-rl-close]')) shutLayer(); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !el.hidden) { e.preventDefault(); shutLayer(); }
  });
  return el;
}

function showLayer(href) {
  const el = layer(), fr = $('#rlFrame', el);
  if (fr.dataset.href !== href) {
    fr.dataset.href = href;
    fr.src = href;
  }
  el.hidden = false;
  document.body.classList.add('rl-on');
  requestAnimationFrame(() => el.classList.add('in'));
  $('.rl-x', el).focus();
}

function shutLayer() {
  const el = $('#resLayer');
  if (!el || el.hidden) return;
  el.classList.remove('in');
  el.hidden = true;
  document.body.classList.remove('rl-on');
}

/* 摘要条主入口与「直接看…」按钮：neo.js 里开新窗口的 openResHref 包在 IIFE 里改不到，
   所以在捕获阶段先接下这些点击（neo.js 的委托是冒泡阶段，stopPropagation 就够） */
addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('.res-out .ro-go, [data-res-jump]');
  if (!t || inResult()) return;
  const go = document.querySelector('.res-out .ro-go');
  const base = t.matches('.ro-go') ? t.getAttribute('href') : go && go.getAttribute('href');
  if (!base) return;
  const k = t.dataset.resJump;
  if (k && k !== 'report' && window.NEO_DEPTH === 'quick') {
    e.preventDefault(); e.stopPropagation();
    say('分集问题标注是深度评估的产物，升级后即可查看');
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  showLayer(k ? base.replace(/([?&]tab=)\w+/, '$1' + k) : base);
}, true);

/* 兜底：⌘K 面板等入口仍走 window.open，把结果页的窗口请求收进浮层。
   neo.js 拿返回值登记到 RES_WINS（返回 null 会退化成整页跳转），故回一个可用的替身 */
const origOpen = window.open;
window.open = function (url, ...rest) {
  const href = url == null ? '' : String(url);
  /* 浮层里的那份结果页要换视角时就地跳转，别再往外弹窗口 */
  if (/result\.html/.test(href) && embedded()) {
    location.replace(href);
    return { closed: false, focus() {}, close() {} };
  }
  if (/result\.html/.test(href) && !inResult()) {
    showLayer(href);
    return {
      closed: false,
      focus() {},
      close() { shutLayer(); },
      /* 评估页改了数据会 ping 已打开的结果页，转给浮层里的那份 */
      get neoResultRefresh() {
        const cw = $('#rlFrame') && $('#rlFrame').contentWindow;
        return cw && typeof cw.neoResultRefresh === 'function'
          ? cw.neoResultRefresh.bind(cw) : undefined;
      }
    };
  }
  return origOpen.apply(window, [url, ...rest]);
};

/* 入口文案：不再是「新页面」 */
function resEntry(root) {
  root.querySelectorAll('.res-out:not([data-flat-ro])').forEach(box => {
    box.dataset.flatRo = '1';
    const go = box.querySelector('.ro-go');
    if (go) {
      go.title = '在当前页的浮层里查看完整评估结果';
      go.removeAttribute('target');
    }
    box.querySelectorAll('.ro-go i, .res-jump i').forEach(i => i.textContent = '⤢');
    box.querySelectorAll('.res-jump').forEach(b =>
      b.innerHTML = b.innerHTML.replace('在结果页查看', '直接看'));
    const note = box.querySelector('.ro-note');
    if (note) note.textContent = note.textContent
      .replace('都在同一个结果页，按 tab 切换', '都在同一个浮层里，按 tab 切换')
      .replace('都在同一个结果页', '都在同一个浮层里');
  });
}

/* 嵌在浮层里时，结果页自己的顶栏（含「返回评估页」）是多余的 */
function embedTrim() {
  if (!embedded()) return;
  document.body.classList.add('rl-embed');
  const tb = $('#topbar');
  if (tb) tb.hidden = true;
}

/* 深度评估完成后，对话里的自然语言总结下面不再摆结果摘要卡片（评级/KPI/跳转），
   只留「查看完整评估结果」这一个按钮——节点本身不摘掉，soloChat 的 HAS_RESULT 还要认它 */
function resSlim(root) {
  root.querySelectorAll('.res-out.in-chat:not([data-flat-rs])').forEach(box => {
    box.dataset.flatRs = '1';
    box.classList.add('flat-slim');
  });
}

function watchReports() {
  const tick = () => { shareBox(document); noFix(document); gradeReport(document); restructureReport(document);
    majorOnly(document); slimReport(document); chatSkin(document); depthPick(document); resEntry(document); resSlim(document); pwClose(); };
  embedTrim();
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
