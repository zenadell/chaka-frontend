/**
 * Turso Client - Bridge between Frontend and Node.js Database Routes
 * Handles HTTP requests for data and real-time Socket.io events.
 * ALL data flows through this client — no direct Firestore access.
 */

class TursoClient {
    constructor() {
        this.socket = null;
        this.currentUserUid = null;
        
        // Callbacks for real-time events (Mimicking Firebase onSnapshot)
        this.onSessionAddedCallback = null;
        this.onSessionUpdatedCallback = null;
        this.onChatAddedCallback = null;
        this.onConfigUpdatedCallback = null;
    }

    // Lazily resolve URLs so we always get the correct backend URL
    get baseUrl() {
        const backend = window.BACKEND_URL || 'http://localhost:3000';
        return `${backend}/api/db`;
    }

    get socketUrl() {
        return window.BACKEND_URL || 'http://localhost:3000';
    }

    /**
     * Initialize Socket connection and authenticate with UID
     */
    connectSocket(uid) {
        if (!window.io) {
            console.error("Socket.io client library not loaded.");
            return;
        }
        
        this.currentUserUid = uid;
        this.socket = window.io(this.socketUrl);
        
        this.socket.on('connect', () => {
            console.log('🟢 Turso Real-Time Socket Connected');
            this.socket.emit('authenticate', uid);
        });

        this.socket.on('SESSION_ADDED', (session) => {
            if (this.onSessionAddedCallback) this.onSessionAddedCallback(session);
        });

        this.socket.on('SESSION_UPDATED', (data) => {
            if (this.onSessionUpdatedCallback) this.onSessionUpdatedCallback(data);
        });

        this.socket.on('CHAT_ADDED', (chat) => {
            if (this.onChatAddedCallback) this.onChatAddedCallback(chat);
        });

        this.socket.on('CONFIG_UPDATED', (config) => {
            if (this.onConfigUpdatedCallback) this.onConfigUpdatedCallback(config);
        });
    }

    // ═══════════════════════════════════════════════
    // USER ENDPOINTS
    // ═══════════════════════════════════════════════

    async getUser(uid) {
        const res = await fetch(`${this.baseUrl}/users/${uid}`);
        if (!res.ok) throw new Error('Failed to fetch user');
        return await res.json();
    }

    async getUserSettings(uid) {
        const res = await fetch(`${this.baseUrl}/users/${uid}/settings`);
        if (!res.ok) throw new Error('Failed to fetch user settings');
        return await res.json();
    }

    async updateUser(uid, data) {
        const res = await fetch(`${this.baseUrl}/users/${uid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update user');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // SESSION ENDPOINTS
    // ═══════════════════════════════════════════════

    async getSessions(uid) {
        const res = await fetch(`${this.baseUrl}/sessions/${uid}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');
        return await res.json();
    }

    async saveSession(uid, sessionId, title, personalityId) {
        const res = await fetch(`${this.baseUrl}/sessions/${uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, title, personalityId })
        });
        if (!res.ok) throw new Error('Failed to save session');
        return await res.json();
    }

    async getSessionDetails(uid, sessionId) {
        const res = await fetch(`${this.baseUrl}/sessions/${uid}/${sessionId}`);
        if (!res.ok) throw new Error('Failed to fetch session details');
        return await res.json();
    }

    async updateSession(uid, sessionId, data) {
        const res = await fetch(`${this.baseUrl}/sessions/${uid}/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update session');
        return await res.json();
    }

    async updateSessionTitle(uid, sessionId, title) {
        return this.updateSession(uid, sessionId, { title });
    }

    // ═══════════════════════════════════════════════
    // CHAT ENDPOINTS
    // ═══════════════════════════════════════════════

    async getChats(uid, sessionId) {
        const res = await fetch(`${this.baseUrl}/chats/${uid}/${sessionId}`);
        if (!res.ok) throw new Error('Failed to fetch chats');
        return await res.json();
    }

    async saveChat(uid, sessionId, messageId, sender, text, imageUrls = null, attachedFiles = null, internal = false) {
        const res = await fetch(`${this.baseUrl}/chats/${uid}/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId, sender, text, image_urls: imageUrls, attached_files: attachedFiles, internal })
        });
        if (!res.ok) throw new Error('Failed to save chat');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // CONFIG ENDPOINTS (replaces Firestore config/global)
    // ═══════════════════════════════════════════════

    async getConfig() {
        const res = await fetch(`${this.baseUrl}/config`);
        if (!res.ok) throw new Error('Failed to fetch config');
        return await res.json();
    }

    async updateConfig(data) {
        const res = await fetch(`${this.baseUrl}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update config');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // PERSONALITY ENDPOINTS (replaces Firestore personalities)
    // ═══════════════════════════════════════════════

    async getPersonalities() {
        const res = await fetch(`${this.baseUrl}/personalities`);
        if (!res.ok) throw new Error('Failed to fetch personalities');
        return await res.json();
    }

    async savePersonality(data) {
        const res = await fetch(`${this.baseUrl}/personalities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to save personality');
        return await res.json();
    }

    async deletePersonality(id) {
        const res = await fetch(`${this.baseUrl}/personalities/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete personality');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // ANNOUNCEMENT ENDPOINTS
    // ═══════════════════════════════════════════════

    async getLatestAnnouncement() {
        const res = await fetch(`${this.baseUrl}/announcements/latest`);
        if (!res.ok) throw new Error('Failed to fetch announcement');
        return await res.json();
    }

    async saveAnnouncement(data) {
        const res = await fetch(`${this.baseUrl}/announcements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to save announcement');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // RAG CHUNKS ENDPOINTS
    // ═══════════════════════════════════════════════

    async getChunks(uid) {
        const res = await fetch(`${this.baseUrl}/chunks/${uid}`);
        if (!res.ok) throw new Error('Failed to fetch chunks');
        return await res.json();
    }

    async saveChunks(uid, chunks) {
        const res = await fetch(`${this.baseUrl}/chunks/${uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunks })
        });
        if (!res.ok) throw new Error('Failed to save chunks');
        return await res.json();
    }

    async deleteChunksByFileId(uid, fileId) {
        const res = await fetch(`${this.baseUrl}/chunks/${uid}/${fileId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete chunks');
        return await res.json();
    }

    // ═══════════════════════════════════════════════
    // REAL-TIME SUBSCRIPTION METHODS
    // ═══════════════════════════════════════════════

    onSessionAdded(callback) { this.onSessionAddedCallback = callback; }
    onSessionUpdated(callback) { this.onSessionUpdatedCallback = callback; }
    onChatAdded(callback) { this.onChatAddedCallback = callback; }
    onConfigUpdated(callback) { this.onConfigUpdatedCallback = callback; }
}

window.tursoClient = new TursoClient();
