# 001 — 知识库本地检索系统

> [Qwen 2026-08-10] 状态：**待实现** | 负责：DeepSeek | 审查：Codex

## 一、问题定义

**现状**：`kb/` 下有 15+ 个 markdown 文件（产品策略、PRD 模板、11 份 JD），找信息只能靠人工翻文件。当知识库扩展到 50+ 文档时，这个问题会严重阻碍 PM 工作效率。

**目标状态**：输入一个查询（如"RAG 知识库"或"项目管理能力"），自动从 `kb/` 中返回最相关的 3-5 个文档片段，带来源标注。

**为什么重要**：这是 RAG 的 "R"（Retrieval）。没有检索，知识库就只是一个文件夹，不是智能工作台。

## 二、技术约束

| 约束 | 说明 |
|---|---|
| 运行时 | Node.js 24（已装） |
| 语言 | JavaScript（项目现有脚本均为 JS） |
| 禁止 | Python、外部 API（OpenAI embedding 等）、向量数据库 |
| 新依赖 | ≤ 2 个 npm 包 |
| 中文 | 必须支持中文查询（文档以中文为主） |

## 三、技术方案

### 方案选型：基于 TF-IDF 的关键词检索

不引入 embedding 模型，用纯文本的 TF-IDF（词频-逆文档频率）实现检索。

**为什么选这个**：
- 零外部依赖，纯 Node.js 可运行
- 中文分词可用 `nodejieba`（成熟的 Node.js 中文分词库，1 个依赖）
- TF-IDF 是信息检索的经典基线，后续可平滑升级到 embedding
- 代码量小（< 200 行），容易理解和维护

### 架构

```
用户查询
  │
  ▼
┌──────────┐    ┌───────────┐    ┌──────────────┐
│ 中文分词  │ →  │ TF-IDF    │ →  │ Top-K 排序    │
│ (jieba)  │    │ 计算相似度 │    │ + 来源标注    │
└──────────┘    └───────────┘    └──────────────┘
```

### 文件设计

```
kb/
├── search.mjs          ← 检索脚本（入口）
├── lib/
│   ├── indexer.mjs     ← 文档切块 + TF-IDF 索引构建
│   └── retriever.mjs   ← 查询匹配 + 排序 + 格式化输出
├── .search-index.json  ← 预构建的索引缓存（可选优化）
└── ...（现有文件不动）
```

### 核心算法

1. **文档切块**：按 `## ` 标题切分每个 md 文件为 chunk，每个 chunk 保留来源文件和标题
2. **分词**：用 `nodejieba` 对每个 chunk 分词
3. **构建索引**：计算每个词在每个 chunk 中的 TF-IDF 值
4. **查询处理**：对查询分词，计算与每个 chunk 的余弦相似度
5. **排序输出**：返回 Top-K 个 chunk，标注来源文件和段落标题

## 四、任务拆解（给 DeepSeek 的执行清单）

### Task 1：安装依赖 + 项目初始化
- 在 `kb/` 下执行 `npm init -y` 和 `npm install nodejieba`
- 确认 `nodejieba` 能正常 import 和分词
- **验证**：运行 `node -e "require('nodejieba').cut('你好世界')"` 输出分词结果

### Task 2：实现文档切块（indexer.mjs）
- 读取 `kb/` 下所有 `.md` 文件（排除 `node_modules/`、`.git/`）
- 按 `## ` 标题切分，每个 chunk 包含：`{source, heading, text}`
- 递归处理 `kb/jobs/` 子目录
- **验证**：写一个简单的测试，输出 chunk 数量和前 3 个 chunk 的来源

### Task 3：实现 TF-IDF 索引（indexer.mjs）
- 对每个 chunk 的 `text` 字段分词
- 计算 TF（词在 chunk 中的频率）和 IDF（词在全部 chunk 中的逆文档频率）
- 每个 chunk 表示为一个 TF-IDF 向量（稀疏表示：`{word: tfidf_value}`）
- **验证**：对"产品经理"这个词，能输出它在哪些 chunk 中出现、TF-IDF 值是多少

### Task 4：实现查询与检索（retriever.mjs）
- 对查询文本分词
- 计算查询向量与每个 chunk 的余弦相似度
- 返回 Top-K（默认 K=5）个最相关 chunk
- 输出格式：来源文件 + 段落标题 + 相关度分数 + 原文前 200 字
- **验证**：输入"RAG"，能返回 product-strategy.md 中的相关段落

### Task 5：实现 CLI 入口（search.mjs）
- 命令行用法：`node kb/search.mjs "查询内容"`
- 可选参数：`--top N`（默认 5）、`--verbose`（显示分词过程）
- 首次运行自动构建索引，后续可直接使用
- **验证**：至少 3 个不同查询能返回合理结果

### Task 6：编写测试
- 创建 `kb/test/search.test.mjs`
- 测试用例：
  1. 中文查询命中中文文档（"产品经理" → jobs/ 下的 JD）
  2. 英文查询命中英文内容（"Agent" → apple-*.md）
  3. 无关查询返回低分结果（"天气预报" → 所有 chunk 分数 < 0.1）
  4. 返回结果包含来源标注（source 字段非空）
- **验证**：全部测试通过

## 五、风险与回滚

| 风险 | 概率 | 应对 |
|---|---|---|
| nodejieba 安装失败（C++ 编译问题） | 中 | 回退到简单分词（按字符 n-gram），不依赖 C++ |
| TF-IDF 对短查询效果差 | 中 | 加 BM25 变体（仍不引入新依赖） |
| 索引构建慢（大文件） | 低 | 加 `.search-index.json` 缓存 |

**回滚**：所有新增文件在 `kb/` 和 `kb/lib/` 和 `kb/test/` 下，删除即可回滚，不影响现有文件。

## 六、给 DeepSeek 的完整启动指令

复制以下内容到 Claude Code（`<project-dir>` 目录下）：

```
读取 ai-workspace/plans/001-kb-retrieval/plan.md 和 acceptance.md。

以编码主力身份，按 plan.md 的 Task 1-6 顺序实现知识库检索系统。
每完成一个 Task，在 report.md 追加进度记录（含验证命令和输出）。
全部完成后填 report.md 的最终报告部分。

约束：
- 用三审查工作流（/three-review）启动实现
- 每个 Task 完成后运行验证命令，把输出贴进 report.md
- 遇到阻塞写 handoff/ 文件等决策，不要自己猜
- 新依赖不超过 2 个，优先 nodejieba
- 不改现有文件（gen_prd_draft.js、kb/*.md 内容）
```
