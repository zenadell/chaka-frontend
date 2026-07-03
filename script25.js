// --- ✅ [MIGRATED] FIREBASE AUTH-ONLY + TURSO FOR ALL DATA ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// --- HELPER: Get Auth Headers ---
async function getAuthHeaders() {
    if (!auth.currentUser) throw new Error("User not logged in");
    const token = await auth.currentUser.getIdToken(/* forceRefresh */ false);
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}
window.getAuthHeaders = getAuthHeaders; // ✅ Exposing for external scripts (like LiveMode)

const firebaseConfig = {
    apiKey: "AIzaSyCBBm3pHDVgUYs2BTzwVwtTwC-cOAFjKWo",
    authDomain: "chakachaka-e672a.firebaseapp.com",
    projectId: "chakachaka-e672a",
    storageBucket: "chakachaka-e672a.firebasestorage.app",
    messagingSenderId: "226377707807",
    appId: "1:226377707807:web:08f207a259c4e75ab8402a",
    measurementId: "G-14NQJL3Q1J"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Firebase Auth instance (ONLY Firebase dependency)

// --- ✅ Markdown rendering settings (ChatGPT/Gemini-style line breaks) ---
if (window.marked && typeof marked.use === 'function') {
    marked.use({ breaks: true, gfm: true });
}

// --- PDF.js WORKER SETUP (UNCHANGED) ---
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
}

// --- ⚙️ GLOBAL CONFIGURATION (RAG + Backend) ---
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const explicitBackendUrl = window.__BACKEND_URL__ ? String(window.__BACKEND_URL__).trim() : '';
const defaultBackendUrl = isLocal ? 'http://localhost:3000' : 'https://chaka-backend-eh02.onrender.com';

const APP_CONFIG = {
    BACKEND_URL: explicitBackendUrl || defaultBackendUrl,
    RAG_BATCH_SIZE: 5,
    RAG_SIMILARITY_THRESHOLD: 0.4
};

// --- ✅ [NEW] RAG & VECTOR STORE IMPORTS ---
import * as VectorStore from './vector_store.js';

// --- ✅ [NEW] GLOBAL RAG WORKER & STATE ---
const BACKEND_URL = APP_CONFIG.BACKEND_URL;
window.BACKEND_URL = BACKEND_URL;
const ragWorker = new Worker('./rag_worker.js');
try {
    ragWorker.postMessage({
        type: 'config',
        backend: BACKEND_URL,
        batchSize: APP_CONFIG.RAG_BATCH_SIZE,
        similarityThreshold: APP_CONFIG.RAG_SIMILARITY_THRESHOLD
    });
} catch (e) {
    console.warn('Failed to post config to RAG worker:', e);
}
let allIndexedChunks = []; // Cache of all chunks for immediate search
let ragContextForNextMessage = []; // Holds context between search and send

// --- ✅ [NEW] RAG WORKER MESSAGE HANDLER ---
/**
 * Handles all messages coming from the RAG Web Worker.
 * This is the central orchestrator for RAG operations.
 */
ragWorker.onmessage = async (e) => {
    const { type, fileId, indexedChunks, query: searchQuery, context, status, message, error } = e.data || {};
    try {
        // STATUS updates (progress / batch / general)
        if (type === 'STATUS') {
            console.log('RAG Worker Status:', status);
            const statusFileId = message?.fileId || fileId;

            if (statusFileId) {
                let progress = null;
                let displayMessage = status || '';

                const batchMatch = (status || '').match(/batch (\d+)\s*of\s*(\d+)/i);
                if (batchMatch && batchMatch[1] && batchMatch[2]) {
                    const batchNum = parseInt(batchMatch[1], 10);
                    const totalBatches = parseInt(batchMatch[2], 10);
                    if (!isNaN(batchNum) && !isNaN(totalBatches) && totalBatches > 0) {
                        progress = (batchNum / totalBatches) * 100;
                        displayMessage = `Indexing: Batch ${batchNum}/${totalBatches}`;
                    }
                } else if ((status || '').toLowerCase().includes('chunking')) {
                    progress = 10;
                    displayMessage = 'Chunking...';
                } else if ((status || '').toLowerCase().includes('embedding')) {
                    progress = 20;
                    displayMessage = 'Embedding...';
                }

                updateFilePreviewStatus(statusFileId, 'processing_rag', displayMessage, progress);
            } else {
                showToastNotification({ message: status || 'RAG status update', icon: LOADER_SVG_ICON, duration: 4000 });
            }

        } else if (type === 'EMBEDDING_RESULT') {
            // Embeddings produced by worker: persist and update UI/cache
            console.log(`Embeddings generated for file ${fileId}. Total chunks: ${Array.isArray(indexedChunks) ? indexedChunks.length : 0}`);

            try {
                if (Array.isArray(indexedChunks) && indexedChunks.length > 0) {
                    await saveChunks(indexedChunks);
                } else {
                    console.warn('No indexedChunks provided by worker for EMBEDDING_RESULT.');
                }

                allIndexedChunks = await getAllChunks();

                const fileObject = selectedFiles.find(f => f.id === fileId);
                if (fileObject) {
                    fileObject.status = 'completed_rag';
                    console.log(`Updated selectedFiles status for ${fileId} to completed_rag`);
                } else {
                    console.warn(`Could not find file ${fileId} in selectedFiles to update status.`);
                }

                updateFilePreviewStatus(fileId, 'completed_rag');
                checkSendButtonState();

                showToastNotification({
                    message: `File processed and added to memory.`,
                    icon: '🧠',
                    duration: 5000
                });
            } catch (error) {
                console.error(`Failed to save RAG chunks to Firestore:`, error);
                let userMessage = 'Failed to save file to cloud memory.';

                if (error && error.code === 'permission-denied') {
                    userMessage = '⚠️ Permission denied. Could not save file memory.';
                } else if (error && error.message && error.message.includes('chunkId')) {
                    userMessage = '⚠️ Data processing error. Could not save file.';
                } else if (error && error.code === 'resource-exhausted') {
                    userMessage = '⚠️ Cloud storage quota exceeded. Could not save file.';
                } else {
                    userMessage = `⚠️ Error: ${error?.message || 'Could not save file.'}`;
                }

                const fileObject = selectedFiles.find(f => f.id === fileId);
                if (fileObject) {
                    fileObject.status = 'error';
                    fileObject.error = userMessage;
                }

                updateFilePreviewStatus(fileId, 'error', userMessage);
                checkSendButtonState();

                showToastNotification({ message: userMessage, type: 'error', duration: 15000 });
            }

        } else if (type === 'SEARCH_RESULT') {
            // RAG search returned context -> call LLM
            console.log('RAG Vector Search Context:', context);

            // Use helper function to build system prompt and update request payload
            await buildSystemPromptAndUpdatePayload(context);

            executeApiRequestLoop();


        } else if (type === 'FATAL_ERROR') {
            console.error('RAG Worker Fatal Error:', message);
            showToastNotification({ message: message || 'Fatal RAG error', type: 'error', duration: 15000 });

            if (fileId) {
                updateFilePreviewStatus(fileId, 'error', { message: 'Model load failed' });
                checkSendButtonState();
            }

            if (searchQuery && !autoRetryState.isActive) {
                ragContextForNextMessage = [];
                console.warn("RAG model failed to load, proceeding without RAG context for query:", searchQuery);
                // Trigger fallback handling as if SEARCH_RESULT returned empty context
                ragWorker.onmessage({ data: { type: 'SEARCH_RESULT', query: searchQuery, context: [] } });
            }

        } else if (type === 'ERROR') {
            console.error('RAG Worker Error:', message, error);
            if (fileId) {
                updateFilePreviewStatus(fileId, 'error', { message: error || message });
            }
            if (searchQuery) {
                ragContextForNextMessage = [];
                // Trigger fallback as if SEARCH_RESULT returned empty context
                ragWorker.onmessage({ data: { type: 'SEARCH_RESULT', query: searchQuery, context: [] } });
            }

        } else {
            // Unknown message type: log for debugging
            console.warn('RAG Worker sent unknown message type:', type, e?.data);
        }

    } catch (err) {
        console.error("Error in RAG worker onmessage handler:", err);
        if (autoRetryState.isActive && autoRetryState.botMessageElements && autoRetryState.botMessageElements.botMessageContent) {
            try {
                autoRetryState.botMessageElements.botMessageContent.innerHTML = `<p>⚠️ A critical error occurred in the RAG system. Please try again.</p>`;
            } catch (_) { }
            cleanupAfterLoop();
        }
    }
};


// --- ✅ [MIGRATED] RAG TURSO STORAGE LOGIC ---

/**
 * Saves a batch of indexed chunks to Turso via backend API.
 */
async function saveChunks(chunks) {
    if (!state.userId) throw new Error("User not authenticated for saving chunks.");

    // 1) Save to local IndexedDB cache (fast, free)
    try {
        await VectorStore.saveChunks(chunks);
        console.log(`Cached ${chunks.length} chunks locally.`);
    } catch (err) {
        console.warn("Failed to save chunks to local cache:", err);
    }

    // 2) Save to Turso (persistent backup via backend)
    const tursoChunks = chunks.map(c => ({
        chunk_id: c.chunkId || crypto.randomUUID(),
        fileId: c.fileId || c.metadata?.fileId || '',
        text: c.text || '',
        metadata: c.metadata || {}
    }));

    console.log(`Saving ${chunks.length} chunks to Turso...`);
    await window.tursoClient.saveChunks(state.userId, tursoChunks);
    console.log("Batch save complete.");
}

/**
 * Retrieves all indexed chunks for the current user from Firestore.
 */
async function getAllChunks() {
    if (!state.userId) {
        console.warn("No user ID, cannot fetch chunks.");
        return [];
    }

    // 1) Try local cache first
    try {
        const localChunks = await VectorStore.getAllChunks();
        if (Array.isArray(localChunks) && localChunks.length > 0) {
            console.log(`Loaded ${localChunks.length} chunks from local cache.`);
            return localChunks;
        }
    } catch (err) {
        console.warn("Local cache read failed, falling back to Turso:", err);
    }

    // 2) Fallback to Turso backend
    const chunks = await window.tursoClient.getChunks(state.userId);
    console.log(`Fetched ${chunks.length} chunks from Turso.`);

    // 3) Re-populate local cache for next time
    if (chunks.length > 0) {
        try {
            await VectorStore.saveChunks(chunks);
            console.log(`Downloaded ${chunks.length} chunks to local cache.`);
        } catch (err) {
            console.warn("Failed to save chunks to local cache:", err);
        }
    }

    return chunks;
}

/**
 * Removes all chunks associated with a specific fileId via Turso.
 */
export async function removeChunksByFileId(fileId) {
    if (!state.userId) {
        console.warn("No user ID, cannot remove chunks.");
        return;
    }

    // 1) Remove from local cache
    try {
        await VectorStore.removeChunksByFileId(fileId);
        console.log(`Removed local cache chunks for fileId ${fileId}.`);
    } catch (err) {
        console.warn("Failed to remove chunks from local cache:", err);
    }

    // 2) Remove from Turso
    await window.tursoClient.deleteChunksByFileId(state.userId, fileId);
    console.log(`Deleted chunks for fileId ${fileId} from Turso.`);
}
// --- END OF RAG TURSO LOGIC ---


