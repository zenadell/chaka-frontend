/**
 * scrape-card.js — Phase 5: Deep Scrape result card
 *
 * Premium dark-glass card that shows while a URL is being scraped
 * and expands to show the full extracted content when done.
 *
 * Exposes: window.chakaScrapeCard.create({ url })
 *          returns { complete(result), fail(msg) }
 */
(function () {
  'use strict';

  if (!document.getElementById('chaka-scrape-card-style')) {
    const style = document.createElement('style');
    style.id = 'chaka-scrape-card-style';
    style.textContent = `
      @keyframes chaka-scrape-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes chaka-scrape-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .chaka-scrape-card {
        position: relative;
        max-width: 560px;
        margin: 8px 0;
        /* Don't let the flex-column #chat-messages parent squish this card */
        flex-shrink: 0;
        align-self: flex-start;
        border-radius: 14px;
        background: linear-gradient(160deg, rgba(18,22,30,0.94) 0%, rgba(12,16,24,0.97) 100%);
        backdrop-filter: blur(20px) saturate(160%);
        -webkit-backdrop-filter: blur(20px) saturate(160%);
        border: 1px solid rgba(120, 80, 255, 0.22);
        box-shadow:
          0 0 0 1px rgba(120,80,255,0.04) inset,
          0 8px 28px rgba(0,0,0,0.45),
          0 0 20px rgba(120,80,255,0.08);
        color: #e6edf3;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
        animation: chaka-scrape-fade-in 0.28s ease-out;
        overflow: hidden;
      }
      .chaka-scrape-card.done {
        border-color: rgba(120,80,255,0.35);
      }
      .chaka-scrape-card.error {
        border-color: rgba(239,68,68,0.28);
      }

      .chaka-scrape-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .chaka-scrape-icon {
        font-size: 15px;
        flex-shrink: 0;
        line-height: 1;
      }
      .chaka-scrape-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(120,80,255,0.25);
        border-top-color: #a855f7;
        border-radius: 50%;
        animation: chaka-scrape-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      .chaka-scrape-title {
        flex: 1;
        font-size: 12.5px;
        font-weight: 600;
        color: #e6edf3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chaka-scrape-tier {
        font-size: 10px;
        color: rgba(168,85,247,0.75);
        font-family: ui-monospace, monospace;
        padding: 2px 6px;
        background: rgba(168,85,247,0.08);
        border-radius: 4px;
        border: 1px solid rgba(168,85,247,0.15);
        flex-shrink: 0;
      }
      .chaka-scrape-btn {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        color: #c9d1d9;
        width: 26px; height: 26px;
        border-radius: 7px;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .chaka-scrape-btn:hover {
        background: rgba(168,85,247,0.14);
        border-color: rgba(168,85,247,0.28);
        color: #a855f7;
      }

      .chaka-scrape-url {
        padding: 6px 14px 0;
        font-size: 11px;
        color: rgba(168,85,247,0.65);
        font-family: ui-monospace, monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chaka-scrape-meta {
        display: flex;
        gap: 12px;
        padding: 8px 14px;
        font-size: 11px;
        color: rgba(230,237,243,0.5);
        font-family: ui-monospace, monospace;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        flex-wrap: wrap;
      }
      .chaka-scrape-meta .pill {
        display: flex; align-items: center; gap: 4px;
      }

      .chaka-scrape-description {
        padding: 8px 14px 0;
        font-size: 12px;
        color: rgba(230,237,243,0.65);
        line-height: 1.5;
        font-style: italic;
      }

      .chaka-scrape-body {
        padding: 10px 14px;
        font-size: 12.5px;
        line-height: 1.65;
        color: #d1d9e0;
        max-height: 300px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(168,85,247,0.25) transparent;
      }
      .chaka-scrape-body.expanded {
        max-height: none;
      }
      .chaka-scrape-body h1,
      .chaka-scrape-body h2,
      .chaka-scrape-body h3 {
        color: #e6edf3;
        margin: 12px 0 6px;
        font-size: 13px;
      }
      .chaka-scrape-body p { margin: 0 0 8px; }
      .chaka-scrape-body a { color: #a855f7; }
      .chaka-scrape-body code {
        font-size: 11px;
        background: rgba(255,255,255,0.06);
        padding: 1px 4px;
        border-radius: 3px;
      }
      .chaka-scrape-body pre code {
        display: block;
        padding: 8px;
        overflow-x: auto;
      }

      .chaka-scrape-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px 10px;
        border-top: 1px solid rgba(255,255,255,0.04);
        gap: 8px;
        flex-wrap: wrap;
      }
      .chaka-scrape-footer .links-count {
        font-size: 10.5px;
        color: rgba(230,237,243,0.4);
        font-family: ui-monospace, monospace;
      }
      .chaka-scrape-footer .actions {
        display: flex; gap: 6px;
      }
      .chaka-scrape-action-btn {
        background: rgba(168,85,247,0.08);
        border: 1px solid rgba(168,85,247,0.18);
        color: #a855f7;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .chaka-scrape-action-btn:hover {
        background: rgba(168,85,247,0.18);
      }

      .chaka-scrape-loading {
        padding: 20px 14px;
        display: flex; align-items: center; gap: 10px;
        font-size: 12px;
        color: rgba(230,237,243,0.55);
      }

      .chaka-scrape-error {
        padding: 12px 14px;
        font-size: 12px;
        color: #f87171;
        background: linear-gradient(180deg, rgba(239,68,68,0.07), transparent);
      }
    `;
    document.head.appendChild(style);
  }

  function escHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function create({ url } = {}) {
    const container =
      document.getElementById('chat-messages') ||
      document.querySelector('.chat-messages');
    if (!container) return null;

    const displayUrl = (() => { try { return new URL(url).hostname; } catch { return url || ''; } })();

    const card = document.createElement('div');
    card.className = 'chaka-scrape-card message-group bot';
    card.innerHTML = `
      <div class="chaka-scrape-header">
        <div class="chaka-scrape-spinner"></div>
        <div class="chaka-scrape-title">Reading page…</div>
      </div>
      <div class="chaka-scrape-url">${escHtml(displayUrl)}</div>
      <div class="chaka-scrape-loading">
        <span>Extracting content — this may take a moment if the site has bot protection…</span>
      </div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    return {
      el: card,

      complete(result) {
        card.classList.add('done');
        const tier = result.tier || '';
        const isCached = result.cached;
        const wordCount = result.wordCount?.toLocaleString() || '0';
        const readTime = result.readTimeMin || 1;
        const linkCount = result.links?.length || 0;
        const hostname = (() => { try { return new URL(result.url || url).hostname; } catch { return result.url || url || ''; } })();

        const bodyHtml = window.marked
          ? window.marked.parse(result.content || '')
          : escHtml(result.content || '').replace(/\n/g, '<br>');

        card.innerHTML = `
          <div class="chaka-scrape-header">
            <div class="chaka-scrape-icon">🕷️</div>
            <div class="chaka-scrape-title">${escHtml(result.title || hostname)}</div>
            <div class="chaka-scrape-tier">${escHtml(tier)}${isCached ? ' · cached' : ''}</div>
            <button class="chaka-scrape-btn" data-act="dismiss" title="Dismiss">✕</button>
          </div>
          <div class="chaka-scrape-url">${escHtml(result.url || url)}</div>
          ${result.description ? `<div class="chaka-scrape-description">${escHtml(result.description)}</div>` : ''}
          <div class="chaka-scrape-meta">
            <span class="pill">📝 ${wordCount} words</span>
            <span class="pill">⏱ ~${readTime}m read</span>
            ${result.publishedTime ? `<span class="pill">📅 ${escHtml(result.publishedTime.slice(0, 10))}</span>` : ''}
            ${result.author ? `<span class="pill">✍️ ${escHtml(result.author.slice(0, 40))}</span>` : ''}
          </div>
          <div class="chaka-scrape-body">${bodyHtml}</div>
          <div class="chaka-scrape-footer">
            <span class="links-count">${linkCount} link${linkCount === 1 ? '' : 's'} found</span>
            <div class="actions">
              <button class="chaka-scrape-action-btn" data-act="expand">Expand ↕</button>
              <button class="chaka-scrape-action-btn" data-act="copy">Copy text</button>
              <a class="chaka-scrape-action-btn" href="${escHtml(result.url || url)}" target="_blank" rel="noopener">Open ↗</a>
            </div>
          </div>
        `;

        card.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => card.remove());
        card.querySelector('[data-act="expand"]')?.addEventListener('click', function () {
          const body = card.querySelector('.chaka-scrape-body');
          body.classList.toggle('expanded');
          this.textContent = body.classList.contains('expanded') ? 'Collapse ↕' : 'Expand ↕';
        });
        card.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
          navigator.clipboard?.writeText(result.content || '').catch(() => {});
        });

        container.scrollTop = container.scrollHeight;
      },

      fail(msg) {
        card.classList.add('error');
        const spinner = card.querySelector('.chaka-scrape-spinner');
        if (spinner) spinner.outerHTML = '<div class="chaka-scrape-icon">⚠️</div>';
        const titleEl = card.querySelector('.chaka-scrape-title');
        if (titleEl) titleEl.textContent = 'Scrape failed';
        const loading = card.querySelector('.chaka-scrape-loading');
        if (loading) loading.outerHTML = `<div class="chaka-scrape-error">${escHtml(msg)}</div>`;
      },
    };
  }

  window.chakaScrapeCard = { create };
  console.log('[chakaScrapeCard] loaded 🕷️');
})();
