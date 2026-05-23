/**
 * research-card.js — Phase 6: Deep Research result card
 *
 * Liquid-glass card with amber accent (distinct from scrape's purple and
 * agent's iridescent violet). Shows the full research pipeline live:
 *   • Sub-queries being planned
 *   • Searches firing in parallel
 *   • Sources being scraped (with favicons + word counts)
 *   • Iteration count
 *   • Final synthesized report with inline [N] citations
 *   • Collapsible source list with click-through
 *
 * Public API:
 *   const c = window.chakaResearchCard.create({ query })
 *   c.status(eventType, payload)
 *   c.complete(result)   // { report, sources, elapsedMs, provider }
 *   c.fail(message)
 */
(function () {
  'use strict';

  const RM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const DUR = RM ? '0ms' : '320ms';
  const FAST = RM ? '0ms' : '180ms';

  // Inject styles once
  if (!document.getElementById('chaka-research-card-style')) {
    const style = document.createElement('style');
    style.id = 'chaka-research-card-style';
    style.textContent = `
      @keyframes rc-spin { to { transform: rotate(360deg); } }
      @keyframes rc-fade-in {
        from { opacity: 0; transform: translateY(6px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0)    scale(1); }
      }
      @keyframes rc-shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes rc-pulse-soft {
        0%, 100% { opacity: 1;   transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(0.85); }
      }
      @keyframes rc-row-in {
        from { opacity: 0; transform: translateX(-8px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      .rc-card {
        --accent:      #fbbf24;
        --accent-soft: rgba(251, 191, 36, 0.45);
        --accent-dim:  rgba(251, 191, 36, 0.10);
        --accent-grad: linear-gradient(135deg, #f59e0b, #fbbf24, #fde047);
        --ok:   #34d399;
        --err:  #f87171;
        --surface-base: rgba(11, 13, 18, 0.78);
        --surface-elev: rgba(20, 23, 30, 0.86);
        --ink-hi:    rgba(245, 247, 250, 0.96);
        --ink-md:    rgba(245, 247, 250, 0.62);
        --ink-lo:    rgba(245, 247, 250, 0.38);
        --hairline:  rgba(255, 255, 255, 0.07);
        --hairline-strong: rgba(255, 255, 255, 0.13);

        position: relative;
        max-width: 600px;
        margin: 12px 0;
        border-radius: 16px;
        background: linear-gradient(180deg, var(--surface-elev) 0%, var(--surface-base) 100%);
        backdrop-filter: blur(32px) saturate(170%);
        -webkit-backdrop-filter: blur(32px) saturate(170%);
        border: 1px solid var(--hairline);
        box-shadow:
          inset 0 1px 0 0 rgba(255, 255, 255, 0.10),
          0 24px 56px -16px rgba(0, 0, 0, 0.7),
          0 2px 8px rgba(0, 0, 0, 0.25);
        color: var(--ink-hi);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
        animation: rc-fade-in ${DUR} cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
        flex-shrink: 0;
        align-self: flex-start;
      }
      .rc-card.done  { --accent: var(--ok);  --accent-soft: rgba(52, 211, 153, 0.45); --accent-grad: linear-gradient(135deg, #34d399, #6ee7b7); }
      .rc-card.error { --accent: var(--err); --accent-soft: rgba(248, 113, 113, 0.45); --accent-grad: linear-gradient(135deg, #f87171, #ef4444); }

      .rc-head {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 16px;
        border-bottom: 1px solid var(--hairline);
      }
      .rc-icon {
        width: 22px; height: 22px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--accent-dim);
        border-radius: 6px;
        color: var(--accent);
      }
      .rc-icon svg { width: 14px; height: 14px; }
      .rc-title-block { flex: 1; min-width: 0; }
      .rc-title {
        font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
      }
      .rc-subtitle {
        font-size: 11px; color: var(--ink-md);
        margin-top: 2px;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .rc-subtitle .rc-shimmer {
        background: linear-gradient(90deg, var(--ink-md) 0%, var(--ink-hi) 50%, var(--ink-md) 100%);
        background-size: 200% 100%;
        animation: rc-shimmer 2.2s linear infinite;
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .rc-elapsed {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10.5px;
        color: var(--ink-lo);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
      }

      .rc-progress {
        height: 2px;
        background: rgba(255, 255, 255, 0.04);
        overflow: hidden;
      }
      .rc-progress-fill {
        height: 100%;
        width: 0%;
        background: var(--accent-grad);
        transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 8px var(--accent-soft);
      }

      .rc-query-line {
        padding: 10px 16px 0;
        font-size: 11.5px;
        color: var(--ink-md);
        font-family: 'JetBrains Mono', monospace;
        line-height: 1.4;
        max-height: 60px; overflow: hidden;
      }
      .rc-query-line .rc-prompt-tag { color: var(--accent); margin-right: 6px; }

      /* Sub-queries list (chips) */
      .rc-subqueries {
        padding: 10px 16px 6px;
        display: flex; flex-wrap: wrap; gap: 5px;
      }
      .rc-subq {
        font-size: 10.5px;
        font-family: 'JetBrains Mono', monospace;
        padding: 3px 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--hairline);
        border-radius: 5px;
        color: var(--ink-md);
        animation: rc-row-in 220ms ease-out;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rc-subq.searching {
        border-color: var(--accent-soft);
        color: var(--accent);
        background: var(--accent-dim);
      }
      .rc-subq.done {
        opacity: 0.55;
      }
      .rc-subq .rc-mini-spin {
        display: inline-block;
        width: 8px; height: 8px;
        border: 1.5px solid var(--accent-soft);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: rc-spin 0.7s linear infinite;
        margin-right: 4px;
        vertical-align: -1px;
      }

      /* Sources list (with favicons) */
      .rc-sources-header {
        padding: 10px 16px 4px;
        font-size: 10px;
        font-family: 'JetBrains Mono', monospace;
        color: var(--ink-lo);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-top: 1px solid var(--hairline);
        margin-top: 6px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .rc-source-count {
        color: var(--accent);
      }
      .rc-sources {
        padding: 0 14px 8px;
        max-height: 200px; overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(251,191,36,0.25) transparent;
      }
      .rc-source {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 6px;
        font-size: 11px;
        border-radius: 6px;
        animation: rc-row-in 240ms ease-out;
        text-decoration: none;
        color: var(--ink-md);
        transition: background ${FAST}, color ${FAST};
      }
      .rc-source:hover {
        background: var(--accent-dim);
        color: var(--ink-hi);
      }
      .rc-source.failed { opacity: 0.4; }
      .rc-source-num {
        flex-shrink: 0;
        width: 18px;
        text-align: right;
        color: var(--accent);
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }
      .rc-source-fav {
        width: 14px; height: 14px;
        flex-shrink: 0;
        border-radius: 3px;
      }
      .rc-source-title {
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-family: 'JetBrains Mono', monospace;
      }
      .rc-source-meta {
        flex-shrink: 0; font-size: 9.5px;
        color: var(--ink-lo);
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
      }

      /* Final report */
      .rc-report {
        padding: 14px 16px;
        font-size: 13px;
        line-height: 1.65;
        color: var(--ink-hi);
        border-top: 1px solid var(--hairline);
        max-height: 480px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(251,191,36,0.3) transparent;
      }
      .rc-report.expanded { max-height: none; }
      .rc-report h1, .rc-report h2, .rc-report h3 {
        color: var(--ink-hi);
        margin: 14px 0 6px;
        font-size: 13.5px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .rc-report h2 { font-size: 14px; }
      .rc-report h1 { font-size: 14.5px; }
      .rc-report p { margin: 0 0 10px; }
      .rc-report ul, .rc-report ol { margin: 4px 0 10px; padding-left: 20px; }
      .rc-report li { margin: 3px 0; }
      .rc-report strong { color: var(--ink-hi); font-weight: 600; }
      .rc-report a { color: var(--accent); text-decoration: none; }
      .rc-report a:hover { text-decoration: underline; }
      .rc-report code {
        font-size: 11.5px;
        background: rgba(255,255,255,0.06);
        padding: 1px 4px;
        border-radius: 3px;
      }
      .rc-report blockquote {
        border-left: 2px solid var(--accent);
        padding: 4px 12px;
        margin: 8px 0;
        background: var(--accent-dim);
        color: var(--ink-md);
        border-radius: 0 6px 6px 0;
      }

      .rc-foot {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px 14px;
        font-size: 10.5px;
        color: var(--ink-lo);
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
        border-top: 1px solid var(--hairline);
        gap: 12px;
      }
      .rc-foot .rc-actions {
        display: flex; gap: 6px;
      }
      .rc-action-btn {
        background: rgba(251,191,36,0.08);
        border: 1px solid rgba(251,191,36,0.2);
        color: var(--accent);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 10.5px;
        cursor: pointer;
        transition: background ${FAST};
      }
      .rc-action-btn:hover {
        background: rgba(251,191,36,0.16);
      }

      .rc-fail {
        padding: 14px 16px;
        color: var(--err);
        font-size: 12px;
        line-height: 1.5;
        background: linear-gradient(180deg, rgba(248,113,113,0.06), transparent);
        border-top: 1px solid var(--hairline);
      }
    `;
    document.head.appendChild(style);
  }

  // SVG icons
  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    book:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    warn:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>',
  };

  function escHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hostname(url) { try { return new URL(url).hostname; } catch { return url; } }
  function fav(url) { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch { return ''; } }
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function create({ query } = {}) {
    const container = document.getElementById('chat-messages') || document.querySelector('.chat-messages');
    if (!container) { console.warn('[chakaResearchCard] no chat container'); return null; }

    const card = document.createElement('div');
    card.className = 'rc-card message-group bot';
    card.innerHTML = `
      <div class="rc-head">
        <div class="rc-icon">${ICONS.search}</div>
        <div class="rc-title-block">
          <div class="rc-title">Deep Research</div>
          <div class="rc-subtitle"><span class="rc-shimmer">planning sub-queries…</span></div>
        </div>
        <div class="rc-elapsed">0s</div>
      </div>
      <div class="rc-progress"><div class="rc-progress-fill"></div></div>
      <div class="rc-query-line"><span class="rc-prompt-tag">▸</span>${escHtml(query || '')}</div>
      <div class="rc-subqueries" hidden></div>
      <div class="rc-sources-header" hidden>
        <span>Sources <span class="rc-source-count">0</span></span>
        <span class="rc-iteration">round 1</span>
      </div>
      <div class="rc-sources"></div>
      <div class="rc-body"></div>
      <div class="rc-foot">
        <span class="rc-provider">via –</span>
        <div class="rc-actions"></div>
      </div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    // State
    const startedAt = Date.now();
    const subqEl    = card.querySelector('.rc-subqueries');
    const subqSet   = new Map();    // query → DOM chip
    const srcsHeader = card.querySelector('.rc-sources-header');
    const srcsEl     = card.querySelector('.rc-sources');
    const reportEl   = card.querySelector('.rc-body');
    const elapsedEl  = card.querySelector('.rc-elapsed');
    const subtitleEl = card.querySelector('.rc-subtitle');
    const progressFill = card.querySelector('.rc-progress-fill');
    const iterEl     = card.querySelector('.rc-iteration');
    const countEl    = card.querySelector('.rc-source-count');
    const providerEl = card.querySelector('.rc-provider');
    let sources = [];
    let sourceCount = 0;

    // Ticker
    const elapsedTimer = setInterval(() => {
      elapsedEl.textContent = fmtTime(Date.now() - startedAt);
    }, 250);

    function setSubtitle(text, shimmer = false) {
      subtitleEl.innerHTML = shimmer
        ? `<span class="rc-shimmer">${escHtml(text)}</span>`
        : escHtml(text);
    }

    function setProgress(pct) {
      progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    function addSubQuery(q) {
      if (subqSet.has(q)) return subqSet.get(q);
      if (subqEl.hidden) subqEl.hidden = false;
      const chip = document.createElement('div');
      chip.className = 'rc-subq';
      chip.title = q;
      chip.innerHTML = `<span class="rc-mini-spin" hidden></span>${escHtml(q.length > 70 ? q.slice(0, 67) + '…' : q)}`;
      subqEl.appendChild(chip);
      subqSet.set(q, chip);
      return chip;
    }
    function markSubQuery(q, state) {
      const chip = subqSet.get(q) || addSubQuery(q);
      const spin = chip.querySelector('.rc-mini-spin');
      if (state === 'searching') {
        chip.classList.add('searching');
        chip.classList.remove('done');
        if (spin) spin.hidden = false;
      } else if (state === 'done') {
        chip.classList.remove('searching');
        chip.classList.add('done');
        if (spin) spin.hidden = true;
      }
    }

    function addSource(payload) {
      if (srcsHeader.hidden) srcsHeader.hidden = false;
      sourceCount++;
      countEl.textContent = sourceCount;
      const a = document.createElement('a');
      a.className = 'rc-source';
      a.href = payload.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <span class="rc-source-num">${sourceCount}</span>
        <img class="rc-source-fav" alt="" src="${escHtml(fav(payload.url))}" onerror="this.style.opacity=0.2"/>
        <span class="rc-source-title">${escHtml(payload.title || hostname(payload.url))}</span>
        <span class="rc-source-meta">${payload.words ? payload.words.toLocaleString() + 'w' : ''}</span>
      `;
      srcsEl.appendChild(a);
      srcsEl.scrollTop = srcsEl.scrollHeight;
    }
    function addFailedSource(url, error) {
      if (srcsHeader.hidden) srcsHeader.hidden = false;
      const a = document.createElement('a');
      a.className = 'rc-source failed';
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `
        <span class="rc-source-num">—</span>
        <img class="rc-source-fav" alt="" src="${escHtml(fav(url))}" onerror="this.style.opacity=0.2"/>
        <span class="rc-source-title">${escHtml(hostname(url))}</span>
        <span class="rc-source-meta" title="${escHtml(error || '')}">failed</span>
      `;
      srcsEl.appendChild(a);
    }

    // Approx progress mapping per phase
    function phaseProgress(type) {
      const map = {
        planning: 5,
        queries_planned: 10,
        searching: 18,
        search_complete: 28,
        ranking: 35,
        scraping: 45,
        source_added: 55,
        reflecting: 75,
        gaps_identified: 80,
        synthesizing: 90,
        research_done: 100,
      };
      return map[type];
    }

    return {
      el: card,

      status(type, payload = {}) {
        // Subtitle updates per phase
        switch (type) {
          case 'planning':
            setSubtitle('expanding query into sub-queries…', true);
            break;
          case 'queries_planned':
            setSubtitle(`${(payload.queries || []).length} sub-queries planned`, false);
            (payload.queries || []).forEach(addSubQuery);
            break;
          case 'iteration_start':
            iterEl.textContent = `round ${payload.n}/${payload.max}`;
            (payload.queries || []).forEach(addSubQuery);
            break;
          case 'searching':
            markSubQuery(payload.query, 'searching');
            setSubtitle(`searching: ${(payload.query || '').slice(0, 60)}`, true);
            break;
          case 'search_complete':
            markSubQuery(payload.query, 'done');
            setSubtitle(`${payload.query?.slice(0, 30)}… → ${payload.hits} hits`, false);
            break;
          case 'search_failed':
            markSubQuery(payload.query, 'done');
            break;
          case 'search_unavailable':
            setSubtitle('search key not configured', false);
            break;
          case 'ranking':
            setSubtitle(`ranking ${payload.candidate_count} URLs by relevance…`, true);
            break;
          case 'scraping':
            setSubtitle(`reading: ${hostname(payload.url)}`, true);
            break;
          case 'source_added':
            sources.push({ url: payload.url, title: payload.title, words: payload.words });
            addSource(payload);
            setSubtitle(`+${hostname(payload.url)} (${payload.words || 0} words)`, false);
            break;
          case 'scrape_failed':
            addFailedSource(payload.url, payload.error);
            break;
          case 'reflecting':
            setSubtitle('reflecting on gaps…', true);
            break;
          case 'gaps_identified':
            if ((payload.follow_up_queries || []).length) {
              setSubtitle(`gap: ${(payload.gaps || '').slice(0, 60)} → ${(payload.follow_up_queries || []).length} more queries`, false);
              (payload.follow_up_queries || []).forEach(addSubQuery);
            } else {
              setSubtitle('comprehensive coverage achieved', false);
            }
            break;
          case 'no_more_gaps':
            setSubtitle('comprehensive coverage achieved', false);
            break;
          case 'synthesizing':
            setSubtitle('synthesizing final report…', true);
            break;
          case 'heartbeat':
            // No subtitle change — just keep the user reassured
            break;
        }
        const p = phaseProgress(type);
        if (p) setProgress(p);
      },

      complete(result) {
        card.classList.add('done');
        clearInterval(elapsedTimer);
        setProgress(100);
        setSubtitle(`done · ${result.sources?.length || 0} sources · ${fmtTime(result.elapsedMs)}`, false);
        card.querySelector('.rc-title').textContent = 'Research complete';
        card.querySelector('.rc-icon').innerHTML = ICONS.check;
        providerEl.textContent = `via ${result.provider || 'multi-llm'}`;

        // Render the report
        const html = window.marked
          ? window.marked.parse(result.report || '')
          : escHtml(result.report || '').replace(/\n/g, '<br>');
        reportEl.className = 'rc-report';
        reportEl.innerHTML = html;

        // Action buttons
        const actionsEl = card.querySelector('.rc-actions');
        actionsEl.innerHTML = `
          <button class="rc-action-btn" data-act="expand">Expand ↕</button>
          <button class="rc-action-btn" data-act="copy">Copy report</button>
        `;
        actionsEl.querySelector('[data-act="expand"]').addEventListener('click', function () {
          reportEl.classList.toggle('expanded');
          this.textContent = reportEl.classList.contains('expanded') ? 'Collapse ↕' : 'Expand ↕';
        });
        actionsEl.querySelector('[data-act="copy"]').addEventListener('click', () => {
          navigator.clipboard?.writeText(result.report || '').catch(() => {});
        });
      },

      fail(message) {
        card.classList.add('error');
        clearInterval(elapsedTimer);
        setSubtitle(`failed after ${fmtTime(Date.now() - startedAt)}`, false);
        card.querySelector('.rc-title').textContent = 'Research failed';
        card.querySelector('.rc-icon').innerHTML = ICONS.warn;
        const fail = document.createElement('div');
        fail.className = 'rc-fail';
        fail.textContent = message || 'Unknown error';
        reportEl.replaceWith(fail);
      },
    };
  }

  window.chakaResearchCard = { create };
  console.log('[chakaResearchCard] loaded 📚');
})();
