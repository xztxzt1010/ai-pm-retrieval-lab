/* app.js — AI PM Job Retrieval Lab 前端交互（纯原生 JS，无框架、无外部库）
 * 样式全部使用 Tailwind utility classes（闭合映射：只输出完整类名，绝不拼接类名）
 * 数据来源：/api/search（实时检索）、/api/stats（语料统计 + 评测摘要 + 能力分析摘要，后端读取仓库内固定 JSON） */
'use strict';

/* ---------- 工具函数 ---------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* 在原文上按分词交替正则定位命中，命中段与非命中段分别转义后拼接——
 * 避免"先整体转义再 split"时切开已插入的 <mark> 标签或 &amp; 等 HTML 实体。 */
function highlightSnippet(text, tokens) {
  const words = (tokens || []).filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  if (words.length === 0) return escapeHtml(text);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(words.map(escRe).join('|'), 'gi');

  let out = '';
  let last = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    out += `<mark>${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/* Tailwind CDN 加载失败降级：不静默失败，给出可见提示 */
window.addEventListener('load', () => {
  if (typeof tailwind === 'undefined') {
    const el = document.getElementById('cdn-fallback');
    if (el) {
      el.textContent = '样式 CDN（cdn.tailwindcss.com）加载失败，请检查网络后刷新。数据与功能不受影响。';
      el.classList.remove('hidden');
    }
  }
});

/* ---------- ① 岗位知识检索 ---------- */
const input = document.getElementById('search-input');
const btn = document.getElementById('search-btn');
const statusEl = document.getElementById('search-status');
const resultsEl = document.getElementById('results');

/* 状态三态 -> Tailwind 类（闭合映射） */
const STATUS_TONE = {
  loading: 'text-slate-500',
  empty: 'text-slate-500',
  error: 'text-red-600',
  '': 'text-slate-500',
};

function setStatus(kind, msg) {
  statusEl.className = `text-sm min-h-6 mt-4 ${STATUS_TONE[kind] || 'text-slate-500'}`;
  statusEl.textContent = msg;
}

/* 骨架屏：3 个灰色 pulse 矩形块 */
function skeletonHTML() {
  return Array.from(
    { length: 3 },
    () => `
      <div class="rounded-xl border border-slate-200 p-4">
        <div class="h-3 w-2/3 bg-slate-200 rounded animate-pulse"></div>
        <div class="h-3 w-1/2 bg-slate-200 rounded animate-pulse mt-2"></div>
        <div class="h-3 w-full bg-slate-200 rounded animate-pulse mt-3"></div>
      </div>`
  ).join('');
}

/* 并发防护：记录 in-flight 搜索，新搜索先中止上一次，避免慢响应覆盖新结果 */
let currentSearch = null;

async function doSearch() {
  const q = input.value.trim();
  if (!q) return;
  if (currentSearch) currentSearch.abort();
  setStatus('loading', `正在检索「${escapeHtml(q)}」…`);
  resultsEl.innerHTML = skeletonHTML();

  const ctrl = new AbortController();
  currentSearch = ctrl;
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}&top=5`, { signal: ctrl.signal });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error || `请求失败 HTTP ${resp.status}`);
    }
    const data = await resp.json();
    renderResults(data);
  } catch (err) {
    if (ctrl !== currentSearch) return; // 已被更新的搜索取代，忽略旧请求的清理
    resultsEl.innerHTML = '';
    if (err.name === 'AbortError') {
      setStatus('error', '请求超时，请检查服务是否在运行后重试');
    } else {
      setStatus('error', `检索失败：${err.message}`);
    }
  } finally {
    clearTimeout(timer);
    if (currentSearch === ctrl) currentSearch = null;
  }
}

/* 结果卡片左侧彩色竖条，按返回结果内的排名分档（结果按分数降序，排名即分数段）
 * 高分=indigo、中分=emerald、低分=amber */
const SCORE_BAR = {
  high: 'border-l-indigo-500',
  mid: 'border-l-emerald-500',
  low: 'border-l-amber-400',
};

function scoreTier(index) {
  if (index < 2) return 'high';
  if (index < 4) return 'mid';
  return 'low';
}

function renderResults(data) {
  const count = data.count || 0;
  if (count === 0) {
    setStatus('empty', `未找到与「${data.query}」相关的内容，换个关键词试试`);
    return;
  }
  setStatus('', `找到 ${count} 条相关结果`);
  resultsEl.innerHTML = data.results
    .map((r, i) => {
      const bar = SCORE_BAR[scoreTier(i)];
      return `
      <article class="bg-white border border-slate-200 border-l-4 ${bar} rounded-xl p-4 shadow-sm hover:shadow-md transition">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-mono text-xs text-slate-500 truncate" title="${escapeHtml(r.source)}">${escapeHtml(r.source)}</span>
          <span class="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0" title="相关度分数">${r.score.toFixed(4)}</span>
        </div>
        <h3 class="text-sm font-semibold text-slate-900 mb-1">${escapeHtml(r.heading)}</h3>
        <p class="text-xs text-slate-600 leading-relaxed line-clamp-3 [&_mark]:bg-amber-200 [&_mark]:text-amber-900 [&_mark]:px-0.5 [&_mark]:rounded-sm [&_mark]:font-medium">${highlightSnippet(r.snippet, data.tokens)}</p>
      </article>`;
    })
    .join('');
}

