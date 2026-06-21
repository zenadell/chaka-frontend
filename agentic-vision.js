/**
 * agentic-vision.js — Phase 3B + Phase 4B
 *
 * Lets Chaka autonomously activate her eyes AND her browser hands from
 * text chat by emitting marker tokens at the end of her response:
 *
 *   [[EYES:webcam|screen|ocr]]
 *   [[HANDS:browse:URL]]
 *   [[HANDS:screenshot:URL]]
 *
 * This script intercepts /api/chat responses, detects the markers, strips
 * them from the visible bubble, executes the action, and pipes results
 * back through Chaka so she responds naturally in a streaming bubble.
 *
 * Square brackets (not <<>>) are used because markdown autolinks the
 * inner content when double angle brackets are used.
 */
(function () {
  'use strict';

  // EYES markers (Phase 3B)
  const EYES_RE  = /(?:\[\[|<<)EYES:(webcam|screen|ocr)(?:\]\]|>>)/i;
  // HANDS markers (Phase 4B) — URL captured greedily up to closing ]]
  const HANDS_RE = /(?:\[\[|<<)HANDS:(browse|screenshot):([^\]>]+?)(?:\]\]|>>)/i;
  // Autonomous-agent marker — Chaka can run multi-step browser tasks
  //   [[HANDS:agent:open jomiez.com, click the resume link, find Tim's experience section]]
  const AGENT_RE = /(?:\[\[|<<)HANDS:agent:([\s\S]+?)(?:\]\]|>>)/i;
  // Deep-scrape marker — Phase 5 (extracts full article body from any URL)
  //   [[SCRAPE:https://example.com/some-article]]
  const SCRAPE_RE = /(?:\[\[|<<)SCRAPE:(https?:\/\/[^\]>]+?)(?:\]\]|>>)/i;
  // Deep-research marker — Phase 6 (Grok-style multi-source dig)
  //   [[RESEARCH:find me everything about Ezinna Emmanuel Nweke Temple]]
  const RESEARCH_RE = /(?:\[\[|<<)RESEARCH:([\s\S]+?)(?:\]\]|>>)/i;
  // Deep-dig marker — Phase 8 (CREATOR-ONLY OSINT-grade dossier)
  //   [[DIG:Ezinna Emmanuel Nweke jomiez.com]]
  const DIG_RE = /(?:\[\[|<<)DIG:([\s\S]+?)(?:\]\]|>>)/i;
  // Combined strip pattern — removes ALL marker families from bubble text
  const STRIP_RE = /(?:\[\[|<<)(?:EYES:(?:webcam|screen|ocr)|HANDS:(?:browse|screenshot):[^\]>]+?|HANDS:agent:[\s\S]+?|SCRAPE:https?:\/\/[^\]>]+?|RESEARCH:[\s\S]+?|DIG:[\s\S]+?)(?:\]\]|>>)/gi;

  // Reentrancy guard
  let visionInFlight = false;

  // ─── helpers ──────────────────────────────────────────────────────────────
  function isChatEndpoint(url) {
    return typeof url === 'string' && url.includes('/api/chat');
  }

  function findLastBotBubble() {
    const container =
      document.getElementById('chat-messages') ||
      document.querySelector('.chat-messages') ||
      document.querySelector('[id*="chat-messages"]');
    if (!container) return null;
    const candidates = container.querySelectorAll('.message.bot .message-content, .message-group.bot .message-content, .message-group.bot, .message.bot');
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  function deepStripMarker(rootEl) {
    if (!rootEl) return;
    // 1. Strip from raw HTML
    if (rootEl.innerHTML) {
      const before = rootEl.innerHTML;
      const cleaned = before.replace(STRIP_RE, '').replace(/<p>\s*<\/p>/gi, '');
      if (cleaned !== before) rootEl.innerHTML = cleaned;
    }
    // 2. Walk text nodes and strip any residual marker text
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    const toClean = [];
    while (walker.nextNode()) {
      if (STRIP_RE.test(walker.currentNode.nodeValue)) {
        toClean.push(walker.currentNode);
      }
    }
    toClean.forEach(node => {
      node.nodeValue = node.nodeValue.replace(STRIP_RE, '').trimEnd();
    });
    // 3. Remove any link/element that contains JUST the marker text leftover
    rootEl.querySelectorAll('a, code, span').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (/^<?EYES:(webcam|screen|ocr)>?$/i.test(txt)) el.remove();
      if (/^<?HANDS:(browse|screenshot|agent):/i.test(txt)) el.remove();
    });
    // 4. Remove now-empty trailing <p> tags
    Array.from(rootEl.querySelectorAll('p')).forEach(p => {
      if (!p.textContent.trim()) p.remove();
    });
  }

  // ─── Vision dispatch ─────────────────────────────────────────────────────
  async function triggerAgenticVision(source) {
    if (visionInFlight) {
      console.warn('[agentic-vision] already in flight, skipping');
      return;
    }
    if (!window.chakaEyes) {
      console.warn('[agentic-vision] window.chakaEyes not loaded — cannot trigger');
      return;
    }
    visionInFlight = true;
    try {
      console.log(`[agentic-vision] 🤖 Chaka autonomously requested ${source} vision`);
      // Brief pause so the user sees the "let me look" narration first
      await new Promise(r => setTimeout(r, 400));

      // Use the in-chat variants so the response renders as a real streaming bubble.
      // Pass showUserBubble=false because we don't need a duplicate "Chaka, look at me" bubble —
      // her "let me have a look" message already serves that purpose.
      if (source === 'webcam') {
        await window.chakaEyes.analyzeWebcamInChat(
          'You autonomously activated your webcam because the user asked you to see them. ' +
          'This frame is what you see RIGHT NOW. Describe naturally what you observe — the person, ' +
          'their expression, environment, lighting — and answer their original question warmly.',
          false
        );
      } else if (source === 'screen') {
        await window.chakaEyes.analyzeScreenInChat(
          'You autonomously activated your screen vision because the user asked you to see their screen. ' +
          'This capture is what you see RIGHT NOW. Describe exactly what is on screen — apps, text, code, ' +
          'errors, anything notable — and answer their original question naturally.',
          false
        );
      } else if (source === 'ocr') {
        await window.chakaEyes.analyzeOcrInChat(false);
      }
    } catch (err) {
      console.error('[agentic-vision] failed:', err);
      const container = document.getElementById('chat-messages');
      if (container) {
        const note = document.createElement('div');
        note.className = 'message-group bot';
        note.innerHTML = `<div class="message bot" style="opacity:0.7;font-style:italic;">⚠️ I tried to look but the camera/screen didn't open — ${(err.message || 'permission denied').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`;
        container.appendChild(note);
      }
    } finally {
      setTimeout(() => { visionInFlight = false; }, 1500);
    }
  }

  // ─── HANDS dispatch (browser navigation/screenshot) ──────────────────────
  // Auth-header fetch with retry. Firebase's securetoken.googleapis.com
  // occasionally returns ERR_CONNECTION_CLOSED on this dev machine due to
  // intermittent DNS/network flakiness — without a retry, the agent fails
  // in 0 steps before even hitting the backend.
  async function authHeaders(opts = {}) {
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelay  = opts.baseDelayMs ?? 600;
    if (typeof window.getAuthHeaders !== 'function') {
      return { 'Content-Type': 'application/json' };
    }
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await window.getAuthHeaders();
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e || '');
        // Only retry transient network errors — auth-revoked / not-signed-in errors should fail fast
        const transient = /network-request-failed|fetch failed|ERR_(NETWORK|CONNECTION|TIMED_OUT)|getaddrinfo|ENOTFOUND|ETIMEDOUT|aborted|timeout/i.test(msg);
        if (!transient || i === maxRetries) break;
        const delay = baseDelay * Math.pow(2, i) + Math.floor(Math.random() * 200);
        console.warn(`[authHeaders] transient auth fail (attempt ${i + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, msg.slice(0, 100));
        await new Promise(r => setTimeout(r, delay));
      }
    }
    // Last resort: still return Content-Type so the backend call is at
    // least well-formed and returns 401 cleanly (better UX than vague network error).
    console.error('[authHeaders] all retries failed, sending request without bearer token:', lastErr);
    throw lastErr;
  }

  function getBackend() {
    if (window.BACKEND_URL) return window.BACKEND_URL;
    return window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://chaka-backend-eh02.onrender.com';
  }

  function addSystemBubble(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return null;
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `<div class="message bot" style="opacity:0.7;font-style:italic;font-size:0.92em;">${text.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;
    return group;
  }

  // Downscale + recompress a screenshot before saving to Turso so we don't blow up storage.
  // Returns a data: URL string (~10-20 KB).
  async function thumbnailize(base64, mimeType) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 240 / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(`data:${mimeType};base64,${base64}`);
      img.src = `data:${mimeType};base64,${base64}`;
    });
  }

  // Save a bot message to Turso so it persists across refresh.
  // Best-effort — silently swallows errors (we don't want to break the agentic flow if save fails).
  async function persistBotMessage(markdownContent) {
    try {
      if (!window.tursoClient?.saveChat) return;
      const state = window.state || {};
      if (!state.userId || !state.sessionId) {
        console.warn('[agentic] cannot persist — no userId/sessionId in state');
        return;
      }
      const id = (crypto.randomUUID && crypto.randomUUID()) || ('msg_' + Date.now());
      await window.tursoClient.saveChat(state.userId, state.sessionId, id, 'bot', markdownContent);
      console.log('[agentic] 💾 persisted bot message', id.slice(0, 8));
    } catch (e) {
      console.warn('[agentic] persist failed (non-fatal):', e.message);
    }
  }

  // Show a screenshot the browser hands just captured so the user can see what Chaka saw.
  // Small thumbnail by default, click to expand to full size. ALSO persists to Turso.
  async function showScreenshotBubble(base64, mimeType, url) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Render full-quality version live for the user
    const fullDataUrl = `data:${mimeType};base64,${base64}`;
    const safeUrl = String(url || '').replace(/[<>"'&]/g, '');
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `
      <div class="message bot" style="padding:8px;">
        <div style="font-size:0.8em; opacity:0.7; margin-bottom:6px;">📸 Looking at <code style="font-size:0.95em;">${safeUrl}</code></div>
        <img src="${fullDataUrl}" alt="screenshot" style="max-width:280px; max-height:200px; border-radius:8px; cursor:zoom-in; display:block;"
             onclick="this.style.maxWidth=this.style.maxWidth==='280px'?'90vw':'280px';this.style.maxHeight=this.style.maxHeight==='200px'?'80vh':'200px';this.style.cursor=this.style.cursor==='zoom-in'?'zoom-out':'zoom-in';" />
      </div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;

    // Save thumbnail to Turso as markdown so it re-renders on refresh
    const thumb = await thumbnailize(base64, mimeType);
    const markdown = `📸 *Looking at ${safeUrl}*\n\n![screenshot](${thumb})`;
    await persistBotMessage(markdown);
  }

  // Defensive JSON unwrap — Gemini sometimes hallucinates {"<any_key>": "..."}
  // wrapping even when plainText mode is set (learned from prior prompts).
  // Handles partial-stream JSON during streaming AND complete responses.
  const KNOWN_TEXT_KEYS = ['final_answer','summary','description','text','response','answer','message','content','result'];

  function extractFromJsonIfWrapped(raw) {
    if (!raw) return raw;
    const t = raw.trim();
    if (!t.startsWith('{')) return raw;

    // Try full JSON parse first (works on complete responses)
    try {
      const json = JSON.parse(t);
      for (const k of KNOWN_TEXT_KEYS) {
        if (typeof json[k] === 'string' && json[k].length > 0) return json[k];
      }
      // Fallback: longest string value in the object
      const strings = Object.values(json).filter(v => typeof v === 'string');
      if (strings.length === 1) return strings[0];
      if (strings.length > 1) return strings.reduce((a, b) => a.length >= b.length ? a : b);
    } catch { /* probably partial during stream */ }

    // Partial regex extract — try known keys in order
    for (const key of KNOWN_TEXT_KEYS) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
      const m = t.match(re);
      if (m) {
        try { return JSON.parse(`"${m[1]}"`); }
        catch { return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
      }
    }
    return raw;
  }

  // Bridge: detect the script25.js schema action_required pattern and route to
  // the new HANDS/EYES pipelines. Returns one of:
  //   { kind: 'hands', action: 'browse'|'screenshot', target: 'url' }
  //   { kind: 'eyes',  source: 'webcam'|'screen'|'ocr' }
  //   null
  function extractLegacyIntent(fullText) {
    try {
      const t = fullText.trim();
      if (!t.startsWith('{')) return null;

      const VISION_MAP = { look_webcam: 'webcam', look_screen: 'screen', ocr_screen: 'ocr' };
      const BROWSE_ACTIONS = new Set(['browse','browse_url','navigate','open_url']);
      const AGENT_ACTIONS  = new Set(['agent_task','agent','autonomous_task']);
      const SCRAPE_ACTIONS = new Set(['scrape','scrape_url','deep_scrape','extract','extract_content']);
      const RESEARCH_ACTIONS = new Set(['research','deep_research','dig','dig_up','investigate','find_info','find_all']);

      let action = null, payload = null;
      try {
        const json = JSON.parse(t);
        action = (json.action_required || '').toLowerCase();
        payload = typeof json.action_payload === 'string' ? json.action_payload : null;
      } catch {
        // Partial during stream — regex it
        const aMatch = t.match(/"action_required"\s*:\s*"([a-z_]+)"/i);
        const pMatch = t.match(/"action_payload"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (aMatch) action = aMatch[1].toLowerCase();
        if (pMatch) payload = pMatch[1];
      }
      if (!action || action === 'none') return null;

      // Vision actions don't need a payload
      if (VISION_MAP[action]) return { kind: 'eyes', source: VISION_MAP[action] };

      // Agent — payload is the natural-language task description
      if (AGENT_ACTIONS.has(action) && payload) {
        return { kind: 'agent', task: payload };
      }

      // Phase 6: Research (Grok-style multi-source dig) — payload is the query
      if (RESEARCH_ACTIONS.has(action) && payload) {
        return { kind: 'research', query: payload };
      }

      // Phase 5: Deep scrape (single URL → full content)
      if (SCRAPE_ACTIONS.has(action) && payload) {
        // If payload looks like a URL, route to scrape; otherwise treat as research
        if (/^https?:\/\//i.test(payload) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(payload)) {
          const url = /^https?:\/\//i.test(payload) ? payload : 'https://' + payload;
          return { kind: 'scrape', url };
        }
        return { kind: 'research', query: payload };
      }

      // Browse actions need a URL payload
      if (BROWSE_ACTIONS.has(action) && payload) {
        return { kind: 'hands', action: 'browse', target: payload };
      }
      if (action === 'screenshot' && payload) {
        return { kind: 'hands', action: 'screenshot', target: payload };
      }
      return null;
    } catch { return null; }
  }

  // Prose-level intent detector — safety net for when the LLM acknowledges an
  // agent task verbally ("Alright, I'll head over to X and sign up…") without
  // actually emitting the [[HANDS:agent:…]] marker. Returns { task } or null.
  //
  // Triggers only when ALL of these are present in the assistant's response:
  //   1. A http/https URL
  //   2. An action verb (sign up, register, book, reserve, fill, submit, …)
  //   3. A future-tense commitment phrase (I'll, I'm going to, let me, on it…)
  // AND NOT a deferral phrase ("should I…", "want me to…", "is that OK").
  function detectProseAgentIntent(text) {
    if (!text || typeof text !== 'string') return null;

    // Strip any JSON wrapper — only look at the human-visible prose
    let prose = text.trim();
    try {
      const parsed = JSON.parse(prose);
      prose = parsed.final_answer || parsed.summary || parsed.description || prose;
    } catch {}

    // Need a URL or a clear "https://" mention or a known domain shape
    const urlMatch = prose.match(/https?:\/\/[^\s)\]"'>]+/i) ||
                     prose.match(/\b([a-z0-9-]+\.(?:com|org|net|io|co|app|dev|ai|gov|edu|me)(?:\/[^\s)\]"'>]*)?)/i);
    if (!urlMatch) return null;
    let url = urlMatch[0].replace(/[.,!?;:]+$/, '');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    // Need action verb. Allow up to two filler words between phrasal verb parts
    // ("sign you up", "log me in", "fill the form out").
    const actionVerb = /\b(sign(?:ing|s)?(?:\s+\w+){0,2}\s+up|register(?:ing)?(?:\s+\w+){0,2}|create(?:\s+\w+){0,2}\s+account|log(?:s|ging)?(?:\s+\w+){0,2}\s+in|sign(?:s|ing)?(?:\s+\w+){0,2}\s+in|book(?:ing|s)?(?:\s+\w+){0,2}\s+(?:flight|hotel|reservation|appointment|table|ticket|trip|stay|room)|reserve|order(?:ing|s)?|purchase|buy(?:ing)?|subscribe(?:\s+\w+){0,2}|fill(?:ing)?(?:\s+\w+){0,2}\s+out|fill\s+out|submit(?:ting)?|search(?:ing)?\s+for|find\s+me|get\s+me|grab|fetch|apply(?:ing)?\s+for)\b/i;
    if (!actionVerb.test(prose)) return null;

    // Need future-tense commitment
    const commit = /\b(i['']?ll|i\s+will|i['']?m\s+going\s+to|i['']?m\s+heading|let\s+me|going\s+to\s+(?:open|visit|head|sign|register|go)|on\s+it|alright|okay,?\s+(?:i|let)|here\s+goes|doing\s+(?:that|this)\s+now)\b/i;
    if (!commit.test(prose)) return null;

    // Bail on deferral / question phrases
    const deferral = /\b(should\s+i|want\s+me\s+to|do\s+you\s+want|is\s+that\s+(?:ok|alright|cool)|let\s+me\s+know\s+if|need\s+more\s+info|wait\s+for\s+(?:your|the)|first\s+tell\s+me|before\s+i\s+(?:proceed|go|do))\b/i;
    if (deferral.test(prose)) return null;

    // Construct a clean agent task: trim filler intros, keep the meat
    const cleanProse = prose
      .replace(/^(alright|okay|sure|got it|on it|cool|sounds good|yes|no problem|will do)[,.\s—-]*/i, '')
      .replace(/just a heads up,.*$/is, '')        // strip trailing caveats
      .replace(/let me know if.*$/is, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 700);

    // Auto-append a smart recovery strategy:
    //   • For SOLVABLE challenges (captcha checkbox / slider / image grid):
    //       call solve_visual_puzzle and stay on the same site.
    //   • For HARD bot-blocks (no challenge, just "you are a bot" wall):
    //       confirm with one solve_visual_puzzle (it'll return puzzle_type=none),
    //       then pivot to a known-permissive alternative for the task type.
    //   • For email verification: use wait_for_verification_email.
    const recoveryStrategy = ' IMPORTANT recovery rules:\n' +
      '1. If the site shows a CAPTCHA/challenge (checkbox, slider, "select all X", "click the Y"): call solve_visual_puzzle with context. Stay on the same site. Max 2 attempts before pivoting.\n' +
      '2. If the site shows a HARD bot-block ("you are a bot", "access denied", no interactive challenge): pivot to a permissive alternative — for flights use google.com/travel/flights or skyscanner.com instead of kayak/expedia; for hotels use google.com/travel/hotels or booking.com.\n' +
      '3. If verification email needed: use wait_for_verification_email with the right from_domain.\n' +
      '4. Always tell the user what happened in your final summary, including the partial URL reached if any (so they can finish manually).';

    const cleanTask = cleanProse + recoveryStrategy;

    return { task: cleanTask, url };
  }

  // Pull the most recent user message from the chat DOM so Chaka can answer
  // the ORIGINAL question rather than just dumping the page.
  function findLastUserQuestion() {
    const container = document.getElementById('chat-messages');
    if (!container) return null;
    const userMsgs = container.querySelectorAll('.message.user, .message-group.user .message-content, .message-group.user');
    if (!userMsgs.length) return null;
    const last = userMsgs[userMsgs.length - 1];
    const txt = (last.textContent || '').trim();
    // Sanity cap so we don't send a huge prior message back
    return txt.slice(0, 600) || null;
  }

  // ─── DEEP SCRAPE — Phase 5: extract full content from any URL ────────────
  async function triggerDeepScrape(url) {
    if (visionInFlight) {
      console.warn('[agentic-scrape] already in flight, skipping');
      return;
    }
    visionInFlight = true;

    // Show a loading card while we wait
    const card = window.chakaScrapeCard?.create({ url });

    try {
      const headers = await authHeaders();
      const res = await fetch(`${getBackend()}/api/scrape`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, screenshot: false }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => 'unknown error');
        throw new Error(`Scrape failed: ${res.status} ${err.slice(0, 200)}`);
      }

      const json = await res.json();
      const result = json.result;

      card?.complete(result);

      // Feed the scraped content back to Chaka as a follow-up context bubble
      // so she can answer the user's original question about it.
      const contextMsg = [
        `**Scraped:** ${result.title || url}`,
        result.description ? `*${result.description}*` : '',
        `**Words:** ${result.wordCount?.toLocaleString() || '?'} · **Read time:** ~${result.readTimeMin || 1}m · **Method:** ${result.tier}`,
        '',
        result.content || '(no content extracted)',
      ].filter(Boolean).join('\n');

      injectContextBubble(contextMsg);

    } catch (err) {
      console.error('[agentic-scrape] failed:', err);
      card?.fail(err.message);
    } finally {
      setTimeout(() => { visionInFlight = false; }, 800);
    }
  }

  // Inject a hidden context message into chat so Chaka gets the scraped data
  function injectContextBubble(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `
      <div class="message bot" style="font-size:0.85em; opacity:0.75; border-left:3px solid rgba(0,243,255,0.3); padding-left:10px; max-height:220px; overflow:hidden;">
        <div style="font-size:0.8em; color:rgba(0,243,255,0.6); margin-bottom:4px; font-family:monospace;">📄 Page content loaded into context</div>
        <div class="message-content" style="-webkit-line-clamp:6; display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden;">
          ${window.marked ? window.marked.parse(text.slice(0, 1500)) : text.slice(0, 1500).replace(/\n/g, '<br>')}
        </div>
      </div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;
  }

  // ─── DEEP RESEARCH — Phase 6: multi-source dig with synthesis ────────────
  //
  // Build a short identity blurb about the asker from chat memory + user
  // profile + recent user messages. Sent as `userContext` so the LLM planner
  // can disambiguate "find me / my company / a peer of mine" queries — the
  // #1 reason research mis-identifies people is "no idea who's asking".
  function buildUserContextBlurb() {
    try {
      const lines = [];
      const state = window.state || {};
      const profile = state.userProfile || window.userProfile || {};

      // 1. Identity from auth profile
      const name  = profile.displayName || profile.name  || state.userName;
      const email = profile.email || state.userEmail;
      if (name)  lines.push(`Asker's name: ${name}.`);
      if (email) lines.push(`Email: ${email}.`);

      // 2. Recent USER-side chat turns (their own messages, last 5, trimmed)
      const container = document.getElementById('chat-messages');
      if (container) {
        const userMsgs = container.querySelectorAll('.message-group.user .message-content, .message-group.user .message, .message.user');
        const recent = [];
        for (let i = Math.max(0, userMsgs.length - 8); i < userMsgs.length; i++) {
          const t = (userMsgs[i].textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length > 4) recent.push(t.slice(0, 180));
        }
        if (recent.length) {
          lines.push(`Recent things the asker said in this chat (newest last):`);
          recent.forEach(t => lines.push(`  • "${t}"`));
        }
      }

      // 3. Any explicit memory snippets the app keeps in window.state.memories
      const mems = state.memories || window.memories;
      if (Array.isArray(mems) && mems.length) {
        const top = mems.slice(0, 4).map(m => (typeof m === 'string' ? m : (m.content || m.text || ''))).filter(Boolean);
        if (top.length) {
          lines.push(`Long-term things Chaka knows about the asker:`);
          top.forEach(m => lines.push(`  • ${m.slice(0, 200)}`));
        }
      }

      // 4. Session title (often summarizes the topic)
      const titleEl = document.querySelector('.history-item.active .title, .session-title');
      if (titleEl?.textContent?.trim()) lines.push(`Current chat session title: "${titleEl.textContent.trim()}"`);

      const blurb = lines.join('\n').slice(0, 1800);
      return blurb || null;
    } catch (e) {
      console.warn('[research] context build failed:', e.message);
      return null;
    }
  }

  // ─── DEEP DIG — Phase 8: CREATOR-ONLY OSINT-grade dossier ────────────────
  async function triggerDeepDig(target) {
    if (visionInFlight) { console.warn('[agentic-dig] already in flight, skipping'); return; }
    visionInFlight = true;
    const card = window.chakaDigCard?.create({ target });

    // Try to extract a known domain from chat context (helps WHOIS/Wayback fire)
    let knownDomain = null;
    try {
      const userMsgs = document.querySelectorAll('.message-group.user, .message.user');
      const blob = Array.from(userMsgs).slice(-10).map(m => m.textContent || '').join(' ');
      const m = blob.match(/(?:https?:\/\/)?([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
      if (m) knownDomain = m[1].replace(/\/.*$/, '').toLowerCase();
    } catch {}

    try {
      const headers = await authHeaders();
      const userContext = buildUserContextBlurb();
      const res = await fetch(`${getBackend()}/api/dig`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, userContext, knownDomain }),
      });

      if (res.status === 403) {
        throw new Error('Deep Dig is creator-only. Your account is not authorized for this OSINT-grade tool.');
      }
      if (!res.ok) {
        const err = await res.text().catch(() => 'unknown');
        throw new Error(`Dig endpoint failed: ${res.status} ${err.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          if (!ev.trim()) continue;
          const eventMatch = ev.match(/^event:\s*(\w+)/m);
          const dataMatch  = ev.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;
          let payload;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }
          const type = eventMatch ? eventMatch[1] : 'message';
          if (type === 'done') { finalResult = payload; card?.complete(payload); }
          else if (type === 'error') { card?.fail(payload.error || 'Unknown error'); }
          else { card?.status(type, payload); }
        }
      }

      if (finalResult?.dossier) {
        injectContextBubble(`**Deep dig dossier:** "${target}"\n\n${finalResult.dossier}`);
      }
    } catch (err) {
      console.error('[agentic-dig] failed:', err);
      card?.fail(err.message);
    } finally {
      setTimeout(() => { visionInFlight = false; }, 800);
    }
  }

  async function triggerDeepResearch(query) {
    if (visionInFlight) {
      console.warn('[agentic-research] already in flight, skipping');
      return;
    }
    visionInFlight = true;

    const card = window.chakaResearchCard?.create({ query });

    try {
      const headers = await authHeaders();
      const userContext = buildUserContextBlurb();
      if (userContext) {
        console.log('[agentic-research] 📎 sending userContext (' + userContext.length + ' chars)');
      }
      const res = await fetch(`${getBackend()}/api/research`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userContext }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => 'unknown');
        throw new Error(`Research endpoint failed: ${res.status} ${err.slice(0, 200)}`);
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          if (!ev.trim()) continue;
          const eventMatch = ev.match(/^event:\s*(\w+)/m);
          const dataMatch  = ev.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;
          let payload;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }
          const type = eventMatch ? eventMatch[1] : 'message';

          if (type === 'done') {
            finalResult = payload;
            card?.complete(payload);
          } else if (type === 'error') {
            card?.fail(payload.error || 'Unknown error');
          } else {
            // Forward every progress event to the card
            card?.status(type, payload);
          }
        }
      }

      // Feed the synthesized report back into chat context so Chaka can
      // answer follow-up questions about it.
      if (finalResult && finalResult.report) {
        const ctx = [
          `**Research complete:** "${query}"`,
          `*${finalResult.sources?.length || 0} sources · ${Math.round((finalResult.elapsedMs || 0) / 1000)}s · via ${finalResult.provider || 'multi-llm'}*`,
          '',
          finalResult.report,
        ].join('\n');
        injectContextBubble(ctx);
      }

    } catch (err) {
      console.error('[agentic-research] failed:', err);
      const raw = String(err?.message || err || '');
      let friendly = raw;
      if (/network-request-failed|ERR_(NETWORK|CONNECTION|TIMED_OUT)|fetch failed/i.test(raw)) {
        friendly = 'Network glitch reaching the research backend. Retry in a moment.';
      }
      card?.fail(friendly);
    } finally {
      setTimeout(() => { visionInFlight = false; }, 800);
    }
  }

  // ─── AGENT — autonomous multi-step browser task (Phase 4D / Stagehand) ───
  // Streams per-step screenshots via SSE. Each step is rendered as a small
  // numbered bubble so the user watches Chaka work in real time.
  async function triggerAgenticAgent(task) {
    if (visionInFlight) {
      console.warn('[agentic-agent] already in flight, skipping');
      return;
    }
    visionInFlight = true;

    // NEW: single premium console card instead of a cascade of bubbles
    const maxSteps = 35;
    const console_ = window.chakaAgentConsole?.create({ task, maxSteps });
    if (!console_) {
      console.warn('[agentic-agent] agent-console not available, falling back to bubbles');
    }

    try {
      const headers = await authHeaders();
      const res = await fetch(`${getBackend()}/api/hands/agent`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, mode: 'cua', maxSteps }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => 'unknown');
        throw new Error(`Agent endpoint failed: ${res.status} ${err.slice(0, 200)}`);
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneMessage = null;
      let taskSucceeded = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          if (!ev.trim()) continue;
          const eventMatch = ev.match(/^event:\s*(\w+)/m);
          const dataMatch = ev.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;
          let payload;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }
          const type = eventMatch ? eventMatch[1] : 'message';

          if (type === 'start') {
            // Backend sends the actual model name in the start event
            if (payload.modelName) {
              console_?.setModel?.(payload.modelName);
            }
          } else if (type === 'frame') {
            // Live 6fps viewport stream
            console_?.frame(payload.frame, payload.mime);
          } else if (type === 'step') {
            console_?.step(payload);
          } else if (type === 'attention_required') {
            // Surface 2FA/captcha alerts INSIDE the console card as a placeholder banner
            console_?.placeholder(payload.message || 'Action required — check the viewport above');
            renderAttentionBubble(payload);
          } else if (type === 'awaiting_email') {
            console_?.status?.('awaiting_email', payload);
          } else if (type === 'email_received') {
            console_?.status?.('email_received', payload);
          } else if (type === 'email_timeout') {
            console_?.status?.('email_timeout', payload);
          } else if (type === 'solving_captcha') {
            console_?.status?.('solving_captcha', payload);
          } else if (type === 'captcha_solved') {
            console_?.status?.('captcha_solved', payload);
          } else if (type === 'analyzing_puzzle') {
            console_?.status?.('analyzing_puzzle', payload);
          } else if (type === 'puzzle_analyzed') {
            console_?.status?.('puzzle_analyzed', payload);
          } else if (type === 'puzzle_executed') {
            console_?.status?.('puzzle_executed', payload);
          } else if (type === 'heartbeat') {
            console_?.status?.('heartbeat', payload);
          } else if (type === 'done') {
            doneMessage = payload.message || 'Task complete.';
            taskSucceeded = payload.success !== false;
            if (!taskSucceeded) {
              console_?.fail(doneMessage);
            } else {
              console_?.complete(doneMessage);
            }
          } else if (type === 'error') {
            console_?.fail(payload.error || 'Unknown error');
          }
        }
      }

      // Persist a brief summary on successful runs only
      if (doneMessage && taskSucceeded && window.tursoClient?.saveChat) {
        const state = window.state || {};
        if (state.userId && state.sessionId) {
          try {
            const id = (crypto.randomUUID && crypto.randomUUID()) || ('msg_' + Date.now());
            await window.tursoClient.saveChat(state.userId, state.sessionId, id, 'bot',
              `🤖 **Autonomous task complete**\n\n${doneMessage}`);
            
            // Remove the live card so it's replaced by the newly saved static card
            const liveCards = document.querySelectorAll('.ck-card.autonomous-card:not(.static-card)');
            liveCards.forEach(c => c.remove());
          } catch {}
        }
      }

    } catch (err) {
      console.error('[agentic-agent] failed:', err);
      const raw = String(err?.message || err || '');
      let friendly = raw;
      if (/network-request-failed|ERR_(NETWORK|CONNECTION|TIMED_OUT)|getaddrinfo|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(raw)) {
        friendly = 'Network glitch reaching Firebase auth (securetoken.googleapis.com). The agent never started — your local DNS is being flaky. Wait ~30s and retry. If it keeps happening, flush DNS:\n\n`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`';
      } else if (/permission|unauthorized|401|403/i.test(raw)) {
        friendly = 'Auth rejected (token expired or revoked). Sign out + back in.';
      } else if (/aborted|cancel/i.test(raw)) {
        friendly = 'Task was cancelled before it started.';
      }
      console_?.fail(friendly);
    } finally {
      setTimeout(() => { visionInFlight = false; }, 800);
    }
  }

  // ATTENTION REQUIRED — 2FA or CAPTCHA detected by backend
  function renderAttentionBubble(payload) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const kind = payload.kind || 'attention';
    const icon = kind === '2fa' ? '🔐' : kind === 'captcha' ? '🤖' : '⚠️';
    const url = String(payload.url || '').replace(/[<>"'&]/g, '');
    const msg = (payload.message || 'Action required').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const img = payload.screenshot
      ? `<img src="data:${payload.screenshotMime || 'image/jpeg'};base64,${payload.screenshot}" style="max-width:280px; max-height:200px; border-radius:8px; cursor:zoom-in; display:block; margin-top:8px;"
           onclick="this.style.maxWidth=this.style.maxWidth==='280px'?'90vw':'280px';this.style.maxHeight=this.style.maxHeight==='200px'?'80vh':'200px';this.style.cursor=this.style.cursor==='zoom-in'?'zoom-out':'zoom-in';" />`
      : '';
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `
      <div class="message bot" style="padding:10px; border-left:3px solid #ffa500;">
        <div style="font-weight:600; margin-bottom:6px;">${icon} ${kind === '2fa' ? '2FA Required' : kind === 'captcha' ? 'CAPTCHA Detected' : 'Action Required'}</div>
        <div style="font-size:0.92em; margin-bottom:6px;">${msg}</div>
        ${url ? `<div style="font-size:0.75em; opacity:0.55;">📍 ${url}</div>` : ''}
        ${img}
      </div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;
  }

  function renderAgentStepBubble(n, payload) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const reasoning = (payload.reasoning || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const url = String(payload.url || '').replace(/[<>"'&]/g, '');
    const img = payload.screenshot
      ? `<img src="data:${payload.screenshotMime || 'image/jpeg'};base64,${payload.screenshot}" style="max-width:280px; max-height:200px; border-radius:8px; cursor:zoom-in; display:block; margin-top:6px;"
           onclick="this.style.maxWidth=this.style.maxWidth==='280px'?'90vw':'280px';this.style.maxHeight=this.style.maxHeight==='200px'?'80vh':'200px';this.style.cursor=this.style.cursor==='zoom-in'?'zoom-out':'zoom-in';" />`
      : '';
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `
      <div class="message bot" style="padding:8px;">
        <div style="font-size:0.85em; opacity:0.85; margin-bottom:4px;">
          <strong>Step ${n}</strong> · <code style="font-size:0.9em;">${payload.action || 'thinking'}</code>
        </div>
        ${reasoning ? `<div style="font-size:0.82em; opacity:0.75; margin-bottom:6px; font-style:italic;">${reasoning}</div>` : ''}
        ${url ? `<div style="font-size:0.75em; opacity:0.55; margin-bottom:4px;">📍 ${url}</div>` : ''}
        ${img}
      </div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;
  }

  async function renderAgentDoneBubble(payload) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const success = payload.success ? '✅' : '⚠️';
    const msg = (payload.message || '').slice(0, 800);
    const safeMsg = msg.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const url = String(payload.finalUrl || '').replace(/[<>"'&]/g, '');
    const finalImg = payload.finalScreenshot
      ? `<img src="data:${payload.screenshotMime || 'image/jpeg'};base64,${payload.finalScreenshot}" style="max-width:280px; max-height:200px; border-radius:8px; cursor:zoom-in; display:block; margin-top:8px;"
           onclick="this.style.maxWidth=this.style.maxWidth==='280px'?'90vw':'280px';this.style.maxHeight=this.style.maxHeight==='200px'?'80vh':'200px';this.style.cursor=this.style.cursor==='zoom-in'?'zoom-out':'zoom-in';" />`
      : '';
    const group = document.createElement('div');
    group.className = 'message-group bot';
    group.innerHTML = `
      <div class="message bot" style="padding:10px;">
        <div style="font-weight:600; margin-bottom:6px;">${success} Task complete (${payload.actionCount || 0} actions)</div>
        <div style="font-size:0.92em; white-space:pre-wrap;">${safeMsg}</div>
        ${url ? `<div style="font-size:0.75em; opacity:0.55; margin-top:6px;">📍 ${url}</div>` : ''}
        ${finalImg}
      </div>`;
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;

    // Persist the final summary to Turso so it survives a refresh
    const persistText = `${success} **Autonomous task done** (${payload.actionCount || 0} steps)\n\n${msg}${url ? `\n\n📍 ${url}` : ''}`;
    await persistBotMessage(persistText);
  }

  async function triggerAgenticHands(action, target) {
    if (visionInFlight) {
      console.warn('[agentic-hands] already in flight, skipping');
      return;
    }
    visionInFlight = true;

    let statusBubble = null;
    try {
      console.log(`[agentic-hands] 🖐 action=${action} target=${target}`);
      statusBubble = addSystemBubble(`🌐 Browsing: ${target}…`);

      const headers = await authHeaders();
      const endpoint = action === 'screenshot' ? 'screenshot' : 'navigate';
      const res = await fetch(`${getBackend()}/api/hands/browser/${endpoint}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, screenshot: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (statusBubble) statusBubble.remove();

      // Find the user's original question so Chaka answers what they actually asked
      const userQuestion = findLastUserQuestion() || '(question unclear — describe the page briefly)';

      // Feed page back to Chaka through her chat pipeline so she answers naturally.
      let hint;
      if (action === 'browse') {
        const text = (data.text || '').slice(0, 10000); // cap to keep tokens sane
        // Build site map — Chaka can use this to navigate sub-pages on follow-up turns
        const linksList = Array.isArray(data.links) && data.links.length
          ? data.links.slice(0, 30).map(l => `  • [${l.text || '(no text)'}] → ${l.url}`).join('\n')
          : '  (no internal links found)';
        const fallbackNote = data.fallbackUsed && data.originalRequest
          ? `\n\nNOTE: The URL you originally requested (${data.originalRequest}) didn't exist or was empty. I auto-redirected to a similar page from the site's navigation.\n`
          : '';
        hint = `You are Chaka. You just navigated to ${data.finalUrl || target} (page title: "${data.title || 'Untitled'}") because the user asked you to.${fallbackNote}

THE USER'S ORIGINAL QUESTION WAS:
"${userQuestion}"

Here is the page text content:
"""
${text}
"""

═══════════════════════════════════════════════════════
SITE MAP (links available on this site — use these for follow-up navigation):
═══════════════════════════════════════════════════════
${linksList}

A screenshot of the page is attached.

═══════════════════════════════════════════════════════
HOW TO RESPOND — READ CAREFULLY:
═══════════════════════════════════════════════════════
- Your response must be NATURAL CONVERSATIONAL PROSE — 1 to 4 short paragraphs, like you're chatting with a friend.
- DO NOT output JSON, do not list raw HTML/page structure, do not include {} brackets.
- DO answer the user's actual question: ${userQuestion ? `"${userQuestion}"` : '(describe what the site is and what it offers, briefly)'}
- If the user asked about a specific page/section (resume, about, pricing, blog, etc) and you see it in the SITE MAP above — mention what you found.
- If the user asked about something NOT on this current page but you SEE a matching link in the SITE MAP — say "I see they have a [X] page — want me to open it?" so the user can ask you to navigate there next.
- Speak as YOURSELF (Chaka), warm and natural.`;
      } else {
        hint = `You are Chaka. You just took a screenshot of ${data.url || target} (page title: "${data.title || 'Untitled'}") because the user asked.

THE USER'S ORIGINAL QUESTION WAS: "${userQuestion}"

The image attached is what the page looks like right now.

═══════════════════════════════════════════════════════
Respond in natural prose (final_answer field), 1-3 sentences. Describe what the page LOOKS like and answer the user's question. Do NOT output JSON or structured data — just chat naturally.`;
      }

      // Show the screenshot to the user as a small bubble — so they can see what Chaka saw
      if (data.screenshot) {
        showScreenshotBubble(data.screenshot, data.screenshotMime || 'image/jpeg', data.finalUrl || data.url || target);
      }

      if (!data.screenshot) {
        // No screenshot — call chat with text-only context
        await sendTextOnlyContextToChat(hint + '\n\n(No screenshot available — answer based on the text only.)');
      } else {
        // Use callChakaWithVision via chakaEyes (it's the same pipeline used for vision)
        // We need to call /api/chat directly with the inline image since chakaEyes doesn't expose that.
        await sendImageContextToChat(data.screenshot, data.screenshotMime || 'image/jpeg', hint);
      }
    } catch (err) {
      console.error('[agentic-hands] failed:', err);
      if (statusBubble) statusBubble.remove();
      const container = document.getElementById('chat-messages');
      if (container) {
        const note = document.createElement('div');
        note.className = 'message-group bot';
        note.innerHTML = `<div class="message bot" style="opacity:0.7;font-style:italic;">⚠️ Couldn't load that page — ${(err.message || 'unknown error').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`;
        container.appendChild(note);
      }
    } finally {
      setTimeout(() => { visionInFlight = false; }, 1500);
    }
  }

  // Generic helper — sends an image + text prompt through /api/chat, streams response into a new bubble.
  // Mirrors callChakaWithVision in eyes.js but lives here so HANDS doesn't depend on EYES internals.
  async function sendImageContextToChat(imageBase64, mimeType, promptText) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) throw new Error('Chat container not found');

    const group = document.createElement('div');
    group.className = 'message-group bot streaming';
    const msg = document.createElement('div');
    msg.className = 'message bot';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<span style="opacity:0.5;">…</span>';
    msg.appendChild(content);
    group.appendChild(msg);
    chatMessages.appendChild(group);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const headers = await authHeaders();
    const res = await fetch(`${getBackend()}/api/chat`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        voiceInput: false,
        plainText: true, // ← CRITICAL: bypass responseMimeType:"application/json" so Chaka can write natural prose
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: promptText }
          ]
        }]
      })
    });

    if (!res.ok) {
      group.remove();
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const raw = decoder.decode(value, { stream: true });
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.text) {
            accumulated += j.text;
            // Defensive unwrap — Gemini sometimes JSON-wraps even when not asked to
            const display = extractFromJsonIfWrapped(accumulated);
            content.innerHTML = window.marked
              ? window.marked.parse(display)
              : display.replace(/\n/g, '<br>');
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch {}
      }
    }

    group.classList.remove('streaming');
    const finalClean = extractFromJsonIfWrapped(accumulated).trim();
    content.innerHTML = window.marked ? window.marked.parse(finalClean) : finalClean.replace(/\n/g, '<br>');
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Persist the CLEAN version to Turso so refresh shows prose, not JSON
    if (finalClean) {
      await persistBotMessage(finalClean);
    }
  }

  async function sendTextOnlyContextToChat(promptText) {
    // Same as above but no image — useful for when screenshot fails
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const headers = await authHeaders();
    const res = await fetch(`${getBackend()}/api/chat`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: promptText }] }]
      })
    });
    if (!res.ok) return;
    // Let the regular chat flow handle rendering (it has its own interceptor — be careful of recursion)
    // Just drain it — we don't render it here because the regular chat already does.
    await res.text();
  }

  // ─── fetch interceptor ───────────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();

    if (!isChatEndpoint(url) || method !== 'POST') {
      return originalFetch(input, init);
    }

    const response = await originalFetch(input, init);
    if (!response.ok || !response.body) return response;

    console.log('[agentic-vision] 🔍 intercepting /api/chat response');

    // Tee the body so we scan it without blocking the original consumer
    const [forUser, forUs] = response.body.tee();

    // Background scan
    (async () => {
      try {
        const reader = forUs.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
        }

        let fullText = '';
        for (const line of accumulated.split('\n')) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line);
            if (j.text) fullText += j.text;
          } catch { /* partial */ }
        }

        console.log('[agentic] accumulated response (last 250 chars):', fullText.slice(-250));

        // Check AGENT first (most powerful), then HANDS, then EYES, then legacy
        const agentMatch = fullText.match(AGENT_RE);
        if (agentMatch) {
          const task = agentMatch[1].trim();
          console.log(`[agentic-agent] 🤖 AGENT marker → task="${task.slice(0, 80)}…"`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerAgenticAgent(task);
          }, 400);
          return;
        }

        const digMatch = fullText.match(DIG_RE);
        if (digMatch) {
          const digTarget = digMatch[1].trim();
          console.log(`[agentic-dig] 🎯 DIG marker → target="${digTarget.slice(0, 80)}…"`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerDeepDig(digTarget);
          }, 400);
          return;
        }

        const researchMatch = fullText.match(RESEARCH_RE);
        if (researchMatch) {
          const researchQuery = researchMatch[1].trim();
          console.log(`[agentic-research] 📚 RESEARCH marker → query="${researchQuery.slice(0, 80)}…"`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerDeepResearch(researchQuery);
          }, 400);
          return;
        }

        const scrapeMatch = fullText.match(SCRAPE_RE);
        if (scrapeMatch) {
          const scrapeUrl = scrapeMatch[1].trim();
          console.log(`[agentic-scrape] 🕷️ SCRAPE marker → url=${scrapeUrl}`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerDeepScrape(scrapeUrl);
          }, 400);
          return;
        }

        const handsMatch = fullText.match(HANDS_RE);
        if (handsMatch) {
          const action = handsMatch[1].toLowerCase();
          const target = handsMatch[2].trim();
          console.log(`[agentic-hands] 🎯 HANDS marker → action=${action} target=${target}`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerAgenticHands(action, target);
          }, 400);
          return;
        }

        const eyesMatch = fullText.match(EYES_RE);
        if (eyesMatch) {
          const source = eyesMatch[1].toLowerCase();
          console.log(`[agentic-vision] 🎯 EYES marker → ${source}`);
          setTimeout(() => {
            const bubble = findLastBotBubble();
            deepStripMarker(bubble);
            triggerAgenticVision(source);
          }, 400);
          return;
        }

        // Legacy schema bridge — Chaka often uses script25.js's action_required
        // field (which is in her JSON schema) instead of the marker. Bridge both
        // browse_url AND look_webcam/look_screen/ocr_screen back to the right pipeline.
        const legacy = extractLegacyIntent(fullText);
        if (legacy) {
          console.log(`[agentic-bridge] 🌉 legacy intent →`, legacy);
          setTimeout(() => {
            // Replace the JSON dump in the bubble with just the prose if possible
            const bubble = findLastBotBubble();
            if (bubble) {
              const content = bubble.querySelector?.('.message-content') || bubble;
              const clean = extractFromJsonIfWrapped(fullText);
              if (clean && clean !== fullText) {
                content.innerHTML = window.marked ? window.marked.parse(clean) : clean.replace(/\n/g, '<br>');
              }
            }
            if (legacy.kind === 'agent') triggerAgenticAgent(legacy.task);
            else if (legacy.kind === 'hands') triggerAgenticHands(legacy.action, legacy.target);
            else if (legacy.kind === 'eyes') triggerAgenticVision(legacy.source);
            else if (legacy.kind === 'research') triggerDeepResearch(legacy.query);
            else if (legacy.kind === 'scrape') triggerDeepScrape(legacy.url);
          }, 400);
          return;
        }

        // Last-resort: prose intent detector. Catches "Alright, I'll head over
        // to X and sign up…" — when the LLM is lazy and acknowledges verbally
        // without emitting the marker.
        const proseIntent = detectProseAgentIntent(fullText);
        if (proseIntent) {
          console.log(`[agentic-prose] 🪄 inferred agent intent from prose → url=${proseIntent.url}`);
          setTimeout(() => {
            triggerAgenticAgent(proseIntent.task);
          }, 400);
          return;
        }

        console.log('[agentic] ❌ no marker (Chaka did not request vision or hands)');
      } catch (e) {
        console.warn('[agentic-vision] scan error:', e.message);
      }
    })();

    return new Response(forUser, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  console.log('[agentic] ready — Chaka can trigger her own eyes 👁️ ([[EYES:src]]) and hands 🖐 ([[HANDS:browse:url]])');
})();
