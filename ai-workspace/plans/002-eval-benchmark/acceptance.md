# 002 — 验收标准

> [Qwen 2026-08-12]

## AC-1：评测集完整性

**验证命令**：
```bash
node -e "const q=JSON.parse(require('fs').readFileSync('kb/eval/questions.json','utf8')); const cats={}; q.forEach(x=>cats[x.category]=(cats[x.category]||0)+1); console.log('total:', q.length, 'cats:', cats)"
```

**通过条件**：
- total = 50
- 4 个类别：exact_match=15, concept=15, cross_doc=10, no_answer=10
- 每题都有 id, query, expected_sources, difficulty 字段

## AC-2：评测脚本可运行

**验证命令**：
```bash
node kb/eval/run-eval.mjs
```

**通过条件**：
- exit code 0
- 终端输出包含 5 个指标：Recall@5、MRR、Precision@1、引用正确率、无关拒绝率
- 输出保存到 `kb/eval/results/` 下的 JSON 文件

## AC-3：TF-IDF 基线存在

**验证命令**：
```bash
node -e "const r=JSON.parse(require('fs').readFileSync('kb/eval/results/baseline-tfidf.json','utf8')); console.log(r.metrics)"
```

**通过条件**：
- 文件存在且可解析
- 包含 5 个指标的数值
- 包含每题的详细结果（per_question 数组）

## AC-4：指标数值合理

**验证**：Codex 人工审查基线数据

**通过条件**：
- Recall@5 ≥ 0.50（基线不应太低，否则说明检索有严重问题）
- 无关拒绝率 ≥ 0.70（10 题中至少 7 题正确拒绝）
- MRR > 0（至少有些题 Top-1 命中）

## AC-5：失败分析存在

**验证**：
```bash
node -e "const r=JSON.parse(require('fs').readFileSync('kb/eval/results/baseline-tfidf.json','utf8')); const fail=r.per_question.filter(x=>!x.source_hit); console.log('failures:', fail.length, fail.map(x=>x.id+': '+x.query).join('\n'))"
```

**通过条件**：
- 失败题目有列表
- 每题有失败原因分类（分词错误/文档缺失/查询歧义/预期答案错误）

## AC-6：零新依赖

**验证命令**：
```bash
node -e "const p=JSON.parse(require('fs').readFileSync('kb/package.json','utf8')); console.log(Object.keys(p.dependencies||{}))"
```

**通过条件**：
- 依赖列表与 001 完成时一致（仅 @node-rs/jieba）

## AC-7：现有代码未修改

**验证命令**：
```bash
git -C kb diff --name-only HEAD -- lib/ search.mjs test/
```

**通过条件**：无输出

## AC-8：评测可重复

**验证**：连跑两次 `node kb/eval/run-eval.mjs`

**通过条件**：两次输出的 5 个指标数值完全一致（确定性检索，无随机性）

---

## 审查结论格式（Codex 填写）

| AC | 结果 | 备注 |
|---|---|---|
| AC-1 | ✅/❌ | |
| ... | ... | |

**总结论**：PASS / PASS_WITH_NOTES / FAIL