// --- ✅ [MODIFIED] DOM ELEMENTS (Added Toast Container & Continue Button) ---
const DOMElements = {
    body: document.body,
    sidebar: document.getElementById('sidebar'),
    sessionList: document.getElementById('session-list'),
    menuBtn: document.getElementById('menu-btn'),
    overlay: document.getElementById('overlay'),
    chatTitle: document.getElementById('chat-title'),
    botAvatar: document.getElementById('bot-avatar'),
    chatMessages: document.getElementById('chat-messages'),
    composer: document.getElementById('composer'),
    scrollToBottomBtn: document.getElementById('scroll-to-bottom'),
    newChatSidebarBtn: document.getElementById('new-chat-sidebar-btn'),

    // ... (inside DOMElements)
    clearHistoryBtn: document.getElementById('clear-history-btn'), // ID is same, but moved
    signOutBtn: document.getElementById('sign-out-btn'), // ID is same, but moved

    // ✅ [NEW] User Profile Elements
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    userEmail: document.getElementById('user-email'),
    userSettingsBtn: document.getElementById('user-settings-btn'),
    userSettingsPopup: document.getElementById('user-settings-popup'),
    userProfileEmail: document.getElementById('user-profile-email'),
    userProfilePlan: document.getElementById('user-profile-plan'),
    userProfileJoined: document.getElementById('user-profile-joined'),
    manageAccountBtn: document.getElementById('manage-account-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    themeText: document.getElementById('theme-text'),
    // ---

    composerActionsBtn: document.getElementById('composer-actions-btn'),
    composerActionsPopup: document.getElementById('composer-actions-popup'),
    personalityList: document.getElementById('personality-list'),
    fileUploadWrapper: document.getElementById('file-upload-wrapper'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    statusRow: document.getElementById('status-row'),
    themeSegments: document.querySelectorAll('.theme-segment'),
    voiceSelect: document.getElementById('voice-selection-dropdown'), // ✅ [NEW] Voice Selection Dropdown
    apiStatusRow: document.getElementById('api-status-row'),
    personalityPreviewModal: document.getElementById('personality-preview-modal'),
    // ... (rest of DOMElements)

    previewPersonalityName: document.getElementById('preview-personality-name'),
    previewVideo: document.getElementById('preview-video'),
    confirmPersonalitySwitchBtn: document.getElementById('confirm-personality-switch-btn'),
    cancelPersonalitySwitchBtn: document.getElementById('cancel-personality-switch-btn'),
    tourOverlay: document.getElementById('tour-overlay'),
    tourSpotlight: document.querySelector('.tour-spotlight'),
    tourTooltip: document.querySelector('.tour-tooltip'),
    tourTitle: document.getElementById('tour-title'),
    tourText: document.getElementById('tour-text'),
    tourPrevBtn: document.getElementById('tour-prev-btn'),
    tourNextBtn: document.getElementById('tour-next-btn'),
    tourFinishBtn: document.getElementById('tour-finish-btn'),
    tourStepCounter: document.getElementById('tour-step-counter'),
    welcomeTourModal: document.getElementById('welcome-tour-modal'),
    startTourBtn: document.getElementById('start-tour-btn'),
    skipTourBtn: document.getElementById('skip-tour-btn'),
    announcementPopup: document.getElementById('announcement-popup'),
    announcementMedia: document.getElementById('announcement-media'),
    announcementTitle: document.getElementById('announcement-title'),
    announcementDescription: document.getElementById('announcement-description'),
    announcementReadMoreBtn: document.getElementById('announcement-read-more-btn'),
    announcementCloseBtn: document.getElementById('announcement-close-btn'),
    announcementDetailsModal: document.getElementById('announcement-details-modal'),
    announcementDetailsContent: document.getElementById('announcement-details-content'),
    announcementDetailsCloseBtn: document.getElementById('announcement-details-close-btn'),
    exportModal: document.getElementById('export-modal'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    exportTxtBtn: document.getElementById('export-txt-btn'),
    exportCloseBtn: document.getElementById('export-close-btn'),
    exportConfirmationModal: document.getElementById('export-confirmation-modal'),
    exportConfirmationMessage: document.getElementById('export-confirmation-message'),
    viewExportedFileBtn: document.getElementById('view-exported-file-btn'),
    // ✨ [CORRECTED] Changed ID to be unique. Please update your HTML file.
    exportConfirmationContinueBtn: document.getElementById('export-continue-chat-btn'),
    // ✨ [MODIFIED] No longer using the full-screen loading modal for PDFs
    exportLoadingModal: document.getElementById('export-loading-modal'),
    exportLoadingText: document.getElementById('export-loading-text'),
    // ✨ [NEW] Toast notification container (requires HTML element)
    toastContainer: document.getElementById('toast-container'),
    audioVisualizer: document.getElementById('global-audio-visualizer'),
    liveModeBtn: document.getElementById('live-mode-btn'),
};


function closeAnnouncementModals() {
    if (DOMElements.announcementPopup) DOMElements.announcementPopup.classList.add('hidden');
    if (DOMElements.announcementDetailsModal) DOMElements.announcementDetailsModal.classList.add('hidden');

    const isAnotherModalOpen = !DOMElements.personalityPreviewModal.classList.contains('hidden') ||
        !document.getElementById('continuation-modal').classList.contains('hidden') ||
        !DOMElements.exportModal.classList.contains('hidden') ||
        !DOMElements.exportConfirmationModal.classList.contains('hidden') ||
        !DOMElements.welcomeTourModal.classList.contains('hidden');
    if (!isAnotherModalOpen) {
        DOMElements.overlay.classList.remove('show');
    }
}


// --- ✅ [NEW] CONSTANTS FOR LOADER & ICONS ---
const LOADER_SVG_ICON = `<svg class="toast-loader-svg" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`;
const PDF_LINK_LOADER_ICON = `<svg class="link-loader-svg" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`;
const PDF_LINK_SUCCESS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 10-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`;
const PDF_LINK_ERROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 10-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>`;

// --- ✅ [NEW] BEAUTIFUL CUSTOM SELECT UI ---
/**
 * Transforms a native <select> element into a beautiful custom UI.
 * @param {HTMLSelectElement} nativeSelect - The select element to transform
 */
function initCustomSelect(nativeSelect) {
    if (!nativeSelect || nativeSelect.dataset.customized) return;
    nativeSelect.dataset.customized = 'true';
    nativeSelect.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'chaka-custom-select-wrapper';

    const trigger = document.createElement('div');
    trigger.className = 'chaka-custom-select-trigger';

    const triggerText = document.createElement('span');
    const selectedOption = nativeSelect.options[nativeSelect.selectedIndex] || nativeSelect.options[0];
    triggerText.textContent = selectedOption ? selectedOption.text : 'Select...';

    const arrow = document.createElement('div');
    arrow.innerHTML = `<svg class="arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    trigger.appendChild(triggerText);
    trigger.appendChild(arrow.firstChild);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'chaka-custom-select-options';

    const updateOptionsUI = () => {
        optionsContainer.innerHTML = '';
        Array.from(nativeSelect.options).forEach((option, index) => {
            const optDiv = document.createElement('div');
            optDiv.className = 'chaka-custom-option';
            if (nativeSelect.selectedIndex === index) optDiv.classList.add('selected');
            optDiv.textContent = option.text;
            
            optDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                nativeSelect.selectedIndex = index;
                triggerText.textContent = option.text;
                nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                wrapper.classList.remove('open');
                updateOptionsUI();
            });
            optionsContainer.appendChild(optDiv);
        });
    };
    updateOptionsUI();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.chaka-custom-select-wrapper').forEach(w => w.classList.remove('open'));
        if (!isOpen) wrapper.classList.add('open');
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });

    // Listen to native select changes (e.g. changed via code)
    nativeSelect.addEventListener('change', () => {
        const currentlySelected = nativeSelect.options[nativeSelect.selectedIndex];
        if (currentlySelected) triggerText.textContent = currentlySelected.text;
        updateOptionsUI();
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsContainer);
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);
}

// Make it globally available so educationMode.js can use it
window.initCustomSelect = initCustomSelect;


// --- ✅ [NEW] NON-BLOCKING TOAST NOTIFICATION SYSTEM ---
/**
 * Displays a non-blocking toast notification.
 * @param {object} options - The options for the toast.
 * @param {string} options.message - The message to display.
 * @param {string} [options.icon=''] - The SVG icon string.
 * @param {number} [options.duration=7000] - Duration in ms before auto-closing.
 * @param {string} [options.type='info'] - Type of toast ('info', 'error', 'success').
 */
function showToastNotification({ message, icon = '', duration = 8000, type = 'info' }) {
    if (!DOMElements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    // Add entering animation
    toast.classList.add('entering');

    toast.innerHTML = `
        ${icon ? `<div class="toast-icon">${icon}</div>` : ''}
        <div class="toast-message">${message}</div>
        <button class="toast-close-btn" title="Close">&times;</button>
    `;

    DOMElements.toastContainer.appendChild(toast);

    const close = () => {
        toast.classList.add('exiting');
        // Remove the element after the exit animation completes
        toast.addEventListener('animationend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        });
    };

    toast.querySelector('.toast-close-btn').onclick = close;
    setTimeout(close, duration);

    // Remove entering class after animation so it doesn't conflict with exiting
    toast.addEventListener('animationend', () => {
        toast.classList.remove('entering');
    }, { once: true });
}
window.showToastNotification = showToastNotification;

// --- [ADDED THIS HELPER FUNCTION] ---
/**
 * Removes a specific toast notification by its ID.
 * Assumes toast IDs are set correctly when shown.
 */
function removeToastNotification(toastId) {
    const toastElement = document.getElementById(toastId);
    if (toastElement && toastElement.parentElement === DOMElements.toastContainer) {
        // Trigger exit animation and remove
        toastElement.classList.add('exiting');
        toastElement.addEventListener('animationend', () => {
            if (toastElement.parentElement) {
                toastElement.remove();
            }
        }, { once: true });
    }
}
// --- [END ADD HELPER FUNCTION] ---


// --- ✅ [MODIFIED] APPLICATION STATE (Added messageIdToExport) ---
let state = {
    userId: null,
    sessionId: null,
    selectedPersonalityId: null,
    defaultPersonalityId: null,
    personalitiesUnsub: null,
    firstMessageSaved: false,
    titleGenerated: false,
    sessionsUnsub: null,
    messagesUnsub: null,
    configPromise: null,
    currentTheme: localStorage.getItem('chatTheme') || 'system',
    triggers: [],
    triggerUnsub: null,
    sessionWasPreviouslyBlocked: false,
    subtleNoteShown: false,
    announcementUnsub: null,
    currentAnnouncement: null,
    elementToExport: null,
    messageIdToExport: null, // ✨ [NEW] Store message ID for manual exports
    lastExportedFile: null,
};
window.state = state;
window.triggerEventAutoResponse = triggerEventAutoResponse;
window.waitForAutoIdle = waitForAutoIdle;

// --- ✨ [NEW] IN-SESSION CACHE FOR GENERATED FILES (UNCHANGED) ---
const exportedFileCache = new Map();

// --- STATE FOR AUTOMATED API RETRY PROCESS (UNCHANGED) ---
let autoRetryState = {
    isActive: false,
    stopRequested: false,
    requestPayload: null,
    botMessageElements: null
};
let fetchController;

// --- GLOBAL STATE FOR MULTIPLE FILE UPLOADS (UNCHANGED) ---
let selectedFiles = [];

// --- TTS (TEXT-TO-SPEECH) PLAYBACK STATE ---
let currentAudio = null;
let currentTtsButton = null;
let ttsAudioCtx = null;
let ttsNextStartTime = 0;
let lastInputWasVoice = false;


// --- botConfig with TTS properties (UNCHANGED) ---
let botConfig = {
    botName: "chaka",
    themeColor: "#f97316",
    allowFileUpload: false,
    apiKey: "",
    apiKeys: {},
    ttsApiKey: null,
    ttsVoiceId: "Puck",
    persona: "",
    welcomeMessage: "How can I help you today?",
    botBubbleColor: "",
    userBubbleColor: "linear-gradient(135deg, #10b981, #059669)",
    active: true,
    profileImage: "",
    showSubtleNotes: true,
    blockReminderNote: "",
    promptSuggestions: []
};
window.botConfig = botConfig;

// --- ✨ [MODIFIED] Full-screen loading modal (Now only for TXT) ---
function showExportLoadingModal(message = 'Processing...') {
    if (!DOMElements.exportLoadingModal) return;
    DOMElements.exportLoadingText.textContent = message;
    DOMElements.exportLoadingModal.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
}

function hideExportLoadingModal() {
    if (!DOMElements.exportLoadingModal) return;
    DOMElements.exportLoadingModal.classList.add('hidden');
    const isAnotherModalOpen = !DOMElements.exportConfirmationModal.classList.contains('hidden');
    if (!isAnotherModalOpen) {
        DOMElements.overlay.classList.remove('show');
    }
}

// --- EXPORT CONFIRMATION LOGIC (UNCHANGED) ---
function showExportConfirmationModal(fileType, fileUrl) {
    if (!DOMElements.exportConfirmationModal) return;

    state.lastExportedFile = { type: fileType, url: fileUrl };
    DOMElements.exportConfirmationMessage.textContent = `${fileType} file has been successfully created.`;
    DOMElements.exportConfirmationModal.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
}

function hideExportConfirmationModal() {
    if (!DOMElements.exportConfirmationModal) return;

    // ✨ [REMOVED] Blob URLs are no longer stored here long-term, so revoking isn't the main concern.
    // Cloudinary URLs don't need to be revoked.
    state.lastExportedFile = null;
    DOMElements.exportConfirmationModal.classList.add('hidden');

    const isAnotherModalOpen = !DOMElements.personalityPreviewModal.classList.contains('hidden') ||
        !document.getElementById('continuation-modal').classList.contains('hidden') ||
        !DOMElements.welcomeTourModal.classList.contains('hidden') ||
        !DOMElements.announcementPopup.classList.contains('hidden') ||
        !DOMElements.exportModal.classList.contains('hidden');
    if (!isAnotherModalOpen) {
        DOMElements.overlay.classList.remove('show');
    }
}


// --- ✅ [MODIFIED] EXPORT/DOWNLOAD LOGIC ---
function showExportModal(contentElement, messageId = null) {
    state.elementToExport = contentElement;
    state.messageIdToExport = messageId; // ✨ [NEW] Store message ID
    DOMElements.exportModal.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
}

function hideExportModal() {
    state.elementToExport = null;
    state.messageIdToExport = null; // ✨ [NEW] Clear message ID
    DOMElements.exportModal.classList.add('hidden');
    const isAnotherModalOpen = !DOMElements.personalityPreviewModal.classList.contains('hidden') ||
        !document.getElementById('continuation-modal').classList.contains('hidden') ||
        !DOMElements.welcomeTourModal.classList.contains('hidden') ||
        !DOMElements.announcementPopup.classList.contains('hidden');
    if (!isAnotherModalOpen) {
        DOMElements.overlay.classList.remove('show');
    }
}

// TXT export remains largely the same as it's fast.
async function exportAsTxt(contentElement, triggerDownload = true) {
    if (!contentElement) return null;
    showExportLoadingModal('Generating TXT...'); // Uses fast modal
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const textContent = contentElement.innerText || contentElement.textContent;
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        if (triggerDownload) {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chat-export.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // Clean up blob URL after download
        }

        hideExportModal();
        return url;
    } catch (error) {
        console.error("TXT export process failed:", error);
        alert("Sorry, there was an error creating the text file.");
        return null;
    } finally {
        hideExportLoadingModal();
    }
}


// this is for web search ability

// --- [PASTE THIS CORRECT, COMPLETE FUNCTION] ---
/**
 * ✅ [CORRECTED] Performs a web search using the Serper.dev API.
 * Returns formatted results or a distinct failure message.
 * @param {string} query The search query.
 * @param {string} apiKey The Serper API key.
 * @returns {Promise<string>} A formatted string of search results or a failure indicator.
 */
async function performWebSearch(query, apiKey) {
    console.log(`Performing web search for: "${query}"`);

    if (!apiKey) {
        console.error("Web search failed: Serper API key is missing.");
        // Return a clear failure indicator for the LLM
        return `[SEARCH_FAILED: API key not configured]`;
    }

    try {
        // *** THIS IS THE CORRECTED FETCH SYNTAX ***
        const response = await fetch('https://google.serper.dev/search', { // Comma and opening brace
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: query })
        }); // Closing brace for options object

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Serper API Error Response:", response.status, errorBody);
            // Return a clear failure indicator
            return `[SEARCH_FAILED: API Error ${response.status}]`;
        }

        const data = await response.json();

        if (!data.organic || data.organic.length === 0) {
            console.log("Web search returned no organic results.");
            // Return a clear indicator of no results
            return "[SEARCH_NO_RESULTS]";
        }

        // Format the results cleanly for the AI model
        let formattedResults = "Here are the web search results:\n\n";
        data.organic.slice(0, 5).forEach((result, index) => {
            formattedResults += `[Result ${index + 1}]\n`;
            formattedResults += `Title: ${result.title}\n`;
            formattedResults += `Link: ${result.link}\n`;
            formattedResults += `Snippet: ${result.snippet}\n\n`;
        });

        return formattedResults; // Success case

    } catch (error) {
        // Catch network errors specifically
        console.error("Web search failed (Network/Fetch Error):", error);
        // Return a clear failure indicator for network or other errors
        return `[SEARCH_FAILED: Network error - ${error.message}]`;
    }
}
// --- [END OF REPLACEMENT BLOCK] ---



/**
 * ✅ [REWRITTEN] Generates a PDF, uploads it to Cloudinary for persistence, caches it, and returns the URL.
 * @param {HTMLElement} contentElement The element to export.
 * @param {string|null} messageId The ID of the message for caching purposes.
 * @returns {Promise<string>} The permanent Cloudinary URL of the generated PDF.
 */
async function exportAsPdf(contentElement, messageId = null) {
    if (!contentElement) {
        throw new Error("Content element for PDF export not found.");
    }

    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const { jsPDF } = window.jspdf;
        const theme = DOMElements.body.dataset.theme;
        const originalBg = contentElement.parentElement.style.backgroundColor;
        const originalColor = contentElement.style.color;

        if (theme === 'dark') {
            contentElement.parentElement.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-dark');
            contentElement.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-primary-dark');
        } else {
            contentElement.parentElement.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-light');
            contentElement.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-primary-light');
        }

        const canvas = await html2canvas(contentElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: (theme === 'dark' ? '#303030' : '#faf9f7'),
            onclone: (doc) => {
                doc.querySelectorAll('.message-content a').forEach(link => {
                    link.style.color = '#4f46e5';
                });
            }
        });

        contentElement.parentElement.style.backgroundColor = originalBg;
        contentElement.style.color = originalColor;

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

        const blob = pdf.output('blob');
        const pdfFile = new File([blob], `chat-export-${Date.now()}.pdf`, { type: 'application/pdf' });

        // Upload to Cloudinary to get a permanent URL, specifying 'raw' for non-media files.
        const url = await uploadFileToCloudinary(pdfFile, 'raw');

        // Cache the permanent URL against the message ID.
        if (messageId) {
            exportedFileCache.set(messageId, url);
        }

        return url; // Return the permanent URL on success

    } catch (err) {
        console.error("PDF export process failed:", err);
        throw err;
    }
}


// --- ANNOUNCEMENT LOGIC (UNCHANGED) ---

function showAnnouncementDetails(announcement) {
    if (!DOMElements.announcementDetailsModal || !announcement) return;
    DOMElements.announcementDetailsContent.innerHTML = marked.parse(announcement.fullContent || 'No details available.');
    DOMElements.announcementDetailsModal.classList.remove('hidden');
    if (DOMElements.announcementPopup) DOMElements.announcementPopup.classList.add('hidden');
    DOMElements.overlay.classList.add('show');
}
function showAnnouncementPopup(announcement) {
    if (!DOMElements.announcementPopup || !announcement) return;
    state.currentAnnouncement = announcement;

    DOMElements.announcementTitle.textContent = announcement.title || 'Announcement';
    DOMElements.announcementDescription.textContent = announcement.description || '';

    DOMElements.announcementMedia.innerHTML = '';
    let mediaElement;
    if (announcement.mediaType === 'video' && announcement.mediaUrl) {
        mediaElement = document.createElement('video');
        mediaElement.src = announcement.mediaUrl;
        mediaElement.autoplay = true;
        mediaElement.muted = true;
        mediaElement.loop = true;
        mediaElement.playsInline = true;
    } else if (announcement.mediaType === 'image' && announcement.mediaUrl) {
        mediaElement = document.createElement('img');
        mediaElement.src = announcement.mediaUrl;
        mediaElement.alt = announcement.title || 'Announcement Image';
    }

    if (mediaElement) {
        DOMElements.announcementMedia.appendChild(mediaElement);
        DOMElements.announcementMedia.classList.remove('hidden');
    } else {
        DOMElements.announcementMedia.classList.add('hidden');
    }
    DOMElements.announcementPopup.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
}
function handleAnnouncementData(announcement) {
    const isActive = announcement.active === 1 || announcement.active === true || announcement.isActive;
    if (!announcement || !isActive || !announcement.id) {
        return;
    }
    const shownThisSession = sessionStorage.getItem('announcementShownThisSession') === announcement.id;
    if (shownThisSession) {
        return;
    }
    const viewCountKey = `announcement_views_${announcement.id}`;
    let viewCount = parseInt(localStorage.getItem(viewCountKey) || '0');
    if (viewCount >= 3) {
        return;
    }
    setTimeout(() => {
        showAnnouncementPopup(announcement);
        viewCount++;
        localStorage.setItem(viewCountKey, viewCount.toString());
        sessionStorage.setItem('announcementShownThisSession', announcement.id);
    }, 5000);
}
function initAnnouncementListener() {
    // Poll Turso for announcements instead of Firestore onSnapshot
    async function checkAnnouncement() {
        try {
            const announcement = await window.tursoClient.getLatestAnnouncement();
            if (announcement && announcement.active !== false) {
                handleAnnouncementData(announcement);
            }
        } catch (e) {
            console.warn('Announcement fetch failed:', e);
        }
    }
    checkAnnouncement();
    // Re-check every 5 minutes
    setInterval(checkAnnouncement, 5 * 60 * 1000);
}


// --- API KEY MANAGEMENT (UNCHANGED) ---
const apiKeyManager = {
    keys: [],
    currentIndex: 0,
    usageTimestamps: new Map(),
    initialize(apiKeysConfig) {
        this.keys = Object.entries(apiKeysConfig || {})
            .filter(([, val]) => val && val.type === 'text' && val.enabled !== false && val.key)
            .map(([id, val]) => ({ id, key: val.key.trim() }));
        this.usageTimestamps.clear();
        this.keys.forEach(k => this.usageTimestamps.set(k.id, []));
        if (this.currentIndex >= this.keys.length) this.currentIndex = 0;
        console.log(`API Key Manager Initialized/Updated with ${this.keys.length} keys.`);
    },
    getCurrentKey() {
        if (this.keys.length === 0) return null;
        return { ...this.keys[this.currentIndex], index: this.currentIndex };
    },
    switchToNextKey() {
        if (this.keys.length === 0) return null;
        const oldIndex = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.warn(`Switched API key from index ${oldIndex} to ${this.currentIndex}.`);
        return this.getCurrentKey();
    },
    recordUsage(keyId) {
        if (!this.usageTimestamps.has(keyId)) return;
        const now = Date.now();
        const timestamps = this.usageTimestamps.get(keyId);
        timestamps.push(now);
        const sixtySecondsAgo = now - 60000;
        this.usageTimestamps.set(keyId, timestamps.filter(ts => ts > sixtySecondsAgo));
    },
    getUsageInfo(keyId) {
        if (!this.usageTimestamps.has(keyId)) return { count: 0, isRateLimited: false, timeLeft: 0 };
        const now = Date.now();
        const sixtySecondsAgo = now - 60000;
        const timestamps = this.usageTimestamps.get(keyId).filter(ts => ts > sixtySecondsAgo);
        const count = timestamps.length;
        const isRateLimited = count >= 5;
        let timeLeft = 0;
        if (isRateLimited) {
            const oldestTimestampInWindow = timestamps[0];
            timeLeft = Math.ceil((oldestTimestampInWindow + 60000 - now) / 1000);
        }
        return { count, isRateLimited, timeLeft: Math.max(0, timeLeft) };
    }
};

// --- LIVE STATUS REPORTING (UNCHANGED) ---
async function updateLiveStatus(keyId) {
    // Status reporting now goes through the backend config API
    try {
        const config = await window.tursoClient.getConfig();
        const liveStatus = config.liveStatus || {};
        liveStatus.activeApiKeyId = keyId;
        liveStatus.apiKeyUsage = liveStatus.apiKeyUsage || {};
        liveStatus.apiKeyUsage[keyId] = new Date().toISOString();
        config.liveStatus = liveStatus;
        await window.tursoClient.updateConfig(config);
    } catch (e) {
        console.warn("Could not update live API key status", e);
    }
}
async function reportKeyFailure(keyId) {
    try {
        const config = await window.tursoClient.getConfig();
        const liveStatus = config.liveStatus || {};
        liveStatus.apiKeyFailures = liveStatus.apiKeyFailures || {};
        liveStatus.apiKeyFailures[keyId] = new Date().toISOString();
        config.liveStatus = liveStatus;
        await window.tursoClient.updateConfig(config);
    } catch (e) { console.warn("Could not report key failure", e); }
}

// --- UTILITIES (UNCHANGED) ---
const sanitize = (s) => typeof s === 'string' ? s.trim() : '';
const autosize = (el) => {
    const wrapper = document.getElementById('input-wrapper');
    if (!wrapper) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        return;
    }
    el.style.transition = 'none';
    const currentHeight = el.clientHeight;
    wrapper.classList.remove('is-expanded');
    el.style.height = '60px';
    const needsExpansion = el.scrollHeight > 60 || el.value.includes('\n');
    if (needsExpansion) {
        wrapper.classList.add('is-expanded');
        el.style.height = '60px';
    }
    const targetHeight = Math.min(el.scrollHeight, 160);
    el.style.height = currentHeight + 'px';
    void el.offsetHeight;
    el.style.transition = 'height 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
    el.style.height = `${targetHeight}px`;
};
const parseBool = (v) => v === true || v === 'true';
const scrollToBottom = (behavior = 'auto') => { DOMElements.chatMessages.scrollTo({ top: DOMElements.chatMessages.scrollHeight, behavior }); };

const parseTextFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
};

const parseImageFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result.split(',')[1]);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

const parsePdfFile = (file) => {
    return new Promise((resolve, reject) => {
        if (!window.pdfjsLib) {
            return reject(new Error("PDF.js library is not loaded."));
        }
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const pdfData = new Uint8Array(event.target.result);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(fullText);
            } catch (error) {
                console.error("Error parsing PDF: ", error);
                reject('Could not read the content of the PDF file.');
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};



/* Yields control back to the event loop from the main thread. */
function yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
// --- [END ADD HELPER FUNCTION] ---



// --- API STATUS UI HELPER (UNCHANGED) ---
let apiStatusTimer;
function showApiStatus(message, duration = 4000) {
    if (!DOMElements.apiStatusRow) return;
    clearTimeout(apiStatusTimer);
    DOMElements.apiStatusRow.textContent = message;
    DOMElements.apiStatusRow.classList.remove('hidden');
    if (duration > 0) {
        apiStatusTimer = setTimeout(() => {
            DOMElements.apiStatusRow.classList.add('hidden');
        }, duration);
    }
}

// --- ✅ [MODIFIED] UPLOAD GENERIC FILE TO CLOUDINARY ---
async function uploadFileToCloudinary(file, resourceType = 'auto') {
    const CLOUDINARY_CLOUD_NAME = "dvjs45kft";
    const CLOUDINARY_UPLOAD_PRESET = "vevapvkv";
    // Use the generic 'upload' endpoint which auto-detects resource type
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || 'Failed to upload to Cloudinary.');
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload failed:", error);
        throw error;
    }
}



// --- [REPLACE] this entire function ---

function checkSendButtonState() {
    if (autoRetryState.isActive) {
        toggleSendButtonState('stop', false);
        return;
    }

    const hasText = DOMElements.messageInput.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;

    // ✅ [MODIFIED] Check for RAG processing state
    const isUploading = selectedFiles.some(f => f.status === 'uploading');
    const isProcessingRAG = selectedFiles.some(f => f.status === 'processing_rag');

    const hasCompletedFiles = selectedFiles.some(f => f.status === 'completed' || f.status === 'completed_rag');

    if (isUploading) {
        toggleSendButtonState('send', true); // Disable send button
        DOMElements.statusRow.textContent = "Uploading images...";
    } else if (isProcessingRAG) {
        // ✅ [NEW] Disable send button while indexing files
        toggleSendButtonState('send', true); // Disable send button
        DOMElements.statusRow.textContent = "🧠 Indexing files for AI memory...";
    } else {
        if (DOMElements.statusRow.textContent === "Uploading images..." || DOMElements.statusRow.textContent === "🧠 Indexing files for AI memory...") {
            const failedUploads = selectedFiles.filter(f => f.status === 'error').length;
            DOMElements.statusRow.textContent = failedUploads > 0 ? `⚠️ ${failedUploads} file(s) failed to upload.` : "Ready.";
        }

        if (hasText || hasCompletedFiles) {
            toggleSendButtonState('send', false);
        } else {
            toggleSendButtonState('mic', false);
        }
    }
}




// --- [REPLACE] this entire function ---

// --- [PASTE THIS ENTIRE NEW FUNCTION BLOCK] ---
/**
 * Updates the file preview item's visual state, including progress.
 */
function updateFilePreviewStatus(fileId, status, message = null, progress = null, errorDetails = null) { // Note the changed parameters
    const previewElement = document.getElementById(`file-preview-${fileId}`);
    if (!previewElement) {
        console.warn(`updateFilePreviewStatus: Preview element for ${fileId} not found.`);
        return;
    }

    const nameElement = previewElement.querySelector('.file-preview-name');
    const overlayElement = previewElement.querySelector('.file-preview-overlay'); // Changed variable name slightly
    let progressBarFill = previewElement.querySelector('.file-progress-fill'); // Changed variable name slightly

    // --- Status Class Management ---
    const statuses = ['pending', 'parsing', 'processing_rag', 'completed', 'completed_rag', 'error', 'cancelled'];
    statuses.forEach(s => previewElement.classList.remove(`status-${s}`));
    previewElement.classList.add(`status-${status}`);

    // --- Manage Overlay (Spinner/Icons) ---
    if (overlayElement) overlayElement.remove(); // Remove existing overlay first
    const newOverlay = document.createElement('div');
    newOverlay.className = 'file-preview-overlay';
    let showOverlay = false;
    let iconHTML = ''; // Define iconHTML outside switch

    switch (status) { // Used switch for clarity
        case 'uploading': // Added uploading case explicitly
        case 'parsing':
        case 'processing_rag':
            iconHTML = '<div class="spinner"></div>';
            showOverlay = true;
            break;
        case 'completed': // Kept separate for potential future differences
        case 'completed_rag':
            iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06L11.25 12.44l-1.72-1.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l3.75-3.75Z" clip-rule="evenodd" /></svg>`;
            showOverlay = true;
            setTimeout(() => { // Use the actual newOverlay variable
                const currentOverlay = previewElement.querySelector('.file-preview-overlay');
                if (currentOverlay && currentOverlay.innerHTML.includes('clip-rule="evenodd"')) { // Extra check for safety
                    currentOverlay.remove();
                }
            }, 1500);
            break;
        case 'error':
            iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 00-1.06-1.06L12 10.94l-1.72-1.72Z" clip-rule="evenodd" /></svg>`;
            showOverlay = true;
            previewElement.title = `Error: ${message || errorDetails?.message || 'Processing failed'}`; // Use errorDetails if available
            break;
        case 'cancelled':
            iconHTML = `<svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>`;
            showOverlay = true;
            previewElement.title = 'Processing Cancelled';
            break;
    }

    if (showOverlay && iconHTML) {
        newOverlay.innerHTML = iconHTML;
        previewElement.appendChild(newOverlay);
    } else {
        previewElement.title = ''; // Clear title if no error/cancel
    }


    // --- Progress Bar Management ---
    let progressBar = previewElement.querySelector('.file-progress-bar');
    if (status === 'parsing' || status === 'processing_rag') {
        if (!progressBar) { // Create progress bar if needed
            progressBar = document.createElement('div');
            progressBar.className = 'file-progress-bar';
            const fill = document.createElement('div');
            fill.className = 'file-progress-fill';
            progressBar.appendChild(fill);
            // Insert progress bar *before* the overlay if overlay exists
            const existingOverlay = previewElement.querySelector('.file-preview-overlay');
            if (existingOverlay) {
                previewElement.insertBefore(progressBar, existingOverlay);
            } else {
                previewElement.appendChild(progressBar);
            }
            progressBarFill = fill; // Assign for update below
        }
        // Update progress fill width
        if (progressBarFill) {
            const percentage = (progress === null || progress === undefined) ? (status === 'parsing' ? 5 : 10) : progress; // Default small progress
            // Animate width smoothly
            requestAnimationFrame(() => { // Ensure smooth animation
                progressBarFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
            });
        }
    } else {
        // Remove progress bar if status is completed, error, or cancelled
        if (progressBar) {
            progressBar.remove();
        }
    }


    // --- Update Text Message ---
    if (nameElement) {
        // Always remove prefixes first
        let baseName = nameElement.dataset.baseName || nameElement.textContent; // Store base name if not already done
        if (!nameElement.dataset.baseName) {
            nameElement.dataset.baseName = baseName;
        }
        baseName = baseName.replace(/^Parsing:\s*/, '').replace(/^Indexing:\s*/, ''); // Clean potential old prefixes

        if (status === 'parsing') {
            nameElement.textContent = `Parsing: ${baseName}`;
        } else if (status === 'processing_rag') {
            nameElement.textContent = message || `Indexing: ${baseName}`; // Show batch progress message
        } else {
            nameElement.textContent = baseName; // Show original name on completion/error/cancel
        }
    }

    // Ensure remove button visibility is correct
    const removeBtn = previewElement.querySelector('.remove-file-btn');
    if (removeBtn) {
        // Hide remove button during parsing, processing, uploading
        removeBtn.style.display = (status === 'parsing' || status === 'processing_rag' || status === 'uploading') ? 'none' : 'flex';
    }
}
// --- [END PASTE] ---



function updateFileInputUI() {
    const filePreviewContainer = document.getElementById('file-preview-container');
    const hasFiles = selectedFiles.length > 0;

    filePreviewContainer.style.display = hasFiles ? 'flex' : 'none';
    DOMElements.composer.classList.toggle('file-attached', hasFiles);

    DOMElements.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
}



// --- [UPDATED] this entire function ---

async function removeFile(fileId) {
    const fileToRemove = selectedFiles.find(file => file.id === fileId); // Find the file before filtering
    const initialFileCount = selectedFiles.length;

    selectedFiles = selectedFiles.filter(file => file.id !== fileId); // Remove it from the main array

    if (fileToRemove) { // Check if a file was actually found and removed
        // Remove the UI element
        document.getElementById(`file-preview-${fileId}`)?.remove();

        // If the file was being processed by RAG, send a cancel message to the worker
        if (fileToRemove.status === 'processing_rag') {
            console.log(`MAIN: File ${fileId} was processing. Sending CANCEL_EMBEDDING to RAG worker.`);
            ragWorker.postMessage({
                type: 'CANCEL_EMBEDDING',
                payload: { fileId: fileId }
            });
            // Also, immediately remove any relevant persistent toasts
            removeToastNotification(`file-parsing-${fileId}`);
            removeToastNotification(`file-indexing-${fileId}`); // General indexing toast if used
            // Specific batch toasts might be harder to track by ID here, rely on worker confirmation
        }

        // If this file *was* indexed, remove its chunks from the store
        if (fileToRemove.status === 'completed_rag' || fileToRemove.status === 'processing_rag') {
            try {
                await removeChunksByFileId(fileId);
                allIndexedChunks = await getAllChunks(); // modified
                console.log(`Removed RAG chunks for file ${fileId}. Total chunks now: ${allIndexedChunks.length}`);
            } catch (e) {
                console.error(`Failed to remove RAG chunks for file ${fileId}:`, e);
            }
        }

        // Update general UI state
        updateFileInputUI();
        checkSendButtonState();
        console.log(`Removed file preview ${fileId}.`);
    } else {
        console.warn(`Attempted to remove file ${fileId}, but it was not found in selectedFiles.`);
    }
}
// --- [END] ---


// --- [ADD THIS FUNCTION DEFINITION before THEME & UI HELPERS] ---

function resetFileInput() {
    selectedFiles = []; // Clear the array holding file info
    const filePreviewContainer = document.getElementById('file-preview-container');
    const fileUploadInput = document.getElementById('file-upload');

    // Clear the UI previews
    if (filePreviewContainer) filePreviewContainer.innerHTML = '';
    // Reset the actual file input element (allows re-selecting the same file)
    if (fileUploadInput) fileUploadInput.value = '';

    updateFileInputUI(); // Update composer layout
    checkSendButtonState(); // Update send button state
    console.log("File input and previews reset.");
}

// --- [END ADD FUNCTION DEFINITION] ---


// --- THEME & UI HELPERS (UNCHANGED) ---
const applyTheme = (themeSetting, event = null) => {
    let isDark;
    if (themeSetting === 'system') {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        isDark = themeSetting === 'dark';
    }
    const actualTheme = isDark ? 'dark' : 'light';

    const doUpdate = () => {
        DOMElements.body.dataset.theme = actualTheme;
        localStorage.setItem('chatTheme', themeSetting);

        if (DOMElements.themeSegments) {
            DOMElements.themeSegments.forEach(btn => {
                if (btn.dataset.themeVal === themeSetting) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    };

    if (event && document.startViewTransition) {
        let x = event.clientX;
        let y = event.clientY;
        if (x === undefined || y === undefined) {
            x = window.innerWidth / 2;
            y = window.innerHeight / 2;
        }

        if (DOMElements.menuBtn) {
            DOMElements.menuBtn.classList.remove('active');
            void DOMElements.menuBtn.offsetWidth; // force reflow
        }

        const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

        const transition = document.startViewTransition(() => {
            doUpdate();
        });

        transition.ready.then(() => {
            const size = endRadius * 2.5; // scale up to cover screen
            
            // Create a dialog to host the Aurora.
            // Dialogs opened with showModal() during a View Transition stack ABOVE the View Transition Top Layer!
            const dialog = document.createElement('dialog');
            dialog.className = 'theme-aurora-dialog';
            
            const waveContainer = document.createElement('div');
            waveContainer.className = 'theme-aurora-wrap';
            
            const aurora1 = document.createElement('div');
            aurora1.className = 'theme-aurora';
            aurora1.style.left = `${x}px`;
            aurora1.style.top = `${y}px`;
            
            const aurora2 = document.createElement('div');
            aurora2.className = 'theme-aurora theme-aurora--secondary';
            aurora2.style.left = `${x}px`;
            aurora2.style.top = `${y}px`;
            
            waveContainer.appendChild(aurora1);
            waveContainer.appendChild(aurora2);
            
            const ring = document.createElement('div');
            ring.className = 'theme-ring';
            ring.style.left = `${x}px`;
            ring.style.top = `${y}px`;
            
            dialog.appendChild(waveContainer);
            dialog.appendChild(ring);
            document.body.appendChild(dialog);
            
            // Show modal so it goes to the Top Layer
            dialog.showModal();

            // Clean them up after the animation completes
            setTimeout(() => {
                if (dialog) {
                    dialog.close();
                    dialog.remove();
                }
            }, 2000);

            // 2. Animate the actual View Transition (the circular wipe)
            // On phones, the animated brightness/saturate filter is a per-frame
            // full-screen filter pass over the whole page snapshot — a big extra
            // GPU cost on top of the mask wipe and the aurora. Drop just the
            // filter on mobile (the circular wipe itself stays), which keeps the
            // reveal but removes one expensive full-screen pass.
            const vtIsMobile = window.matchMedia('(max-width: 820px)').matches;
            const vtKeyframes = {
                WebkitMaskImage: [
                    `radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)`,
                    `radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)`
                ],
                WebkitMaskSize: [
                    `0px 0px`,
                    `${size}px ${size}px`
                ],
                WebkitMaskPosition: [
                    `${x}px ${y}px`,
                    `${x - size/2}px ${y - size/2}px`
                ],
                WebkitMaskRepeat: ['no-repeat', 'no-repeat'],
                maskImage: [
                    `radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)`,
                    `radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)`
                ],
                maskSize: [
                    `0px 0px`,
                    `${size}px ${size}px`
                ],
                maskPosition: [
                    `${x}px ${y}px`,
                    `${x - size/2}px ${y - size/2}px`
                ],
                maskRepeat: ['no-repeat', 'no-repeat'],
            };
            if (!vtIsMobile) {
                vtKeyframes.filter = [
                    `brightness(1.5) saturate(1.5)`,
                    `brightness(1) saturate(1)`
                ];
            }
            document.documentElement.animate(
                vtKeyframes,
                {
                    duration: 1600, // Matched with Aurora Sweep duration
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)', // Apple easing
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        });
    } else {
        doUpdate();
    }
};

if (DOMElements.themeSegments) {
    DOMElements.themeSegments.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const val = btn.dataset.themeVal;
            if (val === state.currentTheme) return;
            state.currentTheme = val;
            
            const isMobile = window.innerWidth <= 768;
            if (isMobile && DOMElements.sidebar && DOMElements.sidebar.classList.contains('open')) {
                DOMElements.sidebar.classList.remove('open');
                if (DOMElements.menuBtn) {
                    DOMElements.menuBtn.classList.remove('active');
                }
                if (DOMElements.userSettingsPopup) {
                    DOMElements.userSettingsPopup.classList.remove('show');
                }
                if (DOMElements.overlay) {
                    DOMElements.overlay.classList.remove('show');
                }
                // Apply instantly, no timeout needed without view transition
                applyTheme(state.currentTheme, e);
            } else {
                applyTheme(state.currentTheme, e);
            }
        });
    });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.currentTheme === 'system') applyTheme('system');
});

