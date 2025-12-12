// TopBar component
const { html, useState, useEffect, useRef, useCallback } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import {
    BrainIcon, SettingsIcon, ChatIcon, PackageIcon,
    LockIcon, GlobeIcon, ChevronDownIcon, ColumnsIcon,
    SearchIcon, EjectIcon, MenuIcon, XIcon, TagIcon, CheckIcon
} from './Icons.js';

export function TopBar() {
    const { currentModel, connected, loading, networkMode, networkAddresses, models, isLoadingModel } = useStore(s => ({
        currentModel: s.currentModel,
        connected: s.connected,
        loading: s.loading || s.isLoadingModel,
        networkMode: s.networkMode,
        networkAddresses: s.networkAddresses,
        models: s.models,
        isLoadingModel: s.isLoadingModel
    }));

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [menuOpen]);

    return html`
        <header class="topbar">
            <div class="topbar-logo">
                <div class="topbar-logo-icon">M</div>
                <span class="topbar-logo-text">MLX<span> Studio</span></span>
            </div>

            <div class="topbar-center">
                <${ModelDropdown}
                    currentModel=${currentModel}
                    models=${models}
                    isLoadingModel=${isLoadingModel}
                />
            </div>

            <!-- Desktop actions -->
            <div class="topbar-actions topbar-actions-desktop">
                <${ApiBadge} networkMode=${networkMode} networkAddresses=${networkAddresses} onClick=${actions.openNetworkModal} />
                <${StatusPill} connected=${connected} loading=${loading} />
                <button class="btn btn-icon" onClick=${actions.toggleChats} title="Chats">
                    <${ChatIcon} size=${18} />
                </button>
                <button class="btn btn-icon" onClick=${actions.openModelComparator} title="Compare Models">
                    <${ColumnsIcon} size=${18} />
                </button>
                <button class="btn btn-icon" onClick=${actions.toggleModelBrowser} title="Download Models">
                    <${PackageIcon} size=${18} />
                </button>
                <button class="btn btn-icon" onClick=${actions.toggleSettings} title="Settings">
                    <${SettingsIcon} size=${18} />
                </button>
            </div>

            <!-- Mobile menu button -->
            <div class="topbar-menu-toggle" ref=${menuRef}>
                <button class="btn btn-icon" onClick=${() => setMenuOpen(!menuOpen)}>
                    ${menuOpen ? html`<${XIcon} size=${18} />` : html`<${MenuIcon} size=${18} />`}
                </button>

                ${menuOpen && html`
                    <div class="topbar-menu-dropdown">
                        <div class="topbar-menu-item" onClick=${() => { actions.openNetworkModal(); setMenuOpen(false); }}>
                            <${LockIcon} size=${16} />
                            <span>API Settings</span>
                        </div>
                        <div class="topbar-menu-item" onClick=${() => { actions.toggleChats(); setMenuOpen(false); }}>
                            <${ChatIcon} size=${16} />
                            <span>Chats</span>
                        </div>
                        <div class="topbar-menu-item" onClick=${() => { actions.openModelComparator(); setMenuOpen(false); }}>
                            <${ColumnsIcon} size=${16} />
                            <span>Compare Models</span>
                        </div>
                        <div class="topbar-menu-item" onClick=${() => { actions.toggleModelBrowser(); setMenuOpen(false); }}>
                            <${PackageIcon} size=${16} />
                            <span>Download Models</span>
                        </div>
                        <div class="topbar-menu-item" onClick=${() => { actions.toggleSettings(); setMenuOpen(false); }}>
                            <${SettingsIcon} size=${16} />
                            <span>Settings</span>
                        </div>
                        <div class="topbar-menu-divider"></div>
                        <div class="topbar-menu-status">
                            <${StatusPill} connected=${connected} loading=${loading} />
                        </div>
                    </div>
                `}
            </div>
        </header>
    `;
}

