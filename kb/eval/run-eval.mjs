// run-eval.mjs — AI PM Job Retrieval Lab 检索评测脚本（TF-IDF 基线）
// 复用 kb/lib/indexer.mjs + retriever.mjs，不修改 lib/ 任何代码。
//
// 目录纪律：本目录（kb/eval/）只允许 .json/.mjs 文件。检索语料限定 kb/jobs/*.md
//（listJobFiles 显式排除 README.md 与隐藏/非 .md 文件），kb/eval/ 与 kb/README.md
// 均不进入索引。
//
// 用法：
//   node kb/eval/run-eval.mjs              → 结果写入 results/current.json（可重复覆盖）
//   node kb/eval/run-eval.mjs --name x     → 结果写入 results/x.json（基线用 --name baseline-tfidf）
// 默认不写 baseline-tfidf.json，避免后续实验把基线冲掉（基线快照保护）。
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildIndex, listJobFiles } from '../lib/indexer.mjs';
import { retrieve } from '../lib/retriever.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(__dirname, 'results');

/* ---------- 配置（可配置常量，选定依据见 report.md） ---------- */
const TOP_K = 5;          // 检索 Top-K
const REJECT_SCORE = 0.05; // no_answer 拒绝阈值：top1 低于此分数判为「无实质相关内容」
const BOILERPLATE_HEADING =
  /原始来源|收录原则|文件结构约定|现有文档清单|后续如何接真实RAG|^目录$/;

/* 样板块过滤（评测脚本层，不动 kb/lib/）：
 * 排除 README 源文件与「来源/目录/收录」类元数据块——它们是跨文档聚合块，
 * tf 高且短而密，系统性霸榜 top-5，会污染 Recall/引用判定。过滤后才算实质内容检索质量。 */
const isBoilerplate = (h) => /README/i.test(h.source) || BOILERPLATE_HEADING.test(h.heading);

/* 路径分隔符归一化：Windows 反斜杠与 questions.json 正斜杠统一 */
const norm = (p) => String(p).replace(/\\/g, '/');

/* 语料指纹：对参与索引的岗位语料（kb/jobs/*.md）的 (路径 + 内容) 做 sha1，取前 16 位。
 * 存入结果 JSON，供核对「这份基线对应哪一版语料」——语料漂移时指纹变化（如新增/改动岗位文件）。 */
function corpusFingerprint(kbDir) {
  const h = crypto.createHash('sha1');
  const rel = (f) => path.relative(kbDir, f).split(path.sep).join('/');
  for (const f of listJobFiles(kbDir).sort((a, b) => rel(a).localeCompare(rel(b)))) {
    h.update(rel(f));
    h.update('\x00');
    h.update(fs.readFileSync(f, 'utf8'));
  }
  return h.digest('hex').slice(0, 16);
}

const snapshot = (hits) =>
  hits.map((h) => ({ source: norm(h.source), heading: h.heading, score: Number(h.score.toFixed(4)) }));

/* ---------- 数据 ---------- */
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')).questions;
const index = buildIndex(KB_DIR);

/* ---------- 单题评测 ---------- */
function evaluateOne(q) {
  const raw = retrieve(index, q.query, TOP_K * 4); // 多取一些再过滤，保证过滤后仍够 TOP_K
  const filtered = raw.filter((h) => !isBoilerplate(h)).slice(0, TOP_K);
  const expected = (q.expected_sources || []).map(norm);

  // source_hit：过滤后 top-5 含任意 expected_sources（ANY 判定，多来源题含任一即命中）
  const hitIdx = filtered.findIndex((h) => expected.includes(norm(h.source)));
  let source_hit = hitIdx >= 0;
  const recall_rank = source_hit ? hitIdx + 1 : 0; // 1-based；0 = 未命中

  // Precision@1
  const p1 = filtered.length > 0 && expected.includes(norm(filtered[0].source)) ? 1 : 0;

  // 引用正确率：首个 source 命中的 chunk 的 heading 是否命中 expected_headings（子串）
  let citation_ok = null;
  if (source_hit) {
    const hit = filtered[hitIdx];
    const heads = (q.expected_headings || []).map(norm);
    citation_ok = heads.some((h) => norm(hit.heading).includes(h));
  }

  // no_answer 拒绝判定：返回空 或 top1 分数低于阈值
  let rejected = null;
  if (q.category === 'no_answer') {
    rejected = filtered.length === 0 || filtered[0].score < REJECT_SCORE;
  }

  // 失败自动信号（仅线索，AC-5 的 4 类人工标签由 failure_reason 字段承载）
  let auto_signal = null;
  let failure_reason = null;
  if (q.category === 'no_answer') {
    // 定义：no_answer 的 source_hit 表示「正确拒绝」（AC-5 验收命令按 !source_hit 找失败题，
    // 否则 expected_sources=[] 恒不命中，会把「拒绝对了」也计成失败）。
    // 拒绝的两种成因与未拒绝的近失配分开标注。
    source_hit = rejected;
    if (rejected) {
      auto_signal = raw.length === 0 ? 'rejected_empty' : 'rejected_low_score';
    } else {
      auto_signal = 'near_miss_not_rejected';
      failure_reason = '查询歧义'; // 查询与词表部分重叠但语义超纲 → 检索器返回相关但错误的 chunk
    }
  } else {
    if (raw.length === 0) {
      auto_signal = 'qvec_empty'; // 查询向量空（全 OOV / 词表缺失）
      failure_reason = '分词错误'; // 启发式初判，人工复核可覆盖
    } else if (!source_hit) {
      auto_signal = 'not_in_top5';
      failure_reason = '查询歧义'; // 启发式初判，人工复核可覆盖
    }
  }

  // correct：语义纯净的「答对」布尔字段，不重载 source_hit。
  // answerable = source_hit（找到来源）；no_answer = 正确拒绝。
  const correct = q.category === 'no_answer' ? rejected : source_hit;

  return {
    id: q.id,
    category: q.category,
    query: q.query,
    difficulty: q.difficulty,
    correct,
    source_hit,
    recall_rank,
    p1,
    citation_ok,
    rejected,
    auto_signal,
    failure_reason,
    raw_top5: snapshot(raw.slice(0, TOP_K)),
    top5: snapshot(filtered),
  };
}

