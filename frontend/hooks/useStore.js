// Simple global state management using Preact signals pattern
// This creates a centralized store that components can subscribe to

const { useState, useEffect, useCallback } = window.preact;

// Storage key prefix
const STORAGE_KEY = 'mlx-studio';

// Load persisted data from localStorage
function loadPersistedState() {
    try {
        const chatsData = localStorage.getItem(`${STORAGE_KEY}-chats`);
        const settingsData = localStorage.getItem(`${STORAGE_KEY}-settings`);
        const currentChatIdData = localStorage.getItem(`${STORAGE_KEY}-currentChatId`);
        const profileData = localStorage.getItem(`${STORAGE_KEY}-profile`);
        const currentModelData = localStorage.getItem(`${STORAGE_KEY}-currentModel`);

        const persisted = {};

        if (chatsData) {
            const chats = JSON.parse(chatsData);
            // Restore dates
            chats.forEach(c => {
                if (c.time) c.time = new Date(c.time);
            });
            persisted.chats = chats;

            // Load current chat messages
            const currentId = currentChatIdData ? parseInt(currentChatIdData) : chats[0]?.id;
            if (currentId) {
                persisted.currentChatId = currentId;
                const currentChat = chats.find(c => c.id === currentId);
                if (currentChat) {
                    persisted.messages = currentChat.messages || [];
                }
            }
        }

        if (settingsData) {
            const savedSettings = JSON.parse(settingsData);
            // Filter out null/undefined/NaN values to prevent overwriting defaults
            persisted.settings = Object.fromEntries(
                Object.entries(savedSettings).filter(([_, v]) =>
                    v != null && !Number.isNaN(v)
                )
            );
        }

        if (profileData) {
            persisted.currentProfile = profileData;
        }

        if (currentModelData) {
            try {
                persisted.currentModel = JSON.parse(currentModelData);
            } catch {
                persisted.currentModel = null;
            }
        }

        return persisted;
    } catch (e) {
        console.warn('Failed to load persisted state:', e);
        return {};
    }
}

// Default settings
const defaultSettings = {
    temperature: 0.7,
    maxTokens: 8192,
    topP: 0.9,
    topK: 40,
    repPenalty: 1.0,
    contextLength: 32768,
    streamEnabled: true,
    enableThinking: true,  // Enable thinking mode for Qwen3 and similar models
    thinkingBudget: 0,     // Max thinking tokens (0 = unlimited)
    systemPrompt: ''
};

// Default voice settings
const defaultVoiceSettings = {
    inputMode: 'ptt',        // 'ptt' (push-to-talk) or 'vad' (voice activity detection)
    vadThreshold: 0.3,       // Sensitivity threshold for VAD (medium = normal speech)
    vadSilenceDuration: 1200, // ms of silence before speech ends (1.2s feels natural)
    ttsVoice: 'conversational_a',  // Default TTS voice (Marvis Female)
    ttsSpeed: 1.0,           // TTS playback speed (0.25 - 4.0)
    ttsModel: 'Marvis-AI/marvis-tts-250m-v0.1',
    ttsEnabled: true,        // Auto-play TTS responses
    sttModel: 'mlx-community/whisper-large-v3-turbo',
    sttLanguage: 'en'        // STT language (English)
};

// Initial state (with persistence)
const persistedState = loadPersistedState();
const initialState = {
    // Connection
    connected: false,
    loading: false,

    // Models
    models: [],
    currentModel: persistedState.currentModel || null,
    isLoadingModel: false,

    // Chat
    messages: persistedState.messages || [],
    isGenerating: false,

    // All chats
    chats: persistedState.chats || [{ id: 1, name: 'New Chat', messages: [], time: new Date() }],
    currentChatId: persistedState.currentChatId || 1,

    // Settings
    settings: { ...defaultSettings, ...persistedState.settings },

    // Inference profile
    currentProfile: persistedState.currentProfile || 'balanced',

    // Network
    networkMode: 'local',
    networkAddresses: [],

    // Logs
    logs: [],
    logFilter: 'all',

    // UI
    showSettings: false,
    showChats: false,
    showModelBrowser: false,
    showCommandPalette: false,
    showNetworkModal: false,
    showModelComparator: false,
    showVoiceMode: false,
    showStatsPanel: false,

    // Model performance stats (rolling history)
    modelStats: {
        requests: [],        // Array of { timestamp, model, tokens, tps, ttft, duration, cacheHit }
        sessionStart: Date.now(),
        totalTokens: 0,
        totalRequests: 0,
        cacheHits: 0
    },

    // Voice Mode
    voiceSettings: { ...defaultVoiceSettings },
    voiceMessages: [],        // Separate history for voice conversations
    voiceSystemPrompt: `You are a helpful voice assistant. Keep responses concise and conversational - 1-2 sentences when possible. Speak naturally as if having a conversation.`,

    // Theme
    theme: 'system' // 'light', 'dark', or 'system'
};

// Global store
let store = { ...initialState };
let listeners = new Set();

