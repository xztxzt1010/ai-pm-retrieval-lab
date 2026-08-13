# 201 — 结果报告

> DeepSeek 在实现过程中追加此文件。

## 实现进度

### 阶段回顾（三审查）

| 阶段 | 角色 | 结论 | 对实现的影响 |
|---|---|---|---|
| premise | premise-overturner | RECONSIDER_DIRECTION（质疑 style.css 已够用、CDN 引入离线风险） | **驳回**：用户明确指令 + CLAUDE.md Frontend rules 强制 Tailwind CDN、禁止自定义 CSS。CDN 离线风险带进残余风险，用最小降级横幅承接 |
| assumption | assumption-challenger | MEDIUM_RISK，7 条硬规则 | 全部落实：闭合类名映射、渐变 fill 分离、group-open、单份 DOM、setStatus 重映射、server.mjs 只删白名单、无 tailwind.config |
| 实现 | DeepSeek（本报告） | — | 见下方变更清单 |
| range-review | range-creep-guardian | **IN_SCOPE** | 全部改动可追溯，kb/ 零改动，server.mjs 仅删 2 行 |
| final | assumption-challenger（最终 diff 后） | **LOW_RISK**，7 条规则逐条 ✅ | 唯一建议修复项「并发搜索竞态」已落实（行为仿真 6/6 断言通过） |

### 有意的裁剪（设计内决策，非越界）

- **砍掉入场/柱状生长动画**：plan Task 4 的 IO 入场动画、柱状生长动画未实现。assumption-challenger 明确判定「砍掉生长动画不构成回退」，AC 未要求。因无自定义动画，**不需要 tailwind.config**（色板全为默认 Tailwind 色），同时避开了 config-必须在-CDN-前的时序坑。
- **保留 setStatus 文案 + 骨架屏并存**：AC-4「不再显示纯文字搜索中…」以骨架屏为主加载态，状态行保留信息性文案。

---

## 最终报告

