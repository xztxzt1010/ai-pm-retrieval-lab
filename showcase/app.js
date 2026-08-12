/* app.js — PM 智能工作台前端交互（纯原生 JS，无框架、无外部库） */
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

/* ---------- ① 知识库检索 ---------- */
const input = document.getElementById('search-input');
const btn = document.getElementById('search-btn');
const statusEl = document.getElementById('search-status');
const resultsEl = document.getElementById('results');

let searchTimer = null;

function setStatus(kind, msg) {
  statusEl.className = `search-status ${kind}`;
  statusEl.textContent = msg;
}

async function doSearch() {
  const q = input.value.trim();
  if (!q) return;
  setStatus('loading', `正在检索「${escapeHtml(q)}」…`);
  resultsEl.innerHTML = '';

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
    if (err.name === 'AbortError') {
      setStatus('error', '请求超时，请检查服务是否在运行后重试');
    } else {
      setStatus('error', `检索失败：${err.message}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function renderResults(data) {
  const count = data.count || 0;
  if (count === 0) {
    setStatus('empty', `未找到与「${data.query}」相关的内容，换个关键词试试`);
    return;
  }
  setStatus('', `找到 ${count} 条相关结果`);
  resultsEl.innerHTML = data.results
    .map(
      (r, i) => `
      <article class="result-card" style="animation-delay:${i * 0.06}s">
        <div class="result-head">
          <span class="result-source" title="${escapeHtml(r.source)}">${escapeHtml(r.source)}</span>
          <span class="result-score" title="相关度分数">${r.score.toFixed(4)}</span>
        </div>
        <h3 class="result-heading">${escapeHtml(r.heading)}</h3>
        <p class="result-snippet">${highlightSnippet(r.snippet, data.tokens)}</p>
      </article>`
    )
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
    <div class="cap-row">
      <div class="cap-info">
        <span class="cap-name">${escapeHtml(c.name)}</span>
        <span class="cap-sub">硬性 ${escapeHtml(c.hard)} · 软性 ${c.soft} 次</span>
      </div>
      <div class="cap-bar-wrap">
        <svg class="cap-bar" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
          <rect class="cap-track" x="0" y="0" width="100" height="12" rx="6"/>
          <rect class="cap-fill" x="0" y="0" width="${c.pct}" height="12" rx="6" style="animation-delay:${i * 0.05}s"/>
        </svg>
      </div>
      <span class="cap-pct">${c.pct}%</span>
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
    el.innerHTML = '<h3>任务进度</h3><p class="section-desc">进度加载失败，请确认服务已启动。</p>';
  }
}

function renderProgress(s) {
  const p = s.progress || { plan: '001-kb-retrieval', done: 0, total: 0, status: 'unknown' };
  const badgeMap = {
    completed: '已完成',
    in_progress: '进行中',
    unknown: '未知',
  };
  const badge = badgeMap[p.status] || '未知';
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return `
    <h3>任务进度 · ${escapeHtml(p.plan)}</h3>
    <div class="progress-card">
      <div class="progress-head">
        <span class="progress-plan">本地 TF-IDF 知识库检索系统</span>
        <span class="progress-badge ${escapeHtml(p.status)}">${badge}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p class="progress-meta">${p.done} / ${p.total} 个 Task 完成 · 知识库 ${s.files} 个文件 / ${s.chunks} 个片段 / ${s.vocabSize} 词</p>
    </div>`;
}

/* ---------- 初始化 ---------- */
renderCapabilities();
loadStats();
