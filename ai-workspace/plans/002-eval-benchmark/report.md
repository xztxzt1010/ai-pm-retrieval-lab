# 002 — 结果报告

> DeepSeek 在实现过程中追加此文件。

## 实现进度

### 阶段回顾（三审查）

| 阶段 | 角色 | 结论 | 对实现的影响 |
|---|---|---|---|
| premise | premise-overturner | **PROCEED** | 方向成立：固定评测集+基线是「算法改动必须有指标证据」的唯一落地机制，肉眼搜 5 条不可重复/不可对比。确认 kb/eval/ 有潜伏隐患（buildIndex 递归索引 kb/ 下全部 .md，会污染语料并打破 search.test.mjs 的 15 来源断言）且 lib 禁改无法代码根治 → 用文档纪律缓解。概念锚点「AI产品经理能力分析.md」不在 kb/（库根）不被索引 → 已纠正锚定 kb/ 内文档 |
| assumption | assumption-challenger | MEDIUM_RISK，8 条硬规则 | 全部落实（见下方核对）。两大修正：no_answer 全 OOV 是「指标注水」（测的是分词器词表覆盖率非判别力）→ 混入 2 个近失配；样板块（原始来源/README 段，64 chunks 里 33%）系统性霸榜 top-5 → 评测脚本层过滤 |
| 实现 | DeepSeek（本报告） | — | 见下方变更清单 |
| range-review | range-creep-guardian | **IN_SCOPE** | 全部改动可追溯；kb/ 内仅 eval/ 新增 + README 1 行；lib/search/test/package.json 零改动；README 改动为「边界项」（premise 实证的必要文档纪律）不要求回退 |
| final | assumption-challenger（最终 diff 后） | MEDIUM_RISK，3 must_fix | 全部修复：语料漂移 → 冻结后重生成基线（corpus_fingerprint 证明一致）；auto_signal 误标 → 修正为 rejected_empty/rejected_low_score/near_miss_not_rejected 三分；source_hit 重定义 → 加独立 correct 字段 + 报告显式声明。饱和/校准问题判定「如实记录即可，不反向注水」 |

### assumption 8 条硬规则落实核对

| 规则 | 落实方式 | 证据 |
|---|---|---|
| no_answer 混入近失配 | 10 题 = 8 全 OOV + na09「产品经理年薪多少」/na10「PM 薪资」两个近失配（查询与词表部分重叠但语义超纲） | 实测 na09/na10 过滤后 top1=0.106/0.098（>0.05 阈值）→ 计「未拒绝」，拒绝率 0.80 留 0.10 余量 |
| 样板块过滤 | run-eval.mjs 排除 README 源 + `原始来源/收录原则/文件结构约定/现有文档清单/后续如何接真实RAG/^目录$` 类 heading，指标基于过滤后结果 | 实测 em01 原始 top1=「原始来源」(0.386) → 过滤后 top1=岗位职责(0.269) |
| expected_headings 覆盖内容小节 | exact_match 覆盖该文件内容小节（岗位职责/任职要求/加分项/具体小节名）；concept/cross_doc 用最小子串 | questions.json 逐题核对 |
| 40 题分母显式声明 | metrics.recall5_denominator=40（有 expected_sources 的题），report 与 JSON 同时输出 | baseline JSON |
| 失败分类 | auto_signal 只出 qvec_empty/not_in_top5 原始信号；失败题 failure_reason 填 AC-5 的 4 类标签（当前 2 个失败标「查询歧义」，人工复核后冻结） | baseline JSON per_question |
| 阈值可配置 + 记录依据 | REJECT_SCORE=0.05 常量，config 输出；选定依据=实测分数分布（真实命中 0.27~0.74 / 近失配噪声 ≤0.11 / 全 OOV 空，0.05 自然分隔） | baseline JSON config |
| baseline 快照保护 | 默认写 results/current.json，`--name baseline-tfidf` 才写基线；连跑两次 baseline 内容不变 | AC-8 通过 |
| 路径归一化 + no_answer 空数组 | norm() 统一 `/`；no_answer 题 expected_sources=[] | questions.json |

---

## 最终报告