// Debounced persist function
let persistTimeout = null;
function schedulePersist() {
    clearTimeout(persistTimeout);
    persistTimeout = setTimeout(persistState, 500);
}

// Persist state to localStorage
function persistState() {
    try {
        // Save current messages to current chat before persisting
        const chatsWithCurrentMessages = store.chats.map(c =>
            c.id === store.currentChatId ? { ...c, messages: store.messages } : c
        );

        localStorage.setItem(`${STORAGE_KEY}-chats`, JSON.stringify(chatsWithCurrentMessages));
        localStorage.setItem(`${STORAGE_KEY}-settings`, JSON.stringify(store.settings));
        localStorage.setItem(`${STORAGE_KEY}-currentChatId`, store.currentChatId.toString());
        if (store.currentProfile) {
            localStorage.setItem(`${STORAGE_KEY}-profile`, store.currentProfile);
        }
        if (store.currentModel) {
            localStorage.setItem(`${STORAGE_KEY}-currentModel`, JSON.stringify(store.currentModel));
        } else {
            localStorage.removeItem(`${STORAGE_KEY}-currentModel`);
        }
    } catch (e) {
        console.warn('Failed to persist state:', e);
    }
}

// Notify all listeners
function notify() {
    listeners.forEach(listener => listener({ ...store }));
}

// Update store
export function updateStore(updates, persist = true) {
    if (typeof updates === 'function') {
        store = { ...store, ...updates(store) };
    } else {
        store = { ...store, ...updates };
    }
    notify();

    // Schedule persistence for relevant updates
    if (persist) {
        schedulePersist();
    }
}

// Get current store state
export function getStore() {
    return { ...store };
}

