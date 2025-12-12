// Main App component
const { html, useEffect, useCallback } = window.preact;

// Import store and actions
import { useStore, actions, getStore, showToast, initTheme, initCrossTabSync } from './hooks/useStore.js';
import { endpoints, createLogStream } from './utils/api.js';

// Import components
import { TopBar } from './components/TopBar.js';
import { ChatMessages } from './components/ChatMessages.js';
import { ChatInput } from './components/ChatInput.js';
import { LogsPanel } from './components/LogsPanel.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ChatsPanel } from './components/ChatsPanel.js';
import { ModelBrowser } from './components/ModelBrowser.js';
import { CommandPalette } from './components/CommandPalette.js';
import { NetworkModal } from './components/NetworkModal.js';
import { ModelComparator } from './components/ModelComparator.js';

// Offline screen component
function OfflineScreen() {
    const retry = () => {
        window.location.reload();
    };

    return html`
        <div class="offline-screen">
            <div class="offline-content">
                <div class="offline-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M1 1l22 22M9 9a3 3 0 1 0 4.243 4.243M6.343 6.343A8 8 0 1 0 17.657 17.657"/>
                        <path d="M12 20h.01"/>
                    </svg>
                </div>
                <h1>Server Offline</h1>
                <p>Cannot connect to MLX Studio server at localhost:1234</p>
                <div class="offline-instructions">
                    <p>Start the server with:</p>
                    <code>make server</code>
                </div>
                <button class="btn btn-primary" onClick=${retry}>
                    Retry Connection
                </button>
            </div>
        </div>
    `;
}

export function App() {
    const { connected } = useStore(s => ({ connected: s.connected }));

    // Initialize theme and load models on mount
    useEffect(() => {
        initTheme();
        initCrossTabSync();
        loadModels();
        // Refresh models list every 30s (not for connection check, just model list)
        const interval = setInterval(() => {
            if (getStore().connected) loadModels();
        }, 30000);

        actions.addLog('info', 'Interface initialized');

        // Connect to server log stream
        const logStream = createLogStream(
            (log) => actions.addServerLog(log),
            (error) => console.warn('Log stream error, will reconnect...', error)
        );

        return () => {
            clearInterval(interval);
            logStream.close();
        };
    }, []);

    // Show offline screen if not connected
    if (connected === false) {
        return html`<${OfflineScreen} />`;
    }

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // Allow Cmd+K even in inputs
                if (!(e.metaKey || e.ctrlKey) || e.key !== 'k') {
                    return;
                }
            }

            if (e.metaKey || e.ctrlKey) {
                switch (e.key) {
                    case 'k':
                        e.preventDefault();
                        actions.openCommandPalette();
                        break;
                    case 'n':
                        e.preventDefault();
                        actions.newChat();
                        break;
                    case ',':
                        e.preventDefault();
                        actions.toggleSettings();
                        break;
                    case 'b':
                        e.preventDefault();
                        actions.toggleChats();
                        break;
                    case 'd':
                        e.preventDefault();
                        actions.toggleModelBrowser();
                        break;
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return html`
        <div class="app-layout">
            <${TopBar} />

            <main class="app-main">
                <${ChatMessages} />
                <${ChatInput} />
                <${LogsPanel} />
            </main>

            <${SettingsModal} />
            <${ChatsPanel} />
            <${ModelBrowser} />
            <${CommandPalette} />
            <${NetworkModal} />
            <${ModelComparator} />

            <div class="toast" id="toast"></div>
        </div>
    `;
}

// Load available models from MLX Studio (includes HuggingFace + LM Studio)
async function loadModels() {
    try {
        const data = await endpoints.localModels();
        const rawModels = data.models || [];

        // Transform models to a more usable format
        const models = rawModels.map(m => ({
            id: m.id,
            name: m.name || m.id.split('/').pop() || m.id,
            vram: m.size || '',
            quantization: m.quantization,
            path: m.path,
            ...m
        }));

        actions.setModels(models);

        // If user had a model selected that's no longer available, clear it
        const currentModel = getStore().currentModel;
        if (currentModel && !models.find(m => m.id === currentModel.id)) {
            actions.setCurrentModel(null);
        }

        actions.setConnected(true);
    } catch (e) {
        actions.setConnected(false);
    }
}
