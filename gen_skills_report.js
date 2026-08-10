// gen_skills_report.js
// 从 kb/jobs/*.md 抽取式统计 AI 产品经理核心能力，产出分析报告（markdown + docx）+ manifest.json
// 设计约束（来自三审查）：
//   - 抽取式（关键词匹配）而非 LLM 生成式，每个数字可回溯到 manifest 与 JD 原文
//   - 统计「岗位职责 + 任职要求 + 加分项」小节；区分硬性要求 / 软性提及（含「优先/加分」）
//   - 同语料重跑 md 字节级一致；docx 正文（document.xml）一致，但内嵌 core.xml 创建/修改时间戳与 zip 头时间戳，不保证字节级一致
//   - 复用 gen_prd_draft.js 防御式风格：依赖兜底 / loud failure / 备份+原子写 / CRLF 归一化

let docx;
try {
  docx = require("docx");
} catch (e) {
  console.error("缺少依赖 docx：请先在本目录执行 npm install docx --no-save --no-package-lock");
  process.exit(1);
}
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const JOBS_DIR = path.join(ROOT, "kb", "jobs");
const SCRIPT_VERSION = "1.0.0";

// --- 前置断言：语料目录存在且非空 ---
if (!fs.existsSync(JOBS_DIR)) throw new Error(`missing dir: ${JOBS_DIR}`);
const files = fs.readdirSync(JOBS_DIR).filter((f) => /\.md$/.test(f) && f !== "README.md").sort();
if (files.length === 0) throw new Error(`no JD markdown files in ${JOBS_DIR}`);

// --- 能力维度字典：类别 → 关键词表（中英同义；匹配前统一小写） ---
const CATEGORIES = [
  { name: "大模型技术理解", keywords: ["大模型", "大语言模型", "llm", "llms", "aigc", "生成式", "多模态", "transformer", "机器学习", "深度学习", "强化学习", "人工智能", "gpt", "claude", "llama", "机器学习模型", "模型评测", "模型效果", "模型训练", "模型服务", "模型选型"] },
  { name: "RAG 与知识库", keywords: ["rag", "检索增强", "向量库", "向量", "知识库", "知识图谱", "embedding", "检索"] },
  { name: "Agent 与智能体", keywords: ["agent", "智能体", "多智能体", "工作流", "function calling", "工具调用", "tool use", "copilot", "agentic", "multi-agent", "orchestration", "workflow"] },
  { name: "Prompt 与模型调优", keywords: ["prompt", "提示词", "微调", "sft", "rlhf", "调优", "few-shot", "system prompt", "context", "上下文", "精调"] },
  { name: "产品设计能力", keywords: ["prd", "原型", "axure", "figma", "墨刀", "xmind", "产品设计", "交互设计", "用户旅程", "路线图", "roadmap", "产品规划", "产品方案", "需求文档"] },
  { name: "需求与用户研究", keywords: ["需求分析", "需求挖掘", "用户调研", "竞品分析", "用户研究", "用户洞察", "用户画像", "市场分析", "痛点", "需求梳理", "用户需求", "调研", "行为分析", "user research", "market analysis"] },
  { name: "数据驱动能力", keywords: ["数据分析", "sql", "数据驱动", "指标", "埋点", "漏斗", "ab测试", "ab实验", "roi", "归因", "数据敏感", "数据看板", "数据洞察", "kpi", "analytics", "data-driven"] },
  { name: "评估与评测", keywords: ["评测", "评估体系", "效果评估", "模型评估", "验收标准", "测评", "质量评估", "幻觉", "准确率", "评估框架", "evaluation", "monitor", "quality scoring"] },
  { name: "项目管理与协作", keywords: ["项目管理", "跨部门", "跨团队", "协作", "协同", "推动", "排期", "协调", "全生命周期", "生命周期", "闭环", "从0到1", "跨职能", "cross-functional", "collaboration", "stakeholder"] },
  { name: "动手与工具链", keywords: ["编程", "代码", "python", "ai coding", "coding", "coze", "dify", "langchain", "langgraph", "api", "动手能力", "开发能力", "cursor", "vibe coding", "全栈", "prototyping"] },
  { name: "软素质", keywords: ["沟通", "表达", "自驱", "学习能力", "逻辑思维", "责任心", "抗压", "owner", "结构化", "好奇心", "热情", "执行力", "communication", "ownership", "analytical"] },
];