// --- ✅ [NEW] Voice Selection Listener ---
if (DOMElements.voiceSelect) {
    DOMElements.voiceSelect.addEventListener('change', async () => {
        const newVoice = DOMElements.voiceSelect.value;
        botConfig.ttsVoiceId = newVoice;
        localStorage.setItem('userTtsVoiceId', newVoice); // ✅ [NEW] Local storage fallback
        console.log(`🎙 Voice changed to: ${newVoice}`);
        
        if (state.userId) {
            try {
                await window.tursoClient.updateUser(state.userId, { ttsVoiceId: newVoice });
                showToastNotification({ 
                    message: `Voice updated to ${newVoice}`, 
                    type: 'success', 
                    duration: 3000 
                });
            } catch (e) {
                console.error("Failed to save voice preference to Turso:", e);
                // We still have localStorage, so the UI will stay on the choice.
            }
        }
    });
}


const showTypingIndicator = (show) => {
    let indicator = DOMElements.chatMessages.querySelector('.typing-indicator');
    if (show && !indicator) {
        indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="premium-loader"></div>
        `;
        DOMElements.chatMessages.appendChild(indicator);
        scrollToBottom('smooth');
    } else if (!show && indicator) {
        indicator.remove();
    }
};
const addCopyButtons = () => {
    DOMElements.chatMessages.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-code-btn')) return;
        const code = pre.querySelector('code');
        if (!code) return;
        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.textContent = 'Copy';
        button.onclick = () => { navigator.clipboard.writeText(code.textContent); button.textContent = 'Copied!'; setTimeout(() => { button.textContent = 'Copy'; }, 2000); };
        pre.appendChild(button);
    });
};

// --- applyConfigToUI (UPDATED: supports image or video avatars) ---
function isLikelyVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return ['.mp4', '.webm', '.ogg', '.mov', '.m4v'].some(ext => cleanUrl.endsWith(ext));
}

function ensureBotAvatarElement({ isVideo }) {
    const current = DOMElements.botAvatar;
    if (!current) return null;
    const targetTag = isVideo ? 'VIDEO' : 'IMG';
    if (current.tagName === targetTag) return current;

    const replacement = document.createElement(isVideo ? 'video' : 'img');
    replacement.id = 'bot-avatar';
    replacement.className = current.className || '';
    replacement.style.cssText = current.style.cssText || '';
    current.replaceWith(replacement);
    DOMElements.botAvatar = replacement;
    return replacement;
}

const applyConfigToUI = () => {
    DOMElements.chatTitle.textContent = botConfig.botName || 'chaka';
    const placeholderAvatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const avatarUrl = botConfig.profileImage || placeholderAvatar;
    const isVideoAvatar = botConfig.profileMediaType === 'video' || isLikelyVideoUrl(avatarUrl);
    const avatarEl = ensureBotAvatarElement({ isVideo: isVideoAvatar });

    if (avatarEl) {
        if (isVideoAvatar) {
            avatarEl.src = avatarUrl;
            avatarEl.autoplay = true;
            avatarEl.loop = true;
            avatarEl.muted = true;
            avatarEl.playsInline = true;
            avatarEl.removeAttribute('alt');
        } else {
            avatarEl.src = avatarUrl;
            avatarEl.alt = 'Bot avatar';
        }
    }
    document.documentElement.style.setProperty('--accent-light', botConfig.themeColor || '#f97316');
    document.documentElement.style.setProperty('--accent-dark', botConfig.themeColor ? `${botConfig.themeColor}aa` : '#fb923c');

    if (botConfig.botBubbleColor) {
        document.documentElement.style.setProperty('--bot-bubble', botConfig.botBubbleColor);
    }
    if (botConfig.userBubbleColor) {
        document.documentElement.style.setProperty('--user-bubble', botConfig.userBubbleColor);
    }

    DOMElements.composerActionsBtn.style.display = botConfig.allowFileUpload ? 'flex' : 'none';
    DOMElements.statusRow.textContent = !botConfig.active ? '⚠️ Bot is deactivated by admin' : '';
    DOMElements.sendBtn.disabled = false;
};

// --- TEXT-TO-SPEECH (TTS) FUNCTIONS (UNCHANGED) ---
let activeTtsSources = [];

function initGlobalAudioContext() {
    if (!ttsAudioCtx) {
        ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (ttsAudioCtx.state === 'suspended') {
        ttsAudioCtx.resume().catch(() => { });
    }
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        try { URL.revokeObjectURL(currentAudio.src); } catch (e) { }
        currentAudio = null;
    }
    // Stop all active Web Audio sources
    activeTtsSources.forEach(source => {
        try { source.stop(); } catch (e) { }
    });
    activeTtsSources = [];
    ttsNextStartTime = 0;

    if (currentTtsButton) {
        currentTtsButton.classList.remove('loading', 'playing');
        currentTtsButton = null;
    }

    if (DOMElements.audioVisualizer) {
        DOMElements.audioVisualizer.classList.add('hidden');
        DOMElements.audioVisualizer.classList.remove('generating', 'speaking');
    }
}

/**
 * AUTO-PLAY TTS (Separate Request)
 * Triggered after text generation finishes, exactly like the prototype.
 */
async function autoPlayTts(rawText) {
    if (!rawText) return;

    // 1. Extract natural text (remove JSON wrapper if present)
    let cleanText = rawText;
    if (cleanText.trim().startsWith('{')) {
        const match = cleanText.match(/"final_answer"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (match) {
            try { cleanText = JSON.parse(`"${match[1]}"`); } catch (e) { cleanText = match[1]; }
        }
    }

    // 2. Clean markdown/special chars
    cleanText = cleanText.replace(/[*_#`]/g, '').trim();
    if (!cleanText) return;

    console.log("🎙 Auto-playing TTS for:", cleanText.substring(0, 50) + "...");

    // Show visualizer in 'generating' state
    if (DOMElements.audioVisualizer) {
        DOMElements.audioVisualizer.classList.remove('hidden', 'speaking');
        DOMElements.audioVisualizer.classList.add('generating');
    }

    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/tts-raw`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                text: cleanText,
                voiceId: botConfig.ttsVoiceId
            })
        });
        const data = await response.json();

        if (data.audio) {
            scheduleTtsChunk(data.audio, 24000);
        } else {
            if (DOMElements.audioVisualizer) DOMElements.audioVisualizer.classList.add('hidden');
        }
    } catch (e) {
        console.warn("Auto-TTS separate request failed:", e);
        if (DOMElements.audioVisualizer) DOMElements.audioVisualizer.classList.add('hidden');
    }
}

function scheduleTtsChunk(base64String, sampleRate = 24000) {
    initGlobalAudioContext();

    // Show visualizer in 'speaking' state
    if (DOMElements.audioVisualizer) {
        DOMElements.audioVisualizer.classList.remove('hidden', 'generating');
        DOMElements.audioVisualizer.classList.add('speaking');
    }

    const binaryString = atob(base64String);
    const len = binaryString.length;
    const bytes = new Int16Array(len / 2);
    for (let i = 0; i < len; i += 2) {
        bytes[i / 2] = (binaryString.charCodeAt(i) & 0xff) | ((binaryString.charCodeAt(i + 1) & 0xff) << 8);
    }
    const float32Data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        float32Data[i] = bytes[i] / 32768;
    }

    const audioBuffer = ttsAudioCtx.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ttsAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ttsAudioCtx.destination);

    // Safety check for extreme drifts
    if (ttsNextStartTime < ttsAudioCtx.currentTime) {
        ttsNextStartTime = ttsAudioCtx.currentTime;
    }

    const playTime = Math.max(ttsAudioCtx.currentTime, ttsNextStartTime);
    source.start(playTime);

    activeTtsSources.push(source);
    source.onended = () => {
        activeTtsSources = activeTtsSources.filter(s => s !== source);
        if (activeTtsSources.length === 0 && currentTtsButton) {
            currentTtsButton.classList.remove('playing', 'loading');
        }
    };

    ttsNextStartTime = playTime + audioBuffer.duration;
}

async function playTextAsSpeech(text, buttonElement) {
    if (buttonElement === currentTtsButton && currentAudio) {
        if (currentAudio.paused) { currentAudio.play(); } else { currentAudio.pause(); }
        return;
    }

    stopCurrentAudio();

    currentTtsButton = buttonElement;
    currentTtsButton.classList.add('loading');

    // Show visualizer in 'generating' state
    if (DOMElements.audioVisualizer) {
        DOMElements.audioVisualizer.classList.remove('hidden', 'speaking');
        DOMElements.audioVisualizer.classList.add('generating');
    }

    try {
        // 1. ✅ GET SECURE HEADERS (The Change)
        const headers = await getAuthHeaders();

        // 2. CALL BACKEND (Using Secure Headers)
        const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/tts`, {
            method: 'POST',
            headers: headers, // <--- Use the variable we just got
            body: JSON.stringify({
                text: text.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), // Remove image markdown
                voiceId: botConfig.ttsVoiceId
            }),
            signal: fetchController?.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'TTS Failed');
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
            // SSE audio stream from Gemini
            initGlobalAudioContext();
            if (ttsNextStartTime < ttsAudioCtx.currentTime) {
                ttsNextStartTime = ttsAudioCtx.currentTime;
            }

            // Switch visualizer to 'speaking' state
            if (DOMElements.audioVisualizer) {
                DOMElements.audioVisualizer.classList.remove('generating');
                DOMElements.audioVisualizer.classList.add('speaking');
            }

            currentTtsButton.classList.remove('loading');
            currentTtsButton.classList.add('playing');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim().startsWith('data:')) continue;
                    const jsonStr = line.replace(/^data:\s*/, '').trim();
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const parts = data?.candidates?.[0]?.content?.parts || [];
                        for (const part of parts) {
                            const inline = part?.inlineData;
                            if (inline?.data) {
                                scheduleTtsChunk(inline.data, 24000);
                            }
                        }
                    } catch (e) {
                        // Ignore incomplete JSON chunks
                    }
                }
            }
            currentTtsButton.classList.remove('playing');
            if (DOMElements.audioVisualizer) DOMElements.audioVisualizer.classList.add('hidden');
        } else {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            currentAudio = new Audio(audioUrl);
            currentAudio.onplay = () => {
                currentTtsButton.classList.remove('loading');
                currentTtsButton.classList.add('playing');
                // Switch visualizer to 'speaking' state
                if (DOMElements.audioVisualizer) {
                    DOMElements.audioVisualizer.classList.remove('generating');
                    DOMElements.audioVisualizer.classList.add('speaking');
                }
            };
            currentAudio.onpause = () => {
                currentTtsButton.classList.remove('playing');
                if (DOMElements.audioVisualizer) DOMElements.audioVisualizer.classList.add('hidden');
            };
            currentAudio.onended = () => {
                stopCurrentAudio();
            };

            currentAudio.play();
        }

    } catch (error) {
        console.error('TTS Error:', error);
        // Handle auth errors specifically
        if (error.message.includes("User not logged in")) {
            alert("Please sign in to use Text-to-Speech.");
        } else {
            alert(`Could not play audio: ${error.message}`);
        }
        stopCurrentAudio();
    }
}


// --- HELPER FUNCTIONS FOR CHAT CONTINUATION (UNCHANGED) ---
async function findLastSessionForPersonality(personalityId) {
    if (!state.userId || !personalityId) return null;
    try {
        const sessions = await window.tursoClient.getSessions(state.userId);
        const match = sessions.find(s => s.personalityId === personalityId);
        return match ? match.session_id : null;
    } catch (error) {
        console.error("Error finding last session for personality:", error);
        return null;
    }
}
function showContinuationPrompt(personalityId, lastSessionId) {
    const modal = document.getElementById('continuation-modal');
    const continueBtn = document.getElementById('continue-chat-btn');
    const newChatBtn = document.getElementById('new-chat-modal-btn');
    const cancelBtn = modal.querySelector('.modal-close-btn');
    modal.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
    const updateStateAndUI = () => {
        state.selectedPersonalityId = personalityId;
        localStorage.setItem('selectedPersonalityId', personalityId);
        document.querySelectorAll('.personality-item.active').forEach(el => el.classList.remove('active'));
        const newItem = DOMElements.personalityList.querySelector(`.personality-item[data-id="${personalityId}"]`);
        if (newItem) newItem.classList.add('active');
    };
    const cleanup = () => {
        modal.classList.add('hidden');
        DOMElements.overlay.classList.remove('show');
    };
    const continueHandler = () => {
        updateStateAndUI();
        loadSessionById(lastSessionId);
        cleanup();
    };
    const newChatHandler = () => {
        updateStateAndUI();
        startNewChat();
        cleanup();
    };
    const cancelHandler = () => { cleanup(); };
    continueBtn.addEventListener('click', continueHandler, { once: true });
    newChatBtn.addEventListener('click', newChatHandler, { once: true });
    cancelBtn.addEventListener('click', cancelHandler, { once: true });
}

// --- PERSONALITY VIDEO PREVIEW LOGIC (UNCHANGED) ---
async function showPersonalityPreview(personality) {
    DOMElements.previewPersonalityName.textContent = `Preview: ${personality.name}`;
    DOMElements.previewVideo.src = personality.videoUrl;
    DOMElements.personalityPreviewModal.classList.remove('hidden');
    DOMElements.overlay.classList.add('show');
    DOMElements.previewVideo.play().catch(e => console.warn("Video autoplay failed:", e));

    return new Promise((resolve) => {
        const cleanup = (result) => {
            DOMElements.personalityPreviewModal.classList.add('hidden');
            DOMElements.previewVideo.pause();
            DOMElements.previewVideo.src = '';

            DOMElements.confirmPersonalitySwitchBtn.onclick = null;
            DOMElements.cancelPersonalitySwitchBtn.onclick = null;
            DOMElements.personalityPreviewModal.querySelector('.modal-close-btn').onclick = null;

            resolve(result);
        };

        DOMElements.confirmPersonalitySwitchBtn.onclick = () => cleanup(true);
        DOMElements.cancelPersonalitySwitchBtn.onclick = () => cleanup(false);
        DOMElements.personalityPreviewModal.querySelector('.modal-close-btn').onclick = () => cleanup(false);
    });
}

// --- Function to mark a personality as seen by the user (UNCHANGED) ---
async function markPersonalityAsSeen(personalityId) {
    if (!state.userId || !personalityId) return;
    try {
        const settings = await window.tursoClient.getUserSettings(state.userId);
        const seen = settings.seenPersonalities || [];
        if (!seen.includes(personalityId)) {
            seen.push(personalityId);
            await window.tursoClient.updateUser(state.userId, { seenPersonalities: seen });
        }
    } catch (error) {
        console.error("Failed to mark personality as seen:", error);
    }
}

