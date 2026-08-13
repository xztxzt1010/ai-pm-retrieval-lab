#!/usr/bin/env node
// search.mjs — 知识库检索 CLI 入口
//
// 用法：node kb/search.mjs "查询内容" [--top N] [--verbose]
//   --top N     返回前 N 条结果（默认 5）
//   --verbose   显示查询分词与索引统计
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, tokenize } from './lib/indexer.mjs';
import { retrieve } from './lib/retriever.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = __dirname; // kb/

function usage() {
  console.log('用法: node kb/search.mjs "查询内容" [--top N] [--verbose]');
}

/** 解析参数；--top 需为正整数，否则抛错 */
function parseArgs(argv) {
  const args = { query: null, top: 5, verbose: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verbose') {
      args.verbose = true;
    } else if (a === '--top') {
      const v = argv[i + 1];
      if (v === undefined || !/^\d+$/.test(v) || Number(v) <= 0) {
        throw new Error('--top 需要一个正整数');
      }
      args.top = Number(v);
      i++;
    } else {
      rest.push(a);
    }
  }
  args.query = rest.join(' ');
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`错误: ${e.message}`);
    usage();
    process.exit(1);
  }

  const query = (args.query || '').trim();
  if (!query) {
    usage();
    process.exit(1);
  }

  const t0 = Date.now();
  let index;
  try {
    index = buildIndex(KB_DIR);
  } catch (e) {
    console.error(`错误: 索引构建失败 - ${e.message}`);
    process.exit(1);
  }

  if (args.verbose) {
    console.log(`[verbose] 查询分词: ${JSON.stringify(tokenize(query))}`);
    console.log(`[verbose] 索引: ${index.chunks.length} 个片段 / ${index.fileCount} 个文件, 构建 ${Date.now() - t0}ms`);
  }

  let results;
  try {
    results = retrieve(index, query, args.top);
  } catch (e) {
    console.error(`错误: 检索失败 - ${e.message}`);
    process.exit(1);
  }
  if (results.length === 0) {
    console.log('未找到相关内容');
    return;
  }

  for (const r of results) {
    console.log(`\n[${r.source} | ${r.heading}]`);
    console.log(`score: ${r.score.toFixed(4)}`);
    console.log(r.snippet);
  }
  console.log(`\n(共 ${results.length} 条, 耗时 ${Date.now() - t0}ms)`);
}

main();
