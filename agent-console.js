/**
 * agent-console.js — Phase 4 polish, 2026 LIQUID-GLASS redesign
 *
 * Premium agent console card. One card per autonomous browser task.
 * Designed against the UI/UX Pro Max "Liquid Glass" spec:
 *   • Inter typography (300-700 weights, font-display swap)
 *   • Iridescent accent gradient (#818cf8 → #a78bfa → #5eead4) for active state
 *   • Fluid 480ms spring transitions (NOT fast — the spec calls out fast
 *     animations as a "Liquid Glass" anti-pattern)
 *   • Inner top hairline highlight (light-from-above premium glass cue)
 *   • Hover halo with iridescent outer glow
 *   • Dynamic backdrop blur(36px) saturate(170%)
 *   • Action red #DC2626 reserved STRICTLY for destructive / fail state
 *
 * Behavioral upgrades (kept from prior iteration, expanded):
 *   • Crossfade between live frames (380ms ease)
 *   • Humanized action names + Lucide-style SVG icons per step
 *   • Live URL chip with favicon + crossfade transition on URL change
 *   • Per-step duration + clickable timeline → scrubs viewport back
 *   • Snap-to-corner drag in floating mode, with spring release
 *   • Minimize to compact pill (click pill to restore)
 *   • Keyboard: Esc / P / T / M
 *   • aria-live="polite" on subtitle (screen reader announces progress)
 *   • Visible focus rings on every interactive element (WCAG)
 *
 * Public API (100% backward compatible):
 *   const c = window.chakaAgentConsole.create({ task, maxSteps, parent })
 *   c.frame(base64, mime)
 *   c.step({ action, reasoning, url, screenshot })
 *   c.complete(message)
 *   c.fail(message)
 *   c.placeholder(text)
 */