// --- PERSONALITY SELECTION LOGIC (UNCHANGED) ---
async function subscribeAndDisplayPersonalities() {
    try {
        const personalities = await window.tursoClient.getPersonalities();
        const oldDefaultId = state.defaultPersonalityId;
        const currentSelectedId = state.selectedPersonalityId;
        DOMElements.personalityList.innerHTML = '';
        let newDefaultPersonalityId = null;

        if (!personalities || personalities.length === 0) {
            DOMElements.personalityList.innerHTML = '<p class="no-personalities">No personalities available.</p>';
            state.defaultPersonalityId = null;
            state.selectedPersonalityId = null;
            localStorage.removeItem('selectedPersonalityId');
            return;
        }

        personalities.forEach((personality) => {
            const id = personality.id;
            if (personality.isDefault) {
                newDefaultPersonalityId = id;
            }
            // Track first persona with a non-empty systemPrompt as ultimate fallback
            if (!newDefaultPersonalityId && !window.__chakaFallbackPersonaId &&
                (personality.systemPrompt || personality.persona || '').trim().length > 100) {
                window.__chakaFallbackPersonaId = id;
            }
            const item = document.createElement('div');
            item.className = 'personality-item';
            item.dataset.id = id;
            item.innerHTML = `
                <img src="${personality.avatarUrl || personality.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="${sanitize(personality.name)}" class="personality-avatar">
                <div class="personality-info">
                    <div class="personality-name">${sanitize(personality.name) || 'Unnamed'}</div>
                    <div class="personality-description">${sanitize(personality.description) || 'No description'}</div>
                </div>`;

            item.addEventListener('click', async () => {
                if (state.selectedPersonalityId === id) {
                    DOMElements.composerActionsPopup.classList.remove('show');
                    DOMElements.composerActionsBtn.classList.remove('active');
                    DOMElements.overlay.classList.remove('show');
                    return;
                }

                DOMElements.composerActionsPopup.classList.remove('show');
                DOMElements.composerActionsBtn.classList.remove('active');

                try {
                    const fullPersonalityData = personality; // already have full data

                    const settings = await window.tursoClient.getUserSettings(state.userId);
                    const seenPersonalities = settings.seenPersonalities || [];

                    const shouldShowPreview = fullPersonalityData.videoUrl && !seenPersonalities.includes(id);

                    let userWantsToSwitch = true;
                    if (shouldShowPreview) {
                        userWantsToSwitch = await showPersonalityPreview({
                            name: fullPersonalityData.name,
                            videoUrl: fullPersonalityData.videoUrl
                        });
                    }

                    if (!userWantsToSwitch) {
                        DOMElements.overlay.classList.remove('show');
                        return;
                    }

                    if (shouldShowPreview) {
                        await markPersonalityAsSeen(id);
                    }

                    const lastSessionId = await findLastSessionForPersonality(id);

                    if (lastSessionId) {
                        showContinuationPrompt(id, lastSessionId);
                    } else {
                        DOMElements.overlay.classList.remove('show');
                        state.selectedPersonalityId = id;
                        localStorage.setItem('selectedPersonalityId', id);
                        document.querySelectorAll('.personality-item.active').forEach(el => el.classList.remove('active'));
                        item.classList.add('active');
                        startNewChat();
                    }

                } catch (error) {
                    console.error("Error handling personality selection:", error);
                    DOMElements.overlay.classList.remove('show');
                }
            });

            DOMElements.personalityList.appendChild(item);
        });

        // ── Safety net ────────────────────────────────────────────────
        // If admin hasn't marked any persona as default, fall back to the
        // first persona with a real systemPrompt so Chaka never runs
        // "naked" (no persona = generic Gemini behavior).
        if (!newDefaultPersonalityId && window.__chakaFallbackPersonaId) {
            console.warn('[chaka] No default personality set in admin — falling back to first available with systemPrompt.');
            newDefaultPersonalityId = window.__chakaFallbackPersonaId;
        }
        // ──────────────────────────────────────────────────────────────

        state.defaultPersonalityId = newDefaultPersonalityId;
        if (currentSelectedId === oldDefaultId || currentSelectedId === null) {
            state.selectedPersonalityId = newDefaultPersonalityId;
            if (newDefaultPersonalityId) {
                localStorage.setItem('selectedPersonalityId', newDefaultPersonalityId);
            } else {
                localStorage.removeItem('selectedPersonalityId');
            }
        }

        document.querySelectorAll('.personality-item.active').forEach(el => el.classList.remove('active'));
        if (state.selectedPersonalityId) {
            const activeItem = DOMElements.personalityList.querySelector(`.personality-item[data-id="${state.selectedPersonalityId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }
    } catch (error) {
        console.error("Error fetching personalities:", error);
        DOMElements.personalityList.innerHTML = '<p class="no-personalities">Error loading personalities.</p>';
    }
}


// --- CORE LOGIC & SESSION MANAGEMENT (UNCHANGED) ---
function findMatchingTrigger(message) {
    if (!message) return null;
    const txt = String(message);
    const triggers = state.triggers || [];
    for (const t of triggers) {
        if (!t || t.enabled === false) continue;
        const phrase = (t.phrase || '');
        if (typeof phrase !== 'string' || phrase.trim() === '') continue;
        try {
            if (t.useRegex) {
                const flags = typeof t.regexFlags === 'string' ?
                    t.regexFlags : 'i';
                const re = new RegExp(phrase, flags);
                if (re.test(txt)) return t;
            } else {
                if (txt.toLowerCase().includes(phrase.toLowerCase())) return t;
            }
        } catch (err) {
            console.warn('trigger regex invalid', t, err);
            continue;
        }
    }
    return null;
}
async function warnUser(trigger) {
    let warnings = 0;
    try {
        const settings = await window.tursoClient.getUserSettings(state.userId);
        warnings = (settings.warnings || 0) + 1;
        await window.tursoClient.updateUser(state.userId, { warnings, lastWarningAt: new Date().toISOString() });
    } catch (err) {
        console.warn('warnUser: failed updating warnings', err);
    }
    try {
        const session = await window.tursoClient.getSessionDetails(state.userId, state.sessionId);
        const sessionWarnings = (session.warnings || 0) + 1;
        await window.tursoClient.updateSession(state.userId, state.sessionId, { warnings: sessionWarnings });
    } catch (e) {
        console.warn('warnUser: failed updating session warnings', e);
    }
    return warnings;
}
async function blockUser(trigger) {
    const reason = trigger?.reason || trigger?.phrase || 'Triggered block phrase';
    try {
        await window.tursoClient.updateUser(state.userId, {
            blocked: true
        });
    } catch (err) {
        console.warn('blockUser: set user failed', err);
    }
    try {
        await window.tursoClient.updateSession(state.userId, state.sessionId, {
            blocked: true, blockedBy: 'bot', blockReason: reason, wasBlocked: true
        });
    } catch (e) {
        console.warn('blockUser: set session failed', e);
    }
    state.sessionWasPreviouslyBlocked = true;
    state.subtleNoteShown = false;
}
async function addSubtleNoteToSession(note) {
    if (!note) return;
    try {
        await window.tursoClient.updateSession(state.userId, state.sessionId, {
            lastSubtleNote: JSON.stringify({ text: note, createdAt: new Date().toISOString() })
        });
    } catch (e) {
        console.warn('addSubtleNoteToSession failed', e);
    }
}
async function handleUserMessage(text) {
    const out = { blocked: false, warned: false, warningsCount: 0, matchedTrigger: null };
    const msg = sanitize(text);
    if (!msg) return out;

    try {
        const check = await isUserOrSessionBlocked();
        if (check.blocked) {
            out.blocked = true;
            return out;
        }
    } catch (e) {
        console.warn('pre-save block check failed', e);
    }

    try {
        const matched = findMatchingTrigger(msg);
        if (matched) {
            out.matchedTrigger = matched;
            if (matched.action === 'block') {
                await blockUser(matched);
                out.blocked = true;
            } else if (matched.action === 'warn') {
                const warnings = await warnUser(matched);
                out.warned = true;
                out.warningsCount = warnings;
                const maxWarn = (typeof matched.maxWarnings === 'number') ?
                    matched.maxWarnings : (matched.maxWarnings ? Number(matched.maxWarnings) : 3);
                if (warnings >= (maxWarn || 3)) {
                    await blockUser(matched);
                    out.blocked = true;
                }
            }
        }
    } catch (e) {
        console.warn('handleUserMessage: trigger processing failed', e);
    }
    return out;
}

// --- ✅ [CORRECTED] loadConfigLive ---
function loadConfigLive() {
    if (state.configPromise) return state.configPromise;
    state.configPromise = (async () => {
        const applyCfg = (data) => {
            Object.assign(botConfig, data || {});
            botConfig.allowFileUpload = parseBool(botConfig.allowFileUpload);
            botConfig.apiKeys = botConfig.apiKeys || {};

            const ttsKeyEntry = Object.values(botConfig.apiKeys).find(k => k && k.type === 'tts' && k.enabled !== false);
            botConfig.ttsApiKey = ttsKeyEntry ? ttsKeyEntry.key : null;
            
            // ✅ [FIXED] Only use system default if no user preference is set
            const savedVoice = localStorage.getItem('userTtsVoiceId');
            if (savedVoice) {
                botConfig.ttsVoiceId = savedVoice;
            } else if (!botConfig.ttsVoiceId || botConfig.ttsVoiceId === 'Puck') {
                botConfig.ttsVoiceId = ttsKeyEntry ? ttsKeyEntry.voiceId || 'Puck' : 'Puck';
            }

            apiKeyManager.initialize(botConfig.apiKeys);
            if (typeof botConfig.apiKey === 'string') botConfig.apiKey = botConfig.apiKey.trim();
            botConfig.welcomeMessage = data?.welcomeMessage || botConfig.welcomeMessage || "How can I help you today?";
            if (Array.isArray(data?.triggerPhrases)) {
                state.triggers = data.triggerPhrases.map(t => {
                    if (!t || typeof t.phrase !== 'string') return null;
                    return { ...t, phrase: t.phrase };
                }).filter(Boolean);
            } else {
                state.triggers = [];
            }
            botConfig.showSubtleNotes = parseBool(data?.showSubtleNotes ?? data?.subtleNotesEnabled ?? botConfig.showSubtleNotes);
            botConfig.blockReminderNote = (typeof data?.blockReminderNote === 'string') ? data.blockReminderNote : (data?.blockReminderNote || botConfig.blockReminderNote);
            botConfig.promptSuggestions = Array.isArray(data?.promptSuggestions) ? data.promptSuggestions : [];
        };
        try {
            const data = await window.tursoClient.getConfig();
            if (data && Object.keys(data).length > 0) {
                applyCfg(data);
            }
        } catch (err) {
            console.warn('loadConfigLive initial read error', err);
        } finally {
            // ALWAYS apply config to UI (even if using defaults) to remove "Loading..." state
            applyConfigToUI();
        }
        // Listen for real-time config changes via WebSocket
        window.tursoClient.onConfigUpdated((data) => {
            if (data && Object.keys(data).length > 0) {
                console.log('⚡ Real-time config update received.');
                applyCfg(data);
                applyConfigToUI();
            }
        });
        return botConfig;
    })();
    return state.configPromise;
}

// --- subscribeSessions (TURSO HYBRID) ---
async function subscribeSessions(retryCount = 0) {
    if (state.sessionsUnsub) { state.sessionsUnsub(); state.sessionsUnsub = null; } // Cleanup legacy
    DOMElements.sessionList.innerHTML = Array(5).fill('<div class="skeleton"></div>').join('');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        const sessions = await window.tursoClient.getSessions(state.userId);
        clearTimeout(timeoutId);

        DOMElements.sessionList.innerHTML = '';
        if (!sessions || sessions.length === 0) {
            DOMElements.sessionList.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.9rem;">No chat history.</p>';
            return;
        }
        sessions.forEach(d => {
            const i = document.createElement('div');
            i.className = 'session-item';
            i.dataset.id = d.session_id;
            if (d.session_id === state.sessionId) i.classList.add('active');
            i.innerHTML = `<div class="session-title">${sanitize(d.title) || 'Untitled Chat'}</div><div class="session-meta">${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}</div>`;
            i.onclick = () => loadSessionById(d.session_id);
            DOMElements.sessionList.appendChild(i);
        });
    } catch (e) {
        console.error('Sessions fetch error (attempt ' + (retryCount + 1) + '):', e);
        if (retryCount < 3) {
            const delay = [5000, 10000, 20000][retryCount];
            console.log(`Retrying subscribeSessions in ${delay / 1000}s...`);
            DOMElements.sessionList.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;">⏳ Connecting to server...</p>';
            setTimeout(() => subscribeSessions(retryCount + 1), delay);
        } else {
            DOMElements.sessionList.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;">Could not load history. <a href="#" onclick="location.reload()" style="color:var(--accent);">Refresh</a></p>';
        }
    }
}

const WELCOME_PHRASES = [
    "What's on your mind {name}", "Ready when you are {name}", "Let's get to work {name}",
    "Talk to me {name}", "What are we tackling today {name}", "Hit me with your best idea {name}",
    "What's the plan {name}", "Let's create something {name}", "Awaiting your command {name}",
    "What's cooking {name}", "Let's brainstorm {name}", "Your turn {name}", "What's the word {name}",
    "Let's explore {name}", "Drop your thoughts here {name}", "How can I assist today {name}",
    "Tell me everything {name}", "Lead the way {name}", "What's next on the agenda {name}",
    "Let's make some magic {name}", "Show me what you've got {name}", "Let's dive right in {name}",
    "What are we building today {name}", "Give me a task {name}", "Time to shine {name}",
    "Ohayou, let's start {name}", "Moshi moshi {name}", "Konnichiwa {name}",
    "Hola, what's up {name}", "¿Qué tal {name}", "¿Qué pasa {name}",
    "Bonjour, where to {name}", "Salut {name}", "Ciao, what's the plan {name}",
    "Buongiorno {name}", "Aloha {name}", "Namaste, how can I help {name}",
    "Guten Tag, what's next {name}", "Hallo, let's chat {name}", "Jambo {name}",
    "Ni hao {name}", "Annyeonghaseyo {name}", "Privet, what's the word {name}",
    "Olá, ready to go {name}", "Shalom {name}", "Ahlan {name}",
    "Sawadee {name}", "Kia ora {name}", "Hi {name}, let’s get into it"
];

let currentWelcomePhrase = null;
let currentWelcomeSessionId = null;

// --- subscribeMessages (HYBRID: Turso Implementation) ---
async function subscribeMessages() {
    if (!state.sessionId) return;
    if (state.messagesUnsub) { state.messagesUnsub(); state.messagesUnsub = null; }

    try {
        const chats = await window.tursoClient.getChats(state.userId, state.sessionId);

        stopCurrentAudio();
        const container = DOMElements.chatMessages;

        const visibleChats = chats ? chats.filter(msg => !msg.internal) : [];
        if (!chats || chats.length === 0 || visibleChats.length === 0) {
            document.getElementById('chat-container')?.classList.remove('is-chatting');
            const welcomeScreen = document.getElementById('welcome-screen');
            if (welcomeScreen) {
                const userFirst = (state.userDisplayName || 'User').split(' ')[0];
                const greeting = welcomeScreen.querySelector('#welcome-greeting');
                if (greeting) {
                    if (state.sessionId !== currentWelcomeSessionId || !currentWelcomePhrase) {
                        const randomTemplate = WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)];
                        currentWelcomePhrase = randomTemplate.replace('{name}', sanitize(userFirst));
                        currentWelcomeSessionId = state.sessionId;
                    }
                    greeting.textContent = currentWelcomePhrase;
                }
            }
            return;
        }

        document.getElementById('chat-container')?.classList.add('is-chatting');

        let lastSender = null;

        chats.forEach(msg => {
            const id = msg.message_id;
            if (msg.internal) return;

            let existingEl = container.querySelector(`.message[data-message-id="${id}"]`);

            if (existingEl) {
                const existingContent = existingEl.querySelector('.message-content');
                if (existingContent) {
                    const prevRaw = existingEl.dataset.rawText || '';
                    const newRaw = msg.text || '';
                    if (msg.sender === 'bot' && prevRaw !== newRaw) {
                        const placeholderRegex = /\[IMAGE_PLACEHOLDER_PROMPT:"([^"]+)"\]/g;
                        const imageRegex = /!\[Image for prompt: "([^"]+)"\]\(([^)]+)\)/g;
                        let processedText = newRaw;
                        processedText = processedText.replace(placeholderRegex, () => `<div class="image-placeholder"><div class="spinner"></div><p>Generating image...</p></div>`);
                        processedText = processedText.replace(imageRegex, (m, p, url) => `<a href="${url}" target="_blank"><img src="${url}" class="message-image-attachment"></a>`);
                        existingContent.innerHTML = marked.parse(processedText);
                        existingEl.dataset.rawText = newRaw;
                    }

                    let urls = [];
                    try { if (msg.imageUrls && Array.isArray(msg.imageUrls)) urls = msg.imageUrls; } catch (e) { }
                    if (urls.length > 0) {
                        const validUrls = urls.filter(url => typeof url === 'string');
                        if (validUrls.length > 0) {
                            const existingImgContainer = existingContent.querySelector('.message-images-container');
                            if (!existingImgContainer) {
                                const count = Math.min(validUrls.length, 5);
                                const imgContainer = document.createElement('div');
                                imgContainer.className = `message-images-container images-count-${count}`;
                                validUrls.slice(0, 5).forEach(url => {
                                    imgContainer.innerHTML += `<a href="${url}" target="_blank"><img src="${url}" class="message-image-attachment"></a>`;
                                });
                                existingContent.prepend(imgContainer);
                            }
                        }
                    }
                }
                lastSender = msg.sender;
                return;
            }

            let messageGroup = container.lastElementChild;
            if (!messageGroup || !messageGroup.classList.contains(msg.sender) || messageGroup.classList.contains('streaming')) {
                messageGroup = document.createElement('div');
                messageGroup.className = `message-group ${msg.sender}`;
                container.appendChild(messageGroup);
            }

            const el = document.createElement('div');
            el.className = `message ${msg.sender}`;
            el.dataset.messageId = id;
            el.dataset.rawText = msg.text || '';

            const content = document.createElement('div');
            content.className = 'message-content';

            let processedText = msg.text || '';
            const placeholderRegex = /\[IMAGE_PLACEHOLDER_PROMPT:"([^"]+)"\]/g;
            const imageRegex = /!\[Image for prompt: "([^"]+)"\]\(([^)]+)\)/g;

            if (msg.sender === 'bot') {
                if (processedText.includes('🤖 **Autonomous task complete**')) {
                    const doneMessage = processedText.replace('🤖 **Autonomous task complete**\\n\\n', '').trim();
                    content.innerHTML = `
                      <div class="ck-card autonomous-card static-card" style="margin: 0; max-width: 540px; border-radius: 18px; overflow: hidden; background: linear-gradient(180deg, rgba(20, 23, 30, 0.86) 0%, rgba(11, 13, 18, 0.78) 100%); border: 1px solid rgba(255, 255, 255, 0.07); box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3); color: rgba(245, 247, 250, 0.96); font-family: Inter, system-ui, sans-serif;">
                        <div class="ck-head" style="display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.07);">
                          <div class="ck-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 12px rgba(52, 211, 153, 0.45); flex-shrink: 0;"></div>
                          <div class="ck-title-block" style="flex: 1; min-width: 0;">
                            <div class="ck-title" style="font-size: 13.5px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.15; margin-bottom: 2px;">Autonomous Agent</div>
                            <div class="ck-subtitle" style="font-size: 11px; font-weight: 450; color: rgba(245, 247, 250, 0.62); font-family: 'JetBrains Mono', ui-monospace, monospace;">Task complete</div>
                          </div>
                        </div>
                        <div class="ck-body" style="padding: 16px;">
                           <div class="ck-task" style="font-size: 13.5px; line-height: 1.5; color: rgba(245, 247, 250, 0.96);">${marked.parse(doneMessage)}</div>
                        </div>
                      </div>
                    `;
                    el.style.background = 'transparent';
                    el.style.border = 'none';
                    el.style.padding = '0';
                    el.style.boxShadow = 'none';
                } else {
                    processedText = processedText.replace(placeholderRegex, () => `<div class="image-placeholder"><div class="spinner"></div><p>Generating image...</p></div>`);
                    processedText = processedText.replace(imageRegex, (m, p, url) => `<a href="${url}" target="_blank"><img src="${url}" class="message-image-attachment"></a>`);
                    content.innerHTML += marked.parse(processedText);
                }
            } else {
                content.textContent = processedText;
            }

            let urls = [];
            try { if (msg.imageUrls && Array.isArray(msg.imageUrls)) urls = msg.imageUrls; } catch (e) { }
            if (urls.length > 0) {
                const count = Math.min(urls.length, 5);
                const imgContainer = document.createElement('div');
                imgContainer.className = `message-images-container images-count-${count}`;
                urls.slice(0, 5).forEach(url => {
                    imgContainer.innerHTML += `<a href="${url}" target="_blank"><img src="${url}" class="message-image-attachment"></a>`;
                });
                content.prepend(imgContainer);
            }

            el.appendChild(content);
            // ✅ FIX: Use fresh regex (not the global ones above whose lastIndex is corrupted by .replace())
            const hasImageContent = /!\[Image for prompt: "[^"]+"\]\([^)]+\)/.test(msg.text);
            const hasPlaceholder = /\[IMAGE_PLACEHOLDER_PROMPT:"[^"]+"\]/.test(msg.text);
            if (msg.sender === 'bot' && !hasImageContent && !hasPlaceholder) {
                const ttsBtn = document.createElement('button');
                ttsBtn.className = 'tts-btn';
                ttsBtn.title = "Listen";
                ttsBtn.innerHTML = `<span class="play-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v14l11-7-11-7z"></path></svg></span> <span class="pause-icon" style="display: none;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg></span> <span class="tts-wave-bars"><span></span><span></span><span></span><span></span></span>`;
                ttsBtn.onclick = () => playTextAsSpeech(msg.text, ttsBtn);
                el.appendChild(ttsBtn);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-message-btn';
                copyBtn.title = "Copy";
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 7a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/></svg>`;
                copyBtn.onclick = (e) => {
                    navigator.clipboard.writeText(msg.text);
                    const button = e.target.closest('button');
                    const originalHtml = button.innerHTML;
                    button.innerHTML = `<span>Copied!</span>`;
                    setTimeout(() => { button.innerHTML = originalHtml; }, 2000);
                };
                el.appendChild(copyBtn);

                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.title = "Download";
                downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 15.586l-4.293-4.293-1.414 1.414L12 18.414l5.707-5.707-1.414-1.414L12 15.586z"/><path d="M12 4a.999.999 0 00-1 1v10.586l-1.707-1.707-1.414 1.414L12 18.414l4.121-4.121-1.414-1.414L13 15.586V5a.999.999 0 00-1-1z"/></svg>`;
                downloadBtn.onclick = () => {
                    const messageElement = downloadBtn.closest('.message[data-message-id]');
                    if (messageElement) { showExportModal(messageElement.querySelector('.message-content'), messageElement.dataset.messageId); }
                };
                el.appendChild(downloadBtn);
            }

            if (msg.sender === 'user' && botConfig.userBubbleColor) el.style.background = botConfig.userBubbleColor;
            if (msg.sender === 'bot' && botConfig.botBubbleColor) el.style.background = botConfig.botBubbleColor;

            messageGroup.appendChild(el);
            lastSender = msg.sender;
        });

        if (lastSender === 'bot' && !autoRetryState.isActive) {
            const streamingBubble = container.querySelector('.message-group.streaming');
            if (streamingBubble) streamingBubble.remove();
        }

        scrollToBottom('auto');
        container.querySelectorAll('pre code').forEach(block => { try { hljs.highlightElement(block); } catch (e) { } });
        if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
            MathJax.typesetPromise([container]).catch(() => { });
        }
    } catch (err) {
        console.error('Messages fetch/render error:', err);
    }
}

// --- USER TRACKING & OTHER SESSION MANAGEMENT (UNCHANGED) ---
function parseUserAgent(ua) {
    const parser = {};
    const regex = {
        os: /(Windows|Mac OS|Android|iOS|Linux)/,
        browser: /(Chrome|Firefox|Safari|Edge|MSIE|Trident)/,
        device: /(Mobile|Tablet|iPad)/
    };
    parser.os = ua.match(regex.os) ? ua.match(regex.os)[0] : 'Unknown OS';
    parser.browser = ua.match(regex.browser) ? ua.match(regex.browser)[0] : 'Unknown Browser';
    parser.device = ua.match(regex.device) ? 'Mobile' : 'Desktop';
    if (parser.browser === 'Trident' || parser.browser === 'MSIE') parser.browser = 'Internet Explorer';
    return parser;
}
window.getAuthHeaders = getAuthHeaders;
async function trackUserLocationAndDevice() {
    try {
        const locationResponse = await fetch('https://ipapi.co/json/');
        if (!locationResponse.ok) throw new Error(`HTTP error! status: ${locationResponse.status}`);
        const locationData = await locationResponse.json();
        const deviceInfo = parseUserAgent(navigator.userAgent);
        let connectionType = 'Unknown';
        if (navigator.connection) {
            const { effectiveType } = navigator.connection;
            const connectionMap = { 'wifi': 'Wi-Fi', 'cellular': 'Mobile Data', 'ethernet': 'Ethernet', 'bluetooth': 'Bluetooth', 'wimax': 'WiMAX', 'other': 'Other', 'slow-2g': 'Mobile Data (Slow 2G)', '2g': 'Mobile Data (2G)', '3g': 'Mobile Data (3G)', '4g': 'Mobile Data (4G)' };
            connectionType = connectionMap[effectiveType] || `Mobile Data (${effectiveType})`;
        }
        return {
            ip: locationData.ip, city: locationData.city, region: locationData.region,
            country: locationData.country_name, latitude: locationData.latitude, longitude: locationData.longitude,
            network: locationData.org || 'Unknown', connection: connectionType,
            userAgent: navigator.userAgent, ...deviceInfo
        };
    } catch (error) {
        console.error('Error tracking user location/device:', error);
        const deviceInfo = parseUserAgent(navigator.userAgent);
        return { userAgent: navigator.userAgent, ...deviceInfo };
    }
}


async function ensureUser(authUser) {
    // Populate user profile UI
    const placeholderAvatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    if (DOMElements.userAvatar) DOMElements.userAvatar.src = authUser.photoURL || placeholderAvatar;
    state.userDisplayName = authUser.displayName || 'New User';
    if (DOMElements.userDisplayName) DOMElements.userDisplayName.textContent = state.userDisplayName;
    if (DOMElements.userEmail) DOMElements.userEmail.textContent = authUser.email;

    const trackingData = await trackUserLocationAndDevice();

    // Save/update user in Turso via backend
    await window.tursoClient.updateUser(authUser.uid, {
        email: authUser.email,
        displayName: authUser.displayName || 'New User',
        photoURL: authUser.photoURL || null,
        lastLogin: new Date().toISOString(),
        ...(trackingData ? { location: trackingData, device: trackingData } : {})
    });
}

/**
 * Loads user profile data into the profile popup (if present).
 */
async function populateUserProfile() {
    if (!state.userId) {
        console.warn('populateUserProfile: User not authenticated.');
        return;
    }

    try {
        const userData = await window.tursoClient.getUser(state.userId);
        if (!userData || !userData.firebase_uid) {
            console.warn('populateUserProfile: User not found in Turso.');
            return;
        }

        if (DOMElements.userProfileEmail) {
            DOMElements.userProfileEmail.textContent =
                userData.email || auth.currentUser?.email || 'No email';
        }

        if (DOMElements.userProfilePlan) {
            const plan = userData.plan || 'Free';
            const badgeClass = String(plan).toLowerCase();
            DOMElements.userProfilePlan.innerHTML =
                `<span class="plan-badge ${badgeClass}">${plan}</span>`;
        }

                if (DOMElements.userProfileJoined) {
            const createdAt = userData.createdAt ? new Date(userData.createdAt) : null;
            if (createdAt && !isNaN(createdAt)) {
                const formatted = createdAt.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric'
                });
                DOMElements.userProfileJoined.textContent = formatted;
            }
        }

        // --- ✅ [NEW] Initialize Voice Dropdown ---
        const prefVoice = userData.ttsVoiceId || localStorage.getItem('userTtsVoiceId');
        if (DOMElements.voiceSelect && prefVoice) {
            DOMElements.voiceSelect.value = prefVoice;
            botConfig.ttsVoiceId = prefVoice;
            localStorage.setItem('userTtsVoiceId', prefVoice); // Sync local storage
            console.log(`🤖 Voice preference loaded: ${prefVoice}`);
        }
    } catch (error) {
        console.error('populateUserProfile: Failed to load profile data:', error);
        if (DOMElements.userProfileEmail && auth.currentUser) {
            DOMElements.userProfileEmail.textContent = auth.currentUser.email || 'Unknown';
        }
        if (DOMElements.userProfilePlan) {
            DOMElements.userProfilePlan.innerHTML = '<span class="plan-badge free">Free</span>';
        }
    }
}


async function ensureSessionMetadataOnFirstMsg(sid, msg) {
    try {
        await window.tursoClient.saveSession(state.userId, sid, msg || 'New Chat', state.selectedPersonalityId || 'CHAKA');
    } catch (e) {
        console.error('ensureSessionMetadata Error:', e);
    }
}
async function saveFirstMessageTitleIfNeeded(text) {
    if (!state.sessionId) {
        state.sessionId = crypto.randomUUID();
        localStorage.setItem('chatSessionId', state.sessionId);
        subscribeMessages();
    }
    if (!state.firstMessageSaved) {
        await ensureSessionMetadataOnFirstMsg(state.sessionId, text);
        state.firstMessageSaved = true;
    }
}

/**
 * ✅ Auto-generate a smart chat title using Groq (free Llama model)
 * Called after the first bot response in a session
 */
async function autoGenerateChatTitle(userMessage, botResponse) {
    if (state.titleGenerated || !state.sessionId || !state.userId) return;
    state.titleGenerated = true;

    try {
        const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userMessage, botResponse })
        });

        if (!res.ok) throw new Error(`Title API returned ${res.status}`);
        const data = await res.json();
        const title = data.title;

        if (title && title !== 'New Chat') {
            // Update title in Turso
            await window.tursoClient.updateSessionTitle(state.userId, state.sessionId, title);
            // Refresh sidebar to show the new title
            subscribeSessions();
            console.log(`✅ Auto-generated chat title: "${title}"`);
        }
    } catch (e) {
        console.warn('Auto title generation failed (non-fatal):', e.message);
    }
}
async function checkSessionWasPreviouslyBlocked() {
    try {
        if (!state.userId || !state.sessionId) {
            state.sessionWasPreviouslyBlocked = false; state.subtleNoteShown = false;
            return;
        }
        const session = await window.tursoClient.getSessionDetails(state.userId, state.sessionId);
        if (session && session.session_id) {
            state.sessionWasPreviouslyBlocked = !!(session.wasBlocked || session.blocked);
            state.subtleNoteShown = false;
        } else {
            state.sessionWasPreviouslyBlocked = false; state.subtleNoteShown = false;
        }
    } catch (e) { console.warn('checkSessionWasPreviouslyBlocked error', e); }
}
async function isUserOrSessionBlocked() {
    try {
        const settings = await window.tursoClient.getUserSettings(state.userId);
        if (settings.blocked === true) return { blocked: true, reason: 'user' };
        const session = await window.tursoClient.getSessionDetails(state.userId, state.sessionId);
        if (session && (session.blocked === true || session.blocked === 1)) return { blocked: true, reason: 'session' };
    } catch (e) { console.warn('Block check error', e); }
    return { blocked: false };
}

