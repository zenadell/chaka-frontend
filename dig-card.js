/**
 * dig-card.js — Phase 8 OSINT-grade dossier card (creator-only)
 *
 * Distinct visual identity from other tools — terminal/CRT aesthetic:
 *   • Phosphor-green accent (#39ff14)
 *   • Monospace-first typography (JetBrains Mono throughout)
 *   • Scanline overlay, subtle CRT flicker
 *   • Live probe ticker (60+ sites, 700+ probes)
 *   • Per-primitive collapsible sections in the final dossier
 *
 * Public API:
 *   const c = window.chakaDigCard.create({ target })
 *   c.status(eventType, payload)
 *   c.complete(result)
 *   c.fail(message)
 */
(function () {
  'use strict';
  const RM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const DUR  = RM ? '0ms' : '320ms';
  const FAST = RM ? '0ms' : '160ms';

  if (!document.getElementById('chaka-dig-card-style')) {
    const style = document.createElement('style');
    style.id = 'chaka-dig-card-style';
    style.textContent = `
      @keyframes dc-spin   { to { transform: rotate(360deg); } }
      @keyframes dc-fade   { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes dc-scan   { 0% { background-position: 0 0; } 100% { background-position: 0 100%; } }
      @keyframes dc-flicker{ 0%, 95%, 100% { opacity: 1; } 96% { opacity: 0.78; } 97% { opacity: 0.93; } }
      @keyframes dc-shim   { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

      .dc-card {
        --phos:   #39ff14;
        --phos-d: rgba(57, 255, 20, 0.5);
        --phos-x: rgba(57, 255, 20, 0.1);
        --bg:     rgba(4, 8, 6, 0.95);
        --bg-e:   rgba(8, 14, 10, 0.97);
        --txt:    rgba(220, 255, 220, 0.94);
        --txt-m:  rgba(180, 220, 180, 0.62);
        --txt-l:  rgba(120, 180, 130, 0.45);
        --line:   rgba(57, 255, 20, 0.12);

        position: relative;
        max-width: 620px;
        margin: 12px 0;
        border-radius: 8px;
        background: linear-gradient(180deg, var(--bg-e), var(--bg));
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--line);
        box-shadow:
          inset 0 1px 0 0 rgba(57,255,20,0.08),
          0 0 0 1px rgba(0,0,0,0.4),
          0 20px 50px -10px rgba(0,0,0,0.7),
          0 0 30px -8px var(--phos-d);
        color: var(--txt);
        font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px;
        animation: dc-fade ${DUR} cubic-bezier(0.16, 1, 0.3, 1), dc-flicker 12s linear infinite;
        overflow: hidden;
        flex-shrink: 0;
        align-self: flex-start;
      }
      .dc-card::after {
        /* CRT scanline overlay */
        content: '';
        position: absolute; inset: 0;
        background: repeating-linear-gradient(
          to bottom,
          transparent 0 2px,
          rgba(57, 255, 20, 0.025) 2px 3px
        );
        pointer-events: none;
        border-radius: inherit;
      }
      .dc-card.done  { --phos: #34d399; --phos-d: rgba(52,211,153,0.45); }
      .dc-card.error { --phos: #fb7185; --phos-d: rgba(251,113,133,0.45); }

      .dc-head {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 14px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(57,255,20,0.04), transparent);
      }
      .dc-prompt {
        color: var(--phos);
        text-shadow: 0 0 6px var(--phos-d);
        font-weight: 700;
        font-size: 12.5px;
      }
      .dc-title-block { flex: 1; min-width: 0; }
      .dc-title {
        font-size: 12.5px; font-weight: 600;
        color: var(--phos); text-shadow: 0 0 4px var(--phos-d);
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .dc-subtitle {
        font-size: 10.5px; color: var(--txt-m); margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dc-subtitle .dc-shim {
        background: linear-gradient(90deg, var(--txt-m) 0%, var(--phos) 50%, var(--txt-m) 100%);
        background-size: 200% 100%;
        animation: dc-shim 2s linear infinite;
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .dc-badge {
        font-size: 9px;
        padding: 2px 6px;
        border: 1px solid var(--phos-d);
        color: var(--phos);
        border-radius: 3px;
        letter-spacing: 0.1em;
        text-shadow: 0 0 4px var(--phos-d);
      }

      .dc-target {
        padding: 8px 14px;
        font-size: 11.5px;
        color: var(--txt);
        background: rgba(57, 255, 20, 0.03);
        border-bottom: 1px solid var(--line);
      }
      .dc-target .dc-prompt { margin-right: 8px; }

      /* Probe ticker — shows live primitives running */
      .dc-probes {
        padding: 8px 14px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 4px;
      }
      .dc-probe {
        display: flex; align-items: center; gap: 6px;
        font-size: 10.5px;
        padding: 4px 8px;
        background: rgba(57, 255, 20, 0.02);
        border: 1px solid transparent;
        border-radius: 4px;
        transition: all ${FAST};
      }
      .dc-probe.running {
        border-color: var(--phos-d);
        color: var(--phos);
        background: rgba(57, 255, 20, 0.06);
      }
      .dc-probe.done {
        color: var(--txt-m);
        opacity: 0.7;
      }
      .dc-probe .dc-spin {
        width: 8px; height: 8px;
        border: 1.5px solid var(--phos-d);
        border-top-color: var(--phos);
        border-radius: 50%;
        animation: dc-spin 0.8s linear infinite;
        display: none;
      }
      .dc-probe.running .dc-spin { display: inline-block; }
      .dc-probe .dc-check { color: var(--phos); display: none; font-size: 11px; }
      .dc-probe.done .dc-check { display: inline; }
      .dc-probe-count { margin-left: auto; color: var(--txt-l); font-size: 9.5px; }

      .dc-stats {
        padding: 10px 14px;
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 8px;
        font-size: 10.5px;
      }
      .dc-stat {
        display: flex; flex-direction: column; align-items: flex-start;
      }
      .dc-stat .v {
        font-size: 16px; font-weight: 700; color: var(--phos);
        text-shadow: 0 0 6px var(--phos-d);
        font-variant-numeric: tabular-nums;
      }
      .dc-stat .l {
        font-size: 9px; color: var(--txt-l); text-transform: uppercase;
        letter-spacing: 0.1em; margin-top: 2px;
      }

      .dc-dossier {
        padding: 12px 16px;
        font-size: 12.5px;
        line-height: 1.65;
        color: var(--txt);
        border-top: 1px solid var(--line);
        max-height: 520px;
        overflow-y: auto;
        font-family: 'Inter', -apple-system, system-ui, sans-serif;
        scrollbar-width: thin;
        scrollbar-color: var(--phos-d) transparent;
      }
      .dc-dossier.expanded { max-height: none; }
      .dc-dossier h1, .dc-dossier h2, .dc-dossier h3 {
        color: var(--phos);
        text-shadow: 0 0 4px var(--phos-d);
        margin: 14px 0 6px;
        font-size: 13.5px;
        font-weight: 700;
        letter-spacing: -0.005em;
      }
      .dc-dossier h2 { font-size: 14px; }
      .dc-dossier p  { margin: 0 0 10px; }
      .dc-dossier ul, .dc-dossier ol { margin: 4px 0 10px; padding-left: 20px; }
      .dc-dossier li { margin: 3px 0; }
      .dc-dossier strong { color: var(--phos); }
      .dc-dossier a { color: var(--phos); text-decoration: none; }
      .dc-dossier a:hover { text-decoration: underline; text-shadow: 0 0 4px var(--phos-d); }
      .dc-dossier code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11.5px;
        background: rgba(57, 255, 20, 0.08);
        padding: 1px 5px;
        border-radius: 3px;
        color: var(--phos);
      }
      .dc-dossier blockquote {
        border-left: 2px solid var(--phos);
        padding: 4px 12px;
        margin: 8px 0;
        background: rgba(57, 255, 20, 0.04);
        color: var(--txt-m);
      }

      .dc-foot {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px;
        font-size: 10px;
        color: var(--txt-l);
        border-top: 1px solid var(--line);
        font-variant-numeric: tabular-nums;
        gap: 10px;
      }
      .dc-foot-actions { display: flex; gap: 6px; }
      .dc-btn {
        background: transparent;
        border: 1px solid var(--phos-d);
        color: var(--phos);
        padding: 3px 10px;
        border-radius: 3px;
        font-size: 10px;
        font-family: 'JetBrains Mono', monospace;
        cursor: pointer;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        transition: all ${FAST};
      }
      .dc-btn:hover { background: var(--phos-x); text-shadow: 0 0 4px var(--phos-d); }

      .dc-fail {
        padding: 12px 14px;
        color: #fb7185;
        font-size: 11.5px;
        line-height: 1.5;
        background: linear-gradient(180deg, rgba(248,113,113,0.06), transparent);
        border-top: 1px solid rgba(248,113,113,0.2);
      }
    `;
    document.head.appendChild(style);
  }

  function escHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  const PROBE_LABELS = {
    username_sleuth: 'Username sleuth',
    github:          'GitHub deep',
    whois:           'WHOIS + DNS',
    wayback:         'Wayback Machine',
    hunter:          'Hunter.io',
    deep_search:     'Multi-engine search',
  };

  function create({ target } = {}) {
    const container = document.getElementById('chat-messages') || document.querySelector('.chat-messages');
    if (!container) { console.warn('[chakaDigCard] no chat container'); return null; }

    const card = document.createElement('div');
    card.className = 'dc-card message-group bot';
    card.innerHTML = `
      <div class="dc-head">
        <span class="dc-prompt">▶</span>
        <div class="dc-title-block">
          <div class="dc-title">DEEP DIG // OSINT</div>
          <div class="dc-subtitle"><span class="dc-shim">initializing primitives…</span></div>
        </div>
        <span class="dc-badge">CREATOR</span>
        <span class="dc-elapsed" style="font-size:10.5px;color:var(--txt-l);font-variant-numeric:tabular-nums;">0s</span>
      </div>
      <div class="dc-target"><span class="dc-prompt">$</span>dig --target "${escHtml(target || '')}"</div>
      <div class="dc-probes"></div>
      <div class="dc-stats" hidden></div>
      <div class="dc-body"></div>
      <div class="dc-foot">
        <span class="dc-provider">awaiting…</span>
        <div class="dc-foot-actions"></div>
      </div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    const startedAt = Date.now();
    const probesEl  = card.querySelector('.dc-probes');
    const statsEl   = card.querySelector('.dc-stats');
    const bodyEl    = card.querySelector('.dc-body');
    const subtitle  = card.querySelector('.dc-subtitle');
    const elapsedEl = card.querySelector('.dc-elapsed');
    const providerEl = card.querySelector('.dc-provider');
    const probeMap  = new Map();

    // Pre-create probe chips for all known primitives
    for (const [k, label] of Object.entries(PROBE_LABELS)) {
      const chip = document.createElement('div');
      chip.className = 'dc-probe';
      chip.dataset.primitive = k;
      chip.innerHTML = `<span class="dc-spin"></span><span class="dc-check">✓</span><span>${label}</span><span class="dc-probe-count"></span>`;
      probesEl.appendChild(chip);
      probeMap.set(k, chip);
    }

    const timer = setInterval(() => { elapsedEl.textContent = fmtTime(Date.now() - startedAt); }, 250);

    function setSubtitle(text, shimmer = false) {
      subtitle.innerHTML = shimmer
        ? `<span class="dc-shim">${escHtml(text)}</span>`
        : escHtml(text);
    }
    function probeState(name, state, count) {
      const chip = probeMap.get(name); if (!chip) return;
      chip.classList.remove('running', 'done');
      if (state) chip.classList.add(state);
      if (count != null) chip.querySelector('.dc-probe-count').textContent = String(count);
    }

    return {
      el: card,

      status(type, payload = {}) {
        switch (type) {
          case 'dig_start':
            setSubtitle(`launching ${Object.keys(PROBE_LABELS).length} primitives…`, true);
            break;
          case 'dig_probe_start':
            probeState(payload.primitive, 'running');
            setSubtitle(`probing: ${PROBE_LABELS[payload.primitive] || payload.primitive}`, true);
            break;
          case 'dig_probe_done': {
            const count = payload.hits ?? payload.user_count ?? payload.snapshot_count ?? payload.result_count ?? null;
            probeState(payload.primitive, 'done', count);
            setSubtitle(`${PROBE_LABELS[payload.primitive] || payload.primitive} → ${count != null ? count + ' hits' : 'done'}`, false);
            break;
          }
          case 'dig_primitives_done':
            setSubtitle('all primitives complete · synthesizing dossier…', true);
            // Show stats grid
            const s = payload.summary || {};
            statsEl.hidden = false;
            statsEl.innerHTML = `
              <div class="dc-stat"><div class="v">${s.username_hits || 0}</div><div class="l">handles</div></div>
              <div class="dc-stat"><div class="v">${s.github_users || 0}</div><div class="l">gh users</div></div>
              <div class="dc-stat"><div class="v">${s.github_emails || 0}</div><div class="l">emails</div></div>
              <div class="dc-stat"><div class="v">${s.search_hits || 0}</div><div class="l">web hits</div></div>
              <div class="dc-stat"><div class="v">${s.wayback_snapshots || 0}</div><div class="l">snapshots</div></div>
              <div class="dc-stat"><div class="v">${s.whois_ok ? '✓' : '—'}</div><div class="l">whois</div></div>
            `;
            break;
          case 'dig_synthesizing':
            setSubtitle('synthesizing dossier with strict identity gating…', true);
            break;
          case 'heartbeat':
            // keep shimmer alive — no change
            break;
        }
      },

      complete(payload) {
        card.classList.add('done');
        clearInterval(timer);
        setSubtitle(`complete · ${fmtTime(payload.elapsedMs || 0)} · provider: ${payload.provider || '?'}`, false);
        card.querySelector('.dc-title').textContent = 'DIG // COMPLETE';
        providerEl.textContent = `via ${payload.provider || 'multi'}`;

        // Stats grid update with final numbers
        const p = payload.primitives || {};
        statsEl.hidden = false;
        statsEl.innerHTML = `
          <div class="dc-stat"><div class="v">${p.username_hits || 0}</div><div class="l">handles</div></div>
          <div class="dc-stat"><div class="v">${p.github_users || 0}</div><div class="l">gh users</div></div>
          <div class="dc-stat"><div class="v">${(p.github_emails || []).length}</div><div class="l">emails</div></div>
          <div class="dc-stat"><div class="v">${p.search_hits || 0}</div><div class="l">web hits</div></div>
          <div class="dc-stat"><div class="v">${p.wayback_snapshots || 0}</div><div class="l">snapshots</div></div>
          <div class="dc-stat"><div class="v">${p.whois_summary ? '✓' : '—'}</div><div class="l">whois</div></div>
        `;

        const html = window.marked
          ? window.marked.parse(payload.dossier || '')
          : escHtml(payload.dossier || '').replace(/\n/g, '<br>');
        bodyEl.className = 'dc-dossier';
        bodyEl.innerHTML = html;

        const actions = card.querySelector('.dc-foot-actions');
        actions.innerHTML = `
          <button class="dc-btn" data-act="expand">expand</button>
          <button class="dc-btn" data-act="copy">copy</button>
        `;
        actions.querySelector('[data-act="expand"]').addEventListener('click', function () {
          bodyEl.classList.toggle('expanded');
          this.textContent = bodyEl.classList.contains('expanded') ? 'collapse' : 'expand';
        });
        actions.querySelector('[data-act="copy"]').addEventListener('click', () => {
          navigator.clipboard?.writeText(payload.dossier || '').catch(() => {});
        });
      },

      fail(message) {
        card.classList.add('error');
        clearInterval(timer);
        setSubtitle(`failed after ${fmtTime(Date.now() - startedAt)}`, false);
        card.querySelector('.dc-title').textContent = 'DIG // FAILED';
        const fail = document.createElement('div');
        fail.className = 'dc-fail';
        fail.textContent = message || 'Unknown error';
        bodyEl.replaceWith(fail);
      },
    };
  }

  window.chakaDigCard = { create };
  console.log('[chakaDigCard] loaded ▶');
})();