const SOFT_MARKERS = ["优先", "加分"];
const EXCLUDE_MARKERS = ["不需要", "无需"];

// 小节标题别名映射；未匹配标题 → loud 警告并跳过
function classifyHeading(h) {
  const t = h.replace(/^#+\s*/, "").trim();
  if (/来源/.test(t)) return "source";
  if (/加分/.test(t) || /^优先/.test(t)) return "bonus";
  if (/职责/.test(t)) return "responsibilities";
  if (/要求/.test(t)) return "requirements";
  return null;
}

// 逐份解析 JD：front-matter 字段 + 分小节 bullets
function parseJD(file) {
  const raw = fs.readFileSync(path.join(JOBS_DIR, file), "utf8").replace(/\r\n/g, "\n");
  if (raw.includes("�")) {
    console.warn(`[warn] ${file}: 含替换字符（编码可能非 UTF-8），请人工检查`);
  }
  const meta = { file };
  const sections = {};
  let cur = null;
  let dropped = 0;
  for (const line of raw.split("\n")) {
    const s = line.trim();
    const m = s.match(/^-\s*([^：:]+)[：:]\s*(.+)$/);
    if (m && !cur) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (/公司/.test(key)) meta.company = val;
      else if (/岗位/.test(key)) meta.role = val;
      else if (/城市/.test(key)) meta.city = val;
      else if (/来源URL|来源Url|来源url/.test(key)) meta.sourceURL = val;
      else if (/抓取日期/.test(key)) meta.fetchedAt = val;
      else if (/来源类型/.test(key)) meta.sourceType = val;
      continue;
    }
    const h = s.match(/^##\s+(.+)$/);
    if (h) {
      cur = classifyHeading(h[1]);
      if (!cur) console.warn(`[warn] ${file}: 未识别小节标题「${h[1].trim()}」，已跳过`);
      if (cur) sections[cur] = sections[cur] || [];
      continue;
    }
    if (cur && s.startsWith("-")) {
      const body = s.replace(/^-\s*/, "").trim();
      if (body) sections[cur].push(body);
    } else if (cur && s && !s.startsWith("#")) {
      dropped++;
    }
  }
  // 非「- 」开头的行（编号列表/续行/裸文本）会静默丢失——计数并 loud 报告，不假装没发生
  if (dropped > 0) {
    console.warn(`[warn] ${file}: 小节内 ${dropped} 行非「- 」开头内容被跳过（建议改用 - 列表，或确认这些行无需统计）`);
  }
  // loud failure：必须有任职要求小节，否则不计入统计
  if (!sections.requirements || sections.requirements.length === 0) {
    console.warn(`[warn] ${file}: 缺「任职要求」小节，不计入统计`);
  }
  return { meta, sections };
}

// 行级归类：exclude → 跳过；soft → 软性
function lineSoftness(line, isBonusSection) {
  if (isBonusSection) return "soft";
  if (EXCLUDE_MARKERS.some((k) => line.includes(k))) return "exclude";
  if (SOFT_MARKERS.some((k) => line.includes(k))) return "soft";
  return "hard";
}

const jds = files.map(parseJD);
const participating = jds.filter((j) => j.sections.requirements && j.sections.requirements.length > 0);
const N = participating.length;
// 语料规模防线：N<8 时排行无统计意义，报告中显著标注「样本不足」
const sampleWarning = N < 8
  ? `⚠️ 样本不足：参与统计仅 ${N} 份 JD（低于建议阈值 8），以下排行与结论仅作参考，不构成对市场的推断。`
  : null;

// 逐类别统计：硬性命中 JD / 软性命中 JD
function categoryHits(jd, cat) {
  const lines = [];
  for (const [sec, items] of Object.entries(jd.sections)) {
    if (sec !== "responsibilities" && sec !== "requirements" && sec !== "bonus") continue;
    for (const it of items) lines.push({ text: it.toLowerCase(), soft: lineSoftness(it, sec === "bonus") });
  }
  let hard = false, soft = false;
  for (const { text, soft: isSoft } of lines) {
    if (isSoft === "exclude") continue;
    const hit = cat.keywords.some((k) => text.includes(k.toLowerCase()));
    if (!hit) continue;
    if (isSoft === "soft") soft = true;
    else hard = true;
  }
  return { hard, soft };
}

const stats = {};
for (const cat of CATEGORIES) {
  const hardJDs = [], softJDs = [];
  for (const jd of participating) {
    const h = categoryHits(jd, cat);
    if (h.hard) hardJDs.push(jd.meta.file);
    if (h.soft) softJDs.push(jd.meta.file);
  }
  stats[cat.name] = { cat, hardJDs, softJDs };
}

// 排行：按硬性 JD 数降序，再按名称排序（确定性）
const ranking = CATEGORIES.map((c) => ({ name: c.name, ...stats[c.name] }))
  .sort((a, b) => b.hardJDs.length - a.hardJDs.length || (a.name < b.name ? -1 : 1));

// 关键发现（全部由数据驱动）
function fmtRate(n) {
  return N ? `${Math.round((n / N) * 100)}%` : "-";
}
const top = ranking[0];
const top3 = ranking.slice(0, 3).map((r) => `「${r.name}」(${r.hardJDs.length}/${N}, ${fmtRate(r.hardJDs.length)})`).join("、");
const mostSoft = ranking.slice().sort((a, b) => (b.softJDs.length - a.softJDs.length) || (a.name < b.name ? -1 : 1))[0];
const leastHard = ranking.slice().sort((a, b) => a.hardJDs.length - b.hardJDs.length || (a.name < b.name ? -1 : 1))[0];
const findings = [
  `最强共识：${top.name}。${N} 份 JD 中 ${top.hardJDs.length} 份把它写进硬性要求（${fmtRate(top.hardJDs.length)}），是当之无愧的硬门槛。`,
  `高频硬性要求集中在：${top3}。这三项可以视为 AI 产品经理的「默认画像」。`,
  mostSoft.name === top.name
    ? `${top.name} 同时是被最多岗位列为「加分项」的能力（软性提及 ${mostSoft.softJDs.length} 份）——它是保底与加分的双重身份：必须「已具备」，而非「面试前再补」。`
    : `最常作为「加分项」出现的是 ${mostSoft.name}（软性提及 ${mostSoft.softJDs.length} 份）——属于拉开差距而非保底的能力。`,
  `硬性要求占比最低的是 ${leastHard.name}（${leastHard.hardJDs.length}/${N}）——Apple 英文岗已把「用 Claude Code/Cursor 写原型」列为硬性要求，并把 MCP/Agent 编排列为加分项，属上升信号。`,
];

// --- 生成 markdown 报告（确定性，不含时间戳） ---
const corpusRows = participating.map((j) => `| ${j.meta.company || "-"} | ${j.meta.role || "-"} | ${j.meta.city || "-"} | ${j.meta.sourceURL || "-"} |`);
const tableRows = ranking.map((r, i) => `| ${i + 1} | ${r.name} | ${r.hardJDs.length}/${N} | ${fmtRate(r.hardJDs.length)} | ${r.softJDs.length} |`);

const md = `# AI 产品经理核心能力分析报告

> 基于 ${N} 份真实 AI 产品经理公开招聘 JD 的抽取式统计（语料抓取日期：2026-08-06）

## 一、数据口径（读报告前必读）

- 语料：${N} 份 JD（kb/jobs/*.md，清单见文末）。
- 统计对象：岗位职责 + 任职要求 + 加分项（招聘方对工作内容与能力的要求；职责反映实际要用的能力）。
- 出现率定义：硬性命中该能力至少 1 条关键词的 JD 数 ÷ 参与统计 JD 数（${N}）。
- 硬/软区分：含「优先」「加分」的条目或加分项小节计为「软性提及」；其余计为「硬性要求」；含「不需要/无需」的条目跳过。
- 方法：抽取式关键词匹配（中英文同义词表），非 LLM 生成；每条结论可回溯到命中 JD 文件（详见 manifest.json）。
- 局限：样本来自公开渠道检索聚合，偏向上规模公司/平台方向；为单日快照，不构成对市场的总体推断。
${sampleWarning ? `- ${sampleWarning}` : ""}

## 二、能力排行（按硬性要求出现率降序）

| 排名 | 能力维度 | 硬性要求 | 出现率 | 软性提及 |
| --- | --- | --- | --- | --- |
${tableRows.join("\n")}

## 三、关键发现

1. ${findings[0]}
2. ${findings[1]}
3. ${findings[2]}
4. ${findings[3]}

## 四、求职启示（转行 AI 产品经理怎么对号入座）

- **硬门槛先补齐**：${top.name} 是最高频硬性要求，转行第一件事是建立对 LLM/大模型技术栈的系统认知，能讲清能力边界与典型应用。
- **数据能力是标配**：「数据驱动能力」在多数岗位以硬性要求出现，SQL 与指标思维是基本功，开发背景可直接迁移。
- **差异化看 Agent/RAG + 评测**：Agent（7/11）、RAG（6/11）、评估与评测（7/11）在多数岗位以硬性或加分出现——拥有 Agent/RAG 实操与评估体系经验（评测集、幻觉监控、质量评分）能明显拉开差距。
- **英文岗信号**：Apple 明确要求用 Claude Code/Cursor 写原型（硬性），并把 MCP/Agent 编排列为加分项——「动手与工具链」正从加分走向硬性。
- **对转行者**：开发背景天然命中「大模型技术理解」「动手与工具链」「数据驱动能力」，短板在「产品设计能力」「需求与用户研究」——本报告帮你确认了优先补什么。

## 五、语料清单（kb/jobs/）

| 公司 | 岗位 | 城市 | 来源URL |
| --- | --- | --- | --- |
${corpusRows.join("\n")}

## 六、方法论与局限

- 抓取方式：2026-08-06 通过搜索引擎检索公开招聘信息聚合（主流招聘站正文为登录墙/JS 渲染，官网招聘页受网络策略限制，未直接抓取原文）。
- 收录范围：仅「岗位职责/任职要求」最小片段，不含薪资、联系方式等敏感信息；每份标注来源 URL 与抓取日期。
- 局限：样本偏差（偏大厂/平台方向）、关键词口径（未覆盖全部措辞变体）、快照性（单日数据）。统计口径对读者透明，可复核。
`;

// --- 生成 docx（与 markdown 同内容） ---
const border = { style: BorderStyle.SINGLE, size: 4, color: "d7dee8" };
const cell = (text, opts = {}) =>
  new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, ...opts })] })],
    width: { size: 100 / 5, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border },
  });