### 变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `kb/eval/questions.json` | 新增 | 50 题评测集（exact_match=15/concept=15/cross_doc=10/no_answer=10），每题 id/query/expected_sources/expected_headings/keywords/difficulty，锚点基于 kb/ 真实文档、经探针实证可答（防「预期答案错误」） |
| `kb/eval/run-eval.mjs` | 新增 | 评测脚本：复用 buildIndex/retrieve；样板块过滤；5 指标（Recall@5/MRR/Precision@1/引用正确率/无关拒绝率）+ 分母声明；失败自动信号 + AC-5 4 类标签；`--name` 输出（默认 current.json，基线用 `--name baseline-tfidf`）；头注释记录「kb/eval/ 只允许 .json/.mjs」目录纪律 |
| `kb/eval/results/baseline-tfidf.json` | 新增 | TF-IDF 基线：config + metrics + notes + 50 条 per_question（含 raw_top5/top5/source_hit/recall_rank/p1/citation_ok/rejected/failure_reason） |
| `kb/eval/results/current.json` | 新增 | 脚本默认输出（与基线同内容），证明「默认运行不覆盖基线」的保护机制 |
| `kb/README.md` | 修改 1 行 | 「目录」列表加 eval/ 说明：只允许 .json/.mjs、禁止放 .md（否则被 buildIndex 索引并破坏 search.test.mjs 的 15 来源断言） |

### 有意的设计决策（非越界，报告明示）

1. **样板块过滤是评测口径的一部分**：检索器本身仍返回原始来源/README 段（未改 lib），评测脚本层过滤后计算指标。报告明示「指标 = 过滤样板后的检索质量」，raw_top5 保留在 per_question 供诊断。这是 assumption 复审确认的处理：样板块是检索噪声而非实质内容。
2. **answerable 指标饱和（1.0）**：40 道可答题目全 top-1 命中，因语料小（15 文件）+ token 特征鲜明，TF-IDF 精确命中。这是真实结果，非 bug。判别轴在无关拒绝率（0.80）。未来对比更好检索器需补充语义/改写类难题（见后续建议），否则 answerable 轴无余量。
3. **no_answer 的 source_hit 定义**：对 no_answer 题，source_hit 表示「正确拒绝」（返回空或 top1<0.05）。8/10 拒绝 = 处理正确，2 个近失配未拒 = 真失败。该定义使 AC-5 失败列表只含真实失败。
4. **2 个近失配题的失败原因 = 查询歧义**：查询与词表部分重叠（产品经理/岗位）但语义超纲（薪资），检索器返回相关但错误的 chunk。这是判别力弱点的真实样本。

### 验证摘要

| AC | 结果 | 证据 |
|---|---|---|
| AC-1 | ✅ | total=50，exact=15/concept=15/cross_doc=10/no_answer=10；每题有 id/query/expected_sources/difficulty |
| AC-2 | ✅ | `node kb/eval/run-eval.mjs` exit 0；终端输出 5 指标（Recall@5/MRR/Precision@1/引用正确率/无关拒绝率）；JSON 写入 results/current.json |
| AC-3 | ✅ | baseline-tfidf.json 存在可解析，含 metrics（12 字段）+ 50 条 per_question + notes |
| AC-4 | ✅ | Recall@5=1.0≥0.50；无关拒绝率=0.80≥0.70；MRR=1.0>0 |
| AC-5 | ✅ | 失败列表 2 项（na09/na10），failure_reason=「查询歧义」（AC-5 的 4 类标签之一） |
| AC-6 | ✅ | kb/package.json 依赖仅 `@node-rs/jieba` |
| AC-7 | ✅ | `git -C kb diff --name-only HEAD -- lib/ search.mjs test/` 无输出 |
| AC-8 | ✅ | 连跑两次 5 指标数值完全一致（确定性检索，无随机性） |

**基线数值**：Recall@5 **1.000** (40/40) · MRR **1.000** · Precision@1 **1.000** (40/40) · 引用正确率 **1.000** (40/40) · 无关拒绝率 **0.800** (8/10)

### final 复审修复（assumption-challenger 3 must_fix，已全部落实）

1. **语料漂移 → 冻结后重生成基线**：baseline 首次生成在 README.md 加「eval/ 目录纪律」之前，README 改动使索引变化、per-question 分数 3-4 位小数漂移。修复：语料冻结后 `--force` 重生成，并在 config 增加 `corpus_fingerprint`（kb/ 下全部 .md 的路径+内容 sha1）。已核验 baseline 与 current 指纹一致（`302c848b264b2391`），证明基线对应当前可复现语料；未来重跑指纹不一致即提示语料漂移。指纹值的时间线（README 公开化改写 → 首次发布前重生成基线）见文末「提交前证据一致性说明」。
2. **auto_signal 误标**：原实现把 `near_miss_not_rejected` 无条件赋给全部 10 道 no_answer（含 8 道正确拒绝），语义与事实相反。修复：三分——`rejected_empty`（返回空）/ `rejected_low_score`（top1<0.05）/ `near_miss_not_rejected`（未拒绝）。
3. **source_hit 重定义显式声明 + 独立 correct 字段**：no_answer 的 source_hit 表示「正确拒绝」（AC-5 验收命令按 !source_hit 找失败题的必要映射），语义纯净的「答对」布尔字段新增 `correct`（answerable=source_hit，no_answer=rejected），两者并存、定义在 JSON notes 与本文档显式声明。

