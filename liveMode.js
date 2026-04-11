/**
 * liveMode.js - Real-time Voice Chat Module (Live Stream Mode)
 * Uses Multimodal Live API via WebSockets.
 * Upgraded with High-Fidelity Particle Visualizer (Lumix/Chaka V5 Style)
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

    // INPUT
    inputCtx: null,
    processor: null,
    micStream: null,
    inputAnalyser: null,
    inputDataArray: null,

    // Config from backend
    config: null,

    // DOM cache
    elements: {},

    // Visualizer State
    particles: [],
    angleOffset: 0,

    init() {
        console.log("🎙 LiveMode Initializing...");
        this.cacheElements();
        this.attachListeners();
    },

    cacheElements() {
        this.elements = {
            overlay: document.getElementById('live-mode-overlay'),
            visualizer: document.getElementById('live-visualizer'),
            chatLog: document.getElementById('live-chat-log'),
            micBtn: document.getElementById('live-mic-btn'),
            connectBtn: document.getElementById('live-connect-btn'),
            exitBtn: document.getElementById('live-exit-btn'),
            statusText: document.getElementById('live-status-text'),
            connStatus: document.getElementById('live-conn-status'),
            // Optional chaining added in logic below for removed elements
            micStatus: document.getElementById('live-mic-status'), 
            volMeter: document.getElementById('live-vol-meter'),
            volBar: document.getElementById('live-vol-bar'),
            triggerBtn: document.getElementById('live-mode-btn'),
            personaName: document.getElementById('live-persona-name')
        };
    },

    attachListeners() {
        this.elements.triggerBtn?.addEventListener('click', () => this.open());
        this.elements.exitBtn?.addEventListener('click', () => this.close());
        this.elements.connectBtn?.addEventListener('click', () => this.toggleConnection());
        this.elements.micBtn?.addEventListener('click', () => this.toggleMic());
    },

    async open() {
        this.elements.overlay.classList.add('active');
        this.updateStatus("READY", "#8e8e93");
        
        if (this.elements.connectBtn) {
            this.elements.connectBtn.disabled = true;
            this.elements.connectBtn.style.opacity = "0.5";
            this.elements.connectBtn.innerText = "WAIT...";
        }

        try {
            this.updateStatus("CONFIGURING...", "#ff4500");
            const headers = (typeof getAuthHeaders === 'function') ? await getAuthHeaders() : {};

            const persona = window.state?.selectedPersonalityId || localStorage.getItem('selectedPersonalityId') || "";
            const userId = window.state?.userId || "";
            const sessionId = window.state?.sessionId || "";

            const apiBase = window.BACKEND_URL || "";
            const voiceId = window.botConfig?.ttsVoiceId || "Puck";
            const url = `${apiBase}/api/tools/live/config?persona=${encodeURIComponent(persona)}&userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}&voiceId=${encodeURIComponent(voiceId)}`;
            const resp = await fetch(url, { headers });
            if (!resp.ok) throw new Error("Failed to fetch Live Mode configuration");

            this.config = await resp.json();
            
            if (this.elements.personaName && this.config.personaName) {
                this.elements.personaName.innerText = `${this.config.personaName} // LIVE`;
                console.log(`✅ Live HUD Updated to: ${this.config.personaName}`);
            }

            console.log("💎 Live Mode Config Loaded:", { 
                personaId: persona,
                personaName: this.config.personaName,
                voiceId: this.config.voiceId,
                instructionLength: this.config.systemInstruction?.length || 0 
            });

            if (this.elements.connectBtn) {
                this.elements.connectBtn.disabled = false;
                this.elements.connectBtn.style.opacity = "1";
                this.elements.connectBtn.innerText = "Wake";
            }

            this.updateStatus("READY", "#ffffff");
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
        this.elements.overlay.classList.remove('active');
    },

    async toggleConnection() {
        this.isConnected ? this.disconnect() : await this.connect();
    },

    async connect() {
        if (!this.config) return alert("Configuration missing.");

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
            const setupMsg = {
                setup: {
                    model: this.config.model,
                    system_instruction: { parts: [{ text: this.config.systemInstruction }] },
                    tools: this.config.tools || [],
                    generation_config: {
                        response_modalities: ["AUDIO"],
                        speech_config: {
                            voice_config: {
                                prebuilt_voice_config: {
                                    voice_name: this.config.voiceId || "Puck"
                                }
                            }
                        }
                    }
                }
            };
            this.socket.send(JSON.stringify(setupMsg));
            this.isConnected = true;
            this.updateStatus("ONLINE", "#ffffff");
            if(this.elements.connectBtn) this.elements.connectBtn.innerText = "Sleep";
            this.startMic();
        };

        this.socket.onmessage = async (event) => {
            let messageText = event.data instanceof Blob ? await event.data.text() : event.data;
            if (messageText.length < 500) console.log("📥 Raw Live Message:", messageText); 
            let data = JSON.parse(messageText);

            const toolCall = data.toolCall || data.tool_call;
            if (toolCall && toolCall.functionCalls) {
                toolCall.functionCalls.forEach(call => this.handleFunctionCall(call));
                return;
            }

            if (data.serverContent?.interrupted) {
                console.log("🛑 AI Interrupted by User");
                this.stopCurrentAudio();
                return;
            }

            if (data.serverContent?.modelTurn?.parts) {
                for (const part of data.serverContent.modelTurn.parts) {
                    if (part.inlineData?.data) {
                        this.addToQueue(part.inlineData.data);
                    }
                    if (part.text) {
                        this.addChat(part.text, "ai");
                    }
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

    async handleFunctionCall(call) {
        // [Unchanged - Kept exactly as you wrote it]
        console.log(`🤖 Live API requested Tool Call: ${call.name}`, call.args);
        let resultText = "No results found.";
        const apiBase = window.BACKEND_URL || "";
        const headers = (typeof window.getAuthHeaders === 'function') ? await window.getAuthHeaders() : {};

        try {
            if (call.name === "search_web") {
                const query = call.args.query || call.args.query_text;
                this.updateStatus("RESEARCHING...", "#ff4500");
                this.addChat(`🔍 Researching: "${query}"`, "user");
                const resp = await fetch(`${apiBase}/api/tools/search`, { method: 'POST', headers: headers, body: JSON.stringify({ query }) });
                if (!resp.ok) throw new Error("Search failed");
                const data = await resp.json();
                resultText = data.result || "No results found.";
                this.addChat(`✅ Search complete.`, "system");
            } else if (call.name === "scrape_url") {
                const url = call.args.url;
                this.updateStatus("DEEP SCRAPING...", "#00f3ff");
                this.addChat(`🕷 Scraping: ${url}`, "user");
                const resp = await fetch(`${apiBase}/api/tools/scrape-url`, { method: 'POST', headers: headers, body: JSON.stringify({ url }) });
                if (!resp.ok) throw new Error("Scrape failed");
                const data = await resp.json();
                resultText = data.result || "Could not extract content.";
                this.addChat(`✅ Deep Scrape complete.`, "system");
            }
        } catch (e) {
            console.error("Tool execution error:", e);
            resultText = `Error during ${call.name}: ${e.message}`;
        }

        this.updateStatus("ONLINE", "#ffffff");
        console.log(`✅ Sending Tool Response back to Live API:`, resultText.substring(0, 100) + '...');

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

    disconnect() {
        this.isConnected = false;
        this.stopMic();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.updateStatus("SYSTEM OFFLINE", "#8e8e93");
        if(this.elements.connectBtn) this.elements.connectBtn.innerText = "Wake";
        this.elements.micBtn.classList.remove('active'); // Updated to use the new CSS class
        this.audioQueue = []; 
    },

    updateStatus(text, color) {
        if (!this.elements.statusText) return;
        this.elements.statusText.innerText = text;
        this.elements.statusText.style.color = color;
    },

    initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.drawVisualizer(); // Starts the loop
        }
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    },

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
    },

    playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            this.isAiSpeaking = false;
            this.currentSource = null;
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

    async startMic() {
        if (!this.isConnected) return;
        this.isRecording = true;

        this.elements.micBtn.classList.add("active"); // Match new CSS

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
                if (this.isAiSpeaking || !this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

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

        } catch (e) {
            console.error(e);
            this.stopMic();
            alert("Mic Error: " + e.message);
        }
    },

    stopMic() {
        this.isRecording = false;
        this.elements.micBtn.classList.remove("active");

        if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
        if (this.inputCtx) this.inputCtx.close();
        if (this.processor) this.processor.disconnect();
    },

    toggleMic() {
        this.isRecording ? this.stopMic() : this.startMic();
    },

    // ---------------------------------------------------------
    // THE NEW FLUID PARTICLE VISUALIZER (Lumix Style)
    // ---------------------------------------------------------
    drawVisualizer() {
        requestAnimationFrame(() => this.drawVisualizer());

        const canvas = this.elements.visualizer;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2;

        // Initialize particles once
        if (this.particles.length === 0) {
            const numParticles = 200;
            for (let i = 0; i < numParticles; i++) {
                this.particles.push({
                    angle: (i / numParticles) * Math.PI * 2,
                    baseRadius: 80 + Math.random() * 5,
                    size: 1 + Math.random() * 1.5,
                    noiseOffset: Math.random() * 100
                });
            }
        }

        ctx.clearRect(0, 0, w, h);

        // Get AI Output Volume
        let aiVol = 0;
        if (this.analyser && this.isAiSpeaking) {
            this.analyser.getByteFrequencyData(this.dataArray);
            aiVol = (this.dataArray.reduce((a, b) => a + b) / this.dataArray.length) / 255;
        }

        // Get User Mic Volume
        let userVol = 0;
        if (this.isRecording && this.inputAnalyser && !this.isAiSpeaking) {
            this.inputAnalyser.getByteFrequencyData(this.inputDataArray);
            userVol = (this.inputDataArray.reduce((a, b) => a + b) / this.inputDataArray.length) / 255;
        }

        // Determine Active State & Color
        let activeVol = 0;
        let particleColor = "rgba(142, 142, 147, 0.4)"; // Idle Gray
        
        if (userVol > 0.05) {
            activeVol = userVol;
            particleColor = "rgba(255, 69, 0, 0.9)"; // Brand Orange for User
        } else if (aiVol > 0.05) {
            activeVol = aiVol;
            particleColor = "rgba(255, 255, 255, 0.9)"; // Bright White for AI
        }

        // Rotate entire ring slowly over time, speed up when active
        this.angleOffset += 0.002 + (activeVol * 0.02);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angleOffset);

        // Render Particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            // Audio expands the particles outwards
            const expansion = activeVol * 45; 
            
            // Add sine-wave ripples for a fluid look
            const wave = Math.sin(p.angle * 6 + this.angleOffset * 5) * (activeVol * 15);
            const r = p.baseRadius + expansion + wave;
            
            const x = Math.cos(p.angle) * r;
            const y = Math.sin(p.angle) * r;

            ctx.beginPath();
            ctx.arc(x, y, p.size + (activeVol * 2), 0, Math.PI * 2);
            ctx.fillStyle = particleColor;
            
            // Add glow effect only when loud
            if (activeVol > 0.1) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = particleColor;
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.fill();
        }
        ctx.restore();

        // Update Text Context dynamically based on who is speaking
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
    },

    addChat(text, sender) {
        const div = document.createElement("div");
        div.className = `live-msg ${sender}`;
        div.innerText = text;
        this.elements.chatLog.appendChild(div);
        
        // Keep only last 3 messages so it doesn't clutter the dark UI
        if(this.elements.chatLog.children.length > 3) {
            this.elements.chatLog.removeChild(this.elements.chatLog.firstChild);
        }
        this.elements.chatLog.scrollTop = this.elements.chatLog.scrollHeight;
    }
};

LiveMode.init();
export default LiveMode;
