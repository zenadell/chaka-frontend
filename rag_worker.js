// rag_worker.js - Lightweight Version (Server-Side Embeddings)

// Tracks { fileId: { isCancelled: boolean } }
const activeEmbeddings = {}; 
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

// Configurable runtime knobs (can be set by main thread via config message)
let BATCH_SIZE = 5; // how many chunks to request in parallel
let SIMILARITY_THRESHOLD = 0.4; // cosine similarity threshold for search results
let EMBED_REQUEST_TIMEOUT_MS = 20000; // 20s timeout for embed requests

// EMBED API URL is configured by the main thread. We accept a config message
// that sets a `backend` base URL (e.g. https://chaka-backend.onrender.com).
// This prevents the worker from calling localhost when deployed.
let EMBED_API_URL = null;

// Listen for configuration from the main thread
self.addEventListener('message', (e) => {
    const data = e.data || {};
    if (data.type === 'config' && data.backend) {
        // Normalize and append the embed path
        const base = String(data.backend).replace(/\/$/, '');
        EMBED_API_URL = `${base}/api/rag/embed`;
        // Optional debug log (workers don't have console in some envs)
        try { console.log('RAG worker configured EMBED_API_URL =', EMBED_API_URL); } catch (e) {}
    }

    // Allow runtime configuration of batch size / thresholds
    if (data.type === 'config' && typeof data.batchSize === 'number') {
        BATCH_SIZE = Math.max(1, Math.floor(data.batchSize));
    }
    if (data.type === 'config' && typeof data.similarityThreshold === 'number') {
        SIMILARITY_THRESHOLD = Number(data.similarityThreshold);
    }
    if (data.type === 'config' && typeof data.embedRequestTimeoutMs === 'number') {
        EMBED_REQUEST_TIMEOUT_MS = Number(data.embedRequestTimeoutMs);
    }
});

// --- 1. Utility Functions ---

/**
 * ✅ [IMPROVED] Smart Chunking: Respects sentence boundaries
 * Splits by punctuation (. ! ? \n) to preserve semantic meaning.
 */
function chunkText(text) {
    if (!text) return [];
    
    // 1. Split by sentence ending punctuation or newlines
    // This regex looks for punctuation followed by space or end of line
    const sentences = text.match(/[^.!?\n]+[.!?\n]+(\s+|$)|[^.!?\n]+$/g) || [text];
    
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        // If adding this sentence keeps us under the limit, add it
        if ((currentChunk + sentence).length <= CHUNK_SIZE) {
            currentChunk += sentence;
        } else {
            // Chunk is full. Push it if it has content.
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
            }
            
            // Create overlap for continuity (keep the last ~100 chars of the previous chunk)
            // This helps the AI understand context across chunk boundaries
            const overlap = currentChunk.length > CHUNK_OVERLAP 
                ? currentChunk.slice(-CHUNK_OVERLAP) 
                : "";
                
            currentChunk = overlap + sentence;
        }
    }
    
    // Push the final remaining text
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}


/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    // Ensure same length
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calls the Backend API to get the vector for a text string.
 */
async function fetchEmbeddingFromServer(text) {
    try {
        // Use configured EMBED_API_URL, or fall back to the Render backend if not configured
        const url = EMBED_API_URL || 'https://chaka-backend.onrender.com/api/rag/embed';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), EMBED_REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const bodyText = await response.text().catch(() => '');
            throw new Error(`Server Error: ${response.status} ${bodyText}`);
        }

        const data = await response.json();
        const embedding = data?.embedding || data?.vector || null;
        if (!Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('Invalid embedding returned from server');
        }
        // Ensure numeric array
        if (!embedding.every(n => typeof n === 'number')) {
            throw new Error('Embedding values are not numeric');
        }
        return embedding; // [0.1, 0.2, ...]
    } catch (error) {
        console.error("Embedding API Call Failed:", error && error.message ? error.message : error);
        throw error;
    }
}

// --- 2. Main Logic Handlers ---

/**
 * Generates embeddings by calling the server for each chunk (PARALLEL BATCHED VERSION).
 */
