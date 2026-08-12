#!/usr/bin/env node
// server.mjs — PM 智能工作台展示后端（Node 原生 http，0 新依赖）
//
// 路由：
//   GET /                 → showcase.html
//   GET /app.js           → 前端逻辑
//   GET /api/search?q=&top= → 知识库检索（复用 kb/lib 的 indexer + retriever）
//   GET /api/stats        → 知识库统计 + 001 任务进度
//
// 说明：索引在启动时构建一次并缓存（只读），搜索请求内不重建。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHOWCASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.resolve(SHOWCASE_DIR, '../kb');
const REPORT_001 = path.resolve(SHOWCASE_DIR, '../ai-workspace/plans/001-kb-retrieval/report.md');

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
  if (!fs.existsSync(path.join(KB_DIR, 'node_modules/@node-rs/jieba'))) {
    throw new Error('缺少 kb/node_modules（@node-rs/jieba）。请先在 kb/ 目录执行: npm install');
  }
  if (!fs.existsSync(path.join(KB_DIR, 'lib/userdict.txt'))) {
    throw new Error('缺少 kb/lib/userdict.txt，无法加载分词词典');
  }
}

/** 构建索引 + 统计（含 001 任务进度，剥离 HTML 注释防模板行污染计数）。
 *  顺序：preflight（中文报错优先）→ 加载 retriever → 加载 indexer。 */
async function init() {
  preflight();
  const { retrieve } = await import(pathToFileURL(path.join(KB_DIR, 'lib/retriever.mjs')).href);
  retrieveFn = retrieve;
  const { buildIndex, tokenize } = await import(pathToFileURL(path.join(KB_DIR, 'lib/indexer.mjs')).href);
  index = buildIndex(KB_DIR);

  let progress = { plan: '001-kb-retrieval', done: 0, total: 0, status: 'unknown' };
  try {
    const txt = fs.readFileSync(REPORT_001, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const lines = txt.split('\n');
    const total = lines.filter((l) => /^### Task \d+/.test(l)).length;
    const done = lines.filter((l) => /^\*\*状态\*\*\s*[:：]\s*✅/.test(l)).length;
    progress = {
      plan: '001-kb-retrieval',
      total,
      done,
      status: total > 0 && done === total ? 'completed' : done > 0 ? 'in_progress' : 'unknown',
    };
  } catch {
    /* 报告缺失时保持 unknown，页面仍渲染三 AI 分工 */
  }

  stats = {
    files: index.fileCount,
    chunks: index.chunks.length,
    vocabSize: index.vocab.size,
    progress,
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
      console.log(`知识库: ${stats.files} 个文件 / ${stats.chunks} 个片段 / ${stats.vocabSize} 词`);
      console.log(`001 任务进度: ${stats.progress.done}/${stats.progress.total} (${stats.progress.status})`);
    });
  })
  .catch((err) => {
    console.error('启动失败:', err.message);
    process.exit(1);
  });
