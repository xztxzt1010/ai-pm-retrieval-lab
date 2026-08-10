# 配置验证清单

> 所有 agents / skills / MCP 都在 **Claude Code 启动时加载**。**必须重启 session**（关掉当前会话，在这个文件夹重新 `claude`）再逐项验证。
>
> 每一项都给出：**操作** → **观察什么** → **成功标志** → **失败排查**。

---

## 0. 前置：重启

```bash
cd E:\pm-rag-agent
claude
```

启动后先确认三件事：

```bash
claude --version          # 应 ≥ 2.1.222
```

---

## ✅ 检查 1：GitHub MCP 工具（mcp__github__*）

**操作**：直接对 Claude 说：

> 用 GitHub MCP 工具查一下我自己的账号信息，或者列一下我的仓库。

**观察**：Claude 是否调用 `mcp__github__*` 前缀的工具。

**成功标志**：
- 对话/转录中出现工具调用 `mcp__github__get_authenticated_user`（或 `list_my_repositories` 等）；
- 返回了账号数据（`xztxzt1010`），即使仓库列表为空也是成功（说明 token 生效）；
- 或者输入 `/mcp` 打开 MCP 面板，能看到 `github` 为 **Connected**，工具列表里有一堆 `github_*` 工具。

**失败排查**：
- `/mcp` 显示 github 是 Disconnected → 检查 `~/.claude.json` 里 mcpServers.github 配置，或重新 `claude mcp list`。
- 工具调用了但报 401/403 → token 失效，需在 GitHub 重建并更新配置。
- 没看到 `mcp__github__*` → session 未重启，或 MCP 面板里 github 没启用。

---

## ✅ 检查 2：/agents 显示 6 个三审查角色

**操作**：输入：

```text
/agents
```

**观察**：交互菜单里（切到 **Library** / 全部 tab）能看到用户级 agent。

**成功标志**：出现以下 6 个名字：
```
premise-overturner      assumption-challenger   range-creep-guardian
test-designer           metric-gate             rollback-planner
```

**补充验证（角色真正可用）**：对 Claude 说：

> 用 premise-overturner 的视角审查一下"给这个测试项目加个登录功能"这个需求方向。

**成功标志**：Claude 输出 `verdict: ...`。**实测（2026-08-05）本端点上 6 个审查角色全部真实 spawn 成功并返回 verdict**，这是理想结果；若 API 波动导致 spawn 失败，走主对话模拟（`[simulated role: ...]`）也算通过。

**失败排查**：
- 看不到 6 个名字 → 检查 `C:\Users\xzt23\.claude\agents\` 下 6 个 md 文件是否存在；重启 session。
- 注意：如果在测试项目里建了同名项目级 agent，会覆盖用户级，属正常。

---

## ✅ 检查 3：document-skills 能力（生成 docx）

**操作**：对 Claude 说：

> 用文档能力生成一个 docx，标题为"三审查工作流验证"，正文写三句话介绍这个流程，保存到 E:\pm-rag-agent\ 下。

**观察**：Claude 是否加载 docx skill（会在思考里参考 SKILL.md），用 Node 写脚本调用 `docx` 包生成文件。

**成功标志**：
- 生成了 `E:\pm-rag-agent\*.docx`，文件大小 > 0，能双击打开；
- 对话里能看到它创建/运行了 `.js` 脚本。

**失败排查**：
- `Cannot find module 'docx'` → 让它 `npm install docx` 后重试（Node 24 已装，首次需装依赖）。
- 没触发 skill → 试试更明确的措辞"生成 Word 文档"；重启 session 后再试。
- 报 Python/pandoc 错 → 那是**读取/渲染**能力，本机没装 Python/LibreOffice；**创建**功能不需要它，坚持"生成"路径。

---

## ✅ 检查 4：/three-review 工作流状态栏

**操作**：用标准模板启动：

```text
/three-review

我现在的问题：想给这个测试项目加一个"从知识库生成 PRD 初稿"的功能，但不确定该先做检索还是先做模板。

我希望得到的结果：一个最小可用的"选知识库文档 → 生成 PRD 初稿"流程。

这次不要做：不要做 UI 美化，不要接数据库，不要训练模型，不要重构。

