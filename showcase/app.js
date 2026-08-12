/* app.js — PM 智能工作台前端交互（纯原生 JS，无框架、无外部库）
 * 样式全部使用 Tailwind utility classes（闭合映射：只输出完整类名，绝不拼接类名） */
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

/* ---------- ① 知识库检索 ---------- */
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

/* 骨架屏：3 个灰色 pulse 矩形块，替换旧的纯文字加载态 */
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

async function doSearch() {
  const q = input.value.trim();
  if (!q) return;
  setStatus('loading', `正在检索「${escapeHtml(q)}」…`);
  resultsEl.innerHTML = skeletonHTML();

  const ctrl = new AbortController();
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
    resultsEl.innerHTML = '';
    if (err.name === 'AbortError') {
      setStatus('error', '请求超时，请检查服务是否在运行后重试');
    } else {
      setStatus('error', `检索失败：${err.message}`);
    }
  } finally {
    clearTimeout(timer);
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

/* ---------- ② 能力分析（11 维度，来源 AI产品经理能力分析.md） ---------- */
const CAPABILITIES = [
  { name: '大模型技术理解', hard: '11/11', pct: 100, soft: 9 },
  { name: '项目管理与协作', hard: '11/11', pct: 100, soft: 3 },
  { name: '数据驱动能力', hard: '9/11', pct: 82, soft: 2 },
  { name: '需求与用户研究', hard: '9/11', pct: 82, soft: 1 },
  { name: 'Agent 与智能体', hard: '7/11', pct: 64, soft: 3 },
  { name: '产品设计能力', hard: '7/11', pct: 64, soft: 2 },
  { name: '评估与评测', hard: '7/11', pct: 64, soft: 2 },
  { name: '软素质', hard: '7/11', pct: 64, soft: 1 },
  { name: 'Prompt 与模型调优', hard: '6/11', pct: 55, soft: 2 },
  { name: 'RAG 与知识库', hard: '6/11', pct: 55, soft: 1 },
  { name: '动手与工具链', hard: '3/11', pct: 27, soft: 1 },
];

function renderCapabilities() {
  const el = document.getElementById('capability-chart');
  el.innerHTML = CAPABILITIES.map(
    (c, i) => `
    <div class="flex items-center gap-3 sm:gap-4">
      <div class="w-28 sm:w-40 shrink-0">
        <div class="text-sm font-semibold text-slate-100">${escapeHtml(c.name)}</div>
        <div class="text-xs text-slate-400">硬性 ${escapeHtml(c.hard)} · 软性 ${c.soft} 次</div>
      </div>
      <div class="flex-1 min-w-0">
        <svg class="w-full h-3.5 block rounded-full" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
          <rect class="fill-slate-700" x="0" y="0" width="100" height="12" rx="6"/>
          <!-- 前 2 名金色渐变，其余靛蓝渐变（fill 走 presentation attribute url(#id)，与 fill-* 类分属不同元素） -->
          <rect x="0" y="0" width="${c.pct}" height="12" rx="6" fill="${i < 2 ? 'url(#capGold)' : 'url(#capIndigo)'}"/>
        </svg>
      </div>
      <span class="w-12 text-right font-mono text-sm font-bold text-slate-100 shrink-0">${c.pct}%</span>
    </div>`
  ).join('');
}

/* ---------- ④ 多 AI 协作：任务进度 ---------- */
async function loadStats() {
  const el = document.getElementById('task-progress');
  try {
    const resp = await fetch('/api/stats');
    if (!resp.ok) throw new Error(String(resp.status));
    const s = await resp.json();
    el.innerHTML = renderProgress(s);
  } catch {
    el.innerHTML =
      '<h3 class="text-base font-bold text-slate-900 mb-3">任务进度</h3>' +
      '<p class="text-sm text-slate-500">进度加载失败，请确认服务已启动。</p>';
  }
}

/* 状态徽章 -> Tailwind 类（闭合映射，不拼接 status 进类名） */
const STATUS_BADGE = {
  completed: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-amber-100 text-amber-700',
  unknown: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { completed: '已完成', in_progress: '进行中', unknown: '未知' };

function renderProgress(s) {
  const p = s.progress || { plan: '001-kb-retrieval', done: 0, total: 0, status: 'unknown' };
  const badge = STATUS_BADGE[p.status] || STATUS_BADGE.unknown;
  const label = STATUS_LABEL[p.status] || '未知';
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return `
    <h3 class="text-base font-bold text-slate-900 mb-3">任务进度 · ${escapeHtml(p.plan)}</h3>
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center justify-between gap-3 mb-3">
        <span class="font-mono text-xs font-semibold text-slate-700">本地 TF-IDF 知识库检索系统</span>
        <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${badge}">${label}</span>
      </div>
      <div class="h-2.5 rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-700" style="width:${pct}%"></div>
      </div>
      <p class="text-xs text-slate-500 mt-3">${p.done} / ${p.total} 个 Task 完成 · 知识库 ${s.files} 个文件 / ${s.chunks} 个片段 / ${s.vocabSize} 词</p>
    </div>`;
}

/* ---------- 初始化 ---------- */
renderCapabilities();
loadStats();