btn.addEventListener('click', doSearch);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

/* ---------- ② 语料统计 + 评测摘要 + 能力分析摘要（数据全部来自后端 /api/stats） ---------- */
/* 能力排行按后端 manifest 顺序渲染（与 reports/capability-analysis.md 一致），前 2 名金色，其余靛蓝。 */
async function loadStats() {
  let s;
  try {
    const resp = await fetch('/api/stats');
    if (!resp.ok) throw new Error(String(resp.status));
    s = await resp.json();
  } catch {
    // 服务未启动/接口失败：三个区块各自显示兜底文案，不阻断检索
    renderEvalSummary(null);
    renderCapabilities(null);
    renderCorpus(null);
    return;
  }
  renderCorpus(s);
  renderEvalSummary(s.evaluation);
  renderCapabilities(s.capability);
}

function renderCorpus(s) {
  const el = document.getElementById('corpus-stats');
  el.innerHTML = s
    ? `<p class="text-sm text-slate-500">语料：<strong class="text-slate-900">${s.corpusFiles}</strong> 份岗位 Markdown · <strong class="text-slate-900">${s.chunks}</strong> 个片段 · 词表 <strong class="text-slate-900">${s.vocabSize}</strong> 词（kb/jobs/*.md）</p>`
    : '<p class="text-sm text-slate-500">统计加载失败，请确认服务已启动。</p>';
}

function renderEvalSummary(e) {
  const el = document.getElementById('eval-summary');
  if (!e) {
    el.innerHTML = '<p class="text-sm text-slate-500">评测摘要加载失败或缺失（kb/eval/results/current.json）。</p>';
    return;
  }
  const row = (label, val) =>
    `<div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
      <div class="font-mono text-base font-bold text-indigo-600">${escapeHtml(String(val))}</div>
      <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(label)}</div>
    </div>`;
  el.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${row('Recall@5', e.recall5 ?? '-')}
      ${row('MRR', e.mrr ?? '-')}
      ${row('Precision@1', e.precision1 ?? '-')}
      ${row('引用正确率', e.citationAccuracy ?? '-')}
      ${row('无关拒绝率', e.rejectRate ?? '-')}
    </div>
    <p class="text-xs text-slate-500 mt-3">${e.questions} 题评测（exact_match/concept/cross_doc/no_answer）· 语料指纹 <code class="font-mono">${escapeHtml(e.corpusFingerprint ?? '-')}</code> · 详见 reports/retrieval-evaluation.md</p>`;
}

/* 能力分析摘要：数据来自后端 manifest；缺失时兜底。渐变需真实渲染，故容器在 HTML 中已含 defs。 */
function renderCapabilities(c) {
  const el = document.getElementById('capability-chart');
  if (!c || !c.categories) {
    el.innerHTML = '<p class="text-sm text-slate-500">能力分析摘要加载失败或缺失（reports/capability-analysis.manifest.json）。</p>';
    return;
  }
  const cats = Object.entries(c.categories)
    .sort((a, b) => b[1].hardJDs.length - a[1].hardJDs.length || (a[0] < b[0] ? -1 : 1));
  const N = c.N || 11;
  const rows = cats.map(([name, v], i) => {
    const pct = Math.round((v.hardJDs.length / N) * 100);
    return `
    <div class="flex items-center gap-3 sm:gap-4">
      <div class="w-28 sm:w-40 shrink-0">
        <div class="text-sm font-semibold text-slate-100">${escapeHtml(name)}</div>
        <div class="text-xs text-slate-400">硬性 ${v.hardJDs.length}/${N} · 软性 ${v.softJDs.length} 次</div>
      </div>
      <div class="flex-1 min-w-0">
        <svg class="w-full h-3.5 block rounded-full" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
          <rect class="fill-slate-700" x="0" y="0" width="100" height="12" rx="6"/>
          <rect x="0" y="0" width="${pct}" height="12" rx="6" fill="${i < 2 ? 'url(#capGold)' : 'url(#capIndigo)'}"/>
        </svg>
      </div>
      <span class="w-12 text-right font-mono text-sm font-bold text-slate-100 shrink-0">${pct}%</span>
    </div>`;
  });
  el.innerHTML = rows.join('');
}

/* ---------- 初始化 ---------- */
loadStats();
