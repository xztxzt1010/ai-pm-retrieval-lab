#!/usr/bin/env node
// server.mjs — AI PM Job Retrieval Lab 展示后端（Node 原生 http，0 新依赖）
//
// 路由：
//   GET /                 → showcase.html
//   GET /app.js           → 前端逻辑
//   GET /api/search?q=&top= → 岗位知识检索（复用 kb/lib 的 indexer + retriever）
//   GET /api/stats        → 语料统计 + 评测摘要 + 能力分析摘要（均来自仓库内固定 JSON，无动态写入）
//
// 说明：索引在启动时构建一次并缓存（只读），搜索请求内不重建。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHOWCASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SHOWCASE_DIR, '..');
const KB_DIR = path.join(ROOT, 'kb');

// 只允许读取仓库内这些固定 JSON（路径穿越防护：不做任何基于用户输入的文件读取）
const JSON_ASSETS = {
  evaluation: path.join(ROOT, 'kb/eval/results/current.json'),
  capability: path.join(ROOT, 'reports/capability-analysis.manifest.json'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};
const STATIC = {
  '/': 'showcase.html',
  '/app.js': 'app.js',
};

let index = null;
let stats = null;
let retrieveFn = null;

/** 启动前置检查：kb 依赖必须存在，否则给可操作的中文报错。
 *  必须在 init() 内、动态 import(kb 模块) 之前调用——否则依赖缺失时顶层 import 会先抛原始英文 ESM 错误，中文修复指引永远跑不到。 */
function preflight() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules/@node-rs/jieba'))) {
    throw new Error('缺少根目录 node_modules（@node-rs/jieba）。请先在仓库根目录执行: npm install');
  }
  if (!fs.existsSync(path.join(KB_DIR, 'lib/userdict.txt'))) {
    throw new Error('缺少 kb/lib/userdict.txt，无法加载分词词典');
  }
}

/** 读取固定 JSON 资产；缺失时返回 null（页面优雅降级，不阻断检索）。 */
function readAsset(name) {
  try {
    return JSON.parse(fs.readFileSync(JSON_ASSETS[name], 'utf8'));
  } catch {
    return null;
  }
}

/** 构建索引 + 统计（含评测摘要与能力分析摘要，均来自固定 JSON，无动态写入）。
 *  顺序：preflight（中文报错优先）→ 加载 retriever → 加载 indexer。 */
async function init() {
  preflight();
  const { retrieve } = await import(pathToFileURL(path.join(KB_DIR, 'lib/retriever.mjs')).href);
  retrieveFn = retrieve;
  const { buildIndex, tokenize } = await import(pathToFileURL(path.join(KB_DIR, 'lib/indexer.mjs')).href);
  index = buildIndex(KB_DIR);

  const evalRes = readAsset('evaluation');
  const capRes = readAsset('capability');
  stats = {
    corpusFiles: index.fileCount,
    chunks: index.chunks.length,
    vocabSize: index.vocab.size,
    evaluation: evalRes
      ? {
          questions: (evalRes.metrics?.recall5_denominator || 0) + (evalRes.metrics?.reject_denominator || 0),
          recall5: evalRes.metrics?.recall5 ?? null,
          mrr: evalRes.metrics?.mrr ?? null,
          precision1: evalRes.metrics?.precision1 ?? null,
          citationAccuracy: evalRes.metrics?.citation_accuracy ?? null,
          rejectRate: evalRes.metrics?.reject_rate ?? null,
          corpusFingerprint: evalRes.config?.corpus_fingerprint ?? null,
        }
      : null,
    capability: capRes
      ? {
          N: capRes.N ?? null,
          categories: capRes.categories ?? null,
          generatedAt: capRes.generatedAt ?? null,
        }
      : null,
  };
  return { tokenize };
}

let tokenizeFn = null;
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '方法不允许（仅支持 GET）' }));
      return;
    }

    if (pathname === '/api/search') {
      return handleSearch(url, res);
    }
    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stats));
      return;
    }

    // 静态文件白名单（精确路由，杜绝路径穿越）
    const file = STATIC[pathname];
    if (file) {
      const ext = path.extname(file);
      fs.readFile(path.join(SHOWCASE_DIR, file), (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    // 兜底：任何同步异常返回 500 而非让进程崩溃
    console.error('请求处理异常:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '服务器内部错误' }));
    } else {
      res.end();
    }
  }
});

/** /api/search：q 截断 200 字，top 校验正整数默认 5，分数 toFixed(4) 与 CLI 对齐 */
function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
  if (!q) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '缺少查询参数 q' }));
    return;
  }

  let top = 5;
  const topRaw = url.searchParams.get('top');
  if (topRaw !== null) {
    if (!/^\d+$/.test(topRaw) || Number(topRaw) <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'top 需为正整数' }));
      return;
    }
    top = Math.min(Number(topRaw), index.chunks.length);
  }

  const results = retrieveFn(index, q, top).map((r) => ({
    ...r,
    score: Number(r.score.toFixed(4)),
  }));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ query: q, tokens: tokenizeFn(q), count: results.length, results }));
}

const PORT = Number(process.env.PORT) || 3000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。可用 PORT 环境变量换端口，例如: PORT=3001 node showcase/server.mjs`);
  } else {
    console.error('服务器错误:', err.message);
  }
  process.exit(1);
});

init()
  .then(({ tokenize }) => {
    tokenizeFn = tokenize;
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`知识库: ${stats.corpusFiles} 个文件 / ${stats.chunks} 个片段 / ${stats.vocabSize} 词`);
      if (stats.evaluation) {
        console.log(`评测: ${stats.evaluation.questions} 题 · Recall@5=${stats.evaluation.recall5} · MRR=${stats.evaluation.mrr} · P@1=${stats.evaluation.precision1} · 引用=${stats.evaluation.citationAccuracy} · 拒绝=${stats.evaluation.rejectRate} · 指纹 ${stats.evaluation.corpusFingerprint}`);
      } else {
        console.log('评测: 未找到 current.json，页面将隐藏评测摘要');
      }
    });
  })
  .catch((err) => {
    console.error('启动失败:', err.message);
    process.exit(1);
  });
