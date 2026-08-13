// retriever.mjs — 查询匹配 + 排序 + 格式化输出
//
// 职责：对查询分词，构建查询向量（OOV 词权重 0，英文词做前缀匹配），
// 计算与每个 chunk 的余弦相似度，返回 Top-K。
import { tokenize } from './indexer.mjs';

/** 构建查询 TF-IDF 向量。
 *  - 词在词表内：权重 = idf
 *  - 英文词不在词表（如 workflow 对 workflows）：做前缀匹配，命中词以 idf 计入
 *  - 其余 OOV：权重 0（不参与向量，避免 df=0 产生 Infinity/NaN） */
export function buildQueryVector(index, queryText) {
  const { idf, vocab } = index;
  const vec = new Map();
  for (const w of tokenize(queryText)) {
    if (vocab.has(w)) {
      vec.set(w, idf.get(w));
    } else if (/^[a-z]+$/.test(w)) {
      for (const vw of vocab.keys()) {
        if (vw.startsWith(w)) vec.set(vw, idf.get(vw));
      }
    }
  }
  return vec;
}

/** 余弦相似度；任一向量为零向量时返回 0 */
export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [w, v] of a) {
    na += v * v;
    if (b.has(w)) dot += v * b.get(w);
  }
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 检索 Top-K；查询向量为空返回 []（调用方提示"未找到"） */
export function retrieve(index, queryText, topK = 5) {
  const { chunks, vectors } = index;
  const qvec = buildQueryVector(index, queryText);
  if (qvec.size === 0) return [];

  const scored = chunks
    .map((c, i) => ({ source: c.source, heading: c.heading, text: c.text, score: cosine(qvec, vectors[i]) }))
    .sort((a, b) => b.score - a.score);

  const k = Math.min(Math.max(topK, 1), scored.length);
  return scored.slice(0, k).map(({ source, heading, score, text }) => ({
    source,
    heading,
    score,
    snippet: text.slice(0, 200),
  }));
}