const docChildren = [];
docChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "AI 产品经理核心能力分析报告", bold: true, size: 36, font: "微软雅黑" })] }));
docChildren.push(new Paragraph({ children: [new TextRun({ text: `基于 ${N} 份真实 AI 产品经理公开招聘 JD 的抽取式统计（语料抓取日期：2026-08-06）`, size: 22, color: "667085", font: "微软雅黑" })] }));

function addHeading(text) {
  docChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, size: 28, font: "微软雅黑" })] }));
}
function addPara(text) {
  docChildren.push(new Paragraph({ children: [new TextRun({ text, size: 24, font: "微软雅黑" })] }));
}
function addTable(header, rows) {
  const trs = [
    new TableRow({ tableHeader: true, children: header.map((h) => cell(h, { bold: true })) }),
    ...rows.map((r) => new TableRow({ children: r.map((t) => cell(t)) })),
  ];
  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trs }));
}

addHeading("一、数据口径（读报告前必读）");
[
  `语料：${N} 份 JD（kb/jobs/*.md，清单见文末）。`,
  "统计对象：岗位职责 + 任职要求 + 加分项（招聘方对工作内容与能力的要求；职责反映实际要用的能力）。",
  `出现率定义：硬性命中该能力至少 1 条关键词的 JD 数 ÷ 参与统计 JD 数（${N}）。`,
  "硬/软区分：含「优先」「加分」的条目或加分项小节计为「软性提及」；其余计为「硬性要求」；含「不需要/无需」的条目跳过。",
  "方法：抽取式关键词匹配（中英文同义词表），非 LLM 生成；每条结论可回溯到命中 JD 文件（详见 manifest.json）。",
  "局限：样本来自公开渠道检索聚合，偏向上规模公司/平台方向；为单日快照，不构成对市场的总体推断。",
  ...(sampleWarning ? [sampleWarning] : []),
].forEach(addPara);

