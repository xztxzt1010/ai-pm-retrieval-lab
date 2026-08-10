// 从 kb/ 两个文档生成 PRD 初稿（三审查验证用的最小实现）
// 结构来源：prd-template.md 的六节标题（运行时读出，非硬编码）
// 内容来源：product-strategy.md 的各小节要点（运行时解析抽取，非硬编码），节末标注「来源：product-strategy.md §小节」
// 说明：路径以脚本自身所在目录（__dirname）解析，任意 cwd 均可运行
let docx;
try {
  docx = require("docx");
} catch (e) {
  console.error("缺少依赖 docx：请先在本目录执行 npm install docx --no-save --no-package-lock");
  process.exit(1);
}
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const KB = path.join(ROOT, "kb");
const strategyPath = path.join(KB, "product-strategy.md");
const templatePath = path.join(KB, "prd-template.md");

// --- 前置断言：输入非空且含预期锚点，不满足即停 ---
for (const [p, anchor] of [
  [strategyPath, "产品策略"],
  [templatePath, "背景与问题"],
]) {
  if (!fs.existsSync(p)) throw new Error(`missing input: ${p}`);
  const text = fs.readFileSync(p, "utf8");
  if (!text.trim()) throw new Error(`empty input: ${p}`);
  if (!text.includes(anchor)) throw new Error(`anchor "${anchor}" not found in ${p}`);
}

// \r\n → \n：避免 CRLF 文件击穿行级正则（$ 在 \r 前不匹配）
const strategy = fs.readFileSync(strategyPath, "utf8").replace(/\r\n/g, "\n");
const template = fs.readFileSync(templatePath, "utf8").replace(/\r\n/g, "\n");