async function generateEmbeddings(fileId, fileContent) {
    if (activeEmbeddings[fileId]?.isCancelled) return;

    postMessage({ type: 'STATUS', status: `Chunking file...`, fileId });
    const textChunks = chunkText(fileContent);
    const totalChunks = textChunks.length;
    let allIndexedChunks = [];

    console.log(`WORKER: Sending ${totalChunks} chunks to server for embedding...`);

    try {
        // --- ✅ [MODIFIED] PARALLEL BATCH PROCESSING ---
        // Process chunks in configurable groups (BATCH_SIZE) for speed.
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
            // Check cancellation at the start of each batch
            if (activeEmbeddings[fileId]?.isCancelled) {
                console.log(`WORKER: Embedding cancelled for ${fileId} at batch starting ${i}`);
                delete activeEmbeddings[fileId];
                return;
            }

            // Slice out a batch of chunks
            const batch = textChunks.slice(i, i + BATCH_SIZE);
            
            // Map them to an array of promises (fire all requests at once)
            const batchPromises = batch.map(async (chunkText, batchIndex) => {
                const globalIndex = i + batchIndex;
                const vector = await fetchEmbeddingFromServer(chunkText);
                return {
                    chunkId: `${fileId}_${globalIndex}`,
                    fileId: fileId,
                    text: chunkText,
                    vector: vector,
                    metadata: { index: globalIndex }
                };
            });

            // Update UI progress
            const currentBatchNum = Math.ceil((i + 1) / BATCH_SIZE);
            const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
            postMessage({ 
                type: 'STATUS', 
                status: `Indexing: Processing batch ${currentBatchNum} of ${totalBatches}...`, 
                fileId: fileId 
            });

            // Wait for all requests in this batch to finish but tolerate partial failures
            const settled = await Promise.allSettled(batchPromises);
            const successes = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
            const failures = settled.filter(s => s.status === 'rejected');

            if (failures.length > 0) {
                // Notify main thread about per-batch failures but continue with successful embeddings
                postMessage({ type: 'WARN', message: `Embedding: ${failures.length} chunk(s) failed in batch ${Math.ceil((i+1)/BATCH_SIZE)}` , fileId });
                console.warn(`RAG worker: ${failures.length} embedding(s) failed in batch starting at ${i}`);
                failures.forEach(f => console.warn('Batch failure:', f.reason && f.reason.message ? f.reason.message : f.reason));
            }

            // Add only the successful results to our master list
            allIndexedChunks.push(...successes);
        }
        // --- [END MODIFIED BLOCK] ---

        console.log(`WORKER: Embedding complete for ${fileId}.`);
        postMessage({ type: 'EMBEDDING_RESULT', fileId, indexedChunks: allIndexedChunks });

    } catch (error) {
        if (!activeEmbeddings[fileId]?.isCancelled) {
            postMessage({ type: 'ERROR', message: 'Failed to generate embeddings via server.', fileId, error: error.message });
        }
    } finally {
        delete activeEmbeddings[fileId];
    }
}


/**
 * Executes vector search.
 * 1. Embeds the QUERY using the server.
 * 2. Compares query vector vs stored chunks locally (Cosine Similarity).
 */
async function vectorSearch(query, indexedChunks, topK = 5) {
    try {
        // Get the vector for the user's question from the server
        const queryVector = await fetchEmbeddingFromServer(query);

        // Run math locally (Cosine Similarity is fast enough for JS)
        const results = indexedChunks.map(chunk => ({
            ...chunk,
            similarity: cosineSimilarity(queryVector, chunk.vector)
        }))
    .filter(result => result.similarity > SIMILARITY_THRESHOLD) // Threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

        // Return only text (don't send heavy vectors back to main thread)
        const context = results.map(r => ({ text: r.text, fileId: r.fileId, similarity: r.similarity }));

        postMessage({ type: 'SEARCH_RESULT', query, context });

    } catch (error) {
        postMessage({ type: 'ERROR', message: 'Vector search failed.', query, error: error.message });
    }
}

// --- 3. Event Listener ---

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'LOAD_MODEL':
            // No-op: We don't need to load models anymore!
            postMessage({ type: 'STATUS', status: '🧠 Server-side RAG ready.' });
            break;

        case 'EMBED_DOCUMENT':
            const { fileId, fileContent } = payload;
            if (!activeEmbeddings[fileId]?.isCancelled) {
                activeEmbeddings[fileId] = { isCancelled: false };
                await generateEmbeddings(fileId, fileContent);
            }
            break;

        case 'VECTOR_SEARCH':
            await vectorSearch(payload.query, payload.indexedChunks);
            break;

        case 'CANCEL_EMBEDDING':
            const { fileId: cancelFileId } = payload;
            if (activeEmbeddings[cancelFileId]) {
                activeEmbeddings[cancelFileId].isCancelled = true;
            }
            break;
    }
};

// Signal ready immediately since we don't have to load TFJS
postMessage({ type: 'STATUS', status: '🧠 Server-side RAG ready.' });