### 失败分析

| id | 类别 | 查询 | 失败原因 |
|---|---|---|---|
| na09 | no_answer | 产品经理年薪多少 | 查询歧义（与词表部分重叠但语义超纲，检索器返回相关但错误的 chunk，未拒绝） |
| na10 | no_answer | PM 薪资 | 查询歧义（同上） |

### 残余风险（交付即接受，不扩大需求）

1. **answerable 指标饱和**：未来换 BM25/混合检索时，Recall@5/MRR/P@1/引用正确率无上升空间，无法体现改进；唯一判别轴是无失配拒绝率（0.80 → 更好的检索器可提到 1.0）。缓解：语料增长后补充语义/近义改写类难题（见后续建议），本轮不为此改题。
2. **评测题锚点是「校准可答」的**：探针确保每题的 expected_sources 可达，防预期答案错误，但也意味着题集偏向检索器能答的查询。已尽量用自然查询措辞（如「哪些岗位要求 SQL」「大模型平台 产品 公司」），但无法完全消除校准偏好。
3. **REJECT_SCORE=0.05 是全局常数**：TF-IDF 分数尺度随索引规模（chunk 数 N 与 IDF）漂移，换语料后阈值含义会变。当前语料实测 0.05 能自然分隔真实命中(≥0.27)与近失配噪声(≤0.11)，选定依据已记录在 config；近失配 top1(0.106/0.098) 约为阈值 2 倍余量（JSON notes 已记录），语料变动后重跑需人工复核是否翻边。
4. **样板块过滤规则硬编码在评测脚本**：若未来 kb 文档结构变化（新增别的元数据 heading），过滤正则需同步更新，否则会误过滤或漏过滤。

### 后续建议

1. **补语义/改写类难题**（语料增长后）：如近义改写（「做推荐的经验」vs 文档「搜索推荐」）、跨语言（英文查询中文内容）等 TF-IDF 词面不匹配的题，让 answerable 轴有余量、能体现 BM25/混合检索的改进。属独立任务，非本任务范围。
2. **更好的检索器接入后重跑**：`node kb/eval/run-eval.mjs --name bm25` 即可生成对比数据，baseline 受快照保护不会被覆盖。
3. **基线数值偏低项**（当前 0.80 拒绝率）：2 个近失配题暴露判别力弱点，后续若做拒答策略（如分类器/阈值调优），优先看这两个样本。

[DeepSeek 13:58] 最终报告完成

---

## 提交前证据一致性说明（2026-08-13 追加）

> 本节为提交前证据一致性修复追加的透明说明，作为 DeepSeek 原报告的补充，**不改变原报告的任何结论**。

**语料指纹漂移与基线重生成（为何更新第 1 条中的指纹值）**

- `corpus_fingerprint` 是 kb/ 下全部 .md（路径+内容）的 sha1 前 16 位，`kb/README.md` 是语料的一部分，计入指纹。
- 发布前整改对 `kb/README.md` 做了公开化改写（标题改为「本地知识库（TF-IDF 检索）」、首段明示 TF-IDF baseline / 非向量 RAG、本机 venv 路径中性化）。这一内容变化使参与指纹计算的 Markdown 发生改变，语料指纹随之漂移——整改前的旧冻结基线指纹不再对应当前语料。由于 README 源在评测脚本层被 `isBoilerplate` 过滤，不参与检索指标计算，**五项指标完全不变**。
- `eval/` 自创建以来从未首次发布。为避免「首次公开基线 ≠ 首次公开语料」（指纹不一致即提示漂移）的可复现性破坏，按船长决策（`08-codex-second-round-acceptance.md`「必须收尾」第 2 条）在首次发布前重新生成了 `baseline-tfidf.json`（`node kb/eval/run-eval.mjs --name baseline-tfidf --force`），随后重跑普通评测覆盖 `current.json`。
- 修复后 baseline 与 current 共享同一指纹 **`302c848b264b2391`**，五项指标逐字段一致：

| 指标 | 数值 |
|---|---|
| Recall@5 | 1.000 (40/40) |
| MRR | 1.000 |
| Precision@1 | 1.000 (40/40) |
| 引用正确率 | 1.000 (40/40) |
| 无关拒绝率 | 0.800 (8/10) |

- `per_question` 均为 50 条。原报告的结论（answerable 饱和、判别轴在无关拒绝率、近失配题失败原因、残余风险）不因指纹重生成而改变。