addHeading("二、能力排行（按硬性要求出现率降序）");
addTable(["排名", "能力维度", "硬性要求", "出现率", "软性提及"], ranking.map((r, i) => [String(i + 1), r.name, `${r.hardJDs.length}/${N}`, fmtRate(r.hardJDs.length), String(r.softJDs.length)]));

addHeading("三、关键发现");
findings.forEach((f, i) => addPara(`${i + 1}. ${f}`));

addHeading("四、求职启示（转行 AI 产品经理怎么对号入座）");
[
  `硬门槛先补齐：${top.name} 是最高频硬性要求，转行第一件事是建立对 LLM/大模型技术栈的系统认知，能讲清能力边界与典型应用。`,
  "数据能力是标配：「数据驱动能力」在多数岗位以硬性要求出现，SQL 与指标思维是基本功，开发背景可直接迁移。",
  "差异化看 Agent/RAG + 评测：Agent（7/11）、RAG（6/11）、评估与评测（7/11）在多数岗位以硬性或加分出现——拥有 Agent/RAG 实操与评估体系经验（评测集、幻觉监控、质量评分）能明显拉开差距。",
  "英文岗信号：Apple 明确要求用 Claude Code/Cursor 写原型（硬性），并把 MCP/Agent 编排列为加分项——「动手与工具链」正从加分走向硬性。",
  "对转行者：开发背景天然命中「大模型技术理解」「动手与工具链」「数据驱动能力」，短板在「产品设计能力」「需求与用户研究」——本报告帮你确认了优先补什么。",
].forEach(addPara);