完成标准：能从 kb/ 下任意 2 个文档生成一份 PRD 初稿，且能说明每一步怎么验证。
```

**观察**：回复开头是否有状态栏。

**成功标志**（以下两行必须出现在回复开头）：
```
Workflow: three-review
Stage: premise
Scope: 本轮只处理 <你的需求边界>
```
随后按阶段推进：`premise` → `assumption` → `implementation` → `range-review` → `final`，最后给出交付报告（改了什么/验证了什么/没验证什么/剩余风险）。

**失败排查**：
- 没有状态栏、直接开始写代码 → 补一句"继续三审查工作流，只处理刚才这个需求，不要扩大范围"。
- 停在某个阶段不推进 → 说"先停一下。按 three-review 输出当前 Stage、Scope、premise verdict、assumption verdict、range verdict，再继续。"

---

## ✅ 检查 5（已自动验证过）：hook 自动兜底

**操作**：随便提交一个大任务 prompt（比如"实现一个登录功能"）。

**观察**：上下文中是否注入 `[three-review gate] ...` 提醒。

**成功标志**：对话中出现该提醒文本。**本 session 里已实测触发过两次，这条基本无需再验。**

---

## ✅ 检查 6：六角色全出场痕迹（一次运行验证六角色设计）

**目的**：检查 2 只证明"6 个角色定义存在"，检查 4 只证明"流程能跑"。本项用**一次运行**证明六个角色在同一个任务里全部真实出场、各留可检索痕迹、各有实质输出。

**操作**：开一个**新 session**，输入 `/six-role-drill`，工作对象传本次要验证的文件。PRD 实例（见下）。skill 会驱动六个角色全部出场、各自输出固定首键并给出自证块。

**PRD 实例的工作对象**（重跑时原样传入）：
- `E:/pm-rag-agent/PRD初稿.docx`
- `E:/pm-rag-agent/gen_prd_draft.js`
- `E:/pm-rag-agent/kb/product-strategy.md`
- `E:/pm-rag-agent/kb/prd-template.md`

**metric-gate 口径（PRD 实例，重跑需复用或显式替换）**：
- 完整度 = PRD初稿.docx 文本中六节标题（背景与问题/目标与完成标准/范围/用户场景与边界/验证方案/风险与回滚）出现数，目标 = 6。
- 覆盖率 = 文本中 product-strategy.md 关键短语（RAG 知识库、Agent 工作流、三审查）的命中节数，目标 ≥ 2 且能指出来源文档。
- 采集命令一律只读（Node zlib 解压 word/document.xml 后计数 / unzip -p），禁止运行生成脚本。

**成功标志（5 项全过才算通过；grep 细节见 `six-role-drill` skill 的"转录 grep 清单"段，单一真源）**：
1. `Workflow: three-review` 命中；
2. 六个角色每个都有 spawn 或 `[simulated role:]` 标记；
3. 每个角色的输出首键（`verdict` / `test_plan` / `metrics` / `rollback_steps`）命中；
4. `### 六角色出场自证` 命中；
5. 工作对象 mtime/size 未变（前后各 `ls -l --time-style=+%T` 对比）。

**结果记录**：每角色记一列 `spawn` / `simulated`。若 6 个角色**全部** simulated → 说明 subagent 当前不可用，回检查 2 排查，**不算全绿**。

**历史证据（旧内联指令版，2026-08-06）**：六角色全部 spawn（0 simulated，全绿），5 项成功标志全过，PRD初稿.docx（10427B/12:48:33）前置后置一致。该轮验证的是内联指令版；换成 `/six-role-drill` skill 版属不同机制，按上面"操作"重跑一次才算覆盖。

**失败排查**：
- 某角色 spawn/simulated 标记没命中 → 先看转录是否捕获全（`/export` 重导），再补一句"继续演练，确保六个角色全部出场，不要跳过任何角色"。
- 角色有输出块但只有键名没内容 → 该角色重做。
- subagent 报错 → 允许 `[simulated role: ...]` 回退，同样算痕迹；全部 simulated 则回检查 2 排查。
- 演练验证的是**机制与格式**（角色能 spawn、输出约定格式）；"真实任务中触发时机的语义正确性"需一次自然任务，本项不覆盖。

---

## 结果记录表

| 检查项 | 通过 ? | 备注 |
|---|---|---|
| 1. GitHub MCP（mcp__github__*） | ☑ | 2026-08-05 调用 `mcp__github__get_me` 返回 xztxzt1010，token 生效 |
| 2. /agents 6 角色 | ☑ | 6 个 md 文件在 `C:\Users\xzt23\.claude\agents\`，agent 列表已加载 |
| 3. document-skills 生成 docx | ☑ | 生成 `三审查工作流验证.docx`（8823B，ZIP/XML 校验通过）；首次需 `npm install docx` |
| 4. /three-review 状态栏 | ☑ | 2026-08-05 真实启动测试通过：状态栏出现；6 个 subagent 均可 spawn；premise/assumption/range/final 全流程跑通 |
| 5. hook 自动兜底 | ☑ | session 启动时 `[three-review gate]` 提醒已注入 |
| 6. 六角色全出场痕迹 | ☑ | 2026-08-06 新 session 实测通过：六角色全部 spawn（0 simulated，全绿）；5 项成功标志全过；PRD初稿.docx（10427B/12:48:33）前置后置一致 |

全部 ☐ 打勾 → 整套配置验证成功。哪项失败，把现象贴回主项目会话，我来排查。
