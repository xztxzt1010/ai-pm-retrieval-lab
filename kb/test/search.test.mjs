// search.test.mjs — 岗位检索系统行为测试（只读）
// 覆盖：中文/英文查询命中、大小写不敏感、分数非 NaN、结果字段完整性、
//       来源与标题可追溯、语料边界（11 份岗位、排除 README/隐藏/node_modules）、
//       空语料、全 OOV、topK 边界。
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, tokenize } from '../lib/indexer.mjs';
import { retrieve } from '../lib/retriever.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name} — ${e.message}`);
    failed++;
  }
}

// 共享索引：一次构建，多次断言
const index = buildIndex(KB_DIR);
const sources = [...new Set(index.chunks.map((c) => c.source))];

test('T1: 中文岗位查询命中正确 JD（京东 算法产品经理 → jd-algo-pm.md）', () => {
  const r = retrieve(index, '京东 算法产品经理', 5);
  assert.ok(r.length > 0, '应有结果');
  assert.ok(r.some((x) => x.source === 'jobs/jd-algo-pm.md'), '应命中 jobs/jd-algo-pm.md');
});

test('T2: 英文岗位查询命中 Apple JD 且分数非 NaN', () => {
  const r = retrieve(index, 'Agentic AI Product Manager', 5);
  assert.ok(r.some((x) => x.source.includes('apple')), '应命中 Apple JD');
  assert.ok(r.every((x) => Number.isFinite(x.score) && !Number.isNaN(x.score)), '分数不应为 NaN');
});

test('T3: 大小写不敏感（agent 与 Agent 结果一致）', () => {
  const a = retrieve(index, 'agent', 3).map((x) => x.source);
  const b = retrieve(index, 'Agent', 3).map((x) => x.source);
  assert.deepStrictEqual(a, b, '大小写不应影响结果');
});

test('T4: 无关查询不产生 NaN', () => {
  const r = retrieve(index, '天气预报', 5);
  assert.ok(Array.isArray(r), '应返回数组');
  for (const x of r) assert.ok(Number.isFinite(x.score), '分数不应为 NaN/Infinity');
});

test('T5: 每条结果包含 source/heading/snippet/score', () => {
  const r = retrieve(index, 'SQL 数据分析', 5);
  assert.ok(r.length > 0, '应有结果');
  for (const x of r) {
    assert.ok(x.source && typeof x.source === 'string', 'source 非空');
    assert.ok(x.heading && typeof x.heading === 'string', 'heading 非空');
    assert.ok(typeof x.snippet === 'string', 'snippet 非空');
    assert.ok(typeof x.score === 'number' && Number.isFinite(x.score), 'score 为有限数');
  }
});

test('T6: source 文件真实存在', () => {
  const r = retrieve(index, '大模型平台', 5);
  assert.ok(r.length > 0, '应有结果');
  for (const x of r) {
    assert.ok(fs.existsSync(path.join(KB_DIR, x.source)), `source 文件应存在: ${x.source}`);
  }
});

test('T7: heading 是文件中的真实 ## 标题', () => {
  const r = retrieve(index, '大模型平台', 5);
  for (const x of r) {
    const fileText = fs.readFileSync(path.join(KB_DIR, x.source), 'utf8');
    assert.ok(fileText.includes(`## ${x.heading}`), `"## ${x.heading}" 应存在于 ${x.source}`);
  }
});

test('T8: node_modules、隐藏文件、README 不进入语料', () => {
  assert.ok(!sources.some((s) => s.includes('node_modules')), '不应包含 node_modules 来源');
  assert.ok(!sources.some((s) => s.split('/').some((seg) => seg.startsWith('.'))), '不应包含隐藏文件来源');
  assert.ok(!sources.includes('jobs/README.md'), '不应包含 jobs/README.md');
  assert.ok(!sources.some((s) => s.endsWith('README.md')), '不应包含任何 README 来源');
});

test('T9: 实际语料来源数恰为 11 份岗位', () => {
  assert.strictEqual(sources.length, 11, `应为 11 个来源，实际 ${sources.length}`);
  assert.ok(sources.every((s) => s.startsWith('jobs/') && s.endsWith('.md')), '来源均应为 jobs/*.md');
});

test('T10: 空语料 buildIndex 不抛错（边界）', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
  try {
    const empty = buildIndex(emptyDir);
    assert.strictEqual(empty.chunks.length, 0);
    assert.strictEqual(empty.vectors.length, 0);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('T11: 全 OOV 查询返回数组且分数有限，不产生 NaN（边界）', () => {
  const r = retrieve(index, '量子纠缠玻色子凝聚', 5);
  assert.ok(Array.isArray(r), '应返回数组');
  for (const x of r) assert.ok(Number.isFinite(x.score), '分数不应为 NaN/Infinity');
});

test('T12: topK 0/负数/超界被钳制（边界）', () => {
  for (const k of [0, -1, 999]) {
    const r = retrieve(index, 'agent', k);
    assert.ok(r.length >= 1 && r.length <= index.chunks.length, `k=${k} 应返回 1~${index.chunks.length} 条，实际 ${r.length}`);
  }
});

test('T13: 岗位能力相关查询返回岗位语料', () => {
  const r = retrieve(index, 'SQL 数据分析 评测', 5);
  assert.ok(r.length > 0, '应有结果');
  for (const x of r) assert.ok(x.source.startsWith('jobs/'), `来源应为岗位语料: ${x.source}`);
});

test('T14: 语料不含旧工作台/模板文档（product-strategy / prd-template）', () => {
  assert.ok(!sources.some((s) => s.includes('product-strategy')), '不应包含 product-strategy.md');
  assert.ok(!sources.some((s) => s.includes('prd-template')), '不应包含 prd-template.md');
});

test('T15: 分词器领域词典不含「智能工作台」', () => {
  const toks = tokenize('智能工作台 产品经理');
  assert.ok(!toks.includes('智能工作台'), `不应切出 智能工作台，实际 ${JSON.stringify(toks)}`);
  assert.ok(toks.includes('产品经理'), '应切出 产品经理');
});

console.log(`\n${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
