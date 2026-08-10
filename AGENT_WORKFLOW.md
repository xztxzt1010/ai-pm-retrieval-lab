# Agent 工作流设计（本测试项目）

本项目用六个 Agent 角色支撑产品研发的每一步，来自三审查工作流方法论。

## 六个角色

| 角色 | 视角 | 出场时机 | 输出判定 |
|---|---|---|---|
| **premise-overturner** | 方向：是不是非做不可？ | 实现前 | PROCEED / PROCEED_WITH_SMALLER_APPROACH / RECONSIDER_DIRECTION / DO_NOT_BUILD_YET |
| **assumption-challenger** | 假设：哪里默认了"没问题"？ | 实现前 + 最终 diff 后 | LOW_RISK / MEDIUM_RISK / HIGH_RISK |
| **range-creep-guardian** | 范围：有没有做多了？ | 实现后 | IN_SCOPE / MOSTLY_IN_SCOPE_WITH_WARNINGS / RANGE_CREEP_DETECTED |
| **test-designer** | 验证：怎么证明做对了？ | 复杂任务 | 测试清单 + 最小验证命令 |
| **metric-gate** | 证据：指标呢？ | 优化/稳定性任务 | 指标 + 采集方法 + 基线对照 |
| **rollback-planner** | 恢复：改坏了怎么办？ | 高风险变更 | 回滚步骤 + 备份点 + 停止条件 |

## 对本项目的用法（PM 场景示例）

- 写 PRD：用 `assumption-challenger` 暴露需求里的隐性假设（用户场景、边界、指标口径）。
- 排需求优先级：用 `premise-overturner` 挑战"这个功能是不是非做不可"。
- 提测：用 `test-designer` 设计验证用例，用 `metric-gate` 要求上线指标。
- 上线：高风险变更加 `rollback-planner`。

## 执行方式

- 优先尝试 subagent 独立审查（`premise-overturner` 等）。
- DeepSeek 端点上 subagent 大概率不可用 → 主对话分角色模拟，**不要跳过审查**。
- 大任务启动：`/three-review`；回复应以状态栏开头（Workflow/Stage/Scope）。
