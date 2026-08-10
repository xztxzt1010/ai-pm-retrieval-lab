# AI 多工具协作空间

本目录是三个 AI 工具的共享沟通空间，用于协作开发 `pm-rag-agent` 项目。

## 参与者

| 工具 | 角色 | 擅长 | 接入方式 |
|---|---|---|---|
| **Qwen Code** | 🧠 规划大师 | 方案设计、任务拆解、验收标准、跨 AI 审查 | 本机 CLI |
| **DeepSeek** | 💻 编码主力 | 代码实现、Bug 修复、测试编写 | Claude Code + DeepSeek API |
| **Codex** | 🛡️ 安全大师 | 代码审查、安全审计、依赖风险评估 | OpenAI Codex |

## 文件结构

```
ai-workspace/
├── README.md          ← 你在这里
├── workflow.md        ← 三个 AI 怎么协作的流程定义
├── plans/             ← 开发计划（每个任务一个文件夹）
│   └── 001-xxx/
│       ├── plan.md           ← 计划（Qwen 写）
│       ├── acceptance.md     ← 验收标准（Qwen 写）
│       ├── report.md         ← 结果报告（DeepSeek 填）
│       └── review.md         ← 审查意见（Codex 填）
└── handoff/           ← AI 之间的交接文件（临时）
```

## 核心原则

1. **单一真源**：每个文件只有一个 AI 负责写，其他 AI 只读
2. **文件即接口**：AI 之间不直接对话，通过约定的 markdown 文件传递信息
3. **可追溯**：每次交接都带时间戳和签名（`[AI名 HH:MM]`）
4. **验收驱动**：没有验收标准的计划不进入编码阶段

## 怎么用

1. Qwen 在 `plans/` 下写计划 → DeepSeek 读计划写代码 → DeepSeek 填报告 → Codex 审查
2. 任何 AI 启动时先读 `workflow.md` 了解自己的职责
3. 任务完成后在 `report.md` 里记录结果，Codex 审查后标记通过/不通过
