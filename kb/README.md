# 岗位知识库（TF-IDF 检索）

本目录是 AI PM Job Retrieval Lab 的岗位知识库：检索层是 **TF-IDF 词法 baseline**（jieba 中文分词 + 余弦相似度），**不是 embedding / 向量 RAG**。目录为纯 markdown 文档，便于人工阅读与版本管理。

## 目录

- `jobs/` — 检索语料（**唯一检索语料**，11 份 AI 产品经理公开招聘岗位快照 / 整理要点 + `README.md` 说明模板）
- `lib/` — `indexer.mjs`（切块 + TF-IDF 索引）、`retriever.mjs`（余弦 Top-K）、`userdict.txt`（领域词典）
- `eval/` — 检索评测集（50 题）+ 评测脚本 + `results/`（基线与最新结果）
- `test/` — 15 条行为测试
- `search.mjs` — CLI 检索入口

## 语料边界

- 检索只索引 `kb/jobs/*.md`（`lib/indexer.mjs` 的 `listJobFiles`：排除 `README.md`、隐藏文件、非 `.md`）。
- 语料来源数固定为 **11**（测试 T9 断言；语料漂移需同步更新测试、评测基线与语料指纹）。
- 本目录的 `README.md`、`eval/`、`test/`、`lib/` 均不入语料。

## 运行

依赖统一安装在仓库根目录（根 `package.json` 声明 `@node-rs/jieba`）。在仓库根目录执行：

```bash
npm install
npm test                     # 15 条行为测试
npm run eval                 # 重跑评测（写 results/current.json）
node kb/search.mjs "RAG 检索增强" --top 5
```

## 后续如何接真实 RAG

最小可行方案（按需推进，不要一次性全上）：

1. **文档切块 + 向量化**：用 Python（如 `langchain` / `llama-index`）+ 本地向量库（`chroma` / `faiss`），把 `kb/jobs/*.md` 切块嵌入。
2. **混合检索**：BM25 词法 + 向量召回 + RRF 融合，用同一份 50 题评测集对比召回提升。
3. **验证指标**：复用现有评测脚本，对比 Recall@5 / MRR / Precision@1 / 引用正确率 / 无关拒绝率。

> 注意：接真实 RAG 前需先配置 Python 与向量库环境；当前检索与评测只需要 Node.js（`@node-rs/jieba`）。
