// Main App component
const { html, useEffect, useCallback } = window.preact;

// Import store and actions
import { useStore, actions, getStore, showToast, initTheme, initCrossTabSync } from './hooks/useStore.js';
import { endpoints } from './utils/api.js';

// Import components
import { TopBar } from './components/TopBar.js';
import { ChatMessages } from './components/ChatMessages.js';
import { ChatInput } from './components/ChatInput.js';
import { LogsPanel } from './components/LogsPanel.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { ChatsPanel } from './components/ChatsPanel.js';
import { ModelBrowser } from './components/ModelBrowser.js';
import { CommandPalette } from './components/CommandPalette.js';
import { NetworkModal } from './components/NetworkModal.js';
import { ModelComparator } from './components/ModelComparator.js';

export function App() {
    // Initialize theme and load models on mount
    useEffect(() => {
        initTheme();
        initCrossTabSync();
        loadModels();
        const interval = setInterval(loadModels, 30000);

        actions.addLog('info', 'Interface initialized');

        return () => clearInterval(interval);
    }, []);

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

            <${SettingsPanel} />
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
