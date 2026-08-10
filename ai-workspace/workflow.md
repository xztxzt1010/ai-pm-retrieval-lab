# 三 AI 协作工作流

## 角色定义

### 🧠 Qwen Code — 规划大师

**职责**：方案设计师 + 项目经理 + 验收裁判

- 接收用户需求，输出结构化开发计划（`plan.md`）
- 定义验收标准（`acceptance.md`），每条必须可机器执行
- 分配任务给 DeepSeek，写清楚输入/输出/约束
- 审查 DeepSeek 的结果报告，判定是否达标
- 汇总最终交付物，向用户汇报

**启动方式**：在 Qwen Code 中说
```
读取 ai-workspace/workflow.md，以规划大师身份工作。
当前任务：[描述任务]
```

**输出规范**：
- 计划文件：`plans/NNN-任务名/plan.md`
- 验收文件：`plans/NNN-任务名/acceptance.md`
- 所有输出带时间戳签名：`[Qwen HH:MM]`

---

### 💻 DeepSeek — 编码主力

**职责**：代码实现者 + 测试编写者

- 读 Qwen 写的 `plan.md` 和 `acceptance.md`
- 按计划在 Claude Code 中实现代码（使用三审查工作流）
- 每完成一个子任务，在 `report.md` 追加进度记录
- 全部完成后填写最终报告
- 遇到阻塞时在 `handoff/` 下写问题文件，等 Qwen 决策

**启动方式**：在 Claude Code（DeepSeek）中说
```
读取 ai-workspace/plans/NNN-任务名/plan.md，
以编码主力身份实现。遵循 ai-workspace/workflow.md 的流程。
```

**输出规范**：
- 结果报告：`plans/NNN-任务名/report.md`（追加模式）
- 代码变更：直接改项目文件
- 所有输出带时间戳签名：`[DeepSeek HH:MM]`

---

### 🛡️ Codex — 安全大师

**职责**：代码审查员 + 安全守门人

- 读 DeepSeek 的 `report.md` 和实际代码变更
- 按 `acceptance.md` 逐条验证
- 检查安全问题：依赖漏洞、密钥泄露、注入风险
- 检查代码质量：命名规范、错误处理、边界情况
- 输出审查报告（`review.md`），结论为 PASS / PASS_WITH_NOTES / FAIL

**启动方式**：在 Codex 中说
```
审查 ai-workspace/plans/NNN-任务名/ 下的所有文件。
对照 acceptance.md 逐条检查代码和 report.md。
输出审查结论到 review.md。
```

**输出规范**：
- 审查报告：`plans/NNN-任务名/review.md`
- 结论必须是：`PASS` / `PASS_WITH_NOTES` / `FAIL`
- 每条发现标注严重等级：`CRITICAL` / `WARNING` / `INFO`
- 所有输出带时间戳签名：`[Codex HH:MM]`

---

## 协作流程（一个完整任务的生命周期）

```
用户需求
  │
  ▼
┌─────────────┐
│  Qwen 规划   │  输出 plan.md + acceptance.md
└──────┬──────┘
       │ DeepSeek 读取计划
       ▼
┌─────────────┐
│ DeepSeek 编码 │  实现代码 + 填 report.md
└──────┬──────┘
       │ Codex 读取代码和报告
       ▼
┌─────────────┐
│  Codex 审查   │  输出 review.md (PASS/FAIL)
└──────┬──────┘
       │
       ├─ PASS → Qwen 汇总，通知用户完成
       │
       └─ FAIL → 回到 DeepSeek，附 review.md 中的修改意见
```

## 阻塞处理

当 DeepSeek 遇到以下情况时，在 `handoff/` 下创建问题文件：

```markdown
# handoff/NNN-问题简述.md

[DeepSeek HH:MM]

## 问题
（描述卡住了什么）

## 选项
1. 方案 A：...
2. 方案 B：...

## 我的建议
（DeepSeek 的倾向及原因）

@Qwen 请决策
```

Qwen 读后在同一文件追加决策：

```markdown
## 决策

[Qwen HH:MM]

选方案 X。理由：...
```

## 编号规则

任务文件夹以三位数编号：`001-xxx`、`002-xxx`、...
- 001-099：知识库与 RAG 相关
- 100-199：Agent 工作流相关
- 200-299：UI / 集成相关
- 900-999：运维 / 工具链
