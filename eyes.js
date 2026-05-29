/**
 * eyes.js — Chaka Vision System
 * Handles: screen capture, webcam, OCR, object detection, visual memory, surveillance (admin)
 * Exposes: window.chakaEyes
 */
(function () {
  'use strict';

  // Use the same backend URL that script25.js resolves (window.BACKEND_URL),
  // with a localhost fallback so eyes.js works even before script25 sets it.
  function getBackend() {
    if (window.BACKEND_URL) return window.BACKEND_URL;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:3000' : 'https://chaka-backend-eh02.onrender.com';
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

  async function authHeaders() {
    if (typeof window.getAuthHeaders === 'function') return window.getAuthHeaders();
    return { 'Content-Type': 'application/json' };
  }

  async function post(endpoint, body) {
    const headers = await authHeaders();
    const url = `${getBackend()}/api/vision/${endpoint}`;
    console.log('[chakaEyes] POST', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Capture a single frame from a MediaStream as base64
  function captureFrame(stream, mimeType = 'image/jpeg', quality = 0.85) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          // Give the video one frame to render before drawing
          await new Promise(r => setTimeout(r, 150));
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const base64 = dataUrl.split(',')[1];
          if (!base64) throw new Error('Canvas capture returned empty frame');
          resolve({ base64, mimeType });
        } catch (e) { reject(e); }
      };
      video.onerror = (e) => reject(new Error('Video stream error: ' + (e.message || 'unknown')));
      // Timeout safety
      setTimeout(() => reject(new Error('Frame capture timed out')), 8000);
    });
  }

  // ── SCREEN CAPTURE ─────────────────────────────────────────────────────────

  let screenStream = null;

  async function startScreenCapture() {
    if (screenStream) stopScreenCapture();
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });
    screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenCapture);
    console.log('[chakaEyes] Screen capture started');
    return screenStream;
  }

  function stopScreenCapture() {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
      console.log('[chakaEyes] Screen capture stopped');
    }
  }

  async function analyzeScreen(customPrompt = null, storeMemory = true) {
    const stream = screenStream || await startScreenCapture();
    const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
    // Use vision API for programmatic/background calls (returns text, no bubble)
    const data = await post('screen', { imageBase64: base64, mimeType, prompt: customPrompt, storeMemory });
    return data.description;
  }

  // Pull the most recent user question so Chaka answers what was asked, not a generic dump
  function _lastUserQuestion() {
    const c = document.getElementById('chat-messages');
    if (!c) return '';
    const msgs = c.querySelectorAll('.message.user, .message-group.user .message-content, .message-group.user');
    if (!msgs.length) return '';
    return (msgs[msgs.length - 1].textContent || '').trim().slice(0, 500);
  }

  function _withQuestionContext(hint) {
    const q = _lastUserQuestion();
    if (!q) return hint;
    return hint + `\n\nThe user's original question was: "${q}"\n` +
      `Answer THAT question naturally in your final_answer field — plain conversational prose, NO JSON dumps, NO structured fields. 1-3 short paragraphs max.`;
  }

  // analyzeScreenInChat — sends through Chaka's chat pipeline so she responds naturally
  async function analyzeScreenInChat(customPrompt = null, showUserBubble = true) {
    const stream = screenStream || await startScreenCapture();
    const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
    if (showUserBubble) addUserActionBubble('👁️ Chaka, look at my screen.');
    return callChakaWithVision(base64, mimeType, _withQuestionContext(customPrompt ||
      'You are Chaka. Your vision system just captured this screen. Describe what you see naturally and offer to help.'));
  }

  // analyzeWebcamInChat — webcam version of the same agentic pipeline
  async function analyzeWebcamInChat(customPrompt = null, showUserBubble = true) {
    const stream = webcamStream || await startWebcam();
    const { base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.9);
    if (showUserBubble) addUserActionBubble('📷 Chaka, look at me.');
    return callChakaWithVision(base64, mimeType, _withQuestionContext(customPrompt ||
      'You are Chaka. Your webcam just captured this frame of the user. Describe what you see naturally and warmly.'));
  }

  // analyzeOcrInChat — OCR result rendered as a real bot bubble
  async function analyzeOcrInChat(showUserBubble = true) {
    const stream = screenStream || await startScreenCapture();
    const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
    if (showUserBubble) addUserActionBubble('🔍 Chaka, read the text on my screen.');
    return callChakaWithVision(base64, mimeType, _withQuestionContext(
      'You are Chaka using your OCR vision. Extract ALL visible text on this screen exactly as written, preserve structure, then briefly offer to help with any of it.'));
  }

  // ── WEBCAM ─────────────────────────────────────────────────────────────────

  let webcamStream = null;
  let webcamVideoEl = null;

  async function startWebcam(videoEl = null) {
    if (webcamStream) return webcamStream;
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (videoEl) {
      videoEl.srcObject = webcamStream;
      webcamVideoEl = videoEl;
    }
    console.log('[chakaEyes] Webcam started');
    return webcamStream;
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
      if (webcamVideoEl) { webcamVideoEl.srcObject = null; webcamVideoEl = null; }
      console.log('[chakaEyes] Webcam stopped');
    }
  }

  async function analyzeWebcam(customPrompt = null, storeMemory = true) {
    const stream = webcamStream || await startWebcam();
    const { base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.9);
    const data = await post('webcam', { imageBase64: base64, mimeType, prompt: customPrompt, storeMemory });
    return data.description;
  }

  // ── OCR ────────────────────────────────────────────────────────────────────

  // OCR from an existing image file (File object or base64 string)
  async function ocrFile(fileOrBase64, mimeType = 'image/jpeg') {
    let base64 = fileOrBase64;
    if (fileOrBase64 instanceof File || fileOrBase64 instanceof Blob) {
      base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBase64);
        mimeType = fileOrBase64.type || mimeType;
      });
    }
    const data = await post('ocr', { imageBase64: base64, mimeType });
    return data.text;
  }

  // OCR from current screen
  async function ocrScreen() {
    const stream = screenStream || await startScreenCapture();
    const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
    const data = await post('ocr', { imageBase64: base64, mimeType });
    return data.text;
  }

  // OCR from webcam frame
  async function ocrWebcam() {
    const stream = webcamStream || await startWebcam();
    const { base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.9);
    const data = await post('ocr', { imageBase64: base64, mimeType });
    return data.text;
  }

  // ── OBJECT DETECTION ───────────────────────────────────────────────────────

  async function detectObjectsInScreen() {
    const stream = screenStream || await startScreenCapture();
    const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
    const data = await post('objects', { imageBase64: base64, mimeType });
    return data.objects;
  }

  async function detectObjectsInWebcam() {
    const stream = webcamStream || await startWebcam();
    const { base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.9);
    const data = await post('objects', { imageBase64: base64, mimeType });
    return data.objects;
  }

  // ── VISUAL MEMORY ──────────────────────────────────────────────────────────

  async function getVisualMemory(limit = 10) {
    const headers = await authHeaders();
    const res = await fetch(`${getBackend()}/api/vision/memory?limit=${limit}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch visual memory');
    const data = await res.json();
    return data.memories;
  }

  // ── SURVEILLANCE (admin-only) ──────────────────────────────────────────────

  let surveillanceTimer = null;

  async function startSurveillance({ source = 'webcam', triggerCondition, intervalMs = 5000, onTrigger }) {
    if (surveillanceTimer) stopSurveillance();

    const check = async () => {
      try {
        let base64, mimeType;
        if (source === 'screen') {
          const stream = screenStream || await startScreenCapture();
          ({ base64, mimeType } = await captureFrame(stream, 'image/png', 0.8));
        } else {
          const stream = webcamStream || await startWebcam();
          ({ base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.8));
        }
        const result = await post('surveillance', { imageBase64: base64, mimeType, triggerCondition });
        if (result.triggered && typeof onTrigger === 'function') {
          onTrigger(result);
        }
      } catch (err) {
        console.error('[chakaEyes] Surveillance check error:', err.message);
      }
    };

    await check();
    surveillanceTimer = setInterval(check, intervalMs);
    console.log(`[chakaEyes] Surveillance started — checking every ${intervalMs}ms`);
  }

  function stopSurveillance() {
    if (surveillanceTimer) {
      clearInterval(surveillanceTimer);
      surveillanceTimer = null;
      console.log('[chakaEyes] Surveillance stopped');
    }
  }

  // ── UI WIDGET ──────────────────────────────────────────────────────────────

  function injectEyesUI() {
    // ── Phase 5.9: floating vision buttons removed (per user request) ──
    // The three buttons (🖥️ Screen, 📷 Webcam, 🔍 OCR) were always visible
    // in the bottom-right corner. They cluttered the UI without offering
    // anything chat/voice/live-mode can't already trigger via the
    // [[EYES:webcam|screen|ocr]] marker pipeline. The underlying vision
    // capabilities (startScreenCapture, startWebcam, OCR) are still
    // available — they're invoked via the marker interceptor in
    // agentic-vision.js or the live-mode set_vision tool. Only the
    // floating UI is hidden.
    //
    // To re-enable for debugging, comment out the next line:
    return;
    // eslint-disable-next-line no-unreachable
    if (document.getElementById('chaka-eyes-bar')) return;

    // Inject blink keyframes once
    if (!document.getElementById('chaka-eyes-style')) {
      const style = document.createElement('style');
      style.id = 'chaka-eyes-style';
      style.textContent = '@keyframes blink { 0%,50%{opacity:1;} 51%,100%{opacity:0;} }';
      document.head.appendChild(style);
    }

    const bar = document.createElement('div');
    bar.id = 'chaka-eyes-bar';
    bar.style.cssText = `
      position: fixed; bottom: 80px; right: 20px; z-index: 9999;
      display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
    `;

    const buttons = [
      { id: 'eyes-screen-btn', icon: '🖥️', label: 'Read Screen', action: async () => {
          const stream = screenStream || await startScreenCapture();
          const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
          addUserActionBubble('👁️ Chaka, look at my screen and tell me what you see.');
          await callChakaWithVision(base64, mimeType,
            'You are Chaka and your vision system just activated. This image is a live capture of the user\'s screen. ' +
            'Describe exactly what you see — apps open, text visible, errors, layout, anything notable. ' +
            'Be natural and conversational, as if you\'re genuinely looking at it yourself. ' +
            'Then ask how you can help with what you see.'
          );
        }
      },
      { id: 'eyes-webcam-btn', icon: '📷', label: 'See You', action: async () => {
          const stream = webcamStream || await startWebcam();
          const { base64, mimeType } = await captureFrame(stream, 'image/jpeg', 0.9);
          addUserActionBubble('📷 Chaka, look at me through the webcam.');
          await callChakaWithVision(base64, mimeType,
            'You are Chaka and your webcam vision just activated. This image is a live frame from the user\'s camera. ' +
            'Describe what you see — the person, their expression, environment, lighting, anything you notice. ' +
            'Be warm, natural, and personal — you\'re actually looking at them right now. ' +
            'React genuinely to what you observe.'
          );
        }
      },
      { id: 'eyes-ocr-btn', icon: '🔍', label: 'Read Text', action: async () => {
          const stream = screenStream || await startScreenCapture();
          const { base64, mimeType } = await captureFrame(stream, 'image/png', 1.0);
          addUserActionBubble('🔍 Chaka, read all the text you can see on my screen.');
          await callChakaWithVision(base64, mimeType,
            'You are Chaka using your OCR vision. This is a capture of the user\'s screen. ' +
            'Extract and read ALL visible text exactly as written — preserve structure, headings, code, tables. ' +
            'Present it cleanly formatted. Then ask if they need help with any of it.'
          );
        }
      },
    ];

    // Helper to get current user ID from the app state if available
    function getCurrentUserId() {
      return window.state?.userId || window.currentUserId || null;
    }
    const storeMemoryEnabled = true;

    buttons.forEach(({ id, icon, label, action }) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.title = label;
      btn.textContent = icon;
      btn.style.cssText = `
        width: 44px; height: 44px; border-radius: 50%; border: none;
        background: rgba(30,30,40,0.85); color: white; font-size: 20px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        transition: transform 0.15s;
      `;
      btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.12)');
      btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '⏳';
        try { await action(); } catch (e) { console.error(e); alert('Eyes error: ' + e.message); }
        btn.disabled = false;
        btn.textContent = icon;
      });
      bar.appendChild(btn);
    });

    document.body.appendChild(bar);
  }

  // ── CORE: Send image through Chaka's real chat pipeline ──────────────────
  // This is what makes Chaka genuinely aware — she sees the image herself
  // through /api/chat with inlineData, streams the response, and it appears
  // as her own naturally generated bot bubble.

  function getChatContainer() {
    return (
      document.getElementById('chat-messages') ||
      document.querySelector('.chat-messages') ||
      document.querySelector('[id*="chat-messages"]')
    );
  }

  function addUserActionBubble(label) {
    const chatMessages = getChatContainer();
    if (!chatMessages) return;
    const group = document.createElement('div');
    group.className = 'message-group user';
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.style.cssText = 'opacity:0.75; font-style:italic; font-size:0.9em;';
    msg.textContent = label;
    group.appendChild(msg);
    chatMessages.appendChild(group);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Robust extractor for Gemini's JSON-mode responses.
  // Gemini may wrap text in any field: final_answer, description, response, text, content, answer, message.
  // Works on partial JSON during streaming AND on complete JSON at the end.
  function extractCleanText(raw) {
    if (!raw) return '';
    const s = raw.trim();

    // If it doesn't look like JSON, return as-is
    if (!s.startsWith('{') && !s.startsWith('[')) return s;

    // Try common field-name patterns (handles partial/streaming JSON)
    const fields = ['final_answer','description','response','answer','message','content','text','reply','output'];
    for (const key of fields) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
      const m = s.match(re);
      if (m) {
        // Unescape JSON string escapes safely
        try { return JSON.parse(`"${m[1]}"`); } catch { return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
      }
    }

    // Fallback: try full parse and pick the longest string value
    try {
      const j = JSON.parse(s);
      const strings = [];
      const walk = (v) => {
        if (typeof v === 'string') strings.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(j);
      if (strings.length) return strings.sort((a, b) => b.length - a.length)[0];
    } catch {}

    // Still raw JSON fragment — hide it from the user
    return '';
  }

  async function callChakaWithVision(imageBase64, mimeType, systemHint) {
    const chatMessages = getChatContainer();
    if (!chatMessages) throw new Error('Chat container not found');

    // Create a streaming bot bubble — identical structure to script25.js
    const group = document.createElement('div');
    group.className = 'message-group bot streaming';
    const msg = document.createElement('div');
    msg.className = 'message bot';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<span class="typing-cursor" style="display:inline-block;width:8px;height:16px;background:currentColor;animation:blink 1s step-end infinite;"></span>';
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
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: systemHint }
          ]
        }]
      })
    });

    if (!res.ok) {
      group.remove();
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText || `HTTP ${res.status}`);
    }

    // Stream response chunks
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    const cursorHTML = '<span class="typing-cursor" style="display:inline-block;width:8px;height:16px;background:currentColor;margin-left:2px;animation:blink 1s step-end infinite;vertical-align:middle;"></span>';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete trailing line for next iteration
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.text) {
            accumulated += parsed.text;
            const display = extractCleanText(accumulated);
            if (display) {
              const rendered = window.marked
                ? window.marked.parse(display)
                : display.replace(/\n/g, '<br>');
              content.innerHTML = rendered + cursorHTML;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          }
        } catch { /* partial line, skip */ }
      }
    }

    // Finalize — full extraction on complete accumulated text
    group.classList.remove('streaming');
    const finalText = extractCleanText(accumulated) || accumulated;
    content.innerHTML = window.marked
      ? window.marked.parse(finalText)
      : finalText.replace(/\n/g, '<br>');
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Persist to Turso so the response survives a refresh
    try {
      if (finalText.trim() && window.tursoClient?.saveChat) {
        const state = window.state || {};
        if (state.userId && state.sessionId) {
          const id = (crypto.randomUUID && crypto.randomUUID()) || ('msg_' + Date.now());
          await window.tursoClient.saveChat(state.userId, state.sessionId, id, 'bot', finalText.trim());
        }
      }
    } catch (e) { console.warn('[chakaEyes] persist failed:', e.message); }

    return finalText;
  }

  // Push text into chat input (kept as utility, not used for vision responses)
  function injectIntoChatInput(text) {
    const input =
      document.getElementById('userInput') ||
      document.querySelector('textarea');
    if (input) {
      input.value = (input.value ? input.value + '\n\n' : '') + text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  window.chakaEyes = {
    // Screen
    startScreenCapture,
    stopScreenCapture,
    analyzeScreen,
    analyzeScreenInChat,
    ocrScreen,
    detectObjectsInScreen,

    // Webcam
    startWebcam,
    stopWebcam,
    analyzeWebcam,
    analyzeWebcamInChat,
    ocrWebcam,
    detectObjectsInWebcam,

    // OCR in chat
    analyzeOcrInChat,

    // OCR on file
    ocrFile,

    // Memory
    getVisualMemory,

    // Surveillance (admin)
    startSurveillance,
    stopSurveillance,

    // UI
    injectEyesUI,
  };

  // Auto-inject UI when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEyesUI);
  } else {
    injectEyesUI();
  }

  console.log('[chakaEyes] Vision system loaded ✅');
})();