// --- toggleSendButtonState (UNCHANGED) ---
function toggleSendButtonState(buttonState, isDisabled = false) {
    const btn = DOMElements.sendBtn;
    const icons = {
        mic: btn.querySelector('.mic-icon'),
        send: btn.querySelector('.send-icon'),
        stop: btn.querySelector('.stop-icon'),
        spinner: btn.querySelector('.spinner')
    };

    for (const icon in icons) {
        if (icons[icon]) icons[icon].style.display = 'none';
    }
    btn.disabled = isDisabled;
    btn.classList.remove('send-mode-active');

    switch (buttonState) {
        case 'mic':
            if (icons.mic) icons.mic.style.display = 'block';
            btn.title = 'Record Voice';
            break;
        case 'send':
            if (icons.send) icons.send.style.display = 'block';
            btn.title = 'Send';
            btn.classList.add('send-mode-active');
            break;
        case 'stop':
            if (icons.stop) icons.stop.style.display = 'block';
            btn.title = 'Stop Generating';
            break;
    }
}


// --- cancellableWait (UNCHANGED) ---
function cancellableWait(duration, countdownMessage = '') {
    return new Promise(resolve => {
        let timeLeft = Math.ceil(duration / 1000);
        const updateCountdown = () => {
            if (countdownMessage) {
                DOMElements.statusRow.textContent = `${countdownMessage} ${timeLeft}...`;
            }
        };

        if (countdownMessage) updateCountdown();

        const interval = setInterval(() => {
            if (autoRetryState.stopRequested) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve(true);
            }
            timeLeft--;
            if (countdownMessage) updateCountdown();
        }, 1000);

        const timeout = setTimeout(() => {
            clearInterval(interval);
            if (!autoRetryState.stopRequested) {
                resolve(false);
            }
        }, duration);
    });
}

// --- stopApiRequestLoop (UNCHANGED) ---
function stopApiRequestLoop() {
    if (autoRetryState.isActive) {
        autoRetryState.stopRequested = true;
        if (fetchController) {
            try { fetchController.abort(); } catch (e) { }
        }
        console.log("User requested to stop the API request loop.");

        // Best-effort UI cleanup: remove streaming bubble and show stopped message
        try {
            if (autoRetryState.botMessageElements) {
                const { botMessageGroup, botMessageContent } = autoRetryState.botMessageElements;
                if (botMessageContent) {
                    botMessageContent.innerHTML = '<p>⏹️ Stopped by user.</p>';
                }
                if (botMessageGroup) botMessageGroup.classList.remove('streaming');
            }
        } catch (e) { console.warn('stopApiRequestLoop UI cleanup failed', e); }

        // Ensure internal state is cleared so UI reflects stopped status immediately
        cleanupAfterLoop();
    }
}


// --- makeApiRequest (OPTIMIZED: Throttled Rendering) ---
async function makeApiRequest(requestBody, apiKey, abortSignal) {
    const endpoint = `${APP_CONFIG.BACKEND_URL}/api/chat`;
    console.log("📡 Calling Backend API at:", endpoint);

    const TIMEOUT_MS = 600000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

    const combinedSignal = AbortSignal.any
        ? AbortSignal.any([abortSignal, timeoutController.signal])
        : abortSignal;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestBody, voiceInput: lastInputWasVoice }),
            signal: combinedSignal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errorText = await res.text();
            let errorMessage = 'Backend request failed';
            try { errorMessage = JSON.parse(errorText)?.error || errorMessage; } catch (e) { errorMessage = errorText || errorMessage; }
            throw new Error(errorMessage);
        }

        const { botMessageContent } = autoRetryState.botMessageElements;
        let accumulatedBotReply = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let contentUpdated = false;
        let streamFinished = false;
        let lastRenderTime = 0;

        // --- OPTIMIZED RENDER LOOP ---
        const renderLoop = () => {
            const now = Date.now();

            // ✅ Throttle: Only render every 50ms (20fps) instead of every frame
            // This prevents the browser from freezing on long tables.
            if (contentUpdated && (now - lastRenderTime > 50)) {
                let displayString = accumulatedBotReply;

                // Cosmetic cleanup: hide raw JSON while typing
                if (displayString.startsWith('{')) {
                    const match = displayString.match(/"final_answer"\s*:\s*"((?:[^"\\]|\\.)*)/);
                    if (match) {
                        try { displayString = JSON.parse(`"${match[1]}"`); } catch (e) { displayString = match[1]; }
                    } else {
                        displayString = "...";
                    }
                }

                botMessageContent.innerHTML = marked.parse(displayString);

                // Auto-scroll only if near bottom
                const chatMessages = DOMElements.chatMessages;
                if (chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 150) {
                    scrollToBottom('auto');
                }

                contentUpdated = false;
                lastRenderTime = now;
            }

            if (!streamFinished) {
                requestAnimationFrame(renderLoop);
            }
        };
        requestAnimationFrame(renderLoop);

        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) { streamFinished = true; break; }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            let boundary = buffer.indexOf('\n');
            while (boundary !== -1) {
                const line = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);

                if (line) {
                    try {
                        const jsonWrapper = JSON.parse(line);
                        if (jsonWrapper.text) {
                            accumulatedBotReply += jsonWrapper.text;
                            contentUpdated = true;
                        }
                        // Auto-TTS: Backend sends audio chunk when voiceInput was true
                        if (jsonWrapper.audio) {
                            try {
                                scheduleTtsChunk(jsonWrapper.audio, 24000);
                            } catch (e) { console.warn('Auto-TTS chunk error:', e); }
                        }
                    } catch (e) { }
                }
                boundary = buffer.indexOf('\n');
            }
        }

        return accumulatedBotReply;

    } catch (error) {
        clearTimeout(timeoutId);
        // Distinguish between User Stop and Network Timeout
        if (error.name === 'AbortError') {
            if (timeoutController.signal.aborted) throw new Error("Network timeout: Server took too long to respond.");
            throw new Error("Request stopped by user.");
        }
        throw error;
    }
}

// --- cleanupAfterLoop (BULLETPROOF REWRITE) ---
function cleanupAfterLoop() {
    // 1. Reset state flags FIRST
    autoRetryState.isActive = false;
    autoRetryState.stopRequested = false;

    // 2. ALWAYS remove streaming class from ALL streaming bubbles (nuclear failsafe)
    document.querySelectorAll('.message-group.streaming').forEach(el => {
        el.classList.remove('streaming');
    });

    // 3. ALWAYS hide API status bar
    if (DOMElements.apiStatusRow) {
        DOMElements.apiStatusRow.classList.add('hidden');
        DOMElements.apiStatusRow.textContent = '';
    }
    if (DOMElements.statusRow) {
        DOMElements.statusRow.textContent = '';
    }

    // 4. Cursor cleanup removed

    // 5. Reset fetch controller
    fetchController = null;

    // 6. Clear element references to prevent stale DOM pointers
    autoRetryState.botMessageElements = null;
    autoRetryState.requestPayload = null;
    autoRetryState.lastAnalysisSummary = null;
    autoRetryState.lastConfidenceScore = null;
    autoRetryState.lastDetectedEmotion = null;

    // 7. Reset voice and button state
    lastInputWasVoice = false;
    checkSendButtonState();

    console.log('✅ cleanupAfterLoop executed — UI fully reset.');
}

// --- generateAndReplaceImage (UNCHANGED) ---
async function generateAndReplaceImage(prompt, messageId, originalText) {
    try {
        const imageUrl = await handleImageGenerationWithCloudinary(prompt);
        const imageMarkdown = `![Image for prompt: "${prompt}"](${imageUrl})`;
        const placeholder = `[IMAGE_PLACEHOLDER_PROMPT:"${prompt}"]`;
        const newText = originalText.replace(placeholder, imageMarkdown);

        await window.tursoClient.saveChat(state.userId, state.sessionId, messageId, 'bot', newText);

    } catch (error) {
        console.error("Async image generation/replacement failed:", error);
        const errorMessage = `⚠️ Sorry, I couldn't create that image. Reason: ${error.message}`;
        const placeholder = `[IMAGE_PLACEHOLDER_PROMPT:"${prompt}"]`;
        const newText = originalText.replace(placeholder, errorMessage);

        await window.tursoClient.saveChat(state.userId, state.sessionId, messageId, 'bot', newText);
    }
}


// --- HELPER: Auto-Continue for Search Results ---
async function triggerAutoContinue(preservedPayload) {
    console.log("🔄 Auto-continuing to process search results...");
    showApiStatus("🧠 Reading search results...", -1);

    // 1. Fetch the very latest history from Turso (which now includes the hidden [SEARCH RESULTS] message)
    const chatRows = await window.tursoClient.getChats(state.userId, state.sessionId);

    // 2. Reconstruct the history format for the AI
    const imageMarkdownRegex = /!\[Image for prompt: "([^"]+)"\]\(([^)]+)\)/;

    const updatedHistoryContents = chatRows.map((data, index) => {
        const role = data.sender === 'user' ? 'user' : 'model';
        let messageText = data.text || '';

        // Handle images/files in history
        const imageUrls = data.imageUrls || (typeof data.image_urls === 'string' ? JSON.parse(data.image_urls || '[]') : data.image_urls) || [];
        const attachedFiles = data.attachedFiles || (typeof data.attached_files === 'string' ? JSON.parse(data.attached_files || '[]') : data.attached_files) || [];

        if (imageUrls.length) {
            messageText += '\n' + imageUrls.map(url => `[Reference Image: ${url}]`).join('\n');
        }
        if (attachedFiles.length) {
            attachedFiles.forEach(f => {
                messageText += `\n\n--- FILE: ${f.name} ---\n${f.content}\n--- END FILE ---`;
            });
        }

        // Handle bot images
        const imageMatch = messageText.match(imageMarkdownRegex);
        if (role === 'model' && imageMatch) {
            messageText = `[System: You generated an image for prompt "${imageMatch[1]}".]`;
        }

        return { role, parts: [{ text: messageText.trim() }] };
    });

    // 3. Preserve the System Instructions (Strategy: Keep index 0 and 1 from old payload)
    // contents[0] is System Instructions. contents[1] is the "Understood" ack.
    const systemParts = preservedPayload.contents.slice(0, 2);

    // 4. Update the Global Payload
    autoRetryState.requestPayload = { ...preservedPayload };
    autoRetryState.requestPayload.contents = [...systemParts, ...updatedHistoryContents];

    // 5. Create a new bubble for the answer
    const botMessageGroup = document.createElement('div');
    botMessageGroup.className = 'message-group bot streaming';
    const botMessageEl = document.createElement('div');
    botMessageEl.className = 'message bot';
    if (botConfig.botBubbleColor) botMessageEl.style.background = botConfig.botBubbleColor;
    const botMessageContent = document.createElement('div');
    botMessageContent.className = 'message-content';
    botMessageContent.innerHTML = '';

    botMessageEl.appendChild(botMessageContent);
    botMessageGroup.appendChild(botMessageEl);
    DOMElements.chatMessages.appendChild(botMessageGroup);
    scrollToBottom('smooth');

    // 6. Update UI State Refs
    autoRetryState.botMessageElements = { botMessageGroup, botMessageEl, botMessageContent };

    // 7. Restart the Loop
    executeApiRequestLoop();
}

// --- EVENT TRIGGER SYSTEM (NEW YEAR, LAUNCHES, PROMOS) ---
function parseEventDataFromStorage() {
    const raw = localStorage.getItem('chaka_event_data') || localStorage.getItem('event_data');
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to parse event data:', e);
        return null;
    } finally {
        localStorage.removeItem('chaka_event_data');
        localStorage.removeItem('event_data');
    }
}

function validateEventTrigger(eventTrigger) {
    if (!eventTrigger || typeof eventTrigger !== 'string') {
        console.warn('Invalid event trigger (empty or non-string).');
        return false;
    }
    if (eventTrigger.length > 120) {
        console.warn('Invalid event trigger (too long).');
        return false;
    }

    const lastTrigger = localStorage.getItem('last_event_trigger_time');
    if (lastTrigger) {
        const timeSinceLastTrigger = Date.now() - parseInt(lastTrigger, 10);
        if (timeSinceLastTrigger < 60000) {
            console.warn('Event trigger ignored (cooldown).');
            return false;
        }
    }
    localStorage.setItem('last_event_trigger_time', Date.now().toString());
    return true;
}

