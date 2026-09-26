// indexer.mjs — 岗位语料切块 + TF-IDF 索引构建
//
// 职责：读取 kb/jobs/ 下的岗位 Markdown 语料（跳过 README.md、隐藏项与非 .md），
// 按 `## ` 标题切块（前言块并入第一个小节），对每个 chunk 分词并构建 TF-IDF 稀疏向量。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @node-rs/jieba v2：默认实例不加载词典，必须 withDict(dict)；
// 再追加领域用户词典，使"产品经理/项目管理"等复合词成为单一 token（AC-2 字面检查）。
const jieba = Jieba.withDict(dict);
jieba.loadDict(fs.readFileSync(path.join(__dirname, 'userdict.txt')));

const SKIP_DIRS = new Set(['node_modules', '.git']);

/** 分词：lowercase + 只保留中文/字母/数字 token（过滤空格、标点） */
export function tokenize(text) {
  return jieba
    .cut(text)
    .map((w) => w.toLowerCase())
    .filter((w) => /^[一-龥a-z0-9]+$/.test(w));
}

/** 递归收集目录下所有 .md 文件（排除 node_modules/.git/隐藏项）。通用工具，供非语料场景使用。 */
export function listMdFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMdFiles(full));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

/** 收集检索语料：kb/jobs/ 下的岗位 Markdown（排除 README.md、隐藏文件、非 .md）。
 *  jobs 目录缺失或为空时返回空数组（buildIndex 不抛错）。按路径排序保证确定性。 */
export function listJobFiles(kbDir) {
  const jobsDir = path.join(kbDir, 'jobs');
  let entries;
  try {
    entries = fs.readdirSync(jobsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('.') && e.name !== 'README.md')
    .map((e) => path.join(jobsDir, e.name))
    .sort();
}

/** 按 `## ` 标题切块；首个 `## ` 之前的前言块并入第一个小节。
 *  无任何 `## ` 标题的文件返回空数组（不产生 heading 为空的 chunk，满足 AC-5）。 */
export function chunkMarkdown(text, source) {
  const lines = text.split('\n');
  const chunks = [];
  let frontmatter = [];
  let cur = null;
  let hasHeading = false;

  const flush = () => {
    if (cur) chunks.push({ source: cur.source, heading: cur.heading, text: cur.text.join('\n').trim() });
    cur = null;
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      flush();
      cur = { source, heading: m[1].trim(), text: frontmatter };
      frontmatter = [];
      hasHeading = true;
    } else if (cur) {
      cur.text.push(line);
    } else {
      frontmatter.push(line);
    }
  }
  flush();
  return hasHeading ? chunks : [];
}

/** 构建 TF-IDF 索引：返回 chunks 元数据 + 每 chunk 的 TF-IDF 稀疏向量 + IDF 表。
 *  语料 = kb/jobs/ 下的岗位 Markdown（listJobFiles），不含 README/评测说明/报告/模板。 */
export function buildIndex(kbDir) {
  const files = listJobFiles(kbDir);
  const chunks = [];
  for (const file of files) {
    const source = path.relative(kbDir, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    chunks.push(...chunkMarkdown(text, source));
  }

  const N = chunks.length;
  const tokenized = chunks.map((c) => tokenize(c.text));

  // 文档频率 df[word] = 包含该词的 chunk 数
  const df = new Map();
  for (const toks of tokenized) {
    for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
  }

  // 逆文档频率 idf[word] = log(N / df)
  const idf = new Map();
  for (const [w, d] of df) idf.set(w, Math.log(N / d));

  // 每 chunk 的 TF-IDF 稀疏向量：tf(词频占比) × idf
  const vectors = tokenized.map((toks) => {
    const tf = new Map();
    for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
    const vec = new Map();
    const len = toks.length || 1;
    for (const [w, f] of tf) {
      const v = (f / len) * idf.get(w);
      if (v > 0) vec.set(w, v);
    }
    return vec;
  });

  return { chunks, vectors, idf, vocab: df, fileCount: files.length };
}
