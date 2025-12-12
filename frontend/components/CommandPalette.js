// Command Palette component - centralized search/action hub
const { html, useState, useEffect, useRef, useCallback } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { SearchIcon, BrainIcon, EjectIcon } from './Icons.js';

export function CommandPalette() {
    const { show, models, currentModel, isLoadingModel } = useStore(s => ({
        show: s.showCommandPalette,
        models: s.models,
        currentModel: s.currentModel,
        isLoadingModel: s.isLoadingModel
    }));

    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    // Filter models based on search
    const filteredModels = models.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
    );

    // Focus input when opened
    useEffect(() => {
        if (show && inputRef.current) {
            inputRef.current.focus();
            setSearch('');
            setSelectedIndex(0);
        }
    }, [show]);

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, filteredModels.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredModels[selectedIndex]) {
                selectModel(filteredModels[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            actions.closeCommandPalette();
        }
    }, [filteredModels, selectedIndex]);

    // Select model
    const selectModel = async (model) => {
        if (isLoadingModel || model.id === currentModel?.id) {
            actions.closeCommandPalette();
            return;
        }

        actions.closeCommandPalette();
        actions.setIsLoadingModel(true);
        actions.addLog('info', `Loading model: ${model.id}`);
        actions.addMessage({ role: 'system', content: `Loading model ${model.id}...` });

        try {
            const result = await endpoints.loadModel(model.id);
            if (result.error) throw new Error(result.error);

            actions.setCurrentModel(model);
            const loadTime = result.time?.toFixed(1) || '?';
            showToast(`Model loaded in ${loadTime}s`);
            actions.addLog('info', `Model ${model.id} loaded in ${loadTime}s`);
            actions.addMessage({ role: 'system', content: 'Model loaded successfully!' });
        } catch (error) {
            showToast(`Error: ${error.message}`);
            actions.addLog('error', `Failed to load model: ${error.message}`);
            actions.addMessage({ role: 'system', content: `Error loading model: ${error.message}` });
        }

        actions.setIsLoadingModel(false);
    };

    // Unload model
    const unloadModel = async () => {
        if (isLoadingModel || !currentModel) return;

        actions.setIsLoadingModel(true);
        actions.addLog('info', `Unloading model: ${currentModel.id}`);

        try {
            const result = await endpoints.unloadModel();
            if (result.error) throw new Error(result.error);

            actions.setCurrentModel(null);
            showToast('Model unloaded');
            actions.addLog('info', 'Model unloaded, memory freed');
            actions.addMessage({ role: 'system', content: 'Model unloaded, memory freed.' });
        } catch (error) {
            showToast(`Error: ${error.message}`);
            actions.addLog('error', `Failed to unload model: ${error.message}`);
        }

        actions.setIsLoadingModel(false);
    };

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            actions.closeCommandPalette();
        }
    }, []);

    if (!show) return null;

    return html`
        <div class="command-palette-overlay" onClick=${handleOverlayClick}>
            <div class="command-palette">
                <div class="command-palette-header">
                    <div class="command-palette-search">
                        <span class="command-palette-search-icon"><${SearchIcon} size=${18} /></span>
                        <input
                            ref=${inputRef}
                            class="command-palette-input"
                            type="text"
                            placeholder="Search models..."
                            value=${search}
                            onInput=${e => setSearch(e.target.value)}
                            onKeyDown=${handleKeyDown}
                        />
                        <div class="command-palette-hint">
                            <kbd>esc</kbd> to close
                        </div>
                    </div>
                </div>

                <div class="command-palette-content">
                    ${currentModel && !search ? html`
                        <div class="command-palette-section">
                            <div class="command-palette-section-title">Current Model</div>
                            <div
                                class="command-palette-item unload-action"
                                onClick=${unloadModel}
                                style="border: 1px solid var(--border); background: var(--bg-2);"
                            >
                                <div class="command-palette-item-icon" style="color: var(--error);"><${EjectIcon} size=${22} /></div>
                                <div class="command-palette-item-info">
                                    <div class="command-palette-item-name">Unload ${currentModel.name}</div>
                                    <div class="command-palette-item-meta">
                                        <span>Free up memory</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    ${filteredModels.length === 0 ? html`
                        <div class="command-palette-empty">
                            No models found${search ? ` for "${search}"` : ''}
                            <br />
                            <span style="font-size: 12px; color: var(--fg-2);">
                                Press <kbd style="background: var(--bg-3); padding: 2px 6px; border-radius: 4px; font-size: 10px;">⌘D</kbd> to download models
                            </span>
                        </div>
                    ` : html`
                        <div class="command-palette-section">
                            <div class="command-palette-section-title">Available Models</div>
                            ${filteredModels.map((model, idx) => html`
                                <div
                                    class="command-palette-item ${model.loaded ? 'loaded' : ''} ${idx === selectedIndex ? 'selected' : ''}"
                                    onClick=${() => selectModel(model)}
                                    onMouseEnter=${() => setSelectedIndex(idx)}
                                >
                                    <div class="command-palette-item-icon"><${BrainIcon} size=${22} /></div>
                                    <div class="command-palette-item-info">
                                        <div class="command-palette-item-name">${model.name}</div>
                                        <div class="command-palette-item-meta">
                                            <span>${model.vram}</span>
                                            ${model.params && html`<span>${model.params}</span>`}
                                        </div>
                                    </div>
                                    ${model.loaded && html`
                                        <div class="command-palette-item-status">
                                            <span class="dot"></span>
                                            Loaded
                                        </div>
                                    `}
                                </div>
                            `)}
                        </div>
                    `}
                </div>

                <div class="command-palette-footer">
                    <div class="command-palette-footer-item">
                        <kbd>↑↓</kbd> navigate
                    </div>
                    <div class="command-palette-footer-item">
                        <kbd>enter</kbd> select
                    </div>
                    <div class="command-palette-footer-item">
                        <kbd>⌘D</kbd> download models
                    </div>
                </div>
            </div>
        </div>
    `;
}