function ModelDropdown({ currentModel, models, isLoadingModel }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showAliasInput, setShowAliasInput] = useState(false);
    const [aliasName, setAliasName] = useState('');
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const aliasInputRef = useRef(null);

    const hasModel = !!currentModel;

    // Filter models based on search
    const filteredModels = models.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
    );

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setSearch('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

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
            setIsOpen(false);
        }
    }, [filteredModels, selectedIndex]);

    // Select and load model into memory
    const selectModel = async (model) => {
        if (isLoadingModel || model.id === currentModel?.id) {
            setIsOpen(false);
            return;
        }

        setIsOpen(false);
        actions.setIsLoadingModel(true);
        actions.addLog('info', `Loading model: ${model.id}`);

        try {
            const result = await endpoints.loadModel(model.id);
            if (result.error) throw new Error(result.error);

            actions.setCurrentModel(model);
            const loadTime = result.time?.toFixed(1) || '?';
            showToast(`Model loaded in ${loadTime}s`);
            actions.addLog('info', `Model ${model.id} loaded in ${loadTime}s`);
        } catch (error) {
            showToast(`Error: ${error.message}`);
            actions.addLog('error', `Failed to load model: ${error.message}`);
        }

        actions.setIsLoadingModel(false);
    };

    // Unload model from memory
    const unloadModel = async (e) => {
        e.stopPropagation();
        if (isLoadingModel || !currentModel) return;

        setIsOpen(false);
        actions.setIsLoadingModel(true);
        actions.addLog('info', `Unloading model: ${currentModel.id}`);

        try {
            await endpoints.unloadModel();
            actions.setCurrentModel(null);
            showToast('Model unloaded');
            actions.addLog('info', 'Model unloaded, memory freed');
        } catch (error) {
            showToast(`Error: ${error.message}`);
            actions.addLog('error', `Failed to unload model: ${error.message}`);
        }

        actions.setIsLoadingModel(false);
    };

    // Show alias input
    const startSetAlias = (e) => {
        e.stopPropagation();
        setShowAliasInput(true);
        setAliasName('');
        setTimeout(() => aliasInputRef.current?.focus(), 50);
    };

    // Save alias
    const saveAlias = async (e) => {
        e?.stopPropagation();
        if (!aliasName.trim() || !currentModel) {
            setShowAliasInput(false);
            return;
        }

        try {
            await endpoints.addAlias(aliasName.trim(), currentModel.id);
            showToast(`Alias "${aliasName}" created`);
            setShowAliasInput(false);
            setAliasName('');
        } catch (error) {
            showToast('Failed to create alias');
        }
    };

    // Handle alias input keydown
    const handleAliasKeyDown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            saveAlias();
        } else if (e.key === 'Escape') {
            setShowAliasInput(false);
        }
    };

    return html`
        <div class="model-dropdown" ref=${dropdownRef}>
            <div class="model-selector" onClick=${() => setIsOpen(!isOpen)}>
                <span class="model-selector-icon">
                    <${BrainIcon} size=${16} />
                </span>
                <span class="model-selector-text ${!hasModel ? 'placeholder' : ''}">
                    ${hasModel ? currentModel.name : 'Select a model...'}
                </span>
                ${hasModel && html`<span class="model-selector-badge">loaded</span>`}
                <span class="model-selector-arrow ${isOpen ? 'open' : ''}">
                    <${ChevronDownIcon} size=${14} />
                </span>
            </div>

            ${isOpen && html`
                <div class="model-dropdown-menu">
                    <div class="model-dropdown-search">
                        <${SearchIcon} size=${14} />
                        <input
                            ref=${inputRef}
                            type="text"
                            placeholder="Search models..."
                            value=${search}
                            onInput=${e => setSearch(e.target.value)}
                            onKeyDown=${handleKeyDown}
                        />
                    </div>

                    <div class="model-dropdown-list">
                        ${currentModel && !search ? html`
                            ${showAliasInput ? html`
                                <div class="model-dropdown-item alias-input-row" onClick=${e => e.stopPropagation()}>
                                    <${TagIcon} size=${16} />
                                    <input
                                        ref=${aliasInputRef}
                                        type="text"
                                        class="alias-inline-input"
                                        placeholder="Enter alias name..."
                                        value=${aliasName}
                                        onInput=${e => setAliasName(e.target.value)}
                                        onKeyDown=${handleAliasKeyDown}
                                    />
                                    <button class="alias-save-btn" onClick=${saveAlias}>
                                        <${CheckIcon} size=${14} />
                                    </button>
                                </div>
                            ` : html`
                                <div class="model-dropdown-item" onClick=${startSetAlias}>
                                    <${TagIcon} size=${16} />
                                    <span>Set Alias</span>
                                </div>
                            `}
                            <div class="model-dropdown-item unload" onClick=${unloadModel}>
                                <${EjectIcon} size=${16} />
                                <span>Unload ${currentModel.name}</span>
                            </div>
                            <div class="model-dropdown-divider"></div>
                        ` : ''}

                        ${filteredModels.length === 0 ? html`
                            <div class="model-dropdown-empty">
                                No models found
                            </div>
                        ` : filteredModels.map((model, idx) => html`
                            <div
                                class="model-dropdown-item ${model.id === currentModel?.id ? 'active' : ''} ${idx === selectedIndex ? 'selected' : ''}"
                                onClick=${() => selectModel(model)}
                                onMouseEnter=${() => setSelectedIndex(idx)}
                            >
                                <${BrainIcon} size=${16} />
                                <div class="model-dropdown-item-info">
                                    <span class="model-dropdown-item-name">${model.name}</span>
                                    <span class="model-dropdown-item-meta">${model.vram}</span>
                                </div>
                                ${model.id === currentModel?.id && html`
                                    <span class="model-dropdown-item-badge">loaded</span>
                                `}
                            </div>
                        `)}
                    </div>
                </div>
            `}
        </div>
    `;
}

function StatusPill({ connected, loading }) {
    const statusClass = connected ? (loading ? 'loading' : 'connected') : '';
    const statusText = connected ? (loading ? 'loading...' : 'online') : 'offline';

    return html`
        <div class="status-pill">
            <span class="status-dot ${statusClass}"></span>
            <span>${statusText}</span>
        </div>
    `;
}

function ApiBadge({ networkMode, networkAddresses, onClick }) {
    const isNetwork = networkMode === 'network';
    // Get local IP from networkAddresses or fallback to localhost
    const localIp = networkAddresses?.find(addr => addr && !addr.startsWith('127.')) || '127.0.0.1';

    return html`
        <div
            class="api-badge ${isNetwork ? 'network-enabled' : ''}"
            onClick=${onClick}
            style="${isNetwork ? 'border-color: var(--accent); background: var(--accent-muted);' : ''}"
        >
            <span style="display: flex; color: ${isNetwork ? 'var(--accent)' : 'var(--fg-2)'}">
                ${isNetwork ? html`<${GlobeIcon} size=${14} />` : html`<${LockIcon} size=${14} />`}
            </span>
            <span>API:</span>
            <code>${localIp}:1234/v1</code>
        </div>
    `;
}
