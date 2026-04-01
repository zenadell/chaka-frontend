// vector_store.js - Handles IndexedDB for RAG persistence

const DB_NAME = 'ChakaAIDB';
const STORE_NAME = 'vectorStore';
const DB_VERSION = 1;
let db;

/**
 * Opens the IndexedDB connection and creates the object store if it doesn't exist.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            // Key is the unique chunkId
            dbInstance.createObjectStore(STORE_NAME, { keyPath: 'chunkId' });
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.errorCode);
            reject(new Error("IndexedDB failed to open."));
        };
    });
}

/**
 * Saves a batch of indexed chunks to the store.
 */
export async function saveChunks(chunks) {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    chunks.forEach(chunk => {
        store.put(chunk);
    });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => {
            console.error("Save chunks transaction failed:", event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Retrieves all indexed chunks for search.
 */
export async function getAllChunks() {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error("Get all chunks failed:", event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Removes all chunks associated with a specific fileId.
 */
export async function removeChunksByFileId(fileId) {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const allChunks = await getAllChunks();
    const chunksToRemove = allChunks.filter(chunk => chunk.fileId === fileId);

    chunksToRemove.forEach(chunk => {
        store.delete(chunk.chunkId);
    });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => {
            console.error("Remove chunks transaction failed:", event.target.error);
            reject(event.target.error);
        };
    });
}