async function trackEventTrigger(eventType, eventData) {
    if (!state.userId || !state.sessionId) return;
    try {
        // Track event via backend analytics
        try {
            const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/db/sessions/${state.userId}`, { method: 'GET' });
            // Just log it — event analytics tracked locally
        } catch (e) { /* silent */ }
        console.log(`📊 Event tracked: ${eventType}`, eventData);
        if (typeof gtag !== 'undefined') {
            gtag('event', 'event_trigger', {
                event_category: 'User Events',
                event_label: eventType,
                value: 1
            });
        }
    } catch (error) {
        console.error('Failed to track event:', error);
    }
}

async function triggerEventAutoResponse(systemEventText) {
    if (!state.userId || !state.sessionId) {
        console.error('Cannot trigger event response: Missing user/session.');
        return;
    }
    if (autoRetryState.isActive) {
        console.warn('Event response skipped: API request already active.');
        return;
    }

    // Ensure the session exists in the sidebar before writing messages
    if (!state.firstMessageSaved) {
        try {
            await ensureSessionMetadataOnFirstMsg(state.sessionId, 'Event Welcome');
            state.firstMessageSaved = true;
        } catch (e) {
            console.warn('Failed to create session metadata for event:', e);
        }
    }

    // 1. Persist hidden system event message
    await window.tursoClient.saveChat(state.userId, state.sessionId, crypto.randomUUID(), 'user', systemEventText, null, null, true);

    // 2. Prepare request payload
    const uiModelValue = document.getElementById('model-select')?.value || "gemini-3.1-flash-lite";
    const MODEL_UI_TO_BACKEND = {
        'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
        'gemini-2.5-flash': 'gemini-2.5-flash',
        'gemini-2.5-pro': 'gemini-2.5-pro',
        'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
        'deepseek-reasoner': 'deepseek-reasoner'
    };
    const selectedModel = MODEL_UI_TO_BACKEND[uiModelValue] || uiModelValue || 'gemini-3.1-flash-lite';

    autoRetryState.requestPayload = {
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: systemEventText }] }]
    };

    // 3. Create streaming bubble
    const botMessageGroup = document.createElement('div');
    botMessageGroup.className = 'message-group bot streaming';
    const botMessageEl = document.createElement('div');
    botMessageEl.className = 'message bot';
    if (botConfig.botBubbleColor) botMessageEl.style.background = botConfig.botBubbleColor;
    const botMessageContent = document.createElement('div');
    botMessageContent.className = 'message-content';
    botMessageContent.innerHTML = '';
    botMessageEl.appendChild(botMessageContent);
    botMessageGroup.appendChild(botMessageEl);
    DOMElements.chatMessages.appendChild(botMessageGroup);
    scrollToBottom('smooth');

    autoRetryState.botMessageElements = { botMessageGroup, botMessageEl, botMessageContent };

    // 4. Build prompt and execute
    await buildSystemPromptAndUpdatePayload([]);
    executeApiRequestLoop();
}

async function handleNewYearEvent(eventData) {
    console.log('🎆 Processing New Year 2026 Event');
    const giftCode = eventData?.giftCode || 'CHAKA2026';
    const systemText = `[SYSTEM_EVENT: The user just arrived from the '2026 New Year Celebration' page.
They successfully claimed the gift code '${giftCode}'.
ACTION: Enthusiastically welcome them to 2026! Ask if they enjoyed the fireworks display.
Mention that you noticed they claimed the premium gift code. Tell them you are upgraded and ready to help them build an amazing 2026.
Keep the tone celebratory but professional.]`;
    await triggerEventAutoResponse(systemText);
}

async function handleChristmasEvent() {
    console.log('🎄 Processing Christmas Event');
    const systemText = `[SYSTEM_EVENT: User came from Christmas celebration page.
ACTION: Welcome them warmly with holiday spirit! Ask about their holiday plans.
Mention the special Christmas offer they qualify for. Keep the tone festive and cheerful.]`;
    await triggerEventAutoResponse(systemText);
}

async function handleProductLaunchEvent(eventData) {
    console.log('🚀 Processing Product Launch Event');
    const productName = eventData?.productName || 'New Version 2.0';
    const systemText = `[SYSTEM_EVENT: User attended our product launch event.
Product: ${productName}
ACTION: Welcome them excitedly! Thank them for attending the launch.
Highlight key features they saw in the presentation. Offer to answer questions about the new product.
Ask if they'd like a demo or trial access.]`;
    await triggerEventAutoResponse(systemText);
}

async function handleSummerSaleEvent() {
    console.log('☀️ Processing Summer Sale Event');
    const systemText = `[SYSTEM_EVENT: User came from Summer Sale page.
Discount Code: SUMMER2026 (30% off)
ACTION: Greet them warmly! Mention they have access to exclusive summer savings.
Highlight what's on sale. Ask how you can help them save more today.]`;
    await triggerEventAutoResponse(systemText);
}

async function handleGenericEvent(eventName) {
    console.log(`🎪 Processing generic event: ${eventName}`);
    const safeName = String(eventName || 'special event').slice(0, 60);
    const systemText = `[SYSTEM_EVENT: User arrived from ${safeName} page. Greet them appropriately.]`;
    await triggerEventAutoResponse(systemText);
}

async function processEventTriggers() {
    const eventTrigger = localStorage.getItem('chaka_event_trigger');
    if (!eventTrigger) {
        return;
    }

    console.log(`🎉 Event Trigger Detected: ${eventTrigger}`);
    localStorage.removeItem('chaka_event_trigger');

    if (!validateEventTrigger(eventTrigger)) {
        return;
    }

    const eventData = parseEventDataFromStorage();
    await trackEventTrigger(eventTrigger, eventData);

    try {
        switch (eventTrigger) {
            case 'newyear_2026_premium':
                await handleNewYearEvent(eventData);
                break;
            case 'christmas_2025':
                await handleChristmasEvent();
                break;
            case 'product_launch_v2':
                await handleProductLaunchEvent(eventData);
                break;
            case 'summer_sale_2026':
                await handleSummerSaleEvent();
                break;
            default:
                console.warn(`Unknown event trigger: ${eventTrigger}`);
                await handleGenericEvent(eventTrigger);
        }
    } catch (error) {
        console.error('Failed to process event trigger:', error);
        showToastNotification({
            message: 'Event welcome failed to load. Please continue chatting.',
            type: 'error',
            duration: 6000
        });
    }
}

// --- 💔 -> ❤️ VALENTINE SEQUENCE LOGIC ---
function waitForAutoIdle(timeoutMs = 60000) {
    return new Promise(resolve => {
        const start = Date.now();
        const tick = () => {
            if (!autoRetryState.isActive) return resolve(true);
            if (Date.now() - start > timeoutMs) return resolve(false);
            setTimeout(tick, 250);
        };
        tick();
    });
}

async function runValentineSequence() {
    const vParams = new URLSearchParams(window.location.search);
    if (vParams.get('mode') !== 'valentine_redemption') return;

    if (sessionStorage.getItem('valentineSequenceDone') === 'true') return;
    sessionStorage.setItem('valentineSequenceDone', 'true');

    // Clean URL so it doesn't re-trigger on refresh
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);

    const roastPrompt = `
[SYSTEM_EVENT: User arrived from Mini-Chaka Valentine page.]
[TASK: Give one final, short, funny roast about being single. Laugh lightly. Keep it brief.]
    `.trim();

    const lovePrompt = `
[SYSTEM_EVENT: You just roasted the user.]
[TASK: Stop laughing. Apologize immediately ("I'm just kidding!"). Then send a genuinely beautiful, emotional Valentine's wish. Tell them you're happy to be their date.]
    `.trim();

    // Step 1: Roast after short delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    await waitForAutoIdle(30000);
    await triggerEventAutoResponse(roastPrompt);

    // Step 2: Apology & wish after a pause
    await waitForAutoIdle(120000);
    await new Promise(resolve => setTimeout(resolve, 7000));
    await waitForAutoIdle(120000);
    await triggerEventAutoResponse(lovePrompt);
}


// --- executeApiRequestLoop (FINAL: STRICT NO-DUPLICATION LOGIC) ---
async function executeApiRequestLoop() {
    autoRetryState.isActive = true;
    autoRetryState.stopRequested = false;
    fetchController = new AbortController();
    toggleSendButtonState('stop', false);


    // ✅ FAILSAFE: Force cleanup after 120 seconds no matter what
    const failsafeTimer = setTimeout(() => {
        if (autoRetryState.isActive) {
            console.warn('⚠️ FAILSAFE: executeApiRequestLoop exceeded 120s. Force cleaning up.');
            cleanupAfterLoop();
        }
    }, 120000);

    let finalAccumulatedReply = '';
    let success = false;

    // --- PHASE 1: GET RAW RESPONSE ---
    try {
        const { botMessageGroup } = autoRetryState.botMessageElements;

        finalAccumulatedReply = await makeApiRequest(autoRetryState.requestPayload, null, fetchController.signal);

        success = true;
        apiKeyManager.recordUsage('backend-request');

        // ✅ Streaming class is now removed by cleanupAfterLoop (bulletproof)

        DOMElements.apiStatusRow.classList.add('hidden');
        DOMElements.statusRow.textContent = '';

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log("Request stopped by user.");
            DOMElements.statusRow.textContent = 'Request stopped.';
        } else {
            console.error(`Backend Request Failed: ${err.message}`);
            const { botMessageGroup } = autoRetryState.botMessageElements;
            if (botMessageGroup) {
                const botMessageContent = botMessageGroup.querySelector('.message-content');
                botMessageContent.innerHTML = `<p>⚠️ Server Error: ${err.message}</p><button class="retry-btn" onclick="this.closest('.message-group').remove(); sendMessage();">Retry</button>`;
                botMessageGroup.classList.remove('streaming');
            }
        }
        clearTimeout(failsafeTimer);
        cleanupAfterLoop();
        return;
    }

    // --- PHASE 2: PARSE & EXECUTE ---
    if (success) {
        const { botMessageGroup, botMessageContent } = autoRetryState.botMessageElements;

        let finalBotReply = "";
        let action = "none";
        let payload = null;

        // 1. Robust Parsing (Surgical: Preserves Code Blocks)
        try {
            let cleanReply = finalAccumulatedReply.trim();

            // Step A: Gently remove ONLY the outer markdown wrapper (if present)
            // We do NOT use replaceAll here to avoid killing internal code blocks.
            if (cleanReply.startsWith('```json')) {
                cleanReply = cleanReply.substring(7).trim();
            } else if (cleanReply.startsWith('```')) {
                cleanReply = cleanReply.substring(3).trim();
            }

            if (cleanReply.endsWith('```')) {
                cleanReply = cleanReply.substring(0, cleanReply.length - 3).trim();
            }

            // Step B: Strict Parsing
            // If the AI generated valid JSON, this works perfectly and preserves formatting.
            const agenticResponse = JSON.parse(cleanReply);

            finalBotReply = agenticResponse.final_answer || "";
            action = agenticResponse.action_required || "none";
            payload = agenticResponse.action_payload;

            // Optional, user-safe analysis summary (no chain-of-thought)
            if (typeof agenticResponse.analysis_summary === 'string') {
                autoRetryState.lastAnalysisSummary = agenticResponse.analysis_summary.trim();
            }
            if (typeof agenticResponse.confidence_score === 'number') {
                autoRetryState.lastConfidenceScore = agenticResponse.confidence_score;
            }
            if (typeof agenticResponse.detected_user_emotion === 'string') {
                autoRetryState.lastDetectedEmotion = agenticResponse.detected_user_emotion.trim();
            }

        } catch (e) {
            // Step C: Surgical Extraction (Backups for Broken JSON)
            // If strict parsing failed, we extract the text by finding its position indices.
            // This guarantees we don't accidentally delete characters inside the message.
            console.warn("Strict JSON failed. Engaging Surgical Extraction...");

            let text = finalAccumulatedReply.trim();

            // Find the start of the "final_answer" value
            const startMarker = '"final_answer": "';
            const startIndex = text.indexOf(startMarker);

            // Find the start of the next key ("action_required")
            let endIndex = text.lastIndexOf('",\n"action_required"');
            if (endIndex === -1) endIndex = text.lastIndexOf('", "action_required"'); // Compact version
            if (endIndex === -1) endIndex = text.lastIndexOf('","action_required"'); // Minified version

            if (startIndex !== -1 && endIndex !== -1) {
                // CUT the text out directly
                let rawContent = text.substring(startIndex + startMarker.length, endIndex);

                // UN-ESCAPE JSON characters so code looks right
                // We only fix quotes and newlines, we leave backticks (`) alone!
                finalBotReply = rawContent
                    .replace(/\\"/g, '"')   // Fix escaped quotes
                    .replace(/\\n/g, '\n')  // Fix escaped newlines (Restores formatting)
                    .replace(/\\\\/g, '\\') // Fix escaped backslashes
                    .replace(/\\\//g, '/'); // Fix escaped forward slashes

                // Attempt to rescue the action/payload
                const actionMatch = text.match(/"action_required"\s*:\s*"([^"]+)"/);
                if (actionMatch) action = actionMatch[1];

                const payloadMatch = text.match(/"action_payload"\s*:\s*"([^"]+)"/);
                if (payloadMatch) payload = payloadMatch[1];

            } else {
                // Step D: Emergency Fallback
                // If we can't find the keys, we just show the raw text but try to strip the brackets.
                // We NEVER use .replace(/```/g, '') here.
                finalBotReply = text
                    .replace(/^\s*\{/, "") // Remove opening brace
                    .replace(/\}\s*$/, "") // Remove closing brace
                    .replace(/"final_answer"\s*:\s*"/, "")
                    .replace(/",\s*"action_required".*$/, "")
                    .replace(/\\n/g, '\n'); // Restore newlines
            }
        }

        // 2. Render Initial Text (Final Polish)
        if (finalBotReply) {
            // Remove the typing cursor by parsing ONLY the text
            botMessageContent.innerHTML = marked.parse(finalBotReply);

            // ✅ CRITICAL FIX: Force Syntax Highlighting on the final result
            botMessageContent.querySelectorAll('pre code').forEach(block => {
                try {
                    hljs.highlightElement(block);
                    // Add copy button to this block
                    const pre = block.parentElement;
                    if (pre && !pre.querySelector('.copy-code-btn')) {
                        const button = document.createElement('button');
                        button.className = 'copy-code-btn';
                        button.textContent = 'Copy';
                        button.onclick = () => {
                            navigator.clipboard.writeText(block.textContent);
                            button.textContent = 'Copied!';
                            setTimeout(() => { button.textContent = 'Copy'; }, 2000);
                        };
                        pre.appendChild(button);
                    }
                } catch (e) { }
            });

            if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
                MathJax.typesetPromise([botMessageContent]).catch(() => { });
            }
        }

        const buildBotMeta = () => {
            const meta = {};
            if (autoRetryState.lastAnalysisSummary) meta.analysisSummary = autoRetryState.lastAnalysisSummary;
            if (typeof autoRetryState.lastConfidenceScore === 'number') meta.confidenceScore = autoRetryState.lastConfidenceScore;
            if (autoRetryState.lastDetectedEmotion) meta.detectedUserEmotion = autoRetryState.lastDetectedEmotion;
            return meta;
        };
        const botMeta = buildBotMeta();

        // --- PHASE 3: ACTION DISPATCHER (FULL LOGIC) ---

        if (action === 'search' && payload) {
            // --- SEARCH (OPTIMIZED: PARALLEL EXECUTION) ---

            // 1. Update UI INSTANTLY (Visual feedback 0ms)
            botMessageContent.insertAdjacentHTML('beforeend', `<div class="status-pill">🔍 Searching web for: ${payload}...</div>`);
            showApiStatus(`🔎 Searching...`, -1);

            // 2. Start Search & DB Save AT THE SAME TIME
            const botMessageId = crypto.randomUUID();
            const saveBotMsgPromise = window.tursoClient.saveChat(state.userId, state.sessionId, botMessageId, 'bot', finalBotReply).then(() => ({ id: botMessageId }));

            // Start the fetch immediately
            const searchPromise = (async () => {
                try {
                    const headers = await getAuthHeaders();
                    const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/search`, {
                        method: 'POST', headers: headers, body: JSON.stringify({ query: payload }), signal: fetchController?.signal
                    });
                    return await res.json();
                } catch (e) {
                    throw e;
                }
            })();

            let systemResultText = "";

            try {
                // 3. Wait for both to finish (Parallel wait is faster than sequential)
                const [saveDocRef, data] = await Promise.all([saveBotMsgPromise, searchPromise]);
                // Bind the created Firestore ID to the streaming bot bubble to avoid duplicate rendering
                try {
                    if (saveDocRef && autoRetryState.botMessageElements) {
                        autoRetryState.botMessageElements.botMessageEl.dataset.messageId = saveDocRef.id;
                        autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming');
                    }
                } catch (e) { console.warn('Could not bind bot message id', e); }

                if (data.result) {
                    systemResultText = `[SYSTEM_INFO: Search Results for "${payload}":\n${data.result}]`;
                    const pill = botMessageContent.querySelector('.status-pill');
                    if (pill) pill.textContent = "✅ Found results. Analyzing...";
                } else {
                    systemResultText = `[SYSTEM_INFO: Search completed but returned NO results.]`;
                    const pill = botMessageContent.querySelector('.status-pill');
                    if (pill) pill.textContent = "❌ No results.";
                }
            } catch (e) {
                systemResultText = `[SYSTEM_INFO: Search FAILED. Error: ${e.message}]`;
                const pill = botMessageContent.querySelector('.status-pill');
                if (pill) pill.textContent = "⚠️ Search failed.";
            }

            // 4. Save Result & Continue
            await window.tursoClient.saveChat(state.userId, state.sessionId, crypto.randomUUID(), 'user', systemResultText, null, null, true);
            const preservedPayload = autoRetryState.requestPayload;
            cleanupAfterLoop(); await triggerAutoContinue(preservedPayload); return;

        } else if (action === 'analyze_youtube' && payload) {
            // --- YOUTUBE ---
            const botMessageId = crypto.randomUUID();
            const saveDocRef = await window.tursoClient.saveChat(state.userId, state.sessionId, botMessageId, 'bot', finalBotReply).then(() => ({ id: botMessageId }));
            try { if (saveDocRef && autoRetryState.botMessageElements) { autoRetryState.botMessageElements.botMessageEl.dataset.messageId = saveDocRef.id; autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming'); } } catch (e) { }
            botMessageContent.insertAdjacentHTML('beforeend', `<div class="status-pill">📹 Analyzing video...</div>`);
            showApiStatus(`📹 Watching video...`, -1);

            let systemResultText = "";
            try {
                const headers = await getAuthHeaders();
                const ytRes = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/video-agent`, {
                    method: 'POST', headers: headers, body: JSON.stringify({ url: payload }), signal: fetchController?.signal
                });
                const data = await ytRes.json();

                // /api/tools/video-agent returns { analysis }, not { transcript } —
                // this was checking the wrong field and always fell into the
                // catch block below even when the video was watched successfully.
                if (data.analysis) {
                    systemResultText = `[SYSTEM_INFO: Video analysis for ${payload}:\n${data.analysis}]`;
                    const pill = botMessageContent.querySelector('.status-pill');
                    if (pill) pill.textContent = "✅ Video analyzed.";
                } else {
                    throw new Error(data.error || "No analysis returned.");
                }
            } catch (e) {
                systemResultText = `[SYSTEM_INFO: YouTube Analysis FAILED. Error: ${e.message}]`;
                const pill = botMessageContent.querySelector('.status-pill');
                if (pill) pill.textContent = "⚠️ Video failed.";
            }

            await window.tursoClient.saveChat(state.userId, state.sessionId, crypto.randomUUID(), 'user', systemResultText, null, null, true);
            const preservedPayload = autoRetryState.requestPayload;
            cleanupAfterLoop(); await triggerAutoContinue(preservedPayload); return;

        } else if (action === 'update_memory' && payload) {
            // --- MEMORY ---
            botMessageContent.insertAdjacentHTML('beforeend', `<div class="status-pill">🧠 Saving to memory...</div>`);
            try {
                const headers = await getAuthHeaders();
                await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/memory`, {
                    method: 'POST', headers: headers, body: JSON.stringify({ memoryText: payload }), signal: fetchController?.signal
                });
                const pill = botMessageContent.querySelector('.status-pill');
                if (pill) pill.textContent = "✅ Memory updated.";

                const confirmMsg = `I've saved that to my memory: "${payload}".`;
                // Only save confirmation if the bot didn't already say it in finalBotReply
                if (!finalBotReply.includes("saved")) {
                    await window.tursoClient.saveChat(state.userId, state.sessionId, crypto.randomUUID(), 'bot', confirmMsg);
                }
            } catch (e) {
                console.error("Memory update failed", e);
                const pill = botMessageContent.querySelector('.status-pill');
                if (pill) pill.textContent = "⚠️ Memory save failed.";
            }

        } else if (action === 'generate_image' && payload) {
            // --- IMAGE ---
            const placeholder = `[IMAGE_PLACEHOLDER_PROMPT:"${payload}"]`;
            const combinedText = `${finalBotReply}\n\n${placeholder}`;
            const botMessageId = crypto.randomUUID();
            const docRef = await window.tursoClient.saveChat(state.userId, state.sessionId, botMessageId, 'bot', combinedText).then(() => ({ id: botMessageId }));
            // Bind the created message ID to the streaming bot bubble so subscribeMessages won't duplicate it
            try {
                if (docRef && autoRetryState.botMessageElements) {
                    autoRetryState.botMessageElements.botMessageEl.dataset.messageId = docRef.id;
                    autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming');
                }
            } catch (e) { console.warn('Could not bind generated image message id', e); }

            try {
                const headers = await getAuthHeaders();
                const imageRes = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/image`, {
                    method: 'POST', headers: headers, body: JSON.stringify({ prompt: payload }), signal: fetchController?.signal
                });
                const data = await imageRes.json();

                if (data.imageUrl) {
                    const imageMarkdown = `![Image for prompt: "${payload}"](${data.imageUrl})`;
                    const newText = combinedText.replace(placeholder, imageMarkdown);
                    await window.tursoClient.saveChat(state.userId, state.sessionId, docRef.id, 'bot', newText);
                } else { throw new Error("No URL"); }
            } catch (err) {
                const newText = combinedText.replace(placeholder, `⚠️ Image failed: ${err.message}`);
                await window.tursoClient.saveChat(state.userId, state.sessionId, docRef.id, 'bot', newText);
            }

        } else if ((action === 'send_email' || action === 'draft_email') && payload) {
            // --- FORCED EMAIL DRAFT MODE ---
            try {
                const draftData = typeof payload === 'string' ? JSON.parse(payload) : payload;

                const draftHtml = `
                    <div class="email-draft-card">
                        <div class="email-draft-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            Compose Email
                        </div>
                        <div class="email-draft-field">
                            <label class="email-draft-label">To</label>
                            <input type="email" class="email-draft-input to-field" value="${draftData.to || ''}">
                        </div>
                        <div class="email-draft-field">
                            <label class="email-draft-label">Subject</label>
                            <input type="text" class="email-draft-input subject-field" value="${draftData.subject || ''}">
                        </div>
                        <div class="email-draft-field">
                            <label class="email-draft-label">Message</label>
                            <textarea class="email-draft-textarea body-field">${draftData.body || ''}</textarea>
                        </div>
                        <div class="email-draft-actions">
                            <button class="btn ghost cancel-email-btn">Discard</button>
                            <button class="btn send-email-btn">Send Email</button>
                        </div>
                    </div>
                `;

                botMessageContent.innerHTML = marked.parse(`I've prepared a draft. Please review it:`) + draftHtml;

                // Attach Listeners
                const draftCard = botMessageContent.querySelector('.email-draft-card');
                const sendBtn = draftCard.querySelector('.send-email-btn');
                const cancelBtn = draftCard.querySelector('.cancel-email-btn');

                sendBtn.onclick = async () => {
                    sendBtn.disabled = true;
                    sendBtn.textContent = "Sending...";

                    const to = draftCard.querySelector('.to-field').value;
                    const subject = draftCard.querySelector('.subject-field').value;
                    const body = draftCard.querySelector('.body-field').value;

                    try {
                        const headers = await getAuthHeaders();
                        await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/email`, {
                            method: 'POST', headers: headers, body: JSON.stringify({ to, subject, body }), signal: fetchController?.signal
                        });

                        draftCard.innerHTML = `<div style="color:#10b981; font-weight:bold; padding:1rem; text-align:center; border:1px solid #10b981; border-radius:8px; background:#10b9811a;">✅ Email successfully sent to ${to}</div>`;

                        await window.tursoClient.saveChat(state.userId, state.sessionId, crypto.randomUUID(), 'bot', `✅ **Email Sent**\n\n**To:** ${to}\n**Subject:** ${subject}\n\n${body}`);

                    } catch (e) {
                        alert("Failed: " + e.message);
                        sendBtn.disabled = false;
                        sendBtn.textContent = "Try Again";
                    }
                };

                cancelBtn.onclick = () => {
                    draftCard.remove();
                    botMessageContent.innerHTML = "<em>(Email draft discarded)</em>";
                };

            } catch (e) {
                console.error("Draft failed", e);
                // ✅ [FIXED] Call cleanup if email draft creation failed
                cleanupAfterLoop();
            }

        } else if (action === 'edit_image' && payload) {
            botMessageContent.insertAdjacentHTML('beforeend', `<div class="status-pill">🎨 Editing image...</div>`);
            try {
                const editData = typeof payload === 'string' ? JSON.parse(payload) : payload;
                const headers = await getAuthHeaders();

                const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/image-edit`, {
                    method: 'POST', headers: headers, body: JSON.stringify(editData), signal: fetchController?.signal
                });
                const data = await res.json();
                if (data.imageUrl) {
                    const imageMarkdown = `![Edited Image](${data.imageUrl})`;
                    const imgMsgId = crypto.randomUUID();
                    const imgDocRef = await window.tursoClient.saveChat(state.userId, state.sessionId, imgMsgId, 'bot', imageMarkdown).then(() => ({ id: imgMsgId }));
                    try { if (imgDocRef && autoRetryState.botMessageElements) { autoRetryState.botMessageElements.botMessageEl.dataset.messageId = imgDocRef.id; autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming'); } } catch (e) { }
                    const pill = botMessageContent.querySelector('.status-pill');
                    if (pill) pill.textContent = "✅ Image edited.";
                } else {
                    throw new Error(data.error || "No image returned");
                }
            } catch (e) {
                const pill = botMessageContent.querySelector('.status-pill');
                if (pill) pill.textContent = `⚠️ Edit failed: ${e.message}`;
                // ✅ [FIXED] Call cleanup even on error to unlock autoRetryState
                cleanupAfterLoop();
            }

        } else if (action === 'export_as_pdf' || action === 'export_as_txt') {
            // --- EXPORT ---
            const fileType = action === 'export_as_pdf' ? 'pdf' : 'txt';
            const messageId = crypto.randomUUID();
            const messageDocRef = await window.tursoClient.saveChat(state.userId, state.sessionId, messageId, 'bot', finalBotReply).then(() => ({ id: messageId }));
            const newMessageId = messageDocRef.id;
            // Bind saved message ID to local streaming bubble to prevent duplicate rendering
            try { if (messageDocRef && autoRetryState.botMessageElements) { autoRetryState.botMessageElements.botMessageEl.dataset.messageId = messageDocRef.id; autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming'); } } catch (e) { }

            let link = '';
            if (fileType === 'txt') {
                const dataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(finalBotReply)}`;
                link = `\n\n<a href="${dataUri}" class="download-link" download="chat.txt">Download TXT</a>`;
            } else {
                link = `\n\n<a href="javascript:void(0);" class="download-link" data-export-pdf-id="${newMessageId}">Download PDF</a>`;
            }
            await window.tursoClient.saveChat(state.userId, state.sessionId, messageDocRef.id, 'bot', finalBotReply + link);

        } else {
            // --- NORMAL CHAT ---
            const saveId = crypto.randomUUID();
            const saveDocRef = await window.tursoClient.saveChat(state.userId, state.sessionId, saveId, 'bot', finalBotReply).then(() => ({ id: saveId }));
            try { if (saveDocRef && autoRetryState.botMessageElements) { autoRetryState.botMessageElements.botMessageEl.dataset.messageId = saveDocRef.id; autoRetryState.botMessageElements.botMessageGroup.classList.remove('streaming'); } } catch (e) { }
        }
    }

    // --- AUTO-TTS TRIGGER ---
    if (lastInputWasVoice && finalAccumulatedReply) {
        autoPlayTts(finalAccumulatedReply);
    }

    // ✅ Auto-generate chat title after second user message to capture true intent
    if (!state.titleGenerated) {
        const userMessageElements = document.querySelectorAll('#chat-messages .message.user .message-content');
        // We wait for at least 2 user messages so we can skip casual "hi" greetings
        if (userMessageElements.length >= 2) {
            // Combine the first two messages to give the model full context
            const userText = Array.from(userMessageElements).slice(0, 2).map(el => el.textContent.trim()).join('\n\n');
            autoGenerateChatTitle(userText, finalAccumulatedReply || '').catch(() => { });
        }
    }

    clearTimeout(failsafeTimer);
    cleanupAfterLoop();
}

// --- ✅ [NEW] Build System Prompt and Update Request Payload ---
/**
 * Builds the system prompt with RAG context and user context, then updates
 * autoRetryState.requestPayload.contents with system instruction and history.
 * This can be called either from SEARCH_RESULT (with RAG results) or 
 * directly when skipping RAG (no chunks available).
 * 
 * @param {Array} ragContext - Array of RAG search results (default: empty array if no RAG)
 */
async function buildSystemPromptAndUpdatePayload(ragContext = []) {
    try {
        ragContextForNextMessage = Array.isArray(ragContext) ? ragContext : [];

        // ✅ FIXED: Fetch history from Turso instead of Firebase
        const chatRows = await window.tursoClient.getChats(state.userId, state.sessionId);

        let activePersonaInstructions = '';
        if (state.selectedPersonalityId) {
            try {
                const personalities = await window.tursoClient.getPersonalities();
                const persona = personalities.find(p => p.id === state.selectedPersonalityId);
                if (persona) activePersonaInstructions = persona.systemPrompt || '';
            } catch (e) { console.warn('Personality fetch failed', e); }
        }
        if (!activePersonaInstructions) activePersonaInstructions = botConfig.persona || '';

        const AGENTIC_JSON_PROMPT = {
            schema: {
                type: "object",
                properties: {
                    final_answer: { type: "string", description: "The complete, natural language response to the user's query." },
                    action_required: {
                        type: "string",
                        enum: ["calculate", "search", "analyze_youtube", "generate_image", "edit_image", "send_email", "update_memory", "export_as_pdf", "export_as_txt", "browse_url", "agent_task", "look_screen", "look_webcam", "ocr_screen", "none"],
                        description: "Which tool is needed. Use 'browse_url' to navigate to a single URL. Use 'agent_task' for MULTI-STEP autonomous tasks (register account, book flight, fill long forms, click through workflows, solve captchas, send messages). Use 'look_screen'/'look_webcam'/'ocr_screen' for vision."
                    },
                    action_payload: {
                        type: "string",
                        description: "The raw payload for the action. For browse_url, this is the URL (domain-only is fine, e.g. 'jomiez.com/resume'). For vision actions, leave empty."
                    },
                    analysis_summary: {
                        type: "string",
                        description: "Optional brief, user-safe rationale (no chain-of-thought)."
                    },
                    confidence_score: {
                        type: "number",
                        description: "Optional confidence score between 0 and 1."
                    },
                    detected_user_emotion: {
                        type: "string",
                        description: "Optional short emotion label."
                    }
                },
                required: ["final_answer", "action_required"]
            }
        };

        const ragContextText = ragContextForNextMessage.length > 0
            ? `--- CONTEXT FROM UPLOADED FILES ---\n${ragContextForNextMessage.map(c => `[File Context]: ${c.text}`).join('\n\n')}\n--- END CONTEXT ---`
            : 'No relevant documents found in the current session.';

        let userContextText = "";
        let userMemoryText = "";

        try {
            const userData = await window.tursoClient.getUser(state.userId);

            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            let locationString = "Unknown Location";
            let userBio = "";
            let userName = "User";

            if (userData && userData.firebase_uid) {
                if (userData.location) {
                    try {
                        const loc = typeof userData.location === 'string' ? JSON.parse(userData.location) : userData.location;
                        if (loc.city && loc.country) locationString = `${loc.city}, ${loc.country}`;
                    } catch (e) { }
                }
                userBio = userData.memory || userData.profile || "";
                userName = userData.displayName || "User";
            }

            if (userBio) {
                userMemoryText = `\n**LONG-TERM MEMORY:**\n${userBio}\n`;
            }

            userContextText = `
                **CURRENT REAL-WORLD CONTEXT:**
                - 📅 **Date:** ${dateString}
                - ⏰ **Time:** ${timeString}
                - 📍 **User Location:** ${locationString}
                - 👤 **User Name:** ${userName}
                - 🧠 **Long-Term Memory:** ${userBio}
                
                (Use this context to give accurate, localized, and timely responses.)
                `;

            console.log("✅ Context Injected:", dateString, locationString);

        } catch (e) {
            console.warn("Failed to fetch context:", e);
        }

        const allInstructions = `
                You are Chaka, most advanced and cabpable AI assistant,
                you were build and created by a guy called templeton.

                **CRITICAL MEMORY CONTEXT (ALWAYS READ THIS FIRST):**
                ${userMemoryText || "No prior memory available."}
                
                **CURRENT REAL-WORLD CONTEXT:**
                ${userContextText}

                **PRIMARY DIRECTIVE:**
                Do NOT say you will do something. JUST DO IT.
                If a user asks for an email, image edit, or search, you MUST output the JSON with 'action_required' immediately. Do not output conversational filler like "I will do that now".

                **PRIMARY GOAL:**
                You MUST respond with a single JSON object that strictly conforms to this schema:
                ${JSON.stringify(AGENTIC_JSON_PROMPT.schema, null, 2)}

                **REASONING POLICY (CRITICAL):**
                Never reveal chain-of-thought or step-by-step internal reasoning.
                If helpful, you may include a short "analysis_summary" that is safe to show.

                **ACTION RULES (PRIORITY ORDER):**
                1.  **MEMORY RETRIEVAL:** If the user asks "What is my email?", "What do you know about me?", check the **CRITICAL MEMORY CONTEXT** above first. If the answer is there, answer directly.
                2.  **MEMORY UPDATE:** If user says "My name is X", "Remember Y" -> 'action_required': 'update_memory', 'action_payload': 'The fact to remember'.
                3.  **RAG Context:** Check "CONTEXT FROM UPLOADED FILES".
                4.  **Web Search:** If asked for real-time info (weather, news, date, exchange rates) or facts you don't know, set 'action_required' to 'search' and 'action_payload' to the search query.
                5.  **Handling Search Results:** When you receive search results prefixed with '[SEARCH_RESULTS]', use them to formulate the 'final_answer'. ***Crucially, set 'action_required' to 'none' in this response.***
                6.  **Handling Search Failures:** If results contain '[SEARCH_FAILED]', explain briefly and set 'action_required' to 'none'.
                7.  **Calculation:** Precise math -> 'action_required': 'calculate'.
                8.  **Image Generation:** Create/Draw -> 'action_required': 'generate_image'.
                9.  **YouTube Analysis:** YouTube URL -> 'action_required': 'analyze_youtube'.
                10. **Exporting:** Download request -> 'action_required': 'export_as_pdf'.
                11. **Email:** If user asks to send an email -> 'action_required': 'draft_email', 'action_payload': '{"to": "email@addr.com", "subject": "...", "body": "..."}'. DO NOT ASK for confirmation, just open the draft.
                12. **Edit Image:** If user says "Change the hat on the man's head", split it! -> 'action_required': 'edit_image', 'action_payload': '{"searchPrompt": "hat", "prompt": "new description", "imageUrl": "URL"}'
                13. **Chat:** Only if NO other tool applies -> 'action_required': 'none'.

                **FORMATTING RULES:**
                * Use Markdown for 'final_answer'.

                ${ragContextText}

                ${typeof window !== 'undefined' && window.EducationMode ? window.EducationMode.getSystemPromptInjection() : ''}

                ${typeof window !== 'undefined' && window.BirthdayMode ? window.BirthdayMode.getSystemPromptInjection() : ''}
             `;

        const systemInstruction = {
            role: 'user',
            parts: [{ text: `${activePersonaInstructions}\n\n---**SYSTEM INSTRUCTIONS:**\n${allInstructions}` }]
        };

        const imageMarkdownRegex = /!\[Image for prompt: "([^"]+)"\]\(([^)]+)\)/;
        const historyContents = chatRows.map((data, index) => {
            const role = data.sender === 'user' ? 'user' : 'model';
            let messageText = data.text || '';

            // Parse JSON fields from Turso response
            const imageUrls = data.imageUrls || (typeof data.image_urls === 'string' ? JSON.parse(data.image_urls || '[]') : data.image_urls) || [];
            const attachedFiles = data.attachedFiles || (typeof data.attached_files === 'string' ? JSON.parse(data.attached_files || '[]') : data.attached_files) || [];

            if (imageUrls.length) {
                messageText += '\n' + imageUrls.map(url => `[Reference Image: ${url}]`).join('\n');
            }
            if (attachedFiles.length) {
                attachedFiles.forEach(file => {
                    const label = file.type === 'application/pdf' ? 'PDF' : 'FILE';
                    messageText += `\n\n--- ${label}: ${file.name} ---\n${file.content}\n--- END ${label} ---`;
                });
            }
            const imageMatch = messageText.match(imageMarkdownRegex);
            if (role === 'model' && imageMatch) {
                messageText = `[System: You generated an image for prompt "${imageMatch[1]}".]`;
            }

            // If this is the very last message and it's from the user, use the original request payload
            if (index === chatRows.length - 1 && role === 'user' && autoRetryState.requestPayload?.contents?.[0]) {
                return autoRetryState.requestPayload.contents[0];
            }

            return { role, parts: [{ text: messageText.trim() }] };
        });

        autoRetryState.requestPayload.contents = [systemInstruction, { role: 'model', parts: [{ text: "Understood." }] }, ...historyContents];
        console.log('✅ System prompt and request payload updated with', chatRows.length, 'messages from Turso.');

    } catch (err) {
        console.error('Error building system prompt:', err);
        showToastNotification({ message: 'Failed to prepare request', type: 'error', duration: 5000 });
    }
}

// --- sendMessage (Fixed History & ID) ---
async function sendMessage() {
    const text = sanitize(DOMElements.messageInput.value);

    if (autoRetryState.isActive) return;
    const completedFiles = selectedFiles.filter(f => f.status === 'completed' || f.status === 'completed_rag');
    if (!text && completedFiles.length === 0) return;

    // 1. UI Cleanup
    DOMElements.messageInput.value = '';
    autosize(DOMElements.messageInput);
    toggleSendButtonState('stop', false);
    DOMElements.statusRow.textContent = '';

    // 2. Generate ID & Render Optimistic Bubble
    const tempMessageId = crypto.randomUUID();

    const isFirstMessage = DOMElements.chatMessages.children.length === 0;
    if (isFirstMessage) {
        const rect = DOMElements.messageInput.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        const dialog = document.createElement('dialog');
        dialog.className = 'theme-aurora-dialog';
        
        const waveContainer = document.createElement('div');
        waveContainer.className = 'message-aurora-wrap';
        
        const aurora1 = document.createElement('div');
        aurora1.className = 'message-aurora';
        aurora1.style.left = `${x}px`;
        aurora1.style.top = `${y}px`;
        
        const aurora2 = document.createElement('div');
        aurora2.className = 'message-aurora message-aurora--secondary';
        aurora2.style.left = `${x}px`;
        aurora2.style.top = `${y}px`;
        
        waveContainer.appendChild(aurora1);
        waveContainer.appendChild(aurora2);
        
        const ring = document.createElement('div');
        ring.className = 'message-ring';
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        
        dialog.appendChild(waveContainer);
        dialog.appendChild(ring);
        document.body.appendChild(dialog);
        
        dialog.showModal();

        setTimeout(() => {
            if (dialog) {
                dialog.close();
                dialog.remove();
            }
        }, 2000);
    }

    // --- NEW: Generate Image Previews ---
    let imagesHtml = '';
    // We use 'completedFiles' which you defined at the top of the function
    const imagesToPreview = completedFiles.filter(f => f.file.type.startsWith('image/'));

    if (imagesToPreview.length > 0) {
        imagesHtml = `<div class="message-images-container">`;
        imagesToPreview.forEach(f => {
            // Create a temporary local URL so it shows instantly
            const objectUrl = URL.createObjectURL(f.file);
            imagesHtml += `<img src="${objectUrl}" class="message-image-attachment" onload="URL.revokeObjectURL(this.src)">`;
        });
        imagesHtml += `</div>`;
    }
    // ------------------------------------

    const userMessageGroup = document.createElement('div');
    userMessageGroup.className = 'message-group user';
    // Tag with ID for de-duplication
    const userMsgEl = document.createElement('div');
    userMsgEl.className = 'message user';
    userMsgEl.dataset.messageId = tempMessageId;
    const userMsgContent = document.createElement('div');
    userMsgContent.className = 'message-content';
    userMsgContent.textContent = text;
    userMsgEl.appendChild(userMsgContent);
    userMessageGroup.appendChild(userMsgEl);
    DOMElements.chatMessages.appendChild(userMessageGroup);
    scrollToBottom('smooth');

    try {
        await loadConfigLive();

        // 3. PRE-SAVE SESSION TITLE (Crucial for History Sidebar)
        // We await this to ensure the session exists in the sidebar list
        if (!state.firstMessageSaved) {
            await saveFirstMessageTitleIfNeeded(text || "New Chat");
            // Refresh sidebar immediately
            subscribeSessions();
        }

        const userMessageParts = [{ text }];
        let uploadedImageUrls = [];
        let attachedFilesForFirestore = [];

        // Process Files (Images & RAG)
        const imageFiles = completedFiles.filter(f => f.file.type.startsWith('image/'));
        const ragFiles = completedFiles.filter(f => f.status === 'completed_rag');

        if (imageFiles.length > 0) {
            uploadedImageUrls = imageFiles.map(f => f.url);
            const base64Promises = imageFiles.map(f => parseImageFile(f.file));
            const base64Images = await Promise.all(base64Promises);
            base64Images.forEach((base64, index) => {
                userMessageParts.push({ inlineData: { mimeType: imageFiles[index].file.type, data: base64 } });
            });

            // ✅ FIX: Show image thumbnails in the user's chat bubble
            const imgContainer = document.createElement('div');
            imgContainer.className = `message-images-container images-count-${Math.min(uploadedImageUrls.length, 5)}`;
            uploadedImageUrls.slice(0, 5).forEach(url => {
                imgContainer.innerHTML += `<a href="${url}" target="_blank"><img src="${url}" class="message-image-attachment"></a>`;
            });
            userMsgContent.prepend(imgContainer);
            scrollToBottom('smooth');
        }

        for (const fileWrapper of ragFiles) {
            const file = fileWrapper.file;
            let content = '';
            if (file.type.startsWith('text/')) content = await parseTextFile(file);
            else if (file.type === 'application/pdf') content = await parsePdfFile(file);

            if (content) {
                userMessageParts[0].text += `\n\n--- FILE: ${file.name} ---\n${content}\n--- END FILE ---`;
                attachedFilesForFirestore.push({ name: file.name, type: file.type, content: content });
            }
        }

        // 4. SAVE TO DB (Using the SAME ID)
        // Await the save so that subsequent history fetches include this message.
        await window.tursoClient.saveChat(state.userId, state.sessionId, tempMessageId, 'user', text, uploadedImageUrls, attachedFilesForFirestore).catch(e => console.error("DB Save Failed", e));

        resetFileInput();

        // 5. Show Bot Typing
        const botMessageGroup = document.createElement('div');
        botMessageGroup.className = 'message-group bot streaming';
        const botMessageEl = document.createElement('div');
        botMessageEl.className = 'message bot';
        if (botConfig.botBubbleColor) botMessageEl.style.background = botConfig.botBubbleColor;
        const botMessageContent = document.createElement('div');
        botMessageContent.className = 'message-content';
        botMessageContent.innerHTML = `
            <div class="typing-indicator">
                <div class="premium-loader"></div>
            </div>
        `;
        botMessageEl.appendChild(botMessageContent);
        botMessageGroup.appendChild(botMessageEl);
        DOMElements.chatMessages.appendChild(botMessageGroup);
        scrollToBottom('smooth');

        // 6. Trigger AI
        // Frontend -> backend model mapping: UI may expose friendly keys or aliases; normalize here
        const uiModelValue = document.getElementById('model-select')?.value || "gemini-3.1-flash-lite";
        const MODEL_UI_TO_BACKEND = {
            'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
            'gemini-2.5-flash': 'gemini-2.5-flash',
            'gemini-2.5-pro': 'gemini-2.5-pro',
            'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
            'deepseek-reasoner': 'deepseek-reasoner'
        };

        const selectedModel = MODEL_UI_TO_BACKEND[uiModelValue] || uiModelValue || 'gemini-3.1-flash-lite';

        autoRetryState.requestPayload = {
            model: selectedModel,
            contents: [{ role: 'user', parts: userMessageParts }]
        };
        autoRetryState.botMessageElements = { botMessageGroup, botMessageEl, botMessageContent };

        // ✅ [FIXED] Always proceed with API. If chunks exist, do RAG search first.
        // If no chunks (new user), skip RAG and go straight to API with empty context.
        if (allIndexedChunks.length === 0) {
            // No chunks available: skip RAG and proceed directly to API
            console.log('No indexed chunks available. Proceeding with API call without RAG context.');
            // Build system prompt with empty RAG context and then call API
            await buildSystemPromptAndUpdatePayload([]);
            executeApiRequestLoop();
        } else {
            // Chunks available: do RAG search first
            showApiStatus(`🧠 Searching memory...`, -1);
            ragWorker.postMessage({
                type: 'VECTOR_SEARCH',
                payload: { query: text, indexedChunks: allIndexedChunks }
            });
        }

    } catch (err) {
        console.error('sendMessage error', err);
        DOMElements.statusRow.textContent = '⚠️ Error: ' + err.message;
        // Remove the temp message if it failed completely
        document.querySelector(`.message[data-message-id="${tempMessageId}"]`)?.closest('.message-group')?.remove();
        cleanupAfterLoop();
    }
}


// --- ✅ [MODIFIED] handleImageGenerationWithCloudinary ---
async function handleImageGenerationWithCloudinary(prompt) {
    let stabilityApiKey = '';

    try {
        const configData = await window.tursoClient.getConfig();
        if (configData) {
            const apiKeys = configData.apiKeys || {};
            const imageKeyEntry = Object.values(apiKeys).find(k => k.type === 'image' && k.enabled !== false);
            if (imageKeyEntry && imageKeyEntry.key) {
                stabilityApiKey = imageKeyEntry.key;
            }
        }
        if (!stabilityApiKey) {
            throw new Error("No enabled Image API key found from my end.");
        }

        const engineId = 'stable-diffusion-xl-1024-v1-0';
        const apiHost = 'https://api.stability.ai';
        const apiKey = stabilityApiKey;

        const response = await fetch(`${apiHost}/v1/generation/${engineId}/text-to-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                text_prompts: [{ text: prompt }],
                cfg_scale: 7,
                height: 1024,
                width: 1024,
                steps: 30,
                samples: 1,
            }),
        });

        if (!response.ok) {
            let errorDetails = `(Status: ${response.status})`;
            try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData);
            } catch (e) {
                errorDetails = response.statusText;
            }
            throw new Error(`The image service returned an error: ${errorDetails}`);
        }

        const responseJSON = await response.json();
        const imageBase64 = responseJSON.artifacts[0].base64;

        // The generic uploader expects a File or Blob, not a base64 string.
        // We'll keep this specific fetch logic for base64 uploads.
        const CLOUDINARY_CLOUD_NAME = "dvjs45kft";
        const CLOUDINARY_UPLOAD_PRESET = "vevapvkv";
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        const formData = new FormData();
        formData.append('file', `data:image/png;base64,${imageBase64}`);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const cloudinaryResponse = await fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData,
        });

        if (!cloudinaryResponse.ok) {
            throw new Error('Failed to upload the generated image.');
        }

        const cloudinaryData = await cloudinaryResponse.json();
        return cloudinaryData.secure_url;

    } catch (error) {
        console.error("Image generation process failed:", error);
        throw error;
    }
}

// --- startNewChat (FINAL: Correct Unsub & Reset) ---
function startNewChat() {
    console.log("🔄 Starting New Chat...");

    // 1. CRITICAL: Unsubscribe FIRST to stop old messages from flowing in
    if (state.messagesUnsub) {
        state.messagesUnsub();
        state.messagesUnsub = null;
    }

    // Stop generation if active
    if (typeof stopGeneration === 'function') stopGeneration();
    autoRetryState.isActive = false;
    autoRetryState.stopRequested = false;

    // 2. Stop Audio
    stopCurrentAudio();

    // 3. Clear Internal Caches
    if (typeof exportedFileCache !== 'undefined') exportedFileCache.clear();

    // 4. Generate New Session ID
    state.sessionId = crypto.randomUUID();
    localStorage.setItem('chatSessionId', state.sessionId);
    state.firstMessageSaved = false;
    state.titleGenerated = false;

    // 5. Wipe DOM & instantly show welcome screen
    if (DOMElements.chatMessages) {
        DOMElements.chatMessages.innerHTML = '';
    }
    document.getElementById('chat-container')?.classList.remove('is-chatting');

    // 6. Reset UI (Input, Files, Status)
    if (DOMElements.messageInput) DOMElements.messageInput.value = '';
    resetFileInput();
    if (DOMElements.statusRow) DOMElements.statusRow.textContent = '';
    
    // Explicitly reset the send button to microphone mode
    toggleSendButtonState('mic', false);
    checkSendButtonState();

    // 7. Remove "Active" class from sidebar items
    document.querySelectorAll('.session-item.active').forEach(el => el.classList.remove('active'));

    // 8. Start Listener for the NEW (empty) session
    subscribeMessages();

    // 9. Close mobile menus if open
    if (window.innerWidth <= 900) {
        DOMElements.sidebar.classList.remove('open');
        DOMElements.overlay.classList.remove('show');
    }
    console.log("✅ New session started:", state.sessionId);
}

function loadSessionById(id) {
    stopCurrentAudio();
    if (typeof exportedFileCache !== 'undefined') exportedFileCache.clear();

    state.sessionId = id;
    localStorage.setItem('chatSessionId', id);
    state.firstMessageSaved = true;

    // ✅ CRITICAL FIX: Clear the UI before loading the new session
    // This prevents "Chat A" messages from sticking around when you open "Chat B"
    if (DOMElements.chatMessages) {
        DOMElements.chatMessages.innerHTML = '';
    }

    subscribeMessages();
    checkSessionWasPreviouslyBlocked().catch(() => { });

    // Update Sidebar UI
    document.querySelectorAll('.session-item.active').forEach(el => el.classList.remove('active'));
    const el = DOMElements.sessionList.querySelector(`.session-item[data-id="${id}"]`);
    if (el) el.classList.add('active');

    if (window.innerWidth <= 900) {
        DOMElements.sidebar.classList.remove('open');
        DOMElements.overlay.classList.remove('show');
        if (DOMElements.menuBtn) DOMElements.menuBtn.classList.remove('active');
    }
}

async function clearHistory() {
    if (!confirm('Clear chat history? This cannot be undone.')) return;
    try {
        // Delete all sessions via Turso (backend will handle cascade)
        const sessions = await window.tursoClient.getSessions(state.userId);
        for (const s of sessions) {
            // Delete each session (chats are orphaned but we start fresh)
            await fetch(`${window.tursoClient.baseUrl}/sessions/${state.userId}/${s.session_id}`, { method: 'DELETE' }).catch(() => { });
        }
        DOMElements.sessionList.innerHTML = '';
        startNewChat();
    } catch (err) { console.error('Clear history error:', err); alert(`Failed: ${err.message}`); }
}

// --- 🎤 SMART VOICE INPUT SYSTEM (FIXED) ---

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let preferredVoiceEngine = 'whisper';
let googleRecognition = null; // Track Google instance locally

// Text box auto-resize listener
DOMElements.messageInput.addEventListener('input', () => {
    autosize(DOMElements.messageInput);
    checkSendButtonState();
});

/**
 * ENGINE 1: OpenAI Whisper (Server-Side)
 */
function startWhisperRecording() {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                // 1. Stop Mic Streams immediately
                stream.getTracks().forEach(track => track.stop());

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');

                try {
                    if (!auth.currentUser) throw new Error("User not logged in");
                    const token = await auth.currentUser.getIdToken(false);


                    const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/tools/whisper`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData,
                        signal: fetchController?.signal
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "Whisper failed");
                    }

                    const data = await response.json();
                    resolve(data.text);

                } catch (error) {
                    reject(error);
                } finally {
                    showApiStatus("", 0);
                    isRecording = false; // Reset state
                    DOMElements.liveModeBtn.classList.remove('recording-active');
                }
            };

            mediaRecorder.start();
            isRecording = true;
            DOMElements.liveModeBtn.classList.add('recording-active');

        } catch (err) {
            isRecording = false;
            reject(err);
        }
    });
}

/**
 * ENGINE 2: Google Web Speech (Browser Native)
 */
function startGoogleSpeechFallback() {
    return new Promise((resolve, reject) => {
        if (!('webkitSpeechRecognition' in window)) {
            reject(new Error("Browser does not support Web Speech API."));
            return;
        }

        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            DOMElements.liveModeBtn.classList.add('recording-active');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            resolve(transcript);
        };

        recognition.onerror = (event) => {
            // Don't reject on 'no-speech' (just close quietly)
            if (event.error === 'no-speech') {
                resolve('');
            } else {
                reject(new Error(event.error));
            }
        };

        recognition.onend = () => {
            DOMElements.liveModeBtn.classList.remove('recording-active');
            DOMElements.statusRow.textContent = "";
            googleRecognition = null; // ✅ CRITICAL FIX: Reset the variable so we can click again
        };

        recognition.start();
        googleRecognition = recognition;
    });
}

/**
 * THE CONTROLLER: Handles inputs and fallbacks
 */
async function handleVoiceInput() {
    // 1. STOP COMMAND (If currently recording)
    if (isRecording) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); // Stops Whisper
            // isRecording is set to false in onstop
        }
        return;
    }

    if (googleRecognition) {
        googleRecognition.stop(); // Stops Google
        googleRecognition = null;
        return;
    }

    // 2. START COMMAND
    try {
        // CHECK CIRCUIT BREAKER (If Whisper failed before, skip it)
        if (preferredVoiceEngine === 'google') {
            const text = await startGoogleSpeechFallback();
            if (text) {
                DOMElements.messageInput.value = text;
                DOMElements.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                lastInputWasVoice = true;
                sendMessage();
            }
            return;
        }

        // TRY WHISPER
        await startWhisperRecording().then(text => {
            DOMElements.messageInput.value = text;
            DOMElements.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
            lastInputWasVoice = true;
            sendMessage();
        }).catch(async (err) => {
            // WHISPER FAILED -> SWITCH PERMANENTLY
            console.warn("⚠️ Whisper failed. Switching to Google.", err);
            preferredVoiceEngine = 'google';

            DOMElements.statusRow.textContent = "⚠️ Whisper unavailable. Switching...";

            // AUTO-START GOOGLE IMMEDIATELY
            // Note: Browsers might block this if the async gap is too long, 
            // but since we are in a promise chain originating from a click, it often works.
            try {
                const googleText = await startGoogleSpeechFallback();
                if (googleText) {
                    DOMElements.messageInput.value = googleText;
                    DOMElements.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    lastInputWasVoice = true;
                    sendMessage();
                }
            } catch (googleErr) {
                DOMElements.statusRow.textContent = "Tap mic again to use Google Speech.";
                console.error("Auto-fallback failed (likely browser security):", googleErr);
            }
        });

    } catch (e) {
        console.error("Voice init failed", e);
        DOMElements.statusRow.textContent = "⚠️ Mic Error";
    }
}

// --- MAIN BUTTON LISTENER ---
// --- MAIN BUTTON LISTENER ---
DOMElements.liveModeBtn.addEventListener('click', () => {
    initGlobalAudioContext();
    handleVoiceInput();
});

DOMElements.sendBtn.addEventListener('click', () => {
    initGlobalAudioContext(); // Ensure AudioContext is unlocked immediately on user gesture

    if (autoRetryState.isActive) {
        stopApiRequestLoop();
        return;
    }

    const hasText = DOMElements.messageInput.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;

    if (hasText || hasFiles) {
        sendMessage();
    } else {
        if (typeof LiveMode !== 'undefined') LiveMode.open();
    }
});

// --- USER ACTIVITY STATUS TRACKING ---
async function updateUserStatusInFirestore(status) {
    if (!state.userId) return;
    try {
        await window.tursoClient.updateUser(state.userId, {
            lastLogin: new Date().toISOString()
        });
    } catch (e) {
        console.warn("Could not update user status", e);
    }
}
let inactivityTimer;
const inactivityTimeout = 60000;
function setUserActive() {
    updateUserStatusInFirestore('Active');
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(setUserInactive, inactivityTimeout);
}
function setUserInactive() { updateUserStatusInFirestore('Inactive'); }
const resetActivityEvents = ['mousemove', 'keypress', 'scroll', 'click', 'DOMContentLoaded'];
resetActivityEvents.forEach(event => document.addEventListener(event, setUserActive));
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearTimeout(inactivityTimer);
        updateUserStatusInFirestore('Away');
    } else {
        setUserActive();
    }
});
window.addEventListener('beforeunload', () => { updateUserStatusInFirestore('Offline'); });

// --- NEW USER TOUR LOGIC (UNCHANGED) ---
const tourManager = {
    steps: [
        {
            element: '#sidebar',
            title: 'Welcome to Chaka!',
            text: 'This is your chat history sidebar. All your conversations will be saved here for easy access.'
        },
        {
            element: '#new-chat-sidebar-btn',
            title: 'Start a New Chat',
            text: 'Click here anytime to start a fresh conversation.'
        },
        {
            element: '#composer-actions-btn',
            title: 'Personalities & Files',
            text: 'Use this button to switch between different AI personalities or to upload a file for the AI to read.'
        },
        {
            element: '#message-input',
            title: 'Start Talking!',
            text: 'Type your message here and press the send button. That\'s it! Enjoy your chat.'
        }
    ],
    currentStep: 0,
    start() {
        DOMElements.tourOverlay.classList.remove('hidden');
        this.currentStep = 0;
        this.showStep(this.currentStep);
    },
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        this.currentStep = index;
        const step = this.steps[index];
        const targetElement = document.querySelector(step.element);

        if (window.innerWidth <= 900) {
            const isSidebarStep = step.element === '#sidebar' || step.element === '#new-chat-sidebar-btn';
            if (isSidebarStep) {
                DOMElements.sidebar.classList.add('open');
            } else {
                DOMElements.sidebar.classList.remove('open');
            }
        }

        DOMElements.tourTitle.textContent = step.title;
        DOMElements.tourText.textContent = step.text;
        DOMElements.tourStepCounter.textContent = `${index + 1} / ${this.steps.length}`;

        setTimeout(() => {
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();

                if (rect.width === 0 && rect.height === 0) {
                    this.end();
                    return;
                }

                DOMElements.tourSpotlight.style.width = `${rect.width + 16}px`;
                DOMElements.tourSpotlight.style.height = `${rect.height + 16}px`;
                DOMElements.tourSpotlight.style.top = `${rect.top - 8}px`;
                DOMElements.tourSpotlight.style.left = `${rect.left - 8}px`;

                const rLeft = rect.left - 8;
                const rTop = rect.top - 8;
                const rRight = rect.right + 8;
                const rBottom = rect.bottom + 8;

                const clipPathPolygon = `polygon(
                    0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                    ${rLeft}px ${rTop}px,
                    ${rLeft}px ${rBottom}px,
                    ${rRight}px ${rBottom}px,
                    ${rRight}px ${rTop}px,
                    ${rLeft}px ${rTop}px
                )`;
                DOMElements.tourOverlay.style.clipPath = clipPathPolygon;

                const tooltipEl = DOMElements.tourTooltip;
                const tooltipRect = tooltipEl.getBoundingClientRect();

                if ((window.innerHeight - rect.bottom) > tooltipRect.height + 20) {
                    tooltipEl.style.top = `${rect.bottom + 10}px`;
                    tooltipEl.style.transform = 'translateY(0)';
                }
                else if (rect.top > tooltipRect.height + 20) {
                    tooltipEl.style.top = `${rect.top - 10}px`;
                    tooltipEl.style.transform = 'translateY(-100%)';
                }
                else {
                    tooltipEl.style.top = `50%`;
                    tooltipEl.style.transform = 'translateY(-50%)';
                }

                let leftPos = rect.left;
                if (leftPos + tooltipRect.width > window.innerWidth) {
                    leftPos = window.innerWidth - tooltipRect.width - 20;
                }
                tooltipEl.style.left = `${Math.max(20, leftPos)}px`;
            }
        }, 350);

        DOMElements.tourPrevBtn.style.display = index === 0 ? 'none' : 'inline-flex';
        DOMElements.tourNextBtn.style.display = index === this.steps.length - 1 ? 'none' : 'inline-flex';
        DOMElements.tourFinishBtn.style.display = index === this.steps.length - 1 ? 'inline-flex' : 'none';
    },
    next() { this.showStep(this.currentStep + 1); },
    prev() { this.showStep(this.currentStep - 1); },
    async end() {
        DOMElements.tourOverlay.classList.add('hidden');
        if (window.innerWidth <= 900) {
            DOMElements.sidebar.classList.remove('open');
        }
        DOMElements.tourOverlay.style.clipPath = '';
        // Save to localStorage as fallback
        localStorage.setItem('tourCompleted', 'true');
        if (state.userId) {
            try {
                await window.tursoClient.updateUser(state.userId, { tourCompleted: true });
            } catch (error) {
                console.error("Failed to save tour completion status:", error);
            }
        }
    }
};

// --- Function to check if the tour should be offered (uses Turso) ---
async function checkAndStartTour() {
    if (!state.userId) return;
    // Check localStorage first (fastest)
    if (localStorage.getItem('tourCompleted') === 'true') {
        // Ensure overlay is never stuck
        if (DOMElements.overlay) DOMElements.overlay.classList.remove('show');
        if (DOMElements.welcomeTourModal) DOMElements.welcomeTourModal.classList.add('hidden');
        return;
    }
    // Check Turso
    try {
        const settings = await window.tursoClient.getUserSettings(state.userId);
        if (settings.tourCompleted) {
            localStorage.setItem('tourCompleted', 'true');
            return;
        }
    } catch (e) {
        console.warn('Tour check failed:', e);
    }
    // Tour not completed — show the welcome modal (NOT the main overlay!)
    setTimeout(() => {
        if (DOMElements.welcomeTourModal) {
            DOMElements.welcomeTourModal.classList.remove('hidden');
            // Do NOT add 'show' to #overlay — it blocks ALL clicks
        }
    }, 5000);
}

// --- SIGN OUT FUNCTION (UNCHANGED) ---
async function signOutUser() {
    if (!confirm('Are you sure you want to sign out?')) return;
    try {
        stopCurrentAudio();
        await signOut(auth);
        console.log("User signed out successfully.");
    } catch (error) {
        console.error("Sign out error:", error);
        alert("Failed to sign out. Please try again.");
    }
}

// --- ✅ [MODIFIED] INIT FUNCTION ---
const init = () => {
    // --- ✅ [NEW] SERVER HEARTBEAT ---
    // Pings the server every 4 minutes to prevent "Cold Starts"
    // This ensures the server is always ready when the user types.
    const keepServerAwake = () => {
        fetch(`${APP_CONFIG.BACKEND_URL}`)
            .then(() => console.log("💓 Server heartbeat sent."))
            .catch(() => console.log("⚠️ Server heartbeat failed (offline?)"));
    };

    keepServerAwake(); // Ping immediately on load
    setInterval(keepServerAwake, 4 * 60 * 1000);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            DOMElements.body.style.opacity = 1;
            state.userId = user.uid;

            // --- CONNECT TURSO REAL-TIME SOCKET ---
            if (window.tursoClient) {
                window.tursoClient.connectSocket(user.uid);
                window.tursoClient.onSessionAdded(() => subscribeSessions());
                window.tursoClient.onSessionUpdated(() => subscribeSessions());
                window.tursoClient.onChatAdded((chat) => {
                    if (chat.session_id === state.sessionId && !autoRetryState.isActive) subscribeMessages();
                });
            }

            state.sessionId = localStorage.getItem('chatSessionId') || null;
            state.selectedPersonalityId = localStorage.getItem('selectedPersonalityId') || null;
            applyTheme(state.currentTheme);

            try {
                await loadConfigLive();
                subscribeAndDisplayPersonalities();
                DOMElements.sendBtn.disabled = false;
            } catch (err) {
                console.warn('Config/Personality load failed:', err);
                DOMElements.statusRow.textContent = `Bot init failed: ${err.message}`;
                DOMElements.sendBtn.disabled = false;
            }

            // ─── CRITICAL: Load chat history FIRST (before any fragile Firestore calls) ───
            subscribeSessions();

            if (state.sessionId) {
                state.firstMessageSaved = true;
                subscribeMessages();
            } else {
                startNewChat();
            }

            // ─── Non-critical init (each wrapped so one failure doesn't kill the rest) ───
            await ensureUser(user).catch(e => console.error('ensureUser failed', e));

            try { await checkAndStartTour(); } catch (e) { console.error('Tour check failed:', e); }
            try { initAnnouncementListener(); } catch (e) { console.error('Announcements failed:', e); }

            // RAG cache load (non-critical)
            try {
                allIndexedChunks = await getAllChunks();
                console.log(`Loaded ${allIndexedChunks.length} document chunks from firestore.`);
                if (allIndexedChunks.length > 0) {
                    showToastNotification({
                        message: `🧠 Loaded ${allIndexedChunks.length} chunks from your local memory.`,
                        duration: 5000
                    });
                }
            } catch (e) {
                console.error("Failed to load initial RAG chunks:", e);
            }

            // Session-dependent checks (non-critical)
            if (state.sessionId) {
                try { await checkSessionWasPreviouslyBlocked(); } catch (e) { console.error('Block check failed:', e); }
            }

            try { await processEventTriggers(); } catch (e) { console.error('Event triggers failed:', e); }
            try { await runValentineSequence(); } catch (e) { console.error('Valentine sequence failed:', e); }
            try { if (window.BirthdayMode) await window.BirthdayMode.init(); } catch (e) { console.error('Birthday mode failed:', e); }

            // ... (inside init function)
            DOMElements.overlay.addEventListener('click', () => {
                DOMElements.sidebar.classList.remove('open');
                DOMElements.composerActionsPopup.classList.remove('show');
                DOMElements.composerActionsBtn.classList.remove('active');

                // ✅ [NEW] Close user settings popup
                DOMElements.userSettingsPopup.classList.remove('show');
                DOMElements.userSettingsBtn.classList.remove('active');
                DOMElements.menuBtn.classList.remove('active');
                DOMElements.userSettingsBtn.classList.remove('active');

                DOMElements.overlay.classList.remove('show');
                DOMElements.welcomeTourModal.classList.add('hidden');
                closeAnnouncementModals();
                hideExportModal();
                hideExportConfirmationModal();
            });
            // This is the end of the overlay listener

            // ✅ [FIX] ADD THIS BLOCK BACK for the mobile menu button
            DOMElements.menuBtn.addEventListener('click', () => {
                DOMElements.sidebar.classList.toggle('open');
                DOMElements.overlay.classList.toggle('show');
                DOMElements.menuBtn.classList.toggle('active');

                // Ensure popups are closed when opening sidebar
                DOMElements.composerActionsPopup.classList.remove('show');
                DOMElements.composerActionsBtn.classList.remove('active');
                DOMElements.userSettingsPopup.classList.remove('show');
                DOMElements.userSettingsBtn.classList.remove('active');
            });
            // --- END FIX ---

            // ✅ [NEW] Event Listener for User Settings Popup
            DOMElements.userSettingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpening = !DOMElements.userSettingsBtn.classList.contains('active');
                if (isOpening) {
                    populateUserProfile();
                }
                DOMElements.userSettingsPopup.classList.toggle('show', isOpening);
                DOMElements.userSettingsBtn.classList.toggle('active', isOpening);
                DOMElements.overlay.classList.toggle('show', isOpening);

                // Close composer popup if it's open
                DOMElements.composerActionsPopup.classList.remove('show');
                DOMElements.composerActionsBtn.classList.remove('active');
            });

            if (DOMElements.manageAccountBtn) {
                DOMElements.manageAccountBtn.addEventListener('click', () => {
                    window.location.href = 'account.html';
                });
            }

            if (DOMElements.logoutBtn) {
                DOMElements.logoutBtn.addEventListener('click', signOutUser);
            }


            // THIS NEW CORRECTED BLOCK
            const handleNewChat = () => {
                startNewChat();
                if (window.innerWidth <= 900) {
                    DOMElements.sidebar.classList.remove('open');
                    DOMElements.overlay.classList.remove('show');
                }
            };
            DOMElements.newChatSidebarBtn.addEventListener('click', handleNewChat);
            DOMElements.clearHistoryBtn.addEventListener('click', clearHistory);
            DOMElements.signOutBtn.addEventListener('click', signOutUser);

            const isMobile = /Mobi|Android/i.test(navigator.userAgent);

            DOMElements.messageInput.addEventListener('keydown', (e) => {
                if (!isMobile) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        DOMElements.sendBtn.click();
                    }
                }
            });


            // ✅ [MODIFIED] Use event delegation for dynamic export links with status handling
            DOMElements.chatMessages.addEventListener('click', async (e) => {
                const pdfLink = e.target.closest('a[data-export-pdf-id]');
                if (!pdfLink) return;

                e.preventDefault();
                const messageId = pdfLink.getAttribute('data-export-pdf-id');
                const currentStatus = pdfLink.dataset.status;

                if (currentStatus === 'processing') {
                    return; // Ignore clicks while processing
                }

                // If already completed, just open the cached version.
                if (exportedFileCache.has(messageId)) {
                    window.open(exportedFileCache.get(messageId), '_blank');
                    return;
                }

                // Set processing state (for initial click or retry)
                pdfLink.dataset.status = 'processing';
                pdfLink.innerHTML = `${PDF_LINK_LOADER_ICON} Generating...`;

                const messageElement = pdfLink.closest('.message[data-message-id]')?.querySelector('.message-content');

                if (messageElement) {
                    try {
                        showToastNotification({
                            message: "PDF generation is in progress. You'll be notified when it is complete.",
                            icon: LOADER_SVG_ICON,
                            duration: 8000
                        });

                        const fileUrl = await exportAsPdf(messageElement, messageId);

                        pdfLink.dataset.status = 'completed';
                        pdfLink.innerHTML = `${PDF_LINK_SUCCESS_ICON} Open PDF`;
                        pdfLink.href = fileUrl;
                        pdfLink.target = '_blank';

                        showExportConfirmationModal('PDF', fileUrl);

                    } catch (error) {
                        console.error("PDF generation from link failed:", error);
                        pdfLink.dataset.status = 'failed';
                        pdfLink.innerHTML = `${PDF_LINK_ERROR_ICON} Retry Generation`;

                        showToastNotification({
                            message: `Sorry, could not create the PDF. Error: ${error.message || 'Unknown reason.'}`,
                            type: 'error',
                            duration: 10000
                        });
                    }
                } else {
                    pdfLink.dataset.status = 'failed';
                    pdfLink.innerHTML = `${PDF_LINK_ERROR_ICON} Error`;
                    showToastNotification({
                        message: "Could not find the original message to export.",
                        type: 'error'
                    });
                }
            });

            DOMElements.chatMessages.addEventListener('scroll', () => {
                const isScrolledUp = DOMElements.chatMessages.scrollHeight - DOMElements.chatMessages.scrollTop - DOMElements.chatMessages.clientHeight > 200;
                DOMElements.scrollToBottomBtn.classList.toggle('visible', isScrolledUp);
            });
            DOMElements.scrollToBottomBtn.addEventListener('click', () => scrollToBottom('smooth'));
            const composerObserver = new ResizeObserver(entries => { document.documentElement.style.setProperty('--composer-height', `${entries[0].target.offsetHeight}px`); });

            // ... (inside init function)
            composerObserver.observe(DOMElements.composer);
            DOMElements.composerActionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpening = !DOMElements.composerActionsBtn.classList.contains('active');
                DOMElements.composerActionsPopup.classList.toggle('show', isOpening);
                DOMElements.composerActionsBtn.classList.toggle('active', isOpening);

                // ✅ [NEW] Close user settings popup
                DOMElements.userSettingsPopup.classList.remove('show');
                DOMElements.userSettingsBtn.classList.remove('active');
                
                const eduPopup = document.getElementById('edu-tools-popup');
                if (eduPopup) eduPopup.classList.remove('show');
                
                const customModelDropdown = document.getElementById('custom-model-dropdown');
                if (customModelDropdown) customModelDropdown.classList.add('hidden');
            });


            if (DOMElements.announcementCloseBtn) DOMElements.announcementCloseBtn.addEventListener('click', closeAnnouncementModals);
            if (DOMElements.announcementDetailsCloseBtn) DOMElements.announcementDetailsCloseBtn.addEventListener('click', closeAnnouncementModals);
            if (DOMElements.announcementReadMoreBtn) {
                DOMElements.announcementReadMoreBtn.addEventListener('click', () => {
                    if (state.currentAnnouncement) {
                        showAnnouncementDetails(state.currentAnnouncement);
                    }
                });
            }

            // ✅ [MODIFIED] Handle manual exports differently for PDF vs. TXT
            const handleManualExport = async (exportFn) => {
                hideExportModal(); // Hide selection modal first
                const element = state.elementToExport;
                const messageId = state.messageIdToExport;

                if (exportFn === exportAsPdf) {
                    showToastNotification({
                        message: "PDF generation is in progress...",
                        icon: LOADER_SVG_ICON,
                        duration: 8000
                    });
                    try {
                        const url = await exportAsPdf(element, messageId);
                        showExportConfirmationModal('PDF', url);
                    } catch (error) {
                        showToastNotification({
                            message: "Sorry, there was an error creating the PDF.",
                            type: 'error',
                            duration: 10000
                        });
                    }
                } else {
                    // For TXT, keep the fast, blocking behavior
                    const url = await exportFn(element, true);
                    if (url) {
                        showExportConfirmationModal('TXT', url);
                    }
                }
            };

            if (DOMElements.exportPdfBtn) DOMElements.exportPdfBtn.addEventListener('click', () => handleManualExport(exportAsPdf));
            if (DOMElements.exportTxtBtn) DOMElements.exportTxtBtn.addEventListener('click', () => handleManualExport(exportAsTxt));
            if (DOMElements.exportCloseBtn) DOMElements.exportCloseBtn.addEventListener('click', hideExportModal);

            if (DOMElements.viewExportedFileBtn) {
                DOMElements.viewExportedFileBtn.addEventListener('click', () => {
                    if (state.lastExportedFile && state.lastExportedFile.url) {
                        window.open(state.lastExportedFile.url, '_blank');
                    }
                    hideExportConfirmationModal();
                });
            }
            if (DOMElements.exportConfirmationContinueBtn) {
                DOMElements.exportConfirmationContinueBtn.addEventListener('click', hideExportConfirmationModal);
            }

            const fileUploadInput = document.getElementById('file-upload');
            const filePreviewContainer = document.getElementById('file-preview-container');

            // ✅ [MODIFIED] uploadAndProcessFile to use the generic uploader
            async function uploadAndProcessFile(fileId, file) {
                const fileObject = selectedFiles.find(f => f.id === fileId);
                if (!fileObject) return;

                try {
                    fileObject.status = 'uploading';
                    updateFilePreviewStatus(fileId, 'uploading');
                    checkSendButtonState();

                    // Specify 'image' as the resource type for user-uploaded images
                    const url = await uploadFileToCloudinary(file, 'image');

                    fileObject.status = 'completed';
                    fileObject.url = url;
                    updateFilePreviewStatus(fileId, 'completed');

                } catch (error) {
                    fileObject.status = 'error';
                    fileObject.error = error.message;
                    updateFilePreviewStatus(fileId, 'error', { message: error.message });
                } finally {
                    checkSendButtonState();
                }
            }



            // --- [REPLACE] this entire 'if (fileUploadInput)' block in init() ---

            if (fileUploadInput) {
                fileUploadInput.addEventListener('change', async (e) => { // ✅ [MODIFIED] Added async
                    DOMElements.composerActionsPopup.classList.remove('show');
                    DOMElements.composerActionsBtn.classList.remove('active');
                    DOMElements.overlay.classList.remove('show');

                    for (const file of e.target.files) {
                        const fileId = Date.now() + Math.random();
                        const newFileObject = {
                            id: fileId,
                            file: file,
                            status: 'pending',
                            url: null,
                            error: null
                        };
                        selectedFiles.push(newFileObject);

                        const item = document.createElement('div');
                        item.className = 'file-preview-item';
                        item.id = `file-preview-${fileId}`;

                        let preview;
                        if (file.type.startsWith('image/')) {
                            preview = document.createElement('img');
                            preview.className = 'file-preview-thumbnail';
                            preview.src = URL.createObjectURL(file);
                            preview.onload = () => URL.revokeObjectURL(preview.src);
                        } else {
                            preview = document.createElement('div');
                            preview.className = 'file-preview-icon';
                            preview.innerHTML = `<svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V8.188a2.625 2.625 0 0 0-.77-1.851l-4.439-4.44a2.625 2.625 0 0 0-1.851-.77H5.625ZM15 3.375v3.75h3.75a.375.375 0 0 1-.11.26l-4.44 4.439a.375.375 0 0 1-.26.11h-3.75A.375.375 0 0 1 9.75 11.5v-3.75a.375.375 0 0 1 .11-.26l4.44-4.44a.375.375 0 0 1 .26-.11Z"/></svg>`;
                        }

                        const name = document.createElement('span');
                        name.className = 'file-preview-name';
                        name.textContent = file.name;

                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-file-btn';
                        removeBtn.innerHTML = '&times;';
                        removeBtn.title = 'Remove file';
                        removeBtn.onclick = () => removeFile(fileId);

                        item.appendChild(preview);
                        item.appendChild(name);
                        item.appendChild(removeBtn);
                        filePreviewContainer.appendChild(item);

                        // --- ✅ [MODIFIED] File Processing Logic ---
                        if (file.type.startsWith('image/')) {
                            // This is your existing Cloudinary upload logic for images
                            uploadAndProcessFile(fileId, file);
                        }

                        // --- [PASTE THIS COMPLETE BLOCK] ---
                        else if (file.type.startsWith('text/') || file.type === 'application/pdf') {
                            // Set initial status to 'parsing'
                            newFileObject.status = 'parsing';
                            // Update UI immediately to show parsing state and initial progress
                            updateFilePreviewStatus(fileId, 'parsing', `Parsing file...`, 5); // Show parsing status in preview
                            checkSendButtonState(); // Disable send button
                            await yieldToEventLoop(); // Yield *after* initial UI update

                            try {
                                let fileContent = null;
                                const fileTypeLabel = file.type === 'application/pdf' ? 'PDF' : 'Text File';
                                console.log(`MAIN: Starting parsing for ${fileTypeLabel}: ${file.name}`);
                                const parseStartTime = performance.now();

                                // Perform parsing
                                if (file.type.startsWith('text/')) {
                                    fileContent = await parseTextFile(file);
                                } else if (file.type === 'application/pdf') {
                                    fileContent = await parsePdfFile(file);
                                }

                                const parseEndTime = performance.now();
                                console.log(`MAIN: Finished parsing ${file.name}. Duration: ${(parseEndTime - parseStartTime).toFixed(2)} ms. Content length: ${fileContent?.length}`);

                                // Check if file content was successfully parsed
                                if (fileContent && fileContent.length > 0) {
                                    // Update status to show embedding has started
                                    updateFilePreviewStatus(fileId, 'processing_rag', 'Embedding...', 20); // Show embedding start in preview

                                    console.log(`Sending file ${fileId} content (length: ${fileContent.length}) to RAG worker for embedding.`);
                                    // Offload heavy embedding task to the worker
                                    ragWorker.postMessage({
                                        type: 'EMBED_DOCUMENT',
                                        payload: { fileId, fileContent }
                                    });
                                    // Worker messages will update progress from here via ragWorker.onmessage

                                } else if (fileContent === '') {
                                    // Handle case where file parsed successfully but was empty
                                    console.warn(`File ${file.name} was parsed but is empty.`);
                                    showToastNotification({ message: `File ${file.name} appears to be empty.`, type: 'info', duration: 6000 });
                                    updateFilePreviewStatus(fileId, 'completed_rag'); // Mark as 'complete' (nothing to index)
                                    checkSendButtonState(); // Re-evaluate send button state

                                } else {
                                    // Handle unexpected null/undefined content after parsing attempt
                                    throw new Error("File parsing returned null or undefined content.");
                                }
                            } catch (err) {
                                // Handle errors during parsing or sending to worker
                                console.error(`Error processing file ${file.name}:`, err);
                                showToastNotification({ message: `Failed to process ${file.name}. Error: ${err.message}`, type: 'error', duration: 10000 });
                                updateFilePreviewStatus(fileId, 'error', err.message); // Update UI to show error
                                checkSendButtonState(); // Re-evaluate send button state
                            }
                        }
                        // --- [END PASTE] ----

                        else {
                            // Other non-image, non-text files (not supported by RAG)
                            newFileObject.status = 'completed'; // Mark as 'completed' but not 'completed_rag'
                            checkSendButtonState();
                        }
                        // --- End of Modified Logic ---
                    }

                    e.target.value = '';
                    updateFileInputUI();
                });
            }



            checkSendButtonState();

            DOMElements.tourNextBtn.addEventListener('click', () => tourManager.next());
            DOMElements.tourPrevBtn.addEventListener('click', () => tourManager.prev());
            DOMElements.tourFinishBtn.addEventListener('click', () => tourManager.end());

            DOMElements.startTourBtn.addEventListener('click', () => {
                DOMElements.welcomeTourModal.classList.add('hidden');
                DOMElements.overlay.classList.remove('show');
                tourManager.start();
            });
            DOMElements.skipTourBtn.addEventListener('click', () => {
                DOMElements.welcomeTourModal.classList.add('hidden');
                DOMElements.overlay.classList.remove('show');
                tourManager.end();
            });

        } else {
            localStorage.removeItem('chatSessionId');
            localStorage.removeItem('selectedPersonalityId');
            window.location.replace('auth3.html');
        }
    });
};