(function () {
  'use strict';

  const RM       = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const SPRING   = RM ? '0ms linear' : '480ms cubic-bezier(0.34, 1.56, 0.64, 1)';
  const SMOOTH   = RM ? '0ms linear' : '420ms cubic-bezier(0.4, 0, 0.2, 1)';
  const FAST     = RM ? '0ms linear' : '220ms cubic-bezier(0.4, 0, 0.2, 1)';

  // ── Load Inter (once, idempotent) ────────────────────────────────────────
  if (!document.getElementById('chaka-inter-font')) {
    const link = document.createElement('link');
    link.id = 'chaka-inter-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }

  // ── Style injection (idempotent) ─────────────────────────────────────────
  if (!document.getElementById('chaka-agent-console-style')) {
    const style = document.createElement('style');
    style.id = 'chaka-agent-console-style';
    style.textContent = `
      @keyframes ck-spin { to { transform: rotate(360deg); } }
      @keyframes ck-card-in {
        0%   { opacity: 0; transform: translateY(10px) scale(0.96); filter: blur(8px); }
        60%  { opacity: 1; filter: blur(0); }
        100% { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0); }
      }
      @keyframes ck-pulse-soft {
        0%, 100% { opacity: 1;   transform: scale(1); }
        50%      { opacity: 0.5; transform: scale(0.85); }
      }
      @keyframes ck-shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes ck-ticker-in {
        0%   { opacity: 0; transform: translateY(12px); filter: blur(4px); }
        60%  { opacity: 1; filter: blur(0); }
        100% { opacity: 1; transform: translateY(0); filter: blur(0); }
      }
      @keyframes ck-icon-pop {
        0%   { transform: scale(0.6); }
        60%  { transform: scale(1.15); }
        100% { transform: scale(1); }
      }
      @keyframes ck-iris-rotate {
        from { --ang: 0deg;   }
        to   { --ang: 360deg; }
      }
      @keyframes ck-progress-pulse {
        0%, 100% { box-shadow: 0 0 12px var(--accent-soft); }
        50%      { box-shadow: 0 0 22px var(--accent-soft); }
      }

      @property --ang {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }

      /* Win specificity battle against .message-group.bot { max-width: 75% } */
      .ck-card.message-group.bot,
      .ck-card {
        /* Iridescent working palette */
        --iris-1: #818cf8;
        --iris-2: #a78bfa;
        --iris-3: #5eead4;
        --accent:      var(--iris-2);
        --accent-soft: rgba(167, 139, 250, 0.55);
        --accent-dim:  rgba(167, 139, 250, 0.10);
        --accent-grad: linear-gradient(135deg, var(--iris-1), var(--iris-2), var(--iris-3));

        /* States */
        --ok:   #34d399;
        --err:  #f87171;
        --err-strong: #DC2626;

        /* Surfaces */
        --surface-base:    rgba(11, 13, 18, 0.78);
        --surface-elev:    rgba(20, 23, 30, 0.86);

        /* Ink */
        --ink-hi:    rgba(245, 247, 250, 0.96);
        --ink-md:    rgba(245, 247, 250, 0.62);
        --ink-lo:    rgba(245, 247, 250, 0.38);

        /* Hairlines */
        --hairline:        rgba(255, 255, 255, 0.07);
        --hairline-strong: rgba(255, 255, 255, 0.13);
        --top-highlight:   rgba(255, 255, 255, 0.10);

        position: relative;
        max-width: 540px;
        margin: 12px 0;
        /* Critical: chat-messages is a flex column. Without flex-shrink: 0
           the parent layout squishes our card vertically when other
           messages fill the column, clipping the viewport/timeline/footer.
           This was the "card looks cut as session grows" bug. */
        flex-shrink: 0;
        align-self: flex-start;
        /* Ensure scrollIntoView leaves room above the composer */
        scroll-margin-top: 20px;
        scroll-margin-bottom: 140px;
        border-radius: 18px;
        background:
          linear-gradient(180deg, var(--surface-elev) 0%, var(--surface-base) 100%);
        backdrop-filter: blur(36px) saturate(170%);
        -webkit-backdrop-filter: blur(36px) saturate(170%);
        border: 1px solid var(--hairline);
        box-shadow:
          inset 0 1px 0 0 var(--top-highlight),                     /* top "light from above" highlight */
          inset 0 0 0 1px rgba(255, 255, 255, 0.015),                /* ambient inner */
          0 32px 64px -16px rgba(0, 0, 0, 0.75),
          0 4px 12px rgba(0, 0, 0, 0.30);
        color: var(--ink-hi);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
        font-feature-settings: "ss01", "cv11";
        animation: ck-card-in ${SPRING};
        overflow: hidden;
        transition: box-shadow ${SMOOTH}, border-color ${SMOOTH};
      }

      /* Iridescent border halo on working state (conic, very slow rotate) */
      .ck-card::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        padding: 1px;
        background: conic-gradient(
          from var(--ang, 0deg),
          transparent 0deg,
          var(--iris-1) 90deg,
          var(--iris-2) 180deg,
          var(--iris-3) 270deg,
          transparent 360deg
        );
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        opacity: 0.55;
        animation: ck-iris-rotate 12s linear infinite;
        pointer-events: none;
        transition: opacity ${SMOOTH};
      }
      .ck-card.done::before  { opacity: 0; }
      .ck-card.error::before { opacity: 0; }
      .ck-card:hover { box-shadow:
        inset 0 1px 0 0 var(--top-highlight),
        inset 0 0 0 1px rgba(255, 255, 255, 0.02),
        0 36px 72px -16px rgba(0, 0, 0, 0.8),
        0 4px 12px rgba(0, 0, 0, 0.3),
        0 0 48px -8px var(--accent-soft);
      }

      .ck-card.done  { --accent: var(--ok);  --accent-soft: rgba(52, 211, 153, 0.45); --accent-dim: rgba(52,211,153,0.08); --accent-grad: linear-gradient(135deg, #34d399, #6ee7b7); }
      .ck-card.error { --accent: var(--err); --accent-soft: rgba(248, 113, 113, 0.45); --accent-dim: rgba(248,113,113,0.08); --accent-grad: linear-gradient(135deg, #f87171, #ef4444); }

      /* ── Auto-pin pill (appears when card scrolls out of viewport) ──── */
      .ck-pin-pill {
        position: fixed;
        right: 28px;
        bottom: 110px;
        z-index: 9999;
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px;
        background: linear-gradient(180deg, rgba(20,23,30,0.94), rgba(14,16,22,0.96));
        backdrop-filter: blur(28px) saturate(160%);
        -webkit-backdrop-filter: blur(28px) saturate(160%);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        box-shadow:
          inset 0 1px 0 0 rgba(255,255,255,0.08),
          0 16px 40px -8px rgba(0,0,0,0.6),
          0 0 32px -4px var(--accent-soft);
        color: var(--ink-hi);
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 12px; font-weight: 500;
        cursor: pointer;
        opacity: 0;
        transform: translateY(8px) scale(0.94);
        pointer-events: none;
        transition: opacity ${SMOOTH}, transform ${SMOOTH};
      }
      .ck-pin-pill.show { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .ck-pin-pill:hover { background: linear-gradient(180deg, rgba(26,30,38,0.96), rgba(18,21,28,0.97)); }
      .ck-pin-pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
      .ck-pin-pill .ck-dot {
        width: 7px; height: 7px;
      }
      .ck-pin-pill-meta {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--ink-md);
        font-variant-numeric: tabular-nums;
      }
      .ck-pin-pill-arrow {
        opacity: 0.55;
        margin-left: 2px;
        transition: opacity ${FAST}, transform ${FAST};
      }
      .ck-pin-pill:hover .ck-pin-pill-arrow { opacity: 1; transform: translateY(2px); }

      .ck-card.minimized {
        max-width: 260px;
      }
      .ck-card.minimized .ck-body { display: none; }
      .ck-card.minimized .ck-head { display: none; }

      /* ── Header ─────────────────────────────────────────────────────── */
      .ck-head {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 16px;
        border-bottom: 1px solid var(--hairline);
        position: relative;
        z-index: 1;
      }
      .ck-card.floating .ck-head { cursor: grab; }
      .ck-card.floating.dragging .ck-head { cursor: grabbing; }

      .ck-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--accent-grad);
        box-shadow: 0 0 12px var(--accent-soft);
        animation: ck-pulse-soft 1.8s ease-in-out infinite;
        flex-shrink: 0;
      }
      .ck-card.done  .ck-dot,
      .ck-card.error .ck-dot { animation: none; background: var(--accent); }

      .ck-title-block { flex: 1; min-width: 0; }
      .ck-title {
        font-size: 13.5px; font-weight: 600;
        letter-spacing: -0.015em; line-height: 1.15;
        color: var(--ink-hi);
      }
      .ck-subtitle {
        font-size: 11px; font-weight: 450;
        color: var(--ink-md);
        line-height: 1.4; margin-top: 2px;
        font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, monospace;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: color ${FAST};
      }
      .ck-subtitle .ck-shimmer-text {
        background: linear-gradient(90deg,
          var(--ink-md) 0%,
          var(--ink-hi) 50%,
          var(--ink-md) 100%);
        background-size: 200% 100%;
        animation: ck-shimmer 2.4s linear infinite;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .ck-actions { display: flex; gap: 2px; flex-shrink: 0; position: relative; }
      .ck-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--ink-md);
        width: 28px; height: 28px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 13px;
        transition: background ${FAST}, color ${FAST}, transform ${FAST};
      }
      .ck-btn:hover {
        background: var(--accent-dim);
        color: var(--accent);
      }
      .ck-btn:active { transform: scale(0.92); }
      .ck-btn:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .ck-btn svg { width: 14px; height: 14px; }
      .ck-btn.danger:hover {
        background: rgba(220, 38, 38, 0.12);
        color: var(--err-strong);
      }

      /* ── Top sweep progress ─────────────────────────────────────────── */
      .ck-progress {
        position: relative;
        height: 2px;
        background: rgba(255, 255, 255, 0.05);
        overflow: hidden;
        z-index: 1;
      }
      .ck-progress-fill {
        position: absolute; top: 0; left: 0; height: 100%;
        width: 0%;
        background: var(--accent-grad);
        transition: width ${SMOOTH};
        animation: ck-progress-pulse 2.6s ease-in-out infinite;
      }
      .ck-progress-fill::after {
        /* bright leading edge */
        content: '';
        position: absolute;
        right: -2px; top: -2px; bottom: -2px;
        width: 6px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 0 8px white, 0 0 14px var(--accent-soft);
        opacity: 0.85;
      }
      .ck-card.done .ck-progress-fill,
      .ck-card.error .ck-progress-fill { animation: none; }

      /* ── Viewport ───────────────────────────────────────────────────── */
      .ck-viewport {
        position: relative;
        margin: 14px 14px 0;
        border-radius: 12px;
        overflow: hidden;
        background: #050608;
        border: 1px solid var(--hairline);
        aspect-ratio: 16 / 9;
        max-height: 280px;     /* keep card compact in chat */
        min-height: 160px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .ck-viewport img {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover; object-position: top center;
        opacity: 0;
        transition: opacity 380ms ease;
      }
      .ck-viewport img.show { opacity: 1; }
      .ck-viewport-empty {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        color: var(--ink-lo); font-size: 11.5px;
        background: linear-gradient(110deg,
          rgba(255,255,255,0.015) 0%,
          rgba(255,255,255,0.05) 50%,
          rgba(255,255,255,0.015) 100%);
        background-size: 200% 100%;
        animation: ck-shimmer 3s linear infinite;
        gap: 10px;
      }
      .ck-viewport-empty .ck-mini-spin {
        width: 14px; height: 14px;
        border: 1.5px solid rgba(255,255,255,0.12);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: ck-spin 0.85s linear infinite;
      }

      /* ── Ticker (subtitle-overlay on viewport bottom) ───────────────── */
      .ck-ticker {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        padding: 28px 14px 12px;
        background: linear-gradient(180deg,
          transparent 0%,
          rgba(0, 0, 0, 0.55) 55%,
          rgba(0, 0, 0, 0.86) 100%);
        display: flex; align-items: center; gap: 9px;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.94);
        pointer-events: none;
        min-height: 40px;
        letter-spacing: -0.005em;
      }
      .ck-ticker.fresh { animation: ck-ticker-in 380ms cubic-bezier(0.34, 1.56, 0.64, 1); }
      .ck-ticker-icon {
        width: 15px; height: 15px;
        flex-shrink: 0;
        opacity: 0.95;
        display: inline-flex;
      }
      .ck-ticker.fresh .ck-ticker-icon { animation: ck-icon-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
      .ck-ticker-icon svg { width: 100%; height: 100%; display: block; }
      .ck-ticker-text {
        flex: 1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ck-ticker-step {
        font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.55);
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }

      /* ── URL chip ───────────────────────────────────────────────────── */
      .ck-url {
        display: flex; align-items: center; gap: 7px;
        margin: 12px 16px 0;
        padding: 7px 11px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--hairline);
        border-radius: 9px;
        font-size: 11.5px;
        color: var(--ink-md);
        font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, monospace;
        text-decoration: none;
        transition: background ${FAST}, border-color ${FAST}, color ${FAST};
        overflow: hidden;
      }
      .ck-url:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: var(--hairline-strong);
        color: var(--ink-hi);
      }
      .ck-url:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .ck-url-favicon {
        width: 13px; height: 13px;
        flex-shrink: 0;
        border-radius: 3px;
        transition: opacity ${FAST};
      }
      .ck-url-favicon.morph { opacity: 0; }
      .ck-url-text {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        flex: 1;
        transition: opacity ${FAST};
      }
      .ck-url-text.morph { opacity: 0; transform: translateY(-2px); }
      .ck-url-arrow { opacity: 0.5; font-size: 10px; flex-shrink: 0; }

      /* ── Task line ──────────────────────────────────────────────────── */
      .ck-task {
        padding: 10px 16px 0;
        font-size: 11.5px;
        color: var(--ink-md);
        line-height: 1.5;
        font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, monospace;
        cursor: pointer;
        transition: color ${FAST};
      }
      .ck-task:hover { color: var(--ink-hi); }
      .ck-task .ck-task-text {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .ck-task.expanded .ck-task-text {
        -webkit-line-clamp: unset;
        display: block;
        white-space: normal;
      }

      /* ── Timeline ───────────────────────────────────────────────────── */
      .ck-timeline-toggle {
        margin-top: 12px;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 11px;
        color: var(--ink-lo);
        border-top: 1px solid var(--hairline);
        display: flex; justify-content: space-between; align-items: center;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        transition: color ${FAST};
        user-select: none;
      }
      .ck-timeline-toggle:hover { color: var(--ink-md); }
      .ck-timeline-toggle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      .ck-timeline-toggle .caret { transition: transform ${SMOOTH}; display: inline-block; }
      .ck-card.timeline-open .ck-timeline-toggle .caret { transform: rotate(180deg); }

      .ck-timeline {
        max-height: 0;
        overflow: hidden;
        transition: max-height ${SMOOTH};
      }
      .ck-card.timeline-open .ck-timeline { max-height: 280px; overflow-y: auto; }
      .ck-timeline-inner { padding: 2px 14px 12px; }
      .ck-timeline-row {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 8px;
        font-size: 11px;
        border-radius: 7px;
        cursor: pointer;
        transition: background ${FAST};
      }
      .ck-timeline-row:hover { background: var(--accent-dim); }
      .ck-timeline-row.active { background: var(--accent-dim); }
      .ck-timeline-row:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      .ck-timeline-row .n {
        width: 20px; flex-shrink: 0;
        color: var(--ink-lo);
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .ck-timeline-row .ic {
        width: 13px; height: 13px;
        flex-shrink: 0; opacity: 0.8;
        color: var(--ink-md);
      }
      .ck-timeline-row .ic svg { width: 100%; height: 100%; display: block; }
      .ck-timeline-row .txt {
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--ink-hi);
        font-family: 'JetBrains Mono', monospace;
      }
      .ck-timeline-row .dur {
        flex-shrink: 0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: var(--ink-lo);
        font-variant-numeric: tabular-nums;
      }

      /* ── Summary ────────────────────────────────────────────────────── */
      .ck-summary {
        padding: 14px 16px 6px;
        font-size: 12.5px;
        line-height: 1.6;
        color: var(--ink-hi);
        border-top: 1px solid var(--hairline);
      }
      .ck-card.done  .ck-summary { background: linear-gradient(180deg, rgba(52, 211, 153, 0.05), transparent); }
      .ck-card.error .ck-summary { background: linear-gradient(180deg, rgba(248, 113, 113, 0.07), transparent); }
      .ck-summary p:first-child { margin-top: 0; }
      .ck-summary p:last-child { margin-bottom: 0; }

      /* ── Footer ─────────────────────────────────────────────────────── */
      .ck-foot {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px 14px;
        font-size: 10.5px;
        color: var(--ink-lo);
        font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, monospace;
        font-variant-numeric: tabular-nums;
      }
      .ck-foot .ck-model {
        display: inline-flex; align-items: center; gap: 6px;
      }
      .ck-foot .ck-model::before {
        content: ''; display: inline-block;
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--accent-grad);
        box-shadow: 0 0 6px var(--accent-soft);
        opacity: 0.85;
      }

      /* ── Popover ────────────────────────────────────────────────────── */
      .ck-popover {
        position: absolute;
        top: 36px; right: 0;
        background: rgba(18, 20, 26, 0.97);
        backdrop-filter: blur(32px) saturate(180%);
        -webkit-backdrop-filter: blur(32px) saturate(180%);
        border: 1px solid var(--hairline-strong);
        border-radius: 10px;
        padding: 5px;
        box-shadow:
          inset 0 1px 0 0 rgba(255,255,255,0.06),
          0 16px 40px -8px rgba(0,0,0,0.7);
        display: none;
        z-index: 5;
        min-width: 180px;
      }
      .ck-popover.open { display: block; animation: ck-card-in 280ms ease-out; }
      .ck-popover-item {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 11px;
        font-size: 12px;
        color: var(--ink-hi);
        cursor: pointer;
        border-radius: 7px;
        transition: background ${FAST}, color ${FAST};
        user-select: none;
      }
      .ck-popover-item:hover { background: var(--accent-dim); color: var(--accent); }
      .ck-popover-item:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      .ck-popover-item svg { width: 13px; height: 13px; flex-shrink: 0; }
      .ck-popover-item .ck-shortcut {
        margin-left: auto;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: var(--ink-lo);
        padding: 1px 5px;
        background: rgba(255,255,255,0.05);
        border-radius: 3px;
      }

      /* ── Minimized pill ─────────────────────────────────────────────── */
      .ck-mini {
        display: none;
        align-items: center; gap: 10px;
        padding: 12px 14px;
        font-size: 12px;
        color: var(--ink-hi);
        cursor: pointer;
        user-select: none;
        transition: background ${FAST};
      }
      .ck-mini:hover { background: rgba(255,255,255,0.02); }
      .ck-card.minimized .ck-mini { display: flex; }
      .ck-mini-label { font-weight: 600; letter-spacing: -0.01em; }
      .ck-mini-meta {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10.5px;
        color: var(--ink-md);
        margin-left: auto;
        font-variant-numeric: tabular-nums;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Lucide-style SVG icons (1.75px stroke, consistent visual language) ─
  const I = {
    mouse:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 17h8"/></svg>',
    globe:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>',
    scroll:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    scrollUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    enter:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
    check:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    sparkle:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
    eye:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    file:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    popout:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
    close:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    more:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  };

  function humanizeAction(action, reasoning) {
    const a = String(action || '').toLowerCase();
    if (a.startsWith('click'))                            return { text: 'Clicking element',   icon: 'mouse' };
    if (a === 'input_text' || a.startsWith('input') || a.startsWith('type'))
                                                          return { text: 'Typing text',        icon: 'keyboard' };
    if (a.startsWith('go_to_url') || a === 'navigate' || a === 'open_tab')
                                                          return { text: 'Navigating',         icon: 'globe' };
    if (a === 'scroll_down' || a.includes('scroll_down')) return { text: 'Scrolling down',     icon: 'scroll' };
    if (a === 'scroll_up'   || a.includes('scroll_up'))   return { text: 'Scrolling up',       icon: 'scrollUp' };
    if (a === 'send_keys' || a.includes('enter') || a.includes('submit'))
                                                          return { text: 'Submitting',         icon: 'enter' };
    if (a === 'done' || a === 'task_complete')            return { text: 'Task complete',      icon: 'check' };
    if (a === 'extract' || a.includes('extract_content')) return { text: 'Reading page',       icon: 'eye' };
    if (a === 'upload_file' || a.includes('upload'))      return { text: 'Uploading file',     icon: 'file' };
    if (a === 'thinking' || a === 'step')                 return { text: reasoning || 'Thinking', icon: 'sparkle' };
    const pretty = a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    return { text: pretty || 'Working', icon: 'sparkle' };
  }

  function fmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  function fmtDur(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  function esc(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function hostname(url) {
    try { return new URL(url).hostname; } catch { return url || ''; }
  }
  function faviconFor(url) {
    try {
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch { return ''; }
  }

  function snapToCorner(card) {
    const m = 16;
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const vw = window.innerWidth, vh = window.innerHeight;
    const right  = cx > vw / 2;
    const bottom = cy > vh / 2;
    card.style.left   = right  ? 'auto' : m + 'px';
    card.style.right  = right  ? m + 'px' : 'auto';
    card.style.top    = bottom ? 'auto' : m + 'px';
    card.style.bottom = bottom ? m + 'px' : 'auto';
  }

  // ── Main factory ─────────────────────────────────────────────────────
  function create({ task, maxSteps = 35, parent } = {}) {
    const container = parent ||
      document.getElementById('chat-messages') ||
      document.querySelector('.chat-messages');
    if (!container) { console.warn('[chakaAgentConsole] no chat container'); return null; }

    const card = document.createElement('div');
    card.className = 'ck-card message-group bot';
    card.tabIndex = -1;
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Autonomous agent task progress');
    card.innerHTML = `
      <div class="ck-mini" role="button" tabindex="0" aria-label="Restore agent console">
        <div class="ck-dot"></div>
        <span class="ck-mini-label">Agent</span>
        <span class="ck-mini-meta">step <span class="ck-mini-step">0</span> · <span class="ck-mini-elapsed">0s</span></span>
      </div>
      <div class="ck-head">
        <div class="ck-dot"></div>
        <div class="ck-title-block">
          <div class="ck-title">Agent</div>
          <div class="ck-subtitle" aria-live="polite"><span class="ck-shimmer-text">starting up…</span></div>
        </div>
        <div class="ck-actions">
          <button class="ck-btn" data-act="more" title="More options" aria-label="More options" aria-haspopup="menu">${I.more}</button>
          <div class="ck-popover" role="menu">
            <div class="ck-popover-item" data-act="minimize" role="menuitem" tabindex="0">${I.minimize}<span>Minimize</span><span class="ck-shortcut">M</span></div>
            <div class="ck-popover-item" data-act="timeline" role="menuitem" tabindex="0">${I.eye}<span>Toggle timeline</span><span class="ck-shortcut">T</span></div>
            <div class="ck-popover-item" data-act="dismiss" role="menuitem" tabindex="0">${I.close}<span>Dismiss</span><span class="ck-shortcut">Esc</span></div>
          </div>
        </div>
      </div>
      <div class="ck-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${maxSteps}" aria-valuenow="0"><div class="ck-progress-fill"></div></div>
      <div class="ck-body">
        <div class="ck-viewport" role="img" aria-label="Live browser viewport">
          <div class="ck-viewport-empty"><span class="ck-mini-spin"></span>Waking browser…</div>
          <div class="ck-ticker">
            <span class="ck-ticker-icon">${I.sparkle}</span>
            <span class="ck-ticker-text">initializing</span>
            <span class="ck-ticker-step">·</span>
          </div>
        </div>
        <a class="ck-url" href="#" target="_blank" rel="noopener" style="display:none" aria-label="Current page URL">
          <img class="ck-url-favicon" alt="" />
          <span class="ck-url-text"></span>
          <span class="ck-url-arrow" aria-hidden="true">↗</span>
        </a>
        <div class="ck-task" role="button" tabindex="0" aria-label="Task description, click to expand"><div class="ck-task-text">${esc(task || '')}</div></div>
        <div class="ck-timeline-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="ck-timeline-${Date.now()}">
          <span>Timeline · <span class="ck-step-count">0</span> step<span class="ck-step-plural">s</span></span>
          <span class="caret" aria-hidden="true">▾</span>
        </div>
        <div class="ck-timeline"><div class="ck-timeline-inner"></div></div>
        <div class="ck-foot">
          <span class="ck-model">Initializing...</span>
          <span class="ck-elapsed">0s</span>
        </div>
      </div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    // ── State ──────────────────────────────────────────────────────────
    const startedAt = Date.now();
    let stepCount = 0;
    let lastFrameTs = 0;
    let lastStepTs = startedAt;
    let activeImg = 0;
    let lastUrl = '';
    const stepHistory = [];

    // Two stacked <img> for crossfade
    const vp = card.querySelector('.ck-viewport');
    const imgA = document.createElement('img'); imgA.alt = '';
    const imgB = document.createElement('img'); imgB.alt = '';
    vp.appendChild(imgA); vp.appendChild(imgB);

    // ── Live elapsed ticker ───────────────────────────────────────────
    const elapsedEl = card.querySelector('.ck-elapsed');
    const miniElapsedEl = card.querySelector('.ck-mini-elapsed');
    const elapsedTimer = setInterval(() => {
      const txt = fmtElapsed(Date.now() - startedAt);
      elapsedEl.textContent = txt;
      miniElapsedEl.textContent = txt;
    }, 250);

    // ── Subtitle helpers ──────────────────────────────────────────────
    const subtitleEl = card.querySelector('.ck-subtitle');
    function setSubtitle(text, shimmer = false) {
      subtitleEl.innerHTML = shimmer
        ? `<span class="ck-shimmer-text">${esc(text)}</span>`
        : esc(text);
    }

    // ── Progress bar ──────────────────────────────────────────────────
    const progressEl = card.querySelector('.ck-progress');
    const progressFill = card.querySelector('.ck-progress-fill');
    function updateProgress(forceComplete = false) {
      const pct = forceComplete ? 100 : Math.min(100, (stepCount / Math.max(maxSteps, 1)) * 100);
      progressFill.style.width = pct + '%';
      progressEl.setAttribute('aria-valuenow', stepCount);
    }

    // ── URL chip with morph transition ────────────────────────────────
    const urlEl = card.querySelector('.ck-url');
    const urlText = card.querySelector('.ck-url-text');
    const urlFav = card.querySelector('.ck-url-favicon');
    function setUrl(url) {
      if (!url || url === lastUrl) return;
      lastUrl = url;
      urlEl.style.display = 'flex';
      urlText.classList.add('morph');
      urlFav.classList.add('morph');
      setTimeout(() => {
        urlEl.href = url;
        urlText.textContent = hostname(url);
        urlFav.src = faviconFor(url);
        urlText.classList.remove('morph');
        urlFav.classList.remove('morph');
      }, 180);
    }

    // ── Task line: click to expand ────────────────────────────────────
    const taskEl = card.querySelector('.ck-task');
    function toggleTask() { taskEl.classList.toggle('expanded'); }
    taskEl.addEventListener('click', toggleTask);
    taskEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(); } });

    // ── Popover ──────────────────────────────────────────────────────
    const popover = card.querySelector('.ck-popover');
    card.querySelector('[data-act="more"]').addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!card.contains(e.target)) popover.classList.remove('open');
    });

    // ── Timeline ──────────────────────────────────────────────────────
    const timelineToggle = card.querySelector('.ck-timeline-toggle');
    const timelineInner = card.querySelector('.ck-timeline-inner');
    function toggleTimeline() {
      const open = card.classList.toggle('timeline-open');
      timelineToggle.setAttribute('aria-expanded', String(open));
    }
    timelineToggle.addEventListener('click', toggleTimeline);
    timelineToggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTimeline(); } });

    function addTimelineRow(s) {
      const row = document.createElement('div');
      row.className = 'ck-timeline-row';
      row.dataset.step = s.n;
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Step ${s.n}: ${s.text}, took ${fmtDur(s.dur)}. Click to view screenshot.`);
      row.innerHTML = `
        <span class="n">${s.n}</span>
        <span class="ic">${I[s.icon] || I.sparkle}</span>
        <span class="txt" title="${esc(s.reasoning || s.text)}">${esc(s.text)}</span>
        <span class="dur">${fmtDur(s.dur)}</span>
      `;
      const activate = () => {
        if (s.screenshot) showFrame(s.screenshot, 'image/jpeg');
        timelineInner.querySelectorAll('.ck-timeline-row.active').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
      };
      row.addEventListener('click', activate);
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      timelineInner.appendChild(row);
    }

    // ── Frame crossfade ──────────────────────────────────────────────
    function showFrame(base64, mime = 'image/jpeg') {
      const empty = vp.querySelector('.ck-viewport-empty');
      if (empty) empty.remove();
      const incoming = activeImg === 0 ? imgB : imgA;
      const outgoing = activeImg === 0 ? imgA : imgB;
      incoming.onload = () => {
        incoming.classList.add('show');
        outgoing.classList.remove('show');
      };
      incoming.src = `data:${mime};base64,${base64}`;
      activeImg = 1 - activeImg;
    }

    // ── Auto-pin pill (replaces drag/popout) ─────────────────────────
    // When the card scrolls out of the chat viewport, surface a small
    // floating pill in the bottom-right that shows live status. Click
    // the pill to smoothly scroll the chat back to the card.
    const pill = document.createElement('button');
    pill.className = 'ck-pin-pill';
    pill.setAttribute('aria-label', 'Agent working — click to view');
    pill.innerHTML = `
      <div class="ck-dot"></div>
      <span>Agent</span>
      <span class="ck-pin-pill-meta">step <span class="ck-pin-pill-step">0</span> · <span class="ck-pin-pill-elapsed">0s</span></span>
      <span class="ck-pin-pill-arrow">↓</span>
    `;
    document.body.appendChild(pill);
    pill.addEventListener('click', () => {
      card.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    });

    // Mirror live updates onto the pill
    const pillStepEl = pill.querySelector('.ck-pin-pill-step');
    const pillElapsedEl = pill.querySelector('.ck-pin-pill-elapsed');
    const pillElapsedTimer = setInterval(() => {
      pillElapsedEl.textContent = fmtElapsed(Date.now() - startedAt);
    }, 250);

    // Show pill only while the card is out of view (intersection < 30%)
    let observer = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.intersectionRatio < 0.3) {
            pill.classList.add('show');
          } else {
            pill.classList.remove('show');
          }
        }
      }, { threshold: [0, 0.3, 0.6, 1] });
      observer.observe(card);
    }

    // Public no-op popout for backward compatibility — instead of opening
    // a draggable overlay, just scroll the card into view.
    function popout() {
      card.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    }

    // Cleanup when card is removed
    const cleanupPill = () => {
      clearInterval(pillElapsedTimer);
      observer?.disconnect();
      pill.remove();
    };
    // MutationObserver watches for the card being detached so we can yank the pill too
    const pillCleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(card)) {
        cleanupPill();
        pillCleanupObserver.disconnect();
      }
    });
    pillCleanupObserver.observe(document.body, { childList: true, subtree: true });

    // ── Minimize ─────────────────────────────────────────────────────
    function minimize() {
      card.classList.toggle('minimized');
      popover.classList.remove('open');
    }
    const miniEl = card.querySelector('.ck-mini');
    miniEl.addEventListener('click', () => {
      if (card.classList.contains('minimized')) card.classList.remove('minimized');
    });
    miniEl.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && card.classList.contains('minimized')) {
        e.preventDefault();
        card.classList.remove('minimized');
      }
    });

    // ── Popover actions ──────────────────────────────────────────────
    popover.querySelector('[data-act="minimize"]').addEventListener('click', minimize);
    popover.querySelector('[data-act="timeline"]').addEventListener('click', () => { toggleTimeline(); popover.classList.remove('open'); });
    popover.querySelector('[data-act="dismiss"]').addEventListener('click', () => card.remove());

    // ── Keyboard shortcuts ────────────────────────────────────────────
    function onKey(e) {
      const inp = document.activeElement;
      if (inp && (inp.tagName === 'INPUT' || inp.tagName === 'TEXTAREA' || inp.isContentEditable)) return;
      if (!document.body.contains(card)) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape')                  { e.preventDefault(); card.remove(); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTimeline(); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); minimize(); }
    }
    document.addEventListener('keydown', onKey);

    setSubtitle('thinking', true);

    // ── Public API ───────────────────────────────────────────────────
    return {
      el: card,
      popout,

      /** Live frame update (~6fps). Crossfades smoothly. */
      frame(base64, mime = 'image/jpeg') {
        const now = Date.now();
        if (now - lastFrameTs < 110) return;
        lastFrameTs = now;
        showFrame(base64, mime);
      },

      /** New step from browser-use callback. */
      step(payload = {}) {
        stepCount++;
        const now = Date.now();
        const dur = now - lastStepTs;
        lastStepTs = now;

        const { text, icon } = humanizeAction(payload.action, payload.reasoning);

        setSubtitle(`step ${stepCount} · acting`, false);

        // Update ticker (with slide+pop choreography)
        const ticker = vp.querySelector('.ck-ticker');
        if (ticker) {
          ticker.innerHTML = `
            <span class="ck-ticker-icon">${I[icon] || I.sparkle}</span>
            <span class="ck-ticker-text">${esc(text)}</span>
            <span class="ck-ticker-step">step ${stepCount}</span>
          `;
          ticker.classList.remove('fresh');
          // eslint-disable-next-line no-unused-expressions
          ticker.offsetWidth; // reflow to restart anim
          ticker.classList.add('fresh');
        }

        if (payload.url) setUrl(payload.url);
        if (payload.screenshot) showFrame(payload.screenshot, payload.screenshotMime || 'image/jpeg');

        updateProgress();
        card.querySelector('.ck-mini-step').textContent = stepCount;
        pillStepEl.textContent = stepCount;

        const entry = {
          n: stepCount, dur, icon, text,
          action: payload.action, reasoning: payload.reasoning,
          url: payload.url, screenshot: payload.screenshot,
        };
        stepHistory.push(entry);
        addTimelineRow(entry);

        card.querySelector('.ck-step-count').textContent = stepCount;
        card.querySelector('.ck-step-plural').textContent = stepCount === 1 ? '' : 's';

        // After ~700ms drop subtitle back to shimmering "thinking"
        setTimeout(() => {
          if (!card.classList.contains('done') && !card.classList.contains('error')) {
            setSubtitle('thinking', true);
          }
        }, 700);
      },

      complete(message = 'Task complete.') {
        card.classList.add('done');
        clearInterval(elapsedTimer);
        document.removeEventListener('keydown', onKey);
        card.querySelector('.ck-title').textContent = 'Task complete';
        setSubtitle(`finished in ${fmtElapsed(Date.now() - startedAt)} · ${stepCount} step${stepCount === 1 ? '' : 's'}`);
        updateProgress(true);

        const summary = document.createElement('div');
        summary.className = 'ck-summary';
        summary.innerHTML = window.marked ? window.marked.parse(message) : esc(message).replace(/\n/g, '<br>');
        card.querySelector('.ck-foot').before(summary);

        const ctrls = card.querySelector('.ck-actions');
        ctrls.innerHTML = `
          <button class="ck-btn" data-act="dismiss" title="Dismiss (Esc)" aria-label="Dismiss">${I.close}</button>
        `;
        ctrls.querySelector('[data-act="dismiss"]').addEventListener('click', () => card.remove());

        // Hide pill once task is done
        pill.classList.remove('show');
        cleanupPill();
      },

      fail(message = 'Task failed.') {
        card.classList.add('error');
        clearInterval(elapsedTimer);
        document.removeEventListener('keydown', onKey);
        card.querySelector('.ck-title').textContent = 'Task failed';
        setSubtitle(`stopped after ${stepCount} step${stepCount === 1 ? '' : 's'} · ${fmtElapsed(Date.now() - startedAt)}`);

        const summary = document.createElement('div');
        summary.className = 'ck-summary';
        summary.textContent = message;
        card.querySelector('.ck-foot').before(summary);

        const ctrls = card.querySelector('.ck-actions');
        ctrls.innerHTML = `
          <button class="ck-btn danger" data-act="dismiss" title="Dismiss (Esc)" aria-label="Dismiss">${I.close}</button>
        `;
        ctrls.querySelector('[data-act="dismiss"]').addEventListener('click', () => card.remove());

        pill.classList.remove('show');
        cleanupPill();
      },

      setModel(modelName) {
        const modelEl = card.querySelector('.ck-model');
        if (modelEl) {
          modelEl.textContent = String(modelName || 'gemini-2.5-flash');
        }
      },

      placeholder(text) {
        const empty = vp.querySelector('.ck-viewport-empty');
        if (empty) {
          empty.innerHTML = `<span class="ck-mini-spin"></span>${esc(text)}`;
        }
        setSubtitle(text);
      },

      /**
       * Phase 5.5 — reliability events (awaiting_email, solving_captcha, etc.)
       * Surfaces them as caption-overlay + subtitle changes so the user always
       * knows what the agent is waiting on or solving.
       */
      status(kind, payload = {}) {
        const ticker = vp.querySelector('.ck-ticker');
        const updateOverlay = (icon, text) => {
          if (ticker) {
            ticker.innerHTML = `
              <span class="ck-ticker-icon">${I[icon] || I.sparkle}</span>
              <span class="ck-ticker-text">${esc(text)}</span>
              <span class="ck-ticker-step">step ${stepCount}</span>
            `;
            ticker.classList.remove('fresh');
            // eslint-disable-next-line no-unused-expressions
            ticker.offsetWidth;
            ticker.classList.add('fresh');
          }
        };

        switch (kind) {
          case 'awaiting_email': {
            const timeout = payload.timeout_seconds || 120;
            const dom = payload.from_domain || 'sender';
            setSubtitle(`waiting for email from ${dom} · up to ${timeout}s`, true);
            updateOverlay('keyboard', `📧 Waiting for email from ${dom}…`);
            break;
          }
          case 'email_received': {
            const what = payload.code ? `code ${payload.code}` : (payload.link ? 'verification link' : 'email');
            setSubtitle(`got ${what} — applying`, false);
            updateOverlay('check', `✓ Got ${what}`);
            break;
          }
          case 'email_timeout': {
            setSubtitle(`no email from ${payload.from_domain || 'sender'} — continuing`, false);
            break;
          }
          case 'solving_captcha': {
            setSubtitle('solving CAPTCHA via 2captcha…', true);
            updateOverlay('sparkle', '🔐 Solving CAPTCHA…');
            break;
          }
          case 'captcha_solved': {
            const ok = payload.success;
            setSubtitle(ok ? `CAPTCHA solved (${payload.captcha_type || 'ok'})` : 'CAPTCHA solve failed', false);
            updateOverlay(ok ? 'check' : 'sparkle', ok ? `✓ CAPTCHA solved · ${payload.captcha_type || ''}` : '⚠ CAPTCHA solve failed');
            break;
          }
          case 'analyzing_puzzle': {
            const hint = payload.context ? ` (${payload.context.slice(0, 50)})` : '';
            setSubtitle(`vision model analyzing puzzle${hint}…`, true);
            updateOverlay('eye', `👁 Vision model analyzing puzzle…`);
            break;
          }
          case 'puzzle_analyzed': {
            const conf = payload.confidence || 'unknown';
            const dot = conf === 'high' ? '🟢' : conf === 'medium' ? '🟡' : '🔴';
            setSubtitle(`${dot} found ${payload.puzzle_type} · ${conf} confidence`, false);
            updateOverlay('eye', `${dot} ${payload.puzzle_type}: ${payload.action || ''}`);
            break;
          }
          case 'puzzle_executed': {
            const ok = payload.executed && payload.executed !== 'none';
            setSubtitle(ok ? `${payload.executed} executed on ${payload.puzzle_type}` : `nothing to execute`, false);
            updateOverlay(ok ? 'check' : 'sparkle', ok ? `✓ ${payload.executed} on ${payload.puzzle_type}` : '⚠ puzzle execution skipped');
            break;
          }
          case 'heartbeat': {
            // LLM provider chain is slow — reassure the user the backend is alive.
            const sec = Math.round((payload.elapsed_since_last_step_ms || 0) / 1000);
            const stepN = payload.current_step || stepCount;
            setSubtitle(`step ${stepN} · LLM chain is slow today · ${sec}s waiting…`, true);
            break;
          }
        }
      },
    };
  }

  window.chakaAgentConsole = { create };
  console.log('[chakaAgentConsole] loaded ✨ (Liquid Glass · UI Pro Max spec)');
})();