// --- 从模板读出六节标题 ---
const allH2 = template.split("\n").filter((l) => /^##\s/.test(l));
const headings = allH2
  .map((l) => l.match(/^## (\d+\..+)$/))
  .filter(Boolean)
  .map((m) => m[1].trim());
// 未编号的 ## 行（如「## 附录」）一律 loud failure，不静默丢弃
if (allH2.length !== headings.length) {
  throw new Error(`template has ${allH2.length} "## " headings but only ${headings.length} numbered — unnumbered sections would be silently dropped`);
}
if (headings.length < 6) throw new Error(`expected >=6 sections in template, got ${headings.length}`);
// 模板编号查重：两个「## 1.」会静默产出重复节正文
const seenNums = new Set();
for (const h of headings) {
  const n = (h.match(/^(\d+)/) || [])[1];
  if (seenNums.has(n)) throw new Error(`duplicate section number "${n}" in template (${h})`);
  seenNums.add(n);
}

// --- 解析 product-strategy.md 为「小节 → 内容项列表」 ---
// 内容项分两类：bullet（要点，渲染为「· 原文」）/ para（引导句、折行续行，渲染为原文段落）。
// 小节内所有非空、非 # 行都会被保留 —— 策略文档没有静默丢失的行。
function parseStrategySections(text) {
  const sections = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      cur = { heading: h[1].trim(), items: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    const b = line.match(/^(?:[-*]|\d+[.、)])\s*(.+)$/);
    if (b) {
      cur.items.push({ kind: "bullet", text: b[1].trim() });
    } else if (line && !line.startsWith("#")) {
      cur.items.push({ kind: "para", text: line }); // 引导句 / 折行续行：保留而非静默丢弃
    }
  }
  return sections;
}
const strategySections = parseStrategySections(strategy);
if (strategySections.length === 0) {
  throw new Error(`product-strategy.md has no "## " sections — nothing to derive PRD body from`);
}
const byName = {};
for (const s of strategySections) {
  // 重名小节会静默后写覆盖，丢失第一个小节的内容 —— loud 而非静默
  if (Object.prototype.hasOwnProperty.call(byName, s.heading)) {
    throw new Error(`duplicate strategy section "## ${s.heading}" in product-strategy.md`);
  }
  byName[s.heading] = s.items;
}

// 抽取内容项原文（仅去 markdown 加粗/反引号），过滤空串 —— 「朴素抽取」，改动可直接观察到
const stripMd = (t) => t.replace(/\*\*/g, "").replace(/`/g, "").trim();
function pickFrom(name, pred) {
  const all = byName[name];
  if (!all) throw new Error(`strategy section "## ${name}" not found in product-strategy.md`);
  if (all.length === 0) throw new Error(`strategy section "## ${name}" is empty`);
  const picked = all
    .filter((it) => (pred ? pred(it.text) : true))
    .map((it) => ({ kind: it.kind, text: stripMd(it.text) }))
    .filter((it) => it.text);
  if (picked.length === 0) throw new Error(`no usable key points in "## ${name}"`);
  return picked;
}
// bullet 渲染为「· 原文」，para 渲染为原文段落（引导句不带「·」）
const fmt = (items) => items.map((it) => (it.kind === "bullet" ? `· ${it.text}` : it.text));
const sourceLine = (...names) => `来源：product-strategy.md ${names.map((n) => `§${n}`).join(" ")}`;

// --- 各节正文生成器：引导句 + 从 product-strategy.md 抽取的要点原文 + 来源标注 ---
// 每节来源标注只指向本节实际抽取的小节，不无中生有；抽取是「朴素抽取」（要点原文进正文），
// 因此修改 product-strategy.md 任一被引用要点后重新生成，PRD 对应正文会出现该要点 —— 可追溯可观察。
const sectionBuilders = {
  1: () => [
    "以下要点直接取自产品策略（§定位）：",
    ...fmt(pickFrom("定位")),
    "这是真问题还是表象：是真问题——产品经理缺少可检索、可追溯的工作台，需求与流程当前都无兜底。",
    sourceLine("定位"),
  ],
  2: () => [
    "本轮目标：让核心价值成立，重点是把「需求不悬空」变成可观察、可复核的事实。目标要点（取自产品策略）：",
    ...fmt(pickFrom("核心价值", (b) => !b.includes("结果可证"))),
    "完成标准：PRD 初稿包含六节编号标题（来自 prd-template.md）；各节要点来自 product-strategy.md 并标注来源；修改产品策略后重新生成，PRD 正文随之变化。",
    sourceLine("核心价值"),
  ],
  3: () => [
    "做：复用 kb/prd-template.md 六节结构，把 kb/product-strategy.md 的策略要点派生进 PRD 正文并标注来源，输出 docx。",
    "不做（取自产品策略）：",
    ...fmt(pickFrom("边界（本次不做）")),
    sourceLine("边界（本次不做）"),
  ],
  4: () => [
    "主路径：产品经理在「文档 + 检索 + 审查流程三位一体」的工作台中做需求，得到结构完整、可追溯的 PRD 初稿，再继续人工细化。",
    "场景与差异（取自产品策略）：",
    ...fmt(pickFrom("竞品思考（占位）")),
    "异常路径：输入文档缺失或为空则流程停止报错；生成失败先备份旧稿、不覆盖；docx 依赖未装则给出安装指引。",
    sourceLine("竞品思考（占位）"),
  ],
  5: () => [
    "验证原则（取自产品策略「结果可证」）：",
    ...fmt(pickFrom("核心价值", (b) => b.includes("结果可证"))),
    "验证手段：unzip -p 读取 word/document.xml 后 grep 计数——六节编号标题数（完整度，目标 6）、带「来源」标注的正文节占比（追溯覆盖率，目标 100%）、修改策略要点前后的正文 diff（变化响应）；再用 Word 打开目检中文与结构。",
    sourceLine("核心价值"),
  ],
  6: () => [
    "风险与回滚（依据产品策略边界）：",
    ...fmt(pickFrom("边界（本次不做）", (b) => b.includes("不接数据库"))),
    "因此本任务非高风险：无数据迁移、权限或部署变更，回滚即删除新生成的 docx 并可从备份恢复旧稿。",
    sourceLine("边界（本次不做）"),
  ],
};

// 从模板读出的每个编号标题都必须在 sectionBuilders 里找到生成器；
// 模板加/删/改节会 loud failure，而不是静默产出空节或错位正文。
const body = headings.map((h) => {
  const m = h.match(/^(\d+)\./);
  if (!m) throw new Error(`section heading has no number prefix: "${h}"`);
  const builder = sectionBuilders[Number(m[1])];
  if (!builder) throw new Error(`no body builder for section ${m[1]}: "${h}"`);
  return builder();
});

const children = [];
children.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: "产品经理智能工作台 · PRD 初稿", bold: true, size: 36, font: "微软雅黑" })],
  })
);
headings.forEach((h, i) => {
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: h, bold: true, size: 28, font: "微软雅黑" })],
    })
  );
  (body[i] || []).forEach((t) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: t, size: 24, font: "微软雅黑" })],
      })
    );
  });
});

const doc = new Document({ sections: [{ children }] });
const outPath = path.join(ROOT, "PRD初稿.docx");
Packer.toBuffer(doc)
  .then((buffer) => {
    const tmp = path.join(ROOT, "PRD初稿.tmp.docx");
    try {
      // 产物保护：生成成功后才动旧稿 —— 先备份，再整体写入 + 原子替换；失败路径不写不覆盖
      if (fs.existsSync(outPath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // Windows 文件名非法字符(:.)替换掉
        const bak = path.join(ROOT, `PRD初稿.bak-${stamp}.docx`);
        fs.copyFileSync(outPath, bak);
        console.log("backed up existing:", path.basename(bak));
      }
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, outPath); // 原子替换，避免写一半的坏稿
      console.log("written:", outPath, buffer.length, "bytes");
    } catch (err) {
      if (fs.existsSync(tmp)) {
        try { fs.unlinkSync(tmp); } catch (_) {} // 不留半成品坏稿
      }
      throw err;
    }
  })
  .catch((e) => {
    console.error("docx generation failed:", e);
    process.exit(1);
  });
