# 002 — 检索评测集与基线指标

> [Qwen 2026-08-12] 状态：**待实现** | 负责：DeepSeek | 审查：Codex
> 前置：001-kb-retrieval（已完成，TF-IDF 基线）
> 战略对齐：ChatGPT 反馈 — "建立固定评测集和基线"是第一优先级

## 一、问题定义

**现状**：`kb/search.mjs` 能检索，但只有手动测试（"搜一下看看结果对不对"）。没有量化指标，无法回答：
- 检索质量到底好不好？
- 换 BM25 会不会更好？
- 同义词搜不搜得到？
- 无关查询会不会误报？

**目标状态**：一个 50 题评测集 + 自动化评测脚本，输出 Recall@5、MRR、Precision@1、引用正确率。每次改检索算法都能跑一遍对比。

**为什么重要**：没有评测集的 RAG 项目就是玩具。有评测集 + 基线数据 = 可信赖的工程系统。HR/面试官看到 Recall@5 = 0.87 比"搜到了 5 条结果"有说服力 100 倍。

## 二、评测集设计

### 题目来源（50 题，4 类场景）

| 类别 | 数量 | 示例 |
|---|---|---|
| **精确匹配** | 15 | "Apple Agentic AI PM 的岗位要求" → 命中 apple-agentic-ai-pm.md |
| **概念检索** | 15 | "大模型技术理解能力" → 命中 AI产品经理能力分析.md 的相关段落 |
| **跨文档综合** | 10 | "哪些公司要求 Agent 经验" → 命中多份 JD 的加分项/任职要求 |
| **无答案/无关** | 10 | "天气预报"、"Python 安装教程" → 应返回空或极低分 |

### 答案格式（每道题的标准答案）

```json
{
  "id": "q001",
  "category": "exact_match",
  "query": "Apple Agentic AI PM 的岗位要求",
  "expected_sources": ["jobs/apple-agentic-ai-pm.md"],
  "expected_headings": ["岗位职责", "任职要求"],
  "keywords": ["agentic", "AI", "Apple", "MCP"],
  "difficulty": "easy"
}
```

### 指标定义

| 指标 | 公式 | 目标基线 |
|---|---|---|
| **Recall@5** | 命中 expected_sources 的查询占比 | ≥ 0.80 |
| **MRR** | 第一个正确结果的排名倒数的均值 | ≥ 0.60 |
| **Precision@1** | Top-1 结果在 expected_sources 中的占比 | ≥ 0.50 |
| **引用正确率** | heading 在 expected_headings 中的占比 | ≥ 0.70 |
| **无关拒绝率** | 无答案查询返回空/低分的占比 | ≥ 0.90 |

## 三、技术方案

### 文件设计

```
kb/
├── eval/
│   ├── questions.json        ← 50 题评测集
│   ├── run-eval.mjs          ← 自动化评测脚本
│   └── results/
│       └── baseline-tfidf.json  ← 当前 TF-IDF 的基线结果
```

### 评测流程

```
读取 questions.json
  │
  ▼
对每题执行 search(query, topK=5)
  │
  ▼
计算 Recall@5 / MRR / Precision@1 / 引用正确率
  │
  ▼
输出 JSON 报告 + 终端摘要表格
  │
  ▼
与 baseline 对比（如有），标出提升/退化
```

## 四、任务拆解

### Task 1：设计评测集（questions.json）
- 50 题，覆盖 4 个类别
- 每题标注 expected_sources、expected_headings、keywords、difficulty
- 人工审核：确保标准答案正确（Qwen 审核）
- **验证**：`node -e "const q=require('./eval/questions.json'); console.log(q.length, Object.groupBy(q, x=>x.category))"` 输出 50 + 四类分布

### Task 2：实现评测脚本（run-eval.mjs）
- 读取 questions.json
- 调用现有 `buildIndex()` + `retrieve()` 对每题检索
- 计算 5 个指标
- 输出终端表格 + JSON 文件到 `eval/results/`
- **验证**：`node kb/eval/run-eval.mjs` 输出 5 个指标数值

### Task 3：跑基线（baseline-tfidf.json）
- 用当前 TF-IDF 检索跑一遍 50 题
- 记录每个指标 + 每题的详细结果
- 作为后续 BM25/混合检索的对比基线
- **验证**：`eval/results/baseline-tfidf.json` 存在且含 5 个指标

### Task 4：失败分析
- 找出 Recall@5 未命中的题目
- 分析失败原因（分词错误？文档缺失？查询歧义？）
- 输出失败分析摘要（给后续优化的方向）
- **验证**：报告包含失败题目列表 + 原因分类

## 五、给 DeepSeek 的完整启动指令

```
读取 ai-workspace/plans/002-eval-benchmark/plan.md 和 acceptance.md。

以编码主力身份，实现检索评测系统。
核心产出：50 题评测集 + 自动化评测脚本 + TF-IDF 基线数据。

约束：
- 评测集题目必须基于 kb/ 下的真实文档内容，不能编造不存在的内容
- 50 题 = 15 精确匹配 + 15 概念检索 + 10 跨文档 + 10 无答案
- 用三审查工作流（/three-review）启动
- 不引入新 npm 依赖
- 不改 kb/lib/ 下现有代码
- 评测脚本复用 kb/lib/indexer.mjs + kb/lib/retriever.mjs
```