// Hook to use store in components
export function useStore(selector) {
    const [state, setState] = useState(() => selector ? selector(store) : store);

    useEffect(() => {
        const listener = (newStore) => {
            const newState = selector ? selector(newStore) : newStore;
            setState(newState);
        };
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, [selector]);

    return state;
}

// Actions
export const actions = {
    // Connection
    setConnected: (connected) => updateStore({ connected }),
    setLoading: (loading) => updateStore({ loading }),

    // Models
    setModels: (models) => updateStore({ models }),
    setCurrentModel: (currentModel) => updateStore({ currentModel }),
    setIsLoadingModel: (isLoadingModel) => updateStore({ isLoadingModel }),

    // Chat
    setMessages: (messages) => updateStore({ messages }),
    addMessage: (message) => updateStore(s => ({
        messages: [...s.messages, message]
    })),
    updateLastMessage: (content) => updateStore(s => {
        const messages = [...s.messages];
        if (messages.length > 0) {
            messages[messages.length - 1] = {
                ...messages[messages.length - 1],
                content
            };
        }
        return { messages };
    }),
    setIsGenerating: (isGenerating) => updateStore({ isGenerating }),
    clearMessages: () => updateStore({ messages: [] }),

    // Chats
    setChats: (chats) => updateStore({ chats }),
    setCurrentChatId: (currentChatId) => updateStore({ currentChatId }),
    newChat: () => {
        const { chats, messages, currentChatId } = getStore();

        // Save current chat messages
        const updatedChats = chats.map(c =>
            c.id === currentChatId ? { ...c, messages: [...messages] } : c
        );

        const newId = Math.max(...chats.map(c => c.id)) + 1;
        const newChat = { id: newId, name: 'New Chat', messages: [], time: new Date() };

        updateStore({
            chats: [newChat, ...updatedChats],
            currentChatId: newId,
            messages: []
        });
    },
    switchChat: (chatId) => {
        const { chats, messages, currentChatId } = getStore();

        // Save current chat messages
        const updatedChats = chats.map(c =>
            c.id === currentChatId ? { ...c, messages: [...messages] } : c
        );

        // Load new chat
        const chat = updatedChats.find(c => c.id === chatId);
        if (chat) {
            updateStore({
                chats: updatedChats,
                currentChatId: chatId,
                messages: [...chat.messages]
            });
        }
    },
    updateChatName: (chatId, name) => updateStore(s => ({
        chats: s.chats.map(c => c.id === chatId ? { ...c, name } : c)
    })),
    deleteChat: (chatId) => {
        const { chats, currentChatId, messages } = getStore();

        // Don't delete if only one chat
        if (chats.length <= 1) return;

        const newChats = chats.filter(c => c.id !== chatId);

        // If deleting current chat, switch to first remaining
        if (chatId === currentChatId) {
            const newCurrent = newChats[0];
            updateStore({
                chats: newChats,
                currentChatId: newCurrent.id,
                messages: newCurrent.messages || []
            });
        } else {
            updateStore({ chats: newChats });
        }
    },
    clearAllChats: () => {
        const newChat = { id: 1, name: 'New Chat', messages: [], time: new Date() };
        updateStore({
            chats: [newChat],
            currentChatId: 1,
            messages: []
        });
    },

    // Settings
    updateSettings: (settings) => updateStore(s => ({
        settings: { ...s.settings, ...settings }
    })),

    // Inference Profile
    setProfile: (profile) => updateStore({ currentProfile: profile }),

    // Network
    setNetworkMode: (networkMode) => updateStore({ networkMode }),
    setNetworkAddresses: (networkAddresses) => updateStore({ networkAddresses }),

    // Logs
    addLog: (level, message, source = 'client') => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        updateStore(s => ({
            logs: [...s.logs.slice(-499), { timestamp, level, message, source }]
        }));
    },
    addServerLog: (log) => {
        // Add server log with 'server' source
        updateStore(s => ({
            logs: [...s.logs.slice(-499), {
                timestamp: log.timestamp,
                level: log.level,
                message: `[${log.logger}] ${log.message}`,
                source: 'server'
            }]
        }));
    },
    clearLogs: () => updateStore({ logs: [] }),
    setLogFilter: (logFilter) => updateStore({ logFilter }),

    // UI
    toggleSettings: () => updateStore(s => ({
        showSettings: !s.showSettings,
        showChats: false,
        showModelBrowser: false
    })),
    toggleChats: () => updateStore(s => ({
        showChats: !s.showChats,
        showSettings: false,
        showModelBrowser: false
    })),
    toggleModelBrowser: () => updateStore(s => ({
        showModelBrowser: !s.showModelBrowser,
        showSettings: false,
        showChats: false
    })),
    openCommandPalette: () => updateStore({ showCommandPalette: true }),
    closeCommandPalette: () => updateStore({ showCommandPalette: false }),
    openNetworkModal: () => updateStore({ showNetworkModal: true }),
    closeNetworkModal: () => updateStore({ showNetworkModal: false }),
    openModelComparator: () => updateStore({ showModelComparator: true }),
    closeModelComparator: () => updateStore({ showModelComparator: false }),
    closeAllPanels: () => updateStore({
        showSettings: false,
        showChats: false,
        showModelBrowser: false,
        showModelComparator: false,
        showVoiceMode: false
    }),

    // Stats Panel
    toggleStatsPanel: () => updateStore(s => ({ showStatsPanel: !s.showStatsPanel })),
    recordRequestStats: (stats) => updateStore(s => {
        const newRequest = {
            timestamp: Date.now(),
            model: stats.model || s.currentModel?.name || 'unknown',
            tokens: stats.tokens || 0,
            tps: stats.tps || 0,
            ttft: stats.ttft || null,
            duration: stats.duration || 0,
            cacheHit: stats.cacheHit || false,
            promptTokens: stats.promptTokens || 0
        };
        const requests = [...s.modelStats.requests, newRequest].slice(-100); // Keep last 100
        return {
            modelStats: {
                ...s.modelStats,
                requests,
                totalTokens: s.modelStats.totalTokens + newRequest.tokens,
                totalRequests: s.modelStats.totalRequests + 1,
                cacheHits: s.modelStats.cacheHits + (newRequest.cacheHit ? 1 : 0)
            }
        };
    }),
    resetStats: () => updateStore({
        modelStats: {
            requests: [],
            sessionStart: Date.now(),
            totalTokens: 0,
            totalRequests: 0,
            cacheHits: 0
        }
    }),

    // Voice Mode
    toggleVoiceMode: () => updateStore(s => ({
        showVoiceMode: !s.showVoiceMode,
        showSettings: false,
        showChats: false,
        showModelBrowser: false
    })),
    updateVoiceSettings: (settings) => updateStore(s => ({
        voiceSettings: { ...s.voiceSettings, ...settings }
    })),
    addVoiceMessage: (message) => updateStore(s => ({
        voiceMessages: [...s.voiceMessages, message]
    })),
    clearVoiceMessages: () => updateStore({ voiceMessages: [] }),
    setVoiceSystemPrompt: (prompt) => updateStore({ voiceSystemPrompt: prompt }),

    // Theme
    setTheme: (theme) => {
        updateStore({ theme });
        applyTheme(theme);
        localStorage.setItem('mlx-studio-theme', theme);
    },
    toggleTheme: () => {
        const { theme } = getStore();
        const newTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
        actions.setTheme(newTheme);
    }
};

// Apply theme to document
function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', theme);
    }
}

// Initialize theme from localStorage
export function initTheme() {
    const saved = localStorage.getItem('mlx-studio-theme') || 'system';
    updateStore({ theme: saved });
    applyTheme(saved);
}

// Listen for storage changes from other tabs
export function initCrossTabSync() {
    window.addEventListener('storage', (e) => {
        if (e.key === `${STORAGE_KEY}-currentModel`) {
            try {
                const newModel = e.newValue ? JSON.parse(e.newValue) : null;
                const currentId = store.currentModel?.id;
                const newId = newModel?.id;
                if (newId !== currentId) {
                    updateStore({ currentModel: newModel }, false);
                }
            } catch {
                // Ignore parse errors
            }
        }
    });
}

// Toast management
let toastTimeout = null;
export function showToast(message, duration = 2500) {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toastEl.classList.remove('show'), duration);
    }
}
