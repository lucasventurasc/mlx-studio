// API utility functions for MLX Studio v2.0
// Backend: mlx-omni-server + custom extensions

const API_BASE = 'http://localhost:1234';

export const api = {
    base: API_BASE,

    async get(endpoint) {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async post(endpoint, data = {}) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async delete(endpoint) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    /**
     * Stream API with stats callback (OpenAI format)
     */
    async stream(endpoint, data, onChunk, onStats) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, stream: true })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);

                    if (json.error) {
                        throw new Error(json.error.message || 'Generation error');
                    }

                    // Handle content delta
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta && onChunk) onChunk(delta);

                    // Handle usage stats (mlx-omni-server includes these)
                    if (json.usage && onStats) {
                        onStats({
                            tokens: json.usage.completion_tokens || 0,
                            tps: json.usage.tokens_per_second || json.usage.generation_tps || 0,
                            cache_hit: json.usage.cache_hit || false
                        });
                    }

                    // Check for finish
                    const finishReason = json.choices?.[0]?.finish_reason;
                    if (finishReason === 'stop' || finishReason === 'tool_calls') {
                        return;
                    }
                } catch (e) {
                    if (e.message !== 'Generation error') {
                        console.warn('Stream parse error:', e);
                    } else {
                        throw e;
                    }
                }
            }
        }
    }
};

// API endpoints - mapped to mlx-omni-server + extensions
export const endpoints = {
    // =========================================================================
    // mlx-omni-server endpoints
    // =========================================================================

    // Models (mlx-omni-server)
    models: () => api.get('/v1/models'),

    // Chat completions (mlx-omni-server)
    chat: (data) => api.post('/v1/chat/completions', data),
    chatStream: (data, onChunk, onStats) => api.stream('/v1/chat/completions', data, onChunk, onStats),

    // Health check
    health: () => api.get('/health'),

    // =========================================================================
    // MLX Studio extension endpoints
    // =========================================================================

    // Inference profiles (extension)
    profiles: () => api.get('/api/profiles'),
    setProfile: (profile) => api.post(`/api/profiles/${profile}`),

    // KV Cache management (extension)
    cacheStats: () => api.get('/api/cache/stats'),
    cacheClear: (includePersisted = false) =>
        api.post(`/api/cache/clear?include_persisted=${includePersisted}`),
    cachePersisted: () => api.get('/api/cache/persisted'),
    cachePersist: (slotId) => api.post(`/api/cache/persist/${slotId}`),
    cacheDelete: (cacheKey) => api.delete(`/api/cache/persisted/${cacheKey}`),

    // =========================================================================
    // Deprecated/removed endpoints (kept for compatibility, return mock data)
    // =========================================================================

    // Model loading (pre-load into memory)
    loadModel: (modelId) => api.post(`/api/models/load?model_id=${encodeURIComponent(modelId)}`),
    unloadModel: () => api.post('/api/models/unload'),
    refreshModels: () => api.get('/v1/models'),

    // Status - use health endpoint
    status: () => api.get('/health'),

    // Speculative decoding - not available in mlx-omni-server base
    speculativeStatus: async () => ({ enabled: false, draft_model: null }),
    loadDraftModel: async () => ({ status: 'not_supported' }),
    unloadDraftModel: async () => ({ status: 'ok' }),
    toggleSpeculative: async () => ({ status: 'not_supported' }),

    // Generation stats - not available as separate endpoint
    generationStats: async () => ({ generating: false }),

    // Network - not implemented
    network: async () => ({ addresses: [] }),

    // HuggingFace integration (MLX Studio extension)
    hfSearch: (query, limit = 20) => api.get(`/api/models/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    hfDownload: (repoId) => api.post(`/api/models/download?repo_id=${encodeURIComponent(repoId)}`),
    hfDownloads: () => api.get('/api/models/downloads'),
    hfRepoInfo: (repoId) => api.get(`/api/models/info/${repoId}`),

    // Local models
    localModels: () => api.get('/api/models/local'),

    // Model aliases
    aliases: () => api.get('/api/aliases'),
    addAlias: (alias, modelPath) => api.post('/api/aliases', { alias, model_path: modelPath }),
    deleteAlias: (alias) => api.delete(`/api/aliases/${encodeURIComponent(alias)}`),
    autoCreateAliases: () => api.post('/api/aliases/auto')
};