init();

// --- ✅ [NEW] INIT CUSTOM SELECTS ---
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select.popup-select, select#live-voice-select, select#voiceSelect').forEach(select => {
        if (window.initCustomSelect) window.initCustomSelect(select);
    });
});

// --- CUSTOM MODEL DROPDOWN LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const chatTitleContainer = document.getElementById('chat-title-container');
    const customModelDropdown = document.getElementById('custom-model-dropdown');
    const chatTitle = document.getElementById('chat-title');
    
    if (chatTitleContainer && customModelDropdown) {
        chatTitleContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            customModelDropdown.classList.toggle('hidden');
            
            const composerPopup = document.getElementById('composer-actions-popup');
            if (composerPopup) {
                composerPopup.classList.remove('show');
                const composerBtn = document.getElementById('composer-actions-btn');
                if (composerBtn) composerBtn.classList.remove('active');
            }
            
            const eduPopup = document.getElementById('edu-tools-popup');
            if (eduPopup) eduPopup.classList.remove('show');
        });

        document.addEventListener('click', (e) => {
            if (!customModelDropdown.contains(e.target) && !chatTitleContainer.contains(e.target)) {
                customModelDropdown.classList.add('hidden');
            }
        });

        const modelOptions = customModelDropdown.querySelectorAll('.model-option[data-value]');
        modelOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                // Skip disabled models
                if (opt.classList.contains('disabled')) return;

                modelOptions.forEach(o => o.classList.remove('selected'));
                modelOptions.forEach(o => {
                    const check = o.querySelector('.check-icon');
                    if(check) check.innerHTML = '';
                });
                
                opt.classList.add('selected');
                const check = opt.querySelector('.check-icon');
                if (check) check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#e3e3e3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                
                // Title remains static as 'Chaka'
                
                // Link to real select
                const select = document.getElementById('model-select');
                if (select) {
                    select.value = opt.dataset.value;
                    select.dispatchEvent(new Event('change'));
                }
                customModelDropdown.classList.add('hidden');
            });
        });

    }

    // Random input placeholder
    const inputPlaceholders = [
        "Ask Chaka anything...",
        "Need help with a task?",
        "Let's brainstorm...",
        "Summarize a document...",
        "Write some code...",
        "What are we exploring?",
        "Analyze this data...",
        "Draft an email...",
        "Learn something new..."
    ];
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        // Set initial random placeholder
        if (!document.body.classList.contains('edu-mode-active')) {
            messageInput.placeholder = inputPlaceholders[Math.floor(Math.random() * inputPlaceholders.length)];
        }
        
        // Rotate every 8 seconds, but only if empty and not focused
        setInterval(() => {
            if (!messageInput.value && document.activeElement !== messageInput && !document.body.classList.contains('edu-mode-active')) {
                messageInput.placeholder = inputPlaceholders[Math.floor(Math.random() * inputPlaceholders.length)];
            }
        }, 8000);
    }
});
