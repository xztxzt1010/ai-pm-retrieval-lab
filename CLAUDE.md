# Project Workflow

Use /three-review for substantial development tasks in this project.

## Project context

- Domain: 产品经理智能工作台（测试项目）。用于验证 Claude Code 的三审查工作流、6 个 Agent 角色、GitHub MCP 与文档 skills 的完整配置是否生效。
- Structure:
  - `index.html` — 产品网页（RAG 知识库链接 + Agent 工作流链接）
  - `kb/` — RAG 知识库（markdown 种子文档，后续可接向量检索）
  - `AGENT_WORKFLOW.md` — 六角色协作设计
  - `VERIFY.md` — 配置验证清单（重启后逐项执行）
- Main risks: 验证项容易因 session 未重启而误判（agents/skills/MCP 在启动时加载）
- Verification: 见 VERIFY.md 的精确命令与成功标志

## Rules

- Keep changes directly tied to the user's request.
- Prefer the smallest reversible change that produces evidence.
- Do not add dependencies, storage, UI, architecture, or background services unless required.
- 算法/稳定性任务给指标证据，不允许只宣称"优化了"。

## Workflow expectations

- 大任务以 `/three-review` 启动；回复以状态栏开头：`Workflow: three-review` / `Stage` / `Scope`。
- 阶段：premise → assumption → implementation → range-review → final。
- subagent 不可用时在主对话中模拟三个独立角色，不要跳过审查。
- 小问题（解释代码、查文件、改一行文案）直接回答，不走三审查。