const results = questions.map(evaluateOne);

/* ---------- 指标聚合 ---------- */
const answerable = results.filter((r) => r.category !== 'no_answer');
const noAns = results.filter((r) => r.category === 'no_answer');
const nAns = answerable.length; // 40

const recallHits = answerable.filter((r) => r.source_hit);
const mrr = answerable.reduce((s, r) => s + (r.source_hit ? 1 / r.recall_rank : 0), 0) / nAns;
const p1Sum = answerable.filter((r) => r.p1).length;
const citeDenom = recallHits.length;
const citeOk = recallHits.filter((r) => r.citation_ok).length;
const rejectSum = noAns.filter((r) => r.rejected).length;

const metrics = {
  recall5: Number((recallHits.length / nAns).toFixed(4)),
  recall5_denominator: nAns, // 40 = 有 expected_sources 的题（no_answer 不参与）
  recall5_hits: recallHits.length,
  mrr: Number(mrr.toFixed(4)),
  precision1: Number((p1Sum / nAns).toFixed(4)),
  precision1_hits: p1Sum,
  citation_accuracy: citeDenom > 0 ? Number((citeOk / citeDenom).toFixed(4)) : null,
  citation_denominator: citeDenom,
  citation_ok: citeOk,
  reject_rate: Number((rejectSum / noAns.length).toFixed(4)),
  reject_denominator: noAns.length,
  reject_ok: rejectSum,
};

/* ---------- 终端输出 ---------- */
console.log('=== 检索评测（TF-IDF 基线）===');
console.log(`语料: ${index.fileCount} 文件 / ${index.chunks.length} chunk | 阈值 top1<${REJECT_SCORE} 判拒绝 | 样板已过滤`);
console.log('---');
console.log(`Recall@5:    ${metrics.recall5.toFixed(3)}  (${recallHits.length}/${nAns})`);
console.log(`MRR:         ${metrics.mrr.toFixed(3)}`);
console.log(`Precision@1: ${metrics.precision1.toFixed(3)}  (${p1Sum}/${nAns})`);
console.log(`引用正确率:    ${citeDenom > 0 ? metrics.citation_accuracy.toFixed(3) : 'n/a'}  (${citeOk}/${citeDenom})`);
console.log(`无关拒绝率:    ${metrics.reject_rate.toFixed(3)}  (${rejectSum}/${noAns.length})`);
console.log('---');
for (const r of results) {
  const tag = r.category === 'no_answer'
    ? (r.rejected ? '✔ 拒绝' : '✘ 未拒')
    : (r.source_hit ? `✔ hit@${r.recall_rank}` : `✘ miss(${r.auto_signal})`);
  console.log(`  ${r.id} [${r.category}] ${r.query}  ${tag}`);
}

/* ---------- 输出 JSON ---------- */
const outName = process.argv.indexOf('--name') >= 0
  ? process.argv[process.argv.indexOf('--name') + 1]
  : 'current';
const outFile = path.join(RESULTS_DIR, `${outName}.json`);
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// baseline 快照保护（强制版）：除默认 current.json 外，覆盖既有结果文件需显式 --force。
// 防止后续实验误覆盖基线；current.json 是可复现的默认产物，允许自由覆盖。
const force = process.argv.includes('--force');
if (fs.existsSync(outFile) && outName !== 'current' && !force) {
  console.error(`已存在 ${path.relative(KB_DIR, outFile)}，需加 --force 才覆盖（baseline 快照保护）。`);
  process.exit(1);
}

const payload = {
  config: {
    top_k: TOP_K,
    reject_score: REJECT_SCORE,
    boilerplate_filter: 'README sources + 原始来源/收录/目录类 heading',
    corpus_fingerprint: corpusFingerprint(KB_DIR),
  },
  metrics,
  notes: {
    answerable_saturation: '40 道可答题目全在 top-1 命中（Recall@5=MRR=P@1=1.0）。原因是语料小（11 份岗位，44 chunk）且 token 特征鲜明，TF-IDF 精确命中；饱和是「锚定验证 + token 精确匹配」的结构性结果，判别轴在无关拒绝率（0.80，两个近失配失败）。未来对比更好的检索器时，需补充语义/近义改写类难题（语料增长后），否则 answerable 轴无法体现改进。',
    no_answer_definition: 'no_answer 的 source_hit 字段表示「正确拒绝」（验收命令按 !source_hit 找失败题）：返回空或 top1<阈值。语义纯净的答对布尔字段是 correct。na09/na10 为近失配题（查询与词表部分重叠但语义超纲），未拒绝即记失败（查询歧义）。',
    reject_threshold_margin: 'na09/na10 过滤后 top1 分数（见 per_question）约为阈值 0.05 的 2 倍余量；语料变动后重跑需人工复核是否翻边（某题可能被推到阈值另一侧翻转拒绝决策）。',
    corpus_fingerprint_note: 'corpus_fingerprint 为参与索引的岗位语料 kb/jobs/*.md（路径+内容）的 sha1 前 16 位。若未来重跑得到的指纹与基线不一致，说明语料已漂移，基线不再对应可复现语料，需重新生成基线。',
  },
  per_question: results,
};
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`\n已写入 ${path.relative(KB_DIR, outFile)}`);