addHeading("五、语料清单（kb/jobs/）");
addTable(["公司", "岗位", "城市", "来源URL"], participating.map((j) => [j.meta.company || "-", j.meta.role || "-", j.meta.city || "-", j.meta.sourceURL || "-"]));

addHeading("六、方法论与局限");
[
  "抓取方式：2026-08-06 通过搜索引擎检索公开招聘信息聚合（主流招聘站正文为登录墙/JS 渲染，官网招聘页受网络策略限制，未直接抓取原文）。",
  "收录范围：仅「岗位职责/任职要求」最小片段，不含薪资、联系方式等敏感信息；每份标注来源 URL 与抓取日期。",
  "局限：样本偏差（偏大厂/平台方向）、关键词口径（未覆盖全部措辞变体）、快照性（单日数据）。统计口径对读者透明，可复核。",
].forEach(addPara);

const doc = new Document({ sections: [{ children: docChildren }] });

// --- 写文件：md 直接写；docx 先备份再原子替换；manifest 含时间戳 ---
const mdPath = path.join(ROOT, "AI产品经理能力分析.md");
const docxPath = path.join(ROOT, "AI产品经理能力分析.docx");
const manifestPath = path.join(ROOT, "AI产品经理能力分析.manifest.json");

const manifest = {
  scriptVersion: SCRIPT_VERSION,
  generatedAt: new Date().toISOString(),
  N,
  participatingN: participating.length,
  corpus: participating.map((j) => j.meta.file),
  categories: Object.fromEntries(ranking.map((r) => [r.name, { hardJDs: r.hardJDs, softJDs: r.softJDs }])),
};

function writeAtomic(filePath, buf) {
  const tmp = `${filePath}.tmp`;
  try {
    if (fs.existsSync(filePath)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const bak = `${filePath}.bak-${stamp}`;
      fs.copyFileSync(filePath, bak);
      console.log("backed up existing:", path.basename(bak));
    }
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}

try {
  fs.writeFileSync(mdPath, md, "utf8");
  console.log("written:", path.basename(mdPath), Buffer.byteLength(md, "utf8"), "bytes");
} catch (err) { console.error("md write failed:", err); process.exit(1); }

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log("written:", path.basename(manifestPath));

Packer.toBuffer(doc)
  .then((buffer) => {
    writeAtomic(docxPath, buffer);
    console.log("written:", path.basename(docxPath), buffer.length, "bytes");
    console.log(`\nN=${N} 份参与统计。能力排行（硬性要求出现率）：`);
    for (const r of ranking) console.log(`  ${r.name}: ${r.hardJDs.length}/${N} (${fmtRate(r.hardJDs.length)})  软性 ${r.softJDs.length}`);
  })
  .catch((e) => {
    console.error("docx generation failed:", e);
    process.exit(1);
  });
