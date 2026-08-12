# PM RAG Agent

面向 AI 产品经理求职作品集的本地实验项目。它记录了从工作流设计、知识库检索基线，到产品经理工作台 MVP 的完整演进过程。

> 当前状态：本地可运行的 MVP。检索层使用 TF-IDF，并非完整的向量 RAG；Agent 工作流的核心 skills/agents 仍有一部分位于作者本机配置中，公开可复现版本正在整理。

## 三个项目板块

### 1. Agent 审查工作流

通过前提、假设、范围、测试、指标和回滚六类检查，约束 AI 辅助开发中的方向偏差、隐含假设和范围蔓延。

- 设计说明：[`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md)
- 多 AI 文件协作：[`ai-workspace/workflow.md`](ai-workspace/workflow.md)
- 任务记录：[`ai-workspace/plans/`](ai-workspace/plans/)

这部分当前主要证明方法设计与过程记录。下一阶段是将可分发的 skills/agents、安装说明和对照评测纳入仓库。

### 2. 本地知识库检索

`kb/` 是独立 Git 子模块，已实现：

- Markdown 递归扫描与按标题切块
- jieba 中文分词与领域词典
- TF-IDF 稀疏向量与余弦相似度
- Top-K CLI 检索与来源标注
- 中文、英文、无关查询及边界测试

```powershell
git clone --recurse-submodules https://github.com/xztxzt1010/pm-rag-agent.git
cd pm-rag-agent\kb
npm install
npm test
node search.mjs "RAG 知识库" --top 5 --verbose
```

### 3. 产品经理工作台

`showcase/` 提供一个零新增依赖的本地展示应用，包括：

- 知识库实时检索
- AI 产品经理能力分析图表
- 六角色 Agent 工作流展示
- Qwen / DeepSeek / Codex 协作进度

```powershell
cd pm-rag-agent
npm install --prefix kb
node showcase/server.mjs
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 架构

```text
浏览器工作台
    │ /api/search
    ▼
Node.js 原生 HTTP 服务
    │
    ├── TF-IDF 检索器 ── Markdown 知识库
    ├── 能力分析数据
    └── ai-workspace 任务进度
```

## 验证状态

- 知识库：13 个行为与边界测试通过
- 依赖：`npm audit --omit=dev --prefix kb` 为 0 个已知漏洞
- 工作台：桌面与 375px 浏览器实测通过，无水平溢出、无控制台错误
- 安全：静态文件白名单、输入长度限制、HTML 转义；未提交本地权限配置或凭据

详细证据见：

- [`001 检索审查`](ai-workspace/plans/001-kb-retrieval/review.md)
- [`100 工作流受限审查`](ai-workspace/plans/100-six-role-drill/review.md)
- [`200 工作台审查`](ai-workspace/plans/200-showcase-frontend/review.md)

## 已知局限

- 当前检索是词法 baseline，尚未加入 embedding、混合检索、reranker 和带引用回答生成。
- GitHub Pages 不能运行本项目的 Node 搜索 API；在线预览需要支持 Node.js 的托管环境，或增加纯静态演示降级。
- 能力图表数据目前来自一次离线报告，源数据更新后需要重新生成或同步。
- 工作流尚缺少普通模式与三审查模式的量化对照实验。

## 安全说明

- 不要把 GitHub PAT、模型 API Key 或本地 `.env` 提交到仓库。
- `.claude/settings.local.json` 属于本机权限配置，已通过 `.gitignore` 排除。
- 发现凭据泄露时应立即撤销并重新生成最小权限、短有效期凭据。

## Roadmap

1. 发布可复现的 Agent workflow 包与固定评测集。
2. 将检索升级为 BM25 + 本地 embedding + RRF/rerank 的混合方案。
3. 增加带来源回答、PRD 生成、版本差异和人工确认闭环。
4. 部署在线只读演示，并加入 CI、安全扫描和浏览器回归测试。
