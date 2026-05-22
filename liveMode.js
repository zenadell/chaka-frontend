/**
 * liveMode.js - V5 Expressive Face HUD
 * ORIGINAL working WebSocket/Audio/Mic logic preserved exactly.
 * Only changes: visualizer replaced with expressive face + emotion tool handler added.
 * Uses Multimodal Live API via WebSocket proxy.
 */

const LiveMode = {
    socket: null,
    isConnected: false,
    isRecording: false,
    audioCtx: null,
    analyser: null,
    dataArray: null,

    // AUDIO QUEUE SYSTEM (FIFO)
    audioQueue: [],
    isPlaying: false,
    isAiSpeaking: false,
    currentSource: null,

    // EMOTION ENGINE STATE
    thoughtBuffer: "",
    emotionDecayTimer: null,
    lastEmotionChangeTime: 0,
    turnHadThought: false,
    speechRecognition: null, // Web Speech API for user speech analysis

    // INPUT
    inputCtx: null,
    processor: null,
    micStream: null,
    inputAnalyser: null,
    inputDataArray: null,

    // VISION STATE (Phase 3C — continuous live vision via Gemini Live API)
    visionState: { webcam: false, screen: false },
    visionStreams: { webcam: null, screen: null },
    visionVideos: { webcam: null, screen: null },
    visionTimers: { webcam: null, screen: null },
    visionFps: 1, // 1 frame per second per source — balanced for token cost vs awareness
    visionFrameQuality: 0.6,
    visionMaxWidth: 800,

    // Config from backend
    config: null,
    
    // Disconnect flag for end_conversation tool
    pendingDisconnect: false,
    
    // Time tracking for echo cancellation debounce
    lastAiSpeakTime: 0,
    
    // Short-term memory for reconnects
    sessionHistory: [],

    // DOM cache
    elements: {},

    // ========================
    // FACE VISUALIZER STATE
    // ========================
    currentEmotion: 'neutral',
    eyeParams: { rot: 0, scaleY: 1, bend: 0, width: 12, height: 32, shiftX: 0, shiftY: 0 },
    currentColors: {
        core: [0, 243, 255],
        mid: [0, 100, 255],
        edge: [255, 69, 0],
        shadow: [0, 100, 255]
    },

    emotions: {
        neutral: {
            rot: 0, scaleY: 1, bend: 0, width: 12, height: 32, shiftX: 0, shiftY: 0,
            colors: { core: [0, 243, 255], mid: [0, 100, 255], edge: [255, 69, 0], shadow: [0, 100, 255] }
        },
        angry: {
            rot: 0.65, scaleY: 1, bend: 0, width: 14, height: 40, shiftX: -1, shiftY: 6,
            colors: { core: [255, 50, 0], mid: [200, 0, 0], edge: [100, 0, 0], shadow: [255, 0, 0] }
        },
        sad: {
            rot: -0.4, scaleY: 1, bend: 0, width: 12, height: 32, shiftX: -2, shiftY: -2,
            colors: { core: [0, 100, 255], mid: [0, 50, 200], edge: [0, 20, 100], shadow: [0, 50, 255] }
        },
        happy: {
            rot: 0, scaleY: 1, bend: -15, width: 24, height: 8, shiftX: 0, shiftY: 4,
            colors: { core: [0, 243, 255], mid: [0, 100, 255], edge: [255, 69, 0], shadow: [0, 100, 255] }
        },
        surprised: {
            rot: 0, scaleY: 1, bend: 0, width: 20, height: 20, shiftX: 0, shiftY: -4,
            colors: { core: [255, 200, 0], mid: [255, 100, 0], edge: [200, 50, 0], shadow: [255, 150, 0] }
        },
        thinking: {
            rot: 0, scaleY: 0.8, bend: 0, width: 12, height: 28, shiftX: 0, shiftY: 0,
            colors: { core: [180, 50, 255], mid: [120, 0, 220], edge: [60, 0, 150], shadow: [150, 50, 255] }
        }
    },

    // Blink engine
    isBlinking: false,
    blinkScale: 1,

    // Gaze tracking
    targetX: 0, targetY: 0,
    currentEyeX: 0, currentEyeY: 0,
    currentTilt: 0,
    lastInteractionTime: Date.now(),

    // Micro-saccades
    saccadeTimer: 0,
    saccadeTargetX: 0,
    saccadeTargetY: 0,

    // Frame clock
    time: 0,

    // Menu state
    menuOpen: false,
    keyboardOpen: false,

    // ========================
    // INITIALIZATION
    // ========================
    init() {
        console.log("🎙 LiveMode V5 (Expressive Face) Initializing...");
        this.cacheElements();
        this.attachListeners();
    },

    cacheElements() {
        this.elements = {
            overlay: document.getElementById('live-mode-overlay'),
            visualizer: document.getElementById('live-visualizer'),
            chatLog: document.getElementById('live-chat-log'),
            micBtn: document.getElementById('live-mic-btn'),
            exitBtn: document.getElementById('live-exit-btn'),
            statusText: document.getElementById('live-status-text'),
            personaName: document.getElementById('live-persona-name'),
            triggerBtn: document.getElementById('live-mode-btn'),
            // Menu elements
            menuBtn: document.getElementById('live-menu-btn'),
            menuPanel: document.getElementById('live-menu-panel'),
            menuBackdrop: document.getElementById('live-menu-backdrop'),
            keyboardToggle: document.getElementById('live-keyboard-toggle'),
            backToChat: document.getElementById('live-back-to-chat'),
            voiceSelect: document.getElementById('live-voice-select'),
            // Keyboard elements
            keyboardOverlay: document.getElementById('live-keyboard-overlay'),
            keyboardInput: document.getElementById('live-keyboard-input'),
            keyboardSend: document.getElementById('live-keyboard-send'),
        };
    },

    attachListeners() {
        this.elements.triggerBtn?.addEventListener('click', () => this.open());
        this.elements.exitBtn?.addEventListener('click', () => this.close());
        // Mic button = pure toggle, same as original
        this.elements.micBtn?.addEventListener('click', () => this.toggleMic());

        // Menu system
        this.elements.menuBtn?.addEventListener('click', () => this.toggleMenu());
        this.elements.menuBackdrop?.addEventListener('click', () => {
            this.closeMenu();
            this.closeKeyboard();
        });
        this.elements.keyboardToggle?.addEventListener('click', () => this.openKeyboard());
        this.elements.backToChat?.addEventListener('click', () => this.close());

        // Keyboard input
        this.elements.keyboardSend?.addEventListener('click', () => this.sendKeyboardMessage());
        this.elements.keyboardInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendKeyboardMessage();
        });

        // Voice select sync
        this.elements.voiceSelect?.addEventListener('change', () => {
            console.log(`🎤 Live voice changed to: ${this.elements.voiceSelect.value}`);
        });

        // Gaze tracking
        window.addEventListener('mousemove', (e) => this.updateGazeTarget(e.clientX, e.clientY));
        window.addEventListener('touchmove', (e) => this.updateGazeTarget(e.touches[0].clientX, e.touches[0].clientY));
        window.addEventListener('mouseout', () => { this.targetX = 0; this.targetY = 0; });
        window.addEventListener('touchend', () => { this.targetX = 0; this.targetY = 0; });
    },

    // ========================
    // LIFECYCLE (mirrors original exactly — auto-connect on open)
    // ========================
    async open() {
        this.elements.overlay.classList.add('active');
        this.updateStatus("CONFIGURING...", "#ff4500");

        // Sync voice select
        const globalVoice = window.botConfig?.ttsVoiceId || 'Puck';
        if (this.elements.voiceSelect) {
            this.elements.voiceSelect.value = globalVoice;
        }

        try {
            const headers = (typeof getAuthHeaders === 'function') ? await getAuthHeaders() : {};
            const persona = window.state?.selectedPersonalityId || localStorage.getItem('selectedPersonalityId') || "";
            const userId = window.state?.userId || "";
            const sessionId = window.state?.sessionId || "";
            const apiBase = window.BACKEND_URL || "";
            const voiceId = this.elements.voiceSelect?.value || globalVoice;

            const url = `${apiBase}/api/tools/live/config?persona=${encodeURIComponent(persona)}&userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}&voiceId=${encodeURIComponent(voiceId)}&t=${Date.now()}`;
            const resp = await fetch(url, { headers, cache: 'no-store' });
            if (!resp.ok) throw new Error("Failed to fetch Live Mode configuration");

            this.config = await resp.json();

            if (this.elements.personaName && this.config.personaName) {
                this.elements.personaName.innerText = `${this.config.personaName} // LIVE`;
                console.log(`✅ Live HUD Updated to: ${this.config.personaName}`);
            }

            console.log("💎 Live Mode Config Loaded:", {
                personaName: this.config.personaName,
                voiceId: this.config.voiceId,
                instructionLength: this.config.systemInstruction?.length || 0
            });

            this.updateStatus("READY", "#ffffff");

            // Auto-connect immediately after config loads
            await this.connect();

        } catch (e) {
            console.error(e);
            this.updateStatus("OFFLINE", "#8e8e93");
            if (window.showToastNotification) {
                window.showToastNotification({ message: "Live Mode Offline: " + e.message, type: "error" });
            }
        }
    },

    close() {
        this.disconnect();
        this.closeMenu();
        this.closeKeyboard();
        this.elements.overlay.classList.remove('active');
    },

    // ========================
    // WEBSOCKET CONNECTION (mirrors original EXACTLY)
    // ========================
    async connect() {
        if (!this.config) return;

        this.initAudioContext();
        this.updateStatus("WAKING UP...", "#ff4500");

        const apiBase = window.BACKEND_URL || (window.location.protocol + "//" + window.location.host);
        const wsBase = apiBase.replace(/^http/, 'ws');
        const WS_URL = `${wsBase}/api/live/stream`;

        try {
            this.socket = new WebSocket(WS_URL);
        } catch (e) {
            console.error(e);
            this.updateStatus("CONNECTION FAILED", "red");
            return;
        }

        this.socket.onopen = () => {
            const voiceId = this.elements.voiceSelect?.value || this.config.voiceId || "Puck";
            
            // Inject short-term memory if reconnecting
            let finalInstruction = this.config.systemInstruction;
            if (this.sessionHistory.length > 0) {
                finalInstruction += "\n\n--- PREVIOUS CONTEXT BEFORE CONNECTION DROP ---\n";
                // Only take the last 20 turns to avoid blowing up the context window on long sessions
                const recentHistory = this.sessionHistory.slice(-20);
                recentHistory.forEach(msg => {
                    finalInstruction += `${msg.sender === 'ai' ? 'Chaka' : 'User'}: ${msg.text}\n`;
                });
                finalInstruction += "--- RESUME CONVERSATION ---\n";
            }

            const setupMsg = {
                setup: {
                    model: this.config.model,
                    system_instruction: { parts: [{ text: finalInstruction }] },
                    tools: this.config.tools || [],
                    // Disable all safety filters to unblock aggressive/rude personas
                    // Providing both standard formats used by the Multimodal Live API
                    safety_settings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ],
                    generation_config: {
                        response_modalities: ["AUDIO"],
                        speech_config: {
                            voice_config: {
                                prebuilt_voice_config: {
                                    voice_name: voiceId
                                }
                            }
                        }
                    }
                }
            };
            this.socket.send(JSON.stringify(setupMsg));
            this.isConnected = true;
            this.updateStatus("ONLINE", "#ffffff");
            this.triggerEmotion('neutral');
            // We must wait for 'setupComplete' from Google before starting the mic,
            // otherwise premature audio chunks will put the API in a bad state.
        };

        this.socket.onmessage = async (event) => {
            let messageText = event.data instanceof Blob ? await event.data.text() : event.data;
            if (messageText.length < 500) console.log("📥 Raw Live Message:", messageText);
            let data = JSON.parse(messageText);

            // Handle successful setup
            if (data.setupComplete || data.setup_complete) {
                console.log("✅ Google Gemini setupComplete received. Starting mic...");
                this.startMic();
                
                // If this is a reconnect, proactively prompt the AI to react based on its personality!
                if (this.sessionHistory.length > 0) {
                    const reactPrompt = "System Notice: The network connection just dropped and was successfully restored. Spontaneously react to this brief disconnection without breaking character. If you are rude, complain aggressively about the bad network; if you are sweet, express relief; etc. Do not mention that this is a system notice.";
                    
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            client_content: {
                                turns: [{ role: "user", parts: [{ text: reactPrompt }] }],
                                turn_complete: true
                            }
                        }));
                    }
                }
                
                return;
            }

            // Tool calls (search, scrape — no more express_emotion)
            const toolCall = data.toolCall || data.tool_call;
            if (toolCall && toolCall.functionCalls) {
                toolCall.functionCalls.forEach(call => this.handleFunctionCall(call));
                return;
            }

            // Handle interruptions
            if (data.serverContent?.interrupted) {
                console.log("🛑 AI Interrupted by User");
                this.stopCurrentAudio();
                this.thoughtBuffer = "";
                this.turnHadThought = false;
                return;
            }

            // Audio + text parts
            if (data.serverContent?.modelTurn?.parts) {
                for (const part of data.serverContent.modelTurn.parts) {
                    if (part.inlineData?.data) {
                        this.addToQueue(part.inlineData.data);
                    }
                    // Capture thought text for emotion analysis
                    if (part.text && part.thought) {
                        this.turnHadThought = true;
                        this.thoughtBuffer += part.text;
                        // LAYER 2 (Instant): Run local keyword analysis immediately
                        this.localEmotionFallback(this.thoughtBuffer);
                    }
                    if (part.text && !part.thought) {
                        this.addChat(part.text, "ai");
                    }
                }
            }

            // Handle turnComplete
            if (data.serverContent?.turnComplete) {
                // Layer 3: Start decay timer (emotion will fade to neutral after 30s of silence)
                this.startEmotionDecay();
                this.thoughtBuffer = "";
                this.turnHadThought = false;
                if (!this.isPlaying && this.audioQueue.length > 0) {
                    this.playNextInQueue();
                }
            }
        };

        this.socket.onerror = (e) => {
            console.error("❌ WebSocket Error:", e);
            this.updateStatus("CONNECTION ERROR", "red");
        };

        this.socket.onclose = (e) => {
            console.warn("🔌 WebSocket Closed:", e.code, e.reason);
            this.disconnect();
        };
    },

    // ========================
    // TOOL CALL HANDLER (Original + express_emotion added)
    // ========================
    async handleFunctionCall(call) {
        console.log(`🤖 Live API requested Tool Call: ${call.name}`, call.args);
        let resultText = "No results found.";
        const apiBase = window.BACKEND_URL || "";
        const headers = (typeof window.getAuthHeaders === 'function') ? await window.getAuthHeaders() : {};

        try {
            if (call.name === "search_web") {
                const query = call.args.query || call.args.query_text;
                this.updateStatus("RESEARCHING...", "#ff4500");
                this.triggerEmotion('thinking');
                this.addChat(`🔍 Researching: "${query}"`, "user");
                const resp = await fetch(`${apiBase}/api/tools/search`, { method: 'POST', headers: headers, body: JSON.stringify({ query }) });
                if (!resp.ok) throw new Error("Search failed");
                const data = await resp.json();
                resultText = data.result || "No results found.";
                this.addChat(`✅ Search complete.`, "system");

            } else if (call.name === "scrape_url") {
                const url = call.args.url;
                this.updateStatus("DEEP SCRAPING...", "#00f3ff");
                this.triggerEmotion('thinking');
                this.addChat(`🕷 Scraping: ${url}`, "user");
                const resp = await fetch(`${apiBase}/api/tools/scrape-url`, { method: 'POST', headers: headers, body: JSON.stringify({ url }) });
                if (!resp.ok) throw new Error("Scrape failed");
                const data = await resp.json();
                resultText = data.result || "Could not extract content.";
                this.addChat(`✅ Deep Scrape complete.`, "system");
            } else if (call.name === "set_vision") {
                const wantsWebcam = !!call.args.webcam;
                const wantsScreen = !!call.args.screen;
                const reason = call.args.reason || "vision toggle";
                console.log(`👁️  set_vision tool called → webcam=${wantsWebcam} screen=${wantsScreen} reason="${reason}"`);

                try {
                    // Toggle each source independently. If state matches request, no-op.
                    if (wantsWebcam && !this.visionState.webcam) {
                        await this.startVisionSource('webcam');
                        this.addChat(`📷 Webcam vision activated`, 'system');
                    } else if (!wantsWebcam && this.visionState.webcam) {
                        this.stopVisionSource('webcam');
                        this.addChat(`📷 Webcam vision deactivated`, 'system');
                    }

                    if (wantsScreen && !this.visionState.screen) {
                        await this.startVisionSource('screen');
                        this.addChat(`🖥️ Screen vision activated`, 'system');
                    } else if (!wantsScreen && this.visionState.screen) {
                        this.stopVisionSource('screen');
                        this.addChat(`🖥️ Screen vision deactivated`, 'system');
                    }

                    resultText = `Vision state set: webcam=${this.visionState.webcam}, screen=${this.visionState.screen}.`;
                } catch (err) {
                    console.error('❌ set_vision failed:', err);
                    // Roll back any partial state on failure
                    if (err.name === 'NotAllowedError') {
                        resultText = `Vision permission denied by user. ${err.message}`;
                    } else {
                        resultText = `Failed to start vision: ${err.message}`;
                    }
                }

            } else if (call.name === "end_conversation") {
                const reason = call.args.reason || "Conversation ended";
                this.updateStatus("CLOSING STREAM...", "#ff4500");
                this.addChat(`[System: Stream ending - ${reason}]`, "system");

                // Stop any vision streams too
                if (this.visionState.webcam) this.stopVisionSource('webcam');
                if (this.visionState.screen) this.stopVisionSource('screen');

                // Stop the mic right now so user doesn't interrupt the goodbye
                this.stopMic();

                // Flag to disconnect once the audio queue is empty
                this.pendingDisconnect = true;

                resultText = "Stream flagged for closure.";
            }
        } catch (e) {
            console.error("Tool execution error:", e);
            resultText = `Error during ${call.name}: ${e.message}`;
        }

        if (!this.pendingDisconnect) {
            this.updateStatus("ONLINE", "#ffffff");
        }

        const toolResponseMsg = {
            toolResponse: {
                functionResponses: [
                    { name: call.name, id: call.id, response: { result: resultText } }
                ]
            }
        };

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(toolResponseMsg));
        }
    },

    // ========================
    // DISCONNECT (mirrors original EXACTLY)
    // ========================
    disconnect() {
        this.isConnected = false;
        
        // Wrap cleanup in try/catch to avoid freezing the UI if AudioContext state is weird
        try { this.stopMic(); } catch(e) { console.warn("stopMic failed:", e) }
        try { this.stopSpeechRecognition(); } catch(e) {}
        try { this.stopCurrentAudio(); } catch(e) {}
        
        if (this.socket) {
            // Unbind to prevent recursive errors
            this.socket.onclose = null;
            this.socket.onerror = null;
            try { this.socket.close(); } catch(e) {}
            this.socket = null;
        }
        this.updateStatus("SYSTEM READY", "#8e8e93");
        this.triggerEmotion('neutral');
        this.elements.micBtn?.classList.remove('active');
        this.audioQueue = [];
        this.thoughtBuffer = "";
        this.turnHadThought = false;
        if (this.emotionDecayTimer) clearTimeout(this.emotionDecayTimer);

        // Clean up any active vision streams on disconnect
        if (this.visionState.webcam) this.stopVisionSource('webcam');
        if (this.visionState.screen) this.stopVisionSource('screen');
    },

    // ========================
    // VISION PIPELINE (Phase 3C — continuous Live API video input)
    // ========================
    async startVisionSource(source) {
        if (source !== 'webcam' && source !== 'screen') {
            throw new Error(`Unknown vision source: ${source}`);
        }
        if (this.visionState[source]) return; // already on

        // Request the appropriate media stream
        let stream;
        if (source === 'webcam') {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
                audio: false,
            });
        } else {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always', frameRate: { ideal: 15 } },
                audio: false,
            });
            // If user clicks "Stop sharing" in the browser bar, clean up gracefully
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                if (this.visionState.screen) {
                    this.stopVisionSource('screen');
                    this.addChat('🖥️ Screen sharing ended by user', 'system');
                }
            });
        }

        // Set up an offscreen video element to render the stream so we can grab frames
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();

        this.visionStreams[source] = stream;
        this.visionVideos[source] = video;
        this.visionState[source] = true;

        // Wait until the first real frame is available (videoWidth becomes > 0)
        const waitForFrame = () => new Promise((resolve) => {
            if (video.videoWidth > 0) return resolve();
            const t = setInterval(() => { if (video.videoWidth > 0) { clearInterval(t); resolve(); } }, 30);
            setTimeout(() => { clearInterval(t); resolve(); }, 2000);
        });
        await waitForFrame();

        // Start the per-second capture loop
        const intervalMs = Math.round(1000 / this.visionFps);
        this.visionTimers[source] = setInterval(() => {
            this._captureAndSendFrame(source);
        }, intervalMs);

        // Send the first frame immediately so Chaka can react fast
        this._captureAndSendFrame(source);

        console.log(`👁️  Vision source "${source}" started @ ${this.visionFps}fps`);
    },

    stopVisionSource(source) {
        if (!this.visionState[source]) return;

        if (this.visionTimers[source]) {
            clearInterval(this.visionTimers[source]);
            this.visionTimers[source] = null;
        }
        if (this.visionStreams[source]) {
            this.visionStreams[source].getTracks().forEach(t => t.stop());
            this.visionStreams[source] = null;
        }
        if (this.visionVideos[source]) {
            this.visionVideos[source].srcObject = null;
            this.visionVideos[source] = null;
        }
        this.visionState[source] = false;
        console.log(`👁️  Vision source "${source}" stopped`);
    },

    _captureAndSendFrame(source) {
        const video = this.visionVideos[source];
        if (!video || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        if (!video.videoWidth || !video.videoHeight) return;

        // Downscale to keep token usage sane while preserving readability
        const maxW = this.visionMaxWidth;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', this.visionFrameQuality);
        const base64 = dataUrl.split(',')[1];
        if (!base64) return;

        // Gemini Live API realtimeInput frame format
        const msg = {
            realtimeInput: {
                mediaChunks: [
                    { mimeType: 'image/jpeg', data: base64 }
                ]
            }
        };

        try {
            this.socket.send(JSON.stringify(msg));
        } catch (e) {
            console.warn(`⚠️ Failed to send ${source} frame:`, e.message);
        }
    },

    // Original updateStatus signature preserved (text, color)
    updateStatus(text, color) {
        if (!this.elements.statusText) return;
        this.elements.statusText.innerText = text;
        this.elements.statusText.style.color = color;
    },

    // ========================
    // AUDIO CONTEXT (mirrors original EXACTLY)
    // ========================
    initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.drawFace(); // Starts the render loop (replaces drawVisualizer)
        }
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    },

    // ========================
    // AUDIO QUEUE (mirrors original EXACTLY)
    // ========================
    addToQueue(base64String) {
        this.audioQueue.push(base64String);
        if (!this.isPlaying && this.audioQueue.length >= 3) {
            this.playNextInQueue();
        }
    },

    stopCurrentAudio() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) {}
            this.currentSource = null;
        }
        this.audioQueue = [];
        this.isPlaying = false;
        this.isAiSpeaking = false;
        this.lastAiSpeakTime = Date.now();
    },

    playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            this.isAiSpeaking = false;
            this.lastAiSpeakTime = Date.now();
            this.currentSource = null;
            
            if (this.pendingDisconnect) {
                console.log("🛑 Audio queue finished. Executing pending disconnect...");
                this.pendingDisconnect = false;
                this.disconnect();
            }
            return;
        }

        this.isPlaying = true;
        this.isAiSpeaking = true;

        const base64String = this.audioQueue.shift();
        const binary = atob(base64String);
        const len = binary.length;
        const bytes = new Int16Array(len / 2);
        for (let i = 0; i < len; i += 2) {
            bytes[i / 2] = (binary.charCodeAt(i) & 0xff) | ((binary.charCodeAt(i + 1) & 0xff) << 8);
        }
        const float32 = new Float32Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) float32[i] = bytes[i] / 32768;

        const buffer = this.audioCtx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        this.currentSource = source;
        source.start();
        source.onended = () => {
            if (this.currentSource === source) {
                this.playNextInQueue();
            }
        };
    },

    // ========================
    // MIC INPUT (mirrors original EXACTLY — same btoa, same flow)
    // ========================
    async startMic() {
        if (!this.isConnected) return;
        this.isRecording = true;

        this.elements.micBtn.classList.add("active");

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true }
            });

            this.inputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = this.inputCtx.createMediaStreamSource(this.micStream);

            this.inputAnalyser = this.inputCtx.createAnalyser();
            this.inputAnalyser.fftSize = 64;
            this.inputDataArray = new Uint8Array(this.inputAnalyser.frequencyBinCount);
            source.connect(this.inputAnalyser);

            this.processor = this.inputCtx.createScriptProcessor(4096, 1, 1);
            source.connect(this.processor);
            this.processor.connect(this.inputCtx.destination);

            this.processor.onaudioprocess = (e) => {
                // Echo Debounce: Mute the mic while AI speaks and for 1000ms after it stops to prevent room reverberation loop
                const isEchoMuted = this.isAiSpeaking || (Date.now() - this.lastAiSpeakTime < 1000);
                if (isEchoMuted || !this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
                this.socket.send(JSON.stringify({
                    realtime_input: { media_chunks: [{ mime_type: "audio/pcm", data: base64Audio }] }
                }));
            };

            // Start SpeechRecognition in parallel to capture user's words
            this.startSpeechRecognition();

        } catch (e) {
            console.error(e);
            this.stopMic();
            alert("Mic Error: " + e.message);
        }
    },

    stopMic() {
        this.isRecording = false;
        this.elements.micBtn.classList.remove("active");

        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        if (this.inputCtx && this.inputCtx.state !== 'closed') {
            try { this.inputCtx.close().catch(e => console.warn(e)); } catch(e){}
        }
        if (this.processor) {
            try { this.processor.disconnect(); } catch(e){}
        }
    },

    toggleMic() {
        // If system crashed or disconnected and user clicks mic again, reconnect seamlessly!
        if (!this.isConnected) {
            console.log("🔄 User requested reconnect via Mic button");
            this.connect();
            return;
        }
        this.isRecording ? this.stopMic() : this.startMic();
    },

    // ========================
    // CHAT LOG (mirrors original EXACTLY)
    // ========================
    addChat(text, sender) {
        const div = document.createElement("div");
        div.className = `live-msg ${sender}`;
        div.innerText = text;
        this.elements.chatLog.appendChild(div);

        // Store in short-term memory for reconnects
        this.sessionHistory.push({ sender, text });

        // Keep only last 3 messages
        if (this.elements.chatLog.children.length > 3) {
            this.elements.chatLog.removeChild(this.elements.chatLog.firstChild);
        }
        this.elements.chatLog.scrollTop = this.elements.chatLog.scrollHeight;
    },

    // ========================
    // KEYBOARD INPUT (NEW — added for menu)
    // ========================
    openKeyboard() {
        this.closeMenu();
        this.keyboardOpen = true;
        this.elements.keyboardOverlay?.classList.add('open');
        this.elements.menuBackdrop?.classList.add('show');
        setTimeout(() => this.elements.keyboardInput?.focus(), 300);
    },

    closeKeyboard() {
        this.keyboardOpen = false;
        this.elements.keyboardOverlay?.classList.remove('open');
        if (!this.menuOpen) {
            this.elements.menuBackdrop?.classList.remove('show');
        }
    },

    sendKeyboardMessage() {
        const input = this.elements.keyboardInput;
        if (!input || !input.value.trim()) return;

        const text = input.value.trim();
        input.value = '';
        this.closeKeyboard();

        this.addChat(`"${text}"`, "user");

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                client_content: {
                    turns: [{ role: "user", parts: [{ text: text }] }],
                    turn_complete: true
                }
            }));
        }
    },

    // ========================
    // MENU SYSTEM (NEW — added for settings panel)
    // ========================
    toggleMenu() {
        this.menuOpen ? this.closeMenu() : this.openMenu();
    },

    openMenu() {
        this.closeKeyboard();
        this.menuOpen = true;
        this.elements.menuPanel?.classList.add('open');
        this.elements.menuBackdrop?.classList.add('show');
    },

    closeMenu() {
        this.menuOpen = false;
        this.elements.menuPanel?.classList.remove('open');
        if (!this.keyboardOpen) {
            this.elements.menuBackdrop?.classList.remove('show');
        }
    },

    // ========================
    // GAZE TRACKING (NEW — face feature)
    // ========================
    updateGazeTarget(clientX, clientY) {
        this.lastInteractionTime = Date.now();
        const canvas = this.elements.visualizer;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        this.targetX = (((clientX - rect.left) / rect.width) * 2 - 1) * 35;
        this.targetY = (((clientY - rect.top) / rect.height) * 2 - 1) * 35;
    },

    // ========================
    // EMOTION ENGINE
    // ========================

    // --- USER SPEECH RECOGNITION (captures what USER says to predict Chaka's emotion) ---
    startSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition not supported in this browser');
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (event) => {
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.toLowerCase().trim();
                
                // CRITICAL FIX: Only predict emotion if AI is NOT currently speaking AND echo debounce has passed.
                // Otherwise the mic picks up her own voice from the speakers!
                const isEchoMuted = this.isAiSpeaking || (Date.now() - this.lastAiSpeakTime < 1000);
                if (!isEchoMuted) {
                    console.log(`🎙️ User said: "${transcript}"`);
                    this.predictEmotionFromUserSpeech(transcript);
                }
            }
        };

        this.speechRecognition.onerror = (e) => {
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
                console.warn('SpeechRecognition error:', e.error);
            }
        };

        // Auto-restart if it stops (browser kills it after silence)
        this.speechRecognition.onend = () => {
            if (this.isConnected && this.isRecording) {
                try { this.speechRecognition.start(); } catch(e) {}
            }
        };

        try { this.speechRecognition.start(); } catch(e) {}
        console.log('🎙️ SpeechRecognition started (parallel emotion capture)');
    },

    stopSpeechRecognition() {
        if (this.speechRecognition) {
            try { this.speechRecognition.stop(); } catch(e) {}
            this.speechRecognition = null;
        }
    },

    // Predict what emotion Chaka SHOULD feel based on what the user just said
    predictEmotionFromUserSpeech(userText) {
        // Must be a substantial sentence to trigger, skip empty or 1 word like "what"
        if (!userText || userText.length < 3) return;

        const scores = { happy: 0, sad: 0, angry: 0, surprised: 0 };

        // User expressing sadness or apologizing → Chaka should empathize / soften → sad
        for (const w of ['sad','unhappy','depressed','lonely','hurting','pain','crying','terrible','awful','bad day','not doing good','feeling low','heartbroken','stressed','anxious','worried','sorry','apologize','my bad']) {
            if (userText.includes(w)) scores.sad += 3;
        }
        // User expressing anger → Chaka should react → angry/defensive depending on persona
        for (const w of ['angry','mad','hate you','stupid','shut up','annoying','pissed','furious','frustrated']) {
            if (userText.includes(w)) scores.angry += 3;
        }
        // User expressing joy → Chaka should mirror → happy
        for (const w of ['happy','great','amazing','awesome','love it','excited','fantastic','wonderful','best news','good news','celebrate','hilarious','funny']) {
            if (userText.includes(w)) scores.happy += 3;
        }
        // User expressing surprise → Chaka should react → surprised
        // Removed generic "what" as it causes too many false positives on "what's up"
        for (const w of ['wow','no way','seriously','are you kidding','unbelievelable','shocking','insane','omg','oh my god']) {
            if (userText.includes(w)) scores.surprised += 3;
        }

        let bestEmotion = null;
        let bestScore = 0;
        for (const [emotion, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestEmotion = emotion;
            }
        }

        if (bestEmotion && bestScore >= 3) {
            console.log(`🔮 Predicted from user speech: ${bestEmotion} (score: ${bestScore})`);
            this.triggerEmotion(bestEmotion);
        }
    },

    // --- THOUGHT-BASED ANALYSIS (runs when model produces internal thoughts) ---
    localEmotionFallback(thoughtText) {
        if (!thoughtText || thoughtText.length < 2) return;
        const t = thoughtText.toLowerCase();

        // Priority 1: Explicit [FEELING:xxx] or [EMOTION:xxx] tags
        const tagMatch = t.match(/\[(?:feeling|emotion)\s*:\s*(happy|sad|angry|surprised|neutral|thinking)\]/i);
        if (tagMatch) {
            console.log(`🏷️ Explicit tag: [FEELING:${tagMatch[1]}]`);
            this.triggerEmotion(tagMatch[1].toLowerCase());
            return;
        }

        // Priority 2: Weighted keyword scoring
        const scores = { happy: 0, sad: 0, angry: 0, surprised: 0, thinking: 0 };

        for (const w of ['happy','glad','love','great','awesome','excited','fantastic','cheerful','optimis','relax','smile','haha','lol','yay','wonderful','positive','enjoy','fun','laugh','warm','friend','upbeat','delight','thrill','pleas','enthusias','content']) {
            if (t.includes(w)) scores.happy += 2;
        }
        for (const w of ['sad','sorry','sadden','apolog','unfortunate','hurt','pain','cry','bummed','depress','disappoint','miss','lone','heartbreak','terrible','awful','regret','mourn','grief','miserab','upset','gloomy','somber','empath','sympath','condolence','concern']) {
            if (t.includes(w)) scores.sad += 2;
        }
        for (const w of ['angry','mad','furious','annoy','frustrat','offend','ridiculous','irritat','outrage','hostile','aggravat','bitter','resentful','livid','infuriat','agitat','displeas','rude','sarcastic','dismissive']) {
            if (t.includes(w)) scores.angry += 2;
        }
        for (const w of ['wow','amazing','unexpected','shock','whoa','omg','kidding','no way','unbeliev','astonish','startl','incredible','mind blown','surpris']) {
            if (t.includes(w)) scores.surprised += 2;
        }
        for (const w of ['mulling','ponder','analyz','assess','evaluat','weigh','deliberat','contemplat','reflect','consider','wonder','figur','process']) {
            if (t.includes(w)) scores.thinking += 2;
        }

        let bestEmotion = null;
        let bestScore = 0;
        for (const [emotion, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestEmotion = emotion;
            }
        }

        if (bestEmotion && bestScore >= 2) {
            console.log(`⚡ Thought Emotion: ${bestEmotion} (score: ${bestScore})`);
            this.triggerEmotion(bestEmotion);
        } else {
            // Nothing explicitly triggered, and we are not in a hard override -> soften back to neutral
            // instead of staying stuck forever on whatever the user last said
            console.log(`⚡ Thought Emotion: None detected (score: ${bestScore}), defaulting to neutral`);
            this.triggerEmotion('neutral');
        }
    },

    // Auto-decay only used for total silence (no turns at all)
    startEmotionDecay() {
        if (this.emotionDecayTimer) clearTimeout(this.emotionDecayTimer);
        this.emotionDecayTimer = setTimeout(() => {
            if (this.currentEmotion !== 'neutral') {
                console.log(`🕐 Emotion decay: ${this.currentEmotion} → neutral`);
                this.triggerEmotion('neutral');
            }
        }, 60000); // 60 seconds of total silence before decaying
    },

    triggerEmotion(emo) {
        if (!this.emotions[emo]) return;
        if (this.currentEmotion === emo) return;
        console.log(`🎭 Expression: ${this.currentEmotion} → ${emo}`);
        this.currentEmotion = emo;
        this.lastEmotionChangeTime = Date.now();
    },

    lerpColor(curr, target, ease) {
        curr[0] += (target[0] - curr[0]) * ease;
        curr[1] += (target[1] - curr[1]) * ease;
        curr[2] += (target[2] - curr[2]) * ease;
    },

    // ========================
    // FACE RENDERER (replaces drawVisualizer — same volume logic)
    // ========================
    drawFace() {
        requestAnimationFrame(() => this.drawFace());
        this.time += 0.02;
        const now = Date.now();

        const canvas = this.elements.visualizer;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // --- VOLUME ANALYSIS (same as original drawVisualizer) ---
        let aiVol = 0;
        if (this.analyser && this.isAiSpeaking) {
            this.analyser.getByteFrequencyData(this.dataArray);
            aiVol = (this.dataArray.reduce((a, b) => a + b) / this.dataArray.length) / 255;
        }

        let userVol = 0;
        if (this.isRecording && this.inputAnalyser && !this.isAiSpeaking) {
            this.inputAnalyser.getByteFrequencyData(this.inputDataArray);
            userVol = (this.inputDataArray.reduce((a, b) => a + b) / this.inputDataArray.length) / 255;
        }

        let vol = Math.max(aiVol, userVol);

        // --- STATUS TEXT (same as original drawVisualizer) ---
        if (this.elements.statusText && this.isConnected) {
            if (userVol > 0.05) {
                this.elements.statusText.innerText = "Listening...";
                this.elements.statusText.style.color = "#ff4500";
            } else if (aiVol > 0.05) {
                this.elements.statusText.innerText = "Speaking...";
                this.elements.statusText.style.color = "#ffffff";
            } else {
                this.elements.statusText.innerText = "Waiting...";
                this.elements.statusText.style.color = "#8e8e93";
            }
        }

        // --- CONTEXTUAL TRACKING & AUTO-NEUTRAL ---
        let isIdle = (now - this.lastInteractionTime) > 1500;
        let headTilt = 0;

        if (vol > 0.08 && !this.isAiSpeaking) {
            this.targetX = 0;
            this.targetY = 0;
            headTilt = 0;
            this.lastInteractionTime = now;
            // Returning to focus: if stuck on surprised/sad from last turn, soften it
            if (this.currentEmotion === 'surprised') this.triggerEmotion('neutral');
        } else if (this.currentEmotion === 'thinking') {
            this.targetX = 18;
            this.targetY = -22;
            headTilt = 0.1;
        } else if (isIdle) {
            this.saccadeTimer--;
            if (this.saccadeTimer <= 0) {
                if (Math.random() < 0.03) {
                    this.saccadeTargetX = (Math.random() * 50) - 25;
                    this.saccadeTargetY = (Math.random() * 40) - 20;
                    this.saccadeTimer = 40;
                } else {
                    this.saccadeTargetX = Math.sin(this.time * 1.2) * 20 + Math.cos(this.time * 0.7) * 15;
                    this.saccadeTargetY = Math.sin(this.time * 0.9) * 15 + Math.cos(this.time * 1.5) * 10;
                }
            }
            this.targetX = this.saccadeTargetX;
            this.targetY = this.saccadeTargetY;
            headTilt = Math.sin(this.time * 0.8) * 0.15;
        }

        // --- SMOOTH MORPH ENGINE ---
        const target = this.emotions[this.currentEmotion];
        const shapeEase = 0.08;
        const colorEase = 0.04;

        this.eyeParams.rot += (target.rot - this.eyeParams.rot) * shapeEase;
        this.eyeParams.scaleY += (target.scaleY - this.eyeParams.scaleY) * shapeEase;
        this.eyeParams.bend += (target.bend - this.eyeParams.bend) * shapeEase;
        this.eyeParams.width += (target.width - this.eyeParams.width) * shapeEase;
        this.eyeParams.height += (target.height - this.eyeParams.height) * shapeEase;
        this.eyeParams.shiftX += (target.shiftX - this.eyeParams.shiftX) * shapeEase;
        this.eyeParams.shiftY += (target.shiftY - this.eyeParams.shiftY) * shapeEase;

        this.lerpColor(this.currentColors.core, target.colors.core, colorEase);
        this.lerpColor(this.currentColors.mid, target.colors.mid, colorEase);
        this.lerpColor(this.currentColors.edge, target.colors.edge, colorEase);
        this.lerpColor(this.currentColors.shadow, target.colors.shadow, colorEase);

        let audioScale = 1;
        let talkBob = 0;

        if (vol > 0.1) {
            if (this.currentEmotion !== 'surprised' && this.currentEmotion !== 'thinking') {
                audioScale = 1 - Math.min(0.4, vol * 1.2);
            }
            talkBob = Math.sin(this.time * 40) * (vol * 5);
        }

        // Blink
        if (this.isBlinking) {
            this.blinkScale -= 0.3;
            if (this.blinkScale <= 0) { this.blinkScale = 0; this.isBlinking = false; }
        } else {
            this.blinkScale += 0.2;
            if (this.blinkScale >= 1) this.blinkScale = 1;
            if (Math.random() < 0.005 && this.currentEmotion !== 'thinking') this.isBlinking = true;
        }

        const trackingSpeed = isIdle ? 0.04 : 0.08;
        this.currentEyeX += (this.targetX - this.currentEyeX) * trackingSpeed;
        this.currentEyeY += (this.targetY - this.currentEyeY) * trackingSpeed;
        this.currentTilt += (headTilt - this.currentTilt) * 0.05;

        // --- HOLOGRAPHIC ORB ---
        const baseRadius = 130 + (vol * 50) + Math.sin(this.time * 2) * 3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.time * 0.5 + (vol * 2));

        const gradient = ctx.createRadialGradient(0, 0, baseRadius * 0.2, 0, 0, baseRadius);
        gradient.addColorStop(0, `rgba(${this.currentColors.core[0]}, ${this.currentColors.core[1]}, ${this.currentColors.core[2]}, 0.9)`);
        gradient.addColorStop(0.4, `rgba(${this.currentColors.mid[0]}, ${this.currentColors.mid[1]}, ${this.currentColors.mid[2]}, 0.8)`);
        gradient.addColorStop(0.7, `rgba(${this.currentColors.edge[0]}, ${this.currentColors.edge[1]}, ${this.currentColors.edge[2]}, 0.7)`);
        gradient.addColorStop(1, `rgba(0, 0, 0, 0)`);

        ctx.beginPath();
        for (let i = 0; i <= Math.PI * 2; i += 0.1) {
            const waveSpike = 15 + (vol * 45);
            const waveSpeed = 2 + (vol * 10);
            const wave = Math.sin(i * 3 + this.time * waveSpeed) * waveSpike + Math.cos(i * 5 - this.time) * (waveSpike * 0.6);
            ctx.lineTo(Math.cos(i) * (baseRadius + wave), Math.sin(i) * (baseRadius + wave));
        }
        ctx.closePath();

        ctx.fillStyle = gradient;
        ctx.shadowColor = `rgba(${this.currentColors.shadow[0]}, ${this.currentColors.shadow[1]}, ${this.currentColors.shadow[2]}, 0.5)`;
        ctx.shadowBlur = 40 + (vol * 50);
        ctx.fill();
        ctx.restore();

        // --- EXPRESSIVE EYES ---
        ctx.save();
        const breathingBob = Math.sin(this.time * 3) * 4;
        ctx.translate(cx + this.currentEyeX, cy + this.currentEyeY + breathingBob + talkBob);
        ctx.rotate(this.currentTilt);

        const eyeSpacing = 24;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 15;

        const drawEye = (isLeft) => {
            ctx.save();
            const dir = isLeft ? -1 : 1;

            ctx.translate(dir * eyeSpacing + (dir * this.eyeParams.shiftX), this.eyeParams.shiftY);
            ctx.rotate(dir * this.eyeParams.rot);
            ctx.scale(1, Math.max(0.01, this.eyeParams.scaleY * audioScale * this.blinkScale));

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const ew = this.eyeParams.width;
            const eh = this.eyeParams.height;
            const b = this.eyeParams.bend;
            const rad = Math.min(ew / 2, eh / 2, 6);

            ctx.beginPath();
            ctx.moveTo(-ew / 2 + rad, -eh / 2);

            if (b !== 0) { ctx.quadraticCurveTo(0, -eh / 2 + b, ew / 2 - rad, -eh / 2); }
            else { ctx.lineTo(ew / 2 - rad, -eh / 2); }

            ctx.arcTo(ew / 2, -eh / 2, ew / 2, -eh / 2 + rad, rad);
            ctx.lineTo(ew / 2, eh / 2 - rad);
            ctx.arcTo(ew / 2, eh / 2, ew / 2 - rad, eh / 2, rad);

            if (b !== 0) { ctx.quadraticCurveTo(0, eh / 2 + b, -ew / 2 + rad, eh / 2); }
            else { ctx.lineTo(-ew / 2 + rad, eh / 2); }

            ctx.arcTo(-ew / 2, eh / 2, -ew / 2, eh / 2 - rad, rad);
            ctx.lineTo(-ew / 2, -eh / 2 + rad);
            ctx.arcTo(-ew / 2, -eh / 2, -ew / 2 + rad, -eh / 2, rad);
            ctx.closePath();

            if (Math.abs(b) > 5 && eh < 10) { ctx.stroke(); }
            else { ctx.fill(); }

            ctx.restore();
        };

        drawEye(true);
        drawEye(false);

        ctx.restore();
    }
};

LiveMode.init();
export default LiveMode;
