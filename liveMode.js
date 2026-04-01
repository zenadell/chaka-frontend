/**
 * liveMode.js - Real-time Voice Chat Module (Live Stream Mode)
 * Uses Multimodal Live API via WebSockets.
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
    currentSource: null, // Track currently playing source for interruptions

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
        this.updateStatus("READY", "#00f3ff");
        
        // Disable wake button until config is ready
        if (this.elements.connectBtn) {
            this.elements.connectBtn.disabled = true;
            this.elements.connectBtn.style.opacity = "0.5";
            this.elements.connectBtn.innerText = "WAIT...";
        }

        // Fetch config from backend
        try {
            this.updateStatus("CONFIGURING...", "yellow");
            // Note: getAuthHeaders must be globally available from script25.js
            const headers = (typeof getAuthHeaders === 'function') ? await getAuthHeaders() : {};

            // Get current state from script25.js
            const persona = window.state?.selectedPersonalityId || localStorage.getItem('selectedPersonalityId') || "";
            const userId = window.state?.userId || "";
            const sessionId = window.state?.sessionId || "";

            const apiBase = window.BACKEND_URL || "";
            const url = `${apiBase}/api/tools/live/config?persona=${encodeURIComponent(persona)}&userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}`;
            const resp = await fetch(url, { headers });
            if (!resp.ok) throw new Error("Failed to fetch Live Mode configuration");

            this.config = await resp.json();
            
            // Update UI with persona name
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

            // Re-enable wake button
            if (this.elements.connectBtn) {
                this.elements.connectBtn.disabled = false;
                this.elements.connectBtn.style.opacity = "1";
                this.elements.connectBtn.innerText = "Wake";
            }

            this.updateStatus("READY", "#00f3ff");
        } catch (e) {
            console.error(e);
            this.updateStatus("OFFLINE", "#aaa");
            if (window.showToastNotification) {
                window.showToastNotification({
                    message: "Live Mode Offline: " + e.message,
                    type: "error"
                });
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
        this.updateStatus("WAKING UP...", "yellow");

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
            this.updateStatus("ONLINE", "#0f0");
            this.elements.connectBtn.innerText = "Sleep";
            this.startMic();
        };

        this.socket.onmessage = async (event) => {
            let data = JSON.parse(event.data instanceof Blob ? await event.data.text() : event.data);

            // Handle Interruptions from Server
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

    disconnect() {
        this.isConnected = false;
        this.stopMic();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.updateStatus("SYSTEM OFFLINE", "#aaa");
        this.elements.connectBtn.innerText = "Wake";
        this.elements.micBtn.classList.remove('recording');
        this.audioQueue = []; // Clear queue on disconnect
    },

    updateStatus(text, color) {
        if (!this.elements.statusText) return;
        this.elements.statusText.innerText = text;
        this.elements.statusText.style.color = color;
        
        // Match the dot logic to the text
        const isActive = (text === "ONLINE" || text === "WAKING UP...");
        this.elements.connStatus?.classList.toggle("active", isActive);
    },

    initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.drawVisualizer();
        }
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    },

    addToQueue(base64String) {
        this.audioQueue.push(base64String);
        
        // JITTER BUFFER: Wait for at least 3 chunks to be queued before starting playback
        // This prevents cracking due to network jitter.
        if (!this.isPlaying && this.audioQueue.length >= 3) {
            this.playNextInQueue();
        }
    },

    stopCurrentAudio() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
            this.currentSource = null;
        }
        this.audioQueue = []; // Clear remaining chunks
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

        this.currentSource = source; // Track for interruptions
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

        this.elements.micBtn.classList.add("recording");
        this.elements.micStatus.innerText = "[MIC: ACTIVE]";
        this.elements.micStatus.style.color = "#0f0";
        this.elements.volMeter.style.display = "block";

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true
                }
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
        this.elements.micBtn.classList.remove("recording");
        this.elements.micStatus.innerText = "[MIC: OFF]";
        this.elements.micStatus.style.color = "#555";
        this.elements.volMeter.style.display = "none";

        if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
        if (this.inputCtx) this.inputCtx.close();
        if (this.processor) this.processor.disconnect();
    },

    toggleMic() {
        this.isRecording ? this.stopMic() : this.startMic();
    },

    drawVisualizer() {
        requestAnimationFrame(() => this.drawVisualizer());

        const canvas = this.elements.visualizer;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2;

        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            const outEnergy = (this.dataArray.reduce((a, b) => a + b) / this.dataArray.length) / 255;

            ctx.clearRect(0, 0, w, h);
            const radius = 50 + (outEnergy * 50);

            ctx.shadowBlur = 20;
            ctx.shadowColor = `rgb(0, 243, 255)`;
            ctx.fillStyle = `rgba(0, 243, 255, 0.8)`;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.isRecording && this.inputAnalyser) {
            this.inputAnalyser.getByteFrequencyData(this.inputDataArray);
            const vol = this.inputDataArray.reduce((a, b) => a + b) / this.inputDataArray.length;
            const percent = Math.min(100, (vol / 128) * 100);
            this.elements.volBar.style.width = percent + "%";

            if (vol > 20) {
                ctx.shadowColor = `rgb(255, 0, 85)`;
                ctx.fillStyle = `rgba(255, 0, 85, 0.2)`;
                ctx.beginPath();
                ctx.arc(cx, cy, 60 + (vol / 5), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    addChat(text, sender) {
        const div = document.createElement("div");
        div.className = `live-msg ${sender}`;
        div.innerText = text;
        this.elements.chatLog.appendChild(div);
        this.elements.chatLog.scrollTop = this.elements.chatLog.scrollHeight;
    }
};

// Initialize when the module loads
LiveMode.init();

// Export for potential external use
export default LiveMode;