### 变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `showcase/showcase.html` | 重写 | 删 style.css link；加 Tailwind CDN 单行 script；新增 Hero 深色渐变（slate-900→slate-800）+ 3 徽章；四区卡片化（rounded-2xl/shadow-sm）；Agent 时间线（桌面横向/移动端纵向连线 + 编号节点 + hover:scale-105）；多 AI 卡片主题色（Qwen=indigo/DeepSeek=emerald/Codex=amber）+ SVG 箭头（rotate-90 lg:rotate-0）；进度条渐变；footer 深色呼应；新增 #cdn-fallback 降级横幅 |
| `showcase/app.js` | 重写 | 保留 escapeHtml/highlightSnippet/doSearch/loadStats/CAPABILITIES 与全部 API 调用；骨架屏 skeletonHTML()（3 个 animate-pulse 块）；结果卡片左侧彩色竖条 SCORE_BAR 闭合映射（高分 border-l-indigo-500/中分 border-l-emerald-500/低分 border-l-amber-400）；能力柱 i<2 金色渐变 url(#capGold)/其余 url(#capIndigo)；STATUS_TONE/STATUS_BADGE 闭合映射（style.css 删除所强制）；**并发防护**（新搜索 abort 上一次 in-flight，stale-check 防旧响应覆盖）；window.load 检测 tailwind 缺失显示降级横幅 |
| `showcase/style.css` | 删除 | 363 行全部移除，样式 100% Tailwind utility classes |
| `showcase/server.mjs` | 修改 | STATIC 白名单去掉 `'/style.css': 'style.css'` 一行 + 头部路由注释同步。**仅此 2 行**，无任何 API/逻辑改动（MIME 残留 `.css` 映射无害，无对应文件不会命中） |

### 验证摘要

| AC | 结果 | 证据 |
|---|---|---|
| AC-1 | ✅ | `grep -c 'src="https://cdn.tailwindcss.com"'` = 1；仅此一个外部 script，无 rel=stylesheet；`curl /` 200 |
| AC-2 | ✅ | style.css 已删除（`git status` D；`test -f` → DELETED）；HTML 内无 style.css 引用（grep = 0） |
| AC-3 | ✅ | `bg-gradient-to-br from-slate-900 to-slate-800` 深色 Hero + 大标题/副标题/3 徽章（grep 命中） |
| AC-4 | ✅ | skeletonHTML() 3 个 `animate-pulse` 灰色块（grep = 3）；行为仿真确认返回后骨架屏替换为结果、无残留 |
| AC-5 | ✅ | 结果卡片 `border-l-4` + 三色竖条各命中 1（high=indigo/mid=emerald/low=amber，按返回排名分档=分数段） |
| AC-6 | ✅ | 图表容器 `bg-slate-800 rounded-2xl`；capGold/capIndigo 渐变各 2 命中（HTML defs + app.js 引用）；数字 `font-mono`（grep = 4） |
| AC-7 | ✅ | 时间线布局（`grid-cols-1 lg:grid-cols-6` + 横向/纵向连线 + 编号节点）；文字箭头 `→` = 0，SVG 箭头 = 2；hover:scale-105 = 6 |
| AC-8 | ✅ | Qwen=indigo / DeepSeek=emerald / Codex=amber 三色卡片（图标/徽章/边框/背景同色系，grep 各命中） |
| AC-9 | ✅ | sm: 19 + lg: 47 前缀（app.js 另有 sm: 2）；无 @media（grep = 0）；单份 DOM 响应式（flex-col lg:flex-row + 箭头 rotate-90） |
| AC-10 | ✅ | `/api/stats` 结构逐字段一致（files:15/chunks:64/vocabSize:1061/progress 6/6 completed）；`/api/search` 结构一致（query/tokens/count/results）；`/style.css` 200→404；400 校验（无 q / top=abc）均正确；node --check 通过 |

### 残余风险（交付即接受，不扩大需求）

1. **CDN 离线时页面无样式**（premise 首flag）：降级横幅依赖 window.load 触发、且横幅自身无 Tailwind 样式时以纯文本显示——功能可用、醒目度低；若 CDN 请求挂起而非失败，load 事件会被拖住。已用最小横幅缓解，不做进一步兜底。
2. **Play CDN 运行时编译**：动态注入的 `[&_mark]:bg-amber-200` 等任意变体由 MutationObserver 捕获，结果高亮有几十毫秒的默认黄 FOUC（`<mark>` 浏览器原生即高亮，功能从不缺失）。跨大版本 Tailwind 时 `border-l-{color}` 与 `border-{color}` 的输出顺序不保证（当前 Play CDN 锁定 v3.4，稳定成立）。
3. **手动验证项未执行**（无浏览器环境）：375px 无横向滚动、Slow 3G 下骨架屏可见性、视觉审美需 Codex 或用户在浏览器确认。

### 后续建议

1. Codex 在浏览器打开 `node showcase/server.mjs`（端口 3000）后逐条对照 acceptance.md 做视觉验证，重点看 AC-3/AC-5/AC-6/AC-9 的主观项。
2. 若需长期稳定，可将 Tailwind 替换为构建产物（脱离 CDN），属独立任务，非本任务范围。

[DeepSeek 13:29] 最终报告完成

---

> **历史快照说明（2026-08-12 整改时追加，不改写原报告）**：AC-10 中 `/api/stats` 的 `vocabSize: 1061` 是 201 任务完成时（语料为当时版本）的历史数值。此后 kb/README.md 内容变化（追加 `eval/` 目录纪律、标题与说明改写）持续影响词表大小，复测轨迹 1061 → 1075 → **1092**（2026-08-12 整改后实测）。数值随语料内容变化属预期行为，历史报告数值保留不改写；以 `node showcase/server.mjs` 实际输出的 `/api/stats` 为准。
