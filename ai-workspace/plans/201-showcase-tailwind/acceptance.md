# 201 — 验收标准

> [Qwen 2026-08-12] 视觉标准为主观判断 + 客观约束结合。

## AC-1：Tailwind CDN 加载

**验证**：浏览器 DevTools → Network → 筛选 `tailwindcss`

**通过条件**：
- HTML 中有且仅有一个 Tailwind CDN `<script>` 标签
- Network 中能看到 `cdn.tailwindcss.com` 的请求且状态 200
- 页面样式正确渲染（非无样式白页）

## AC-2：style.css 已删除

**验证命令**：
```bash
test -f showcase/style.css && echo "EXISTS" || echo "DELETED"
```

**通过条件**：输出 `DELETED`

## AC-3：Hero 区域存在

**验证**：打开页面

**通过条件**：
- 页面顶部有深色背景区域（slate-900/slate-800 渐变）
- 包含项目标题和副标题
- 视觉上有"产品着陆页"的感觉，不是朴素的白底 header

## AC-4：搜索骨架屏 Loading

**验证**：输入查询后观察（可 DevTools 降速到 Slow 3G）

**通过条件**：
- 点击搜索后、结果返回前，看到灰色矩形块的 pulse 动画
- 结果返回后骨架屏平滑替换为结果卡片
- 不再显示纯文字"搜索中…"

## AC-5：搜索结果彩色竖条

**验证**：搜索任意关键词

**通过条件**：
- 每个结果卡片左侧有彩色竖条（3-4px 宽）
- 不同分数段颜色不同（高分=indigo、中分=emerald、低分=amber/gray）

## AC-6：能力图表深色背景

**验证**：滚动到能力区域

**通过条件**：
- 柱状图容器有深色背景（slate-800/slate-900）
- 柱子有颜色区分（前 2 名与其他不同色）
- 数字用等宽字体显示

## AC-7：Agent 工作流时间线布局

**验证**：滚动到 Agent 区域

**通过条件**：
- 6 个角色不是简单卡片网格，而是有时间线/流程关系的视觉布局
- 角色之间有连线或箭头（SVG 或 CSS，不是纯文字 →）
- 悬停有交互效果

## AC-8：多 AI 卡片各有主题色

**验证**：滚动到协作区域

**通过条件**：
- Qwen 卡片有 indigo 色调
- DeepSeek 卡片有 emerald/green 色调
- Codex 卡片有 amber/orange 色调
- 三者视觉可区分

## AC-9：响应式（手机端）

**验证**：DevTools → 375px 宽度

**通过条件**：
- Hero 区域文字缩小但不截断
- 搜索框全宽
- 结果卡片单列
- 时间线竖排
- 无水平滚动条

## AC-10：功能不退化

**验证**：对照 200 号任务的 AC-1 到 AC-6 重新验证

**通过条件**：
- `node showcase/server.mjs` 正常启动
- 搜索功能返回正确结果
- 能力图表显示 11 个维度
- Agent 6 个角色全部展示
- 多 AI 协作 3 个角色展示 + 任务进度
- 搜索 API 返回的 JSON 与之前一致

---

## 审查结论格式（Codex 填写）

```markdown
| AC | 结果 | 备注 |
|---|---|---|
| AC-1 | ✅/❌ | |
| ... | ... | |

**总结论**：PASS / PASS_WITH_NOTES / FAIL
```
