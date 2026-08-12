# 201 — 展示前端 Tailwind 重写

> [Qwen 2026-08-12] 状态：**待实现** | 负责：DeepSeek | 审查：Codex
> 前置：200-showcase-frontend（已完成，10/10 AC）

## 一、问题定义

**现状**：200 号任务交付的展示页功能完整（搜索/图表/Agent 流/协作看板），但视觉设计偏朴素——白底灰边、无渐变、无层次感、卡片投影弱。给 HR 展示时缺乏"产品感"。

**目标状态**：用 Tailwind CSS CDN 重写全部样式，达到 Notion/Linear/Vercel 级别的产品展示质感。

**为什么重要**：这是 AI 产品经理求职作品集的门面。HR 的第一印象取决于页面视觉质量——3 秒内决定是否继续看。

## 二、技术约束

| 约束 | 说明 |
|---|---|
| Tailwind | 仅用 CDN 方式：`<script src="https://cdn.tailwindcss.com"></script>` |
| 禁止 | npm install、构建工具、PostCSS、任何新 npm 依赖 |
| style.css | **删除**。所有样式用 Tailwind utility classes 内联到 HTML |
| app.js | 交互逻辑保留，DOM 操作改为生成 Tailwind class 的元素 |
| 后端 | `server.mjs` 不改（静态文件路由需去掉 style.css） |
| 响应式 | 必须（Tailwind 的 sm:/md:/lg: 前缀） |

## 三、设计语言（给 DeepSeek 的视觉指南）

### 整体风格
- **深色 Hero + 浅色内容区**：顶部 Hero 用深色渐变（slate-900 → slate-800），内容区白底
- **卡片**：白色背景 + 细微 border + 柔和 shadow-lg + rounded-2xl + hover:shadow-xl 过渡
- **间距**：大量留白，section 间 py-16~py-20
- **字体**：中文用系统默认，英文/代码用 `font-mono`

### 配色
- 主色：`indigo-600`（蓝紫，比纯蓝更高级）
- 辅助：`emerald-500`（绿色，成功状态）
- 深色区：`slate-900` / `slate-800`
- 背景：`gray-50`（内容区）
- 文字：`slate-900`（标题）/ `slate-500`（副文字）

### 四大区域的具体设计

**① Hero（新增，替代当前 header）**
```
全宽深色渐变背景（slate-900 → slate-800）
左侧：大标题 + 副标题 + 3 个标签徽章
右侧（可选）：搜索框直接放在 Hero 里
底部：向下滚动箭头动画
```

**② 知识库检索**
- 搜索框：rounded-xl + ring 聚焦效果 + 搜索图标（SVG inline）
- 结果卡片：左侧彩色竖条（按分数高低 indigo/emerald/amber）
- 分数用彩色 badge
- Loading：骨架屏（3 个 pulse 动画的灰色矩形）

**③ 能力图表**
- 柱状图容器：深色背景卡片（slate-800），柱子用渐变色
- 每个柱子末端带发光效果
- 排名前 2 的柱子用金色（amber-400），其余用 indigo-400
- 数字用等宽字体 + 右对齐

**④ Agent 工作流**
- 6 个角色用横向时间线布局（不是简单卡片排列）
- 每个角色节点：圆形图标 + 连线 + 下方卡片
- 悬停卡片放大效果（scale-105）
- details 展开用平滑高度过渡

**⑤ 多 AI 协作**
- 3 个 AI 卡片更大、更突出
- 每个 AI 有自己的主题色：Qwen=indigo、DeepSeek=emerald、Codex=amber
- 箭头用 SVG（不是文字 →）
- 进度条用渐变 + 动画

**⑥ Footer**
- 简洁一行，深色背景与 Hero 呼应

## 四、任务拆解

### Task 1：重写 showcase.html（结构 + Tailwind 类名）
- 删除 `<link rel="stylesheet" href="style.css">`
- 加 `<script src="https://cdn.tailwindcss.com"></script>`
- 加 Tailwind 自定义配置（字体、扩展颜色）
- 重写全部 HTML 结构，用 Tailwind utility classes
- 新增 Hero 区域
- **验证**：浏览器打开，样式正确渲染

### Task 2：重写 app.js 的 DOM 生成
- 结果卡片、柱状图、进度条的 DOM 生成代码改用 Tailwind class
- 搜索 Loading 改为骨架屏（3 个 animate-pulse 灰色块）
- 保持 API 调用逻辑不变
- **验证**：搜索功能正常，骨架屏出现后替换为结果

### Task 3：删除 style.css + 更新 server.mjs 路由
- 删除 `showcase/style.css`
- server.mjs 的静态文件白名单去掉 style.css
- **验证**：`curl localhost:3000/style.css` 返回 404

### Task 4：响应式 + 动画打磨
- 手机端布局（搜索框全屏宽、卡片单列、时间线竖排）
- 卡片入场动画（Intersection Observer + transition）
- 柱状图生长动画
- Hero 区域微动效
- **验证**：DevTools 模拟 375px 宽度，布局正常

## 五、给 DeepSeek 的完整启动指令

```
读取 ai-workspace/plans/201-showcase-tailwind/plan.md 和 acceptance.md。

以编码主力身份，用 Tailwind CSS CDN 重写展示前端。
当前 showcase/ 下有 200 号任务的实现（功能完好），你需要保留 server.mjs 的 API 逻辑
和 app.js 的数据获取逻辑，但把全部 HTML 结构和样式用 Tailwind 重写。

核心要求：
- 只加一行 <script src="https://cdn.tailwindcss.com"></script>，不装任何包
- 删除 style.css，所有样式用 Tailwind utility classes
- 新增 Hero 深色渐变区域
- 搜索结果卡片加左侧彩色竖条 + 骨架屏 Loading
- 能力图表用深色背景 + 渐变柱子
- Agent 工作流用时间线布局
- 配色：indigo-600 主色、slate-900 深色、gray-50 背景
- 参考 Linear/Notion 的设计语言

约束：
- 用三审查工作流（/three-review）启动
- 不改 kb/ 下任何文件
- server.mjs 只改静态文件白名单（去掉 style.css）
- 不引入任何 JS 框架或额外 CDN（除 Tailwind）
```
