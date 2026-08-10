# 001 — 验收标准

> [Qwen 2026-08-10] 每条标准必须可机器执行，Codex 按此逐条审查。

## AC-1：基本检索能力

**验证命令**：
```bash
node kb/search.mjs "RAG 知识库"
```

**通过条件**：
- 输出包含 `product-strategy.md` 中的相关段落
- 返回结果数 ≥ 3 且 ≤ 5
- 每条结果包含：来源文件名、段落标题、相关度分数、原文片段

## AC-2：中文查询支持

**验证命令**：
```bash
node kb/search.mjs "产品经理核心能力"
```

**通过条件**：
- 输出包含 `jobs/` 目录下的 JD 文件
- 分词结果中包含"产品经理"、"核心"、"能力"等词（用 `--verbose` 可见）

## AC-3：英文查询支持

**验证命令**：
```bash
node kb/search.mjs "Agent workflow"
```

**通过条件**：
- 输出包含 `apple-agentic-ai-pm.md` 或 `apple-ai-pm-ops.md`（Apple 英文 JD）
- 不因中英文混合分词而崩溃

## AC-4：无关查询不产生误报

**验证命令**：
```bash
node kb/search.mjs "天气预报"
```

**通过条件**：
- 所有返回结果的相关度分数 < 0.1，或者输出明确提示"未找到相关内容"

## AC-5：来源标注完整

**验证命令**：
```bash
node kb/search.mjs "大模型技术" --top 5
```

**通过条件**：
- 每条结果的 `source` 字段非空
- `source` 指向的文件真实存在（`ls` 可验证）
- `heading` 对应该文件中真实存在的 `## ` 标题

## AC-6：性能基线

**验证命令**：
```bash
node -e "const s=Date.now(); require('child_process').execSync('node kb/search.mjs \"项目管理\"'); console.log(Date.now()-s + 'ms')"
```

**通过条件**：
- 首次运行（含索引构建）< 10 秒
- 后续运行（如有缓存）< 3 秒

## AC-7：依赖约束

**验证命令**：
```bash
cat kb/package.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).dependencies||{}; console.log(Object.keys(d).length, Object.keys(d))"
```

**通过条件**：
- 依赖数 ≤ 2
- 不包含 Python 相关依赖（python-shell 等）
- 不包含需要外部 API 的包（openai、@anthropic-ai/sdk 等）

## AC-8：现有文件未被修改

**验证命令**：
```bash
git -C kb diff --name-only HEAD
```

**通过条件**：
- 仅包含新增文件（`search.mjs`、`lib/`、`test/`、`package.json`、`package-lock.json`）
- 不包含对 `gen_prd_draft.js`、`product-strategy.md`、`prd-template.md`、`jobs/*.md` 的修改

## AC-9：测试通过

**验证命令**：
```bash
node kb/test/search.test.mjs
```

**通过条件**：
- 全部测试用例通过（输出 0 failures 或 exit code 0）
- 覆盖 AC-1 到 AC-4 的核心场景

## AC-10：报告完整性

**验证**：Codex 人工审查 `report.md`

**通过条件**：
- 每个 Task（1-6）都有进度记录
- 每个 Task 都附带验证命令的实际输出
- 最终报告包含：改了什么、验证了什么、已知局限

---

## 审查结论格式（Codex 填写）

```markdown
## 审查结论

| AC | 结果 | 备注 |
|---|---|---|
| AC-1 | ✅/❌ | |
| AC-2 | ✅/❌ | |
| ... | ... | |

**总结论**：PASS / PASS_WITH_NOTES / FAIL
**审查人**：Codex
**时间**：[Codex HH:MM]
```
