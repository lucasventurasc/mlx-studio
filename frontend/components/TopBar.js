// TopBar component
const { html, useState, useEffect, useRef, useCallback } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import {
    BrainIcon, SettingsIcon, ChatIcon, PackageIcon,
    LockIcon, GlobeIcon, ChevronDownIcon, ColumnsIcon,
    SearchIcon, EjectIcon, MenuIcon, XIcon, TagIcon, CheckIcon
} from './Icons.js';

// Easter egg: Matrix rain animation
function triggerMatrixRain(logoElement) {
    // Find the main app container
    const appMain = document.querySelector('.app-main');
    if (!appMain) return;

    const rect = appMain.getBoundingClientRect();

    // Always use dark overlay for Matrix effect
    const overlayColor = 'rgba(0, 0, 0, 0.95)';
    const trailColor = 'rgba(0, 0, 0, 0.05)';

    // Show "Easter Egg found" label next to logo
    const label = document.createElement('span');
    label.textContent = 'Easter Egg found';
    label.style.cssText = `
        margin-left: 12px;
        font-size: 12px;
        color: var(--accent);
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    logoElement.appendChild(label);
    requestAnimationFrame(() => label.style.opacity = '1');

    // Create overlay only for main container
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background: ${overlayColor};
        z-index: 100;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    document.body.appendChild(overlay);

    // Phase 1: Fade in overlay (0.5s)
    requestAnimationFrame(() => overlay.style.opacity = '1');

    // Phase 2: Start rain quickly after overlay appears (0.5s)
    setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.id = 'matrix-rain';
        canvas.style.cssText = `
            position: fixed;
            top: ${rect.top}px;
            left: ${rect.left}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            z-index: 101;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.5s ease;
        `;
        document.body.appendChild(canvas);

        requestAnimationFrame(() => canvas.style.opacity = '1');

        const ctx = canvas.getContext('2d');
        canvas.width = rect.width;
        canvas.height = rect.height;

        const chars = 'MLXmlx01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split('');
        const fontSize = 18;
        const columns = Math.floor(canvas.width / fontSize);
        const rows = Math.ceil(canvas.height / fontSize);
        const colors = ['#10b981', '#06b6d4', '#a855f7', '#3b82f6'];

        // Grid stores the character and its brightness for each cell
        const grid = [];
        for (let i = 0; i < columns; i++) {
            grid[i] = [];
            for (let j = 0; j < rows; j++) {
                grid[i][j] = {
                    char: chars[Math.floor(Math.random() * chars.length)],
                    brightness: 0
                };
            }
        }

        // Stream heads - multiple per column
        const streams = [];
        for (let i = 0; i < columns; i++) {
            // 2-4 streams per column at different starting positions
            const numStreams = 2 + Math.floor(Math.random() * 3);
            for (let s = 0; s < numStreams; s++) {
                streams.push({
                    col: i,
                    row: Math.floor(Math.random() * rows * 2) - rows,
                    speed: 0.15 + Math.random() * 0.2,
                    length: 8 + Math.floor(Math.random() * 12)
                });
            }
        }

        let frameCount = 0;
        const maxFrames = 360; // 6 seconds at 60fps

        function draw() {
            // Clear with slight fade for trail effect
            ctx.fillStyle = trailColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `bold ${fontSize}px monospace`;

            // Randomly change some characters in the grid
            for (let i = 0; i < columns; i++) {
                for (let j = 0; j < rows; j++) {
                    if (Math.random() < 0.02) {
                        grid[i][j].char = chars[Math.floor(Math.random() * chars.length)];
                    }
                    // Fade brightness over time
                    if (grid[i][j].brightness > 0) {
                        grid[i][j].brightness *= 0.92;
                    }
                }
            }

            // Update streams and set brightness
            for (const stream of streams) {
                stream.row += stream.speed;

                // Set brightness for cells in this stream's trail
                const headRow = Math.floor(stream.row);
                for (let t = 0; t < stream.length; t++) {
                    const r = headRow - t;
                    if (r >= 0 && r < rows) {
                        const brightness = t === 0 ? 1.0 : Math.pow(1 - (t / stream.length), 0.8);
                        grid[stream.col][r].brightness = Math.max(grid[stream.col][r].brightness, brightness);
                    }
                }

                // Reset stream when completely off screen
                if (headRow - stream.length > rows) {
                    stream.row = -stream.length - Math.random() * 20;
                    stream.speed = 0.3 + Math.random() * 0.4;
                    stream.length = 8 + Math.floor(Math.random() * 12);
                }
            }

            // Draw all cells that have brightness
            for (let i = 0; i < columns; i++) {
                for (let j = 0; j < rows; j++) {
                    const cell = grid[i][j];
                    if (cell.brightness < 0.05) continue;

                    const x = i * fontSize;
                    const y = (j + 1) * fontSize;

                    // Gradient based on both x and y position for smooth color transitions
                    const t = ((i / columns) + (j / rows)) / 2;
                    const colorIdx = t * (colors.length - 1);
                    const c1 = Math.floor(colorIdx);
                    const c2 = Math.min(c1 + 1, colors.length - 1);
                    const blend = colorIdx - c1;

                    // Interpolate between colors
                    const color1 = colors[c1];
                    const color2 = colors[c2];
                    const r1 = parseInt(color1.slice(1, 3), 16);
                    const g1 = parseInt(color1.slice(3, 5), 16);
                    const b1 = parseInt(color1.slice(5, 7), 16);
                    const r2 = parseInt(color2.slice(1, 3), 16);
                    const g2 = parseInt(color2.slice(3, 5), 16);
                    const b2 = parseInt(color2.slice(5, 7), 16);
                    const r = Math.round(r1 + (r2 - r1) * blend);
                    const g = Math.round(g1 + (g2 - g1) * blend);
                    const b = Math.round(b1 + (b2 - b1) * blend);
                    const color = `rgb(${r},${g},${b})`;

                    if (cell.brightness > 0.95) {
                        // Head - bright white with glow
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = color;
                        ctx.fillStyle = '#ffffff';
                        ctx.globalAlpha = 1;
                    } else {
                        // Trail - colored with fade
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = color;
                        ctx.fillStyle = color;
                        ctx.globalAlpha = cell.brightness;
                    }

                    ctx.fillText(cell.char, x, y);
                }
            }

            ctx.globalAlpha = 1;

            frameCount++;

            if (frameCount < maxFrames) {
                requestAnimationFrame(draw);
            } else {
                // Phase 3: Fade out everything (1s)
                canvas.style.transition = 'opacity 1s ease';
                canvas.style.opacity = '0';
                overlay.style.transition = 'opacity 1s ease';
                overlay.style.opacity = '0';
                label.style.transition = 'opacity 0.5s ease';
                label.style.opacity = '0';

                setTimeout(() => {
                    canvas.remove();
                    overlay.remove();
                    label.remove();
                }, 1000);
            }
        }

        requestAnimationFrame(draw);
    }, 500); // Start rain after 0.5s (overlay fade)
}

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
    const [clickCount, setClickCount] = useState(0);
    const clickTimerRef = useRef(null);
    const menuRef = useRef(null);
    const logoRef = useRef(null);

    // Easter egg: Triple-click on logo
    const handleLogoClick = useCallback(() => {
        setClickCount(prev => {
            const newCount = prev + 1;

            // Reset timer
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
            }

            // Reset count after 500ms of no clicks
            clickTimerRef.current = setTimeout(() => {
                setClickCount(0);
            }, 500);

            // Trigger easter egg on 3rd click
            if (newCount >= 3) {
                triggerMatrixRain(logoRef.current);
                return 0;
            }

            return newCount;
        });
    }, []);

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
            <div class="topbar-left">
                <div class="topbar-logo" ref=${logoRef} onClick=${handleLogoClick} style="cursor: pointer;">
                    <div class="topbar-logo-icon">M</div>
                    <span class="topbar-logo-text">MLX<span> Studio</span></span>
                </div>
                <button class="btn btn-icon topbar-chats-btn" onClick=${actions.toggleChats} title="Chats">
                    <${ChatIcon} size=${18} />
                </button>
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
    const [loadedModelIds, setLoadedModelIds] = useState([]);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const aliasInputRef = useRef(null);

    const hasModel = !!currentModel;

    // Fetch loaded models when dropdown opens
    useEffect(() => {
        if (isOpen) {
            endpoints.loadedModels().then(data => {
                const ids = (data.loaded || []).map(m => m.model_id);
                setLoadedModelIds(ids);
            }).catch(() => {});
        }
    }, [isOpen]);

    // Sort models: loaded first, then alphabetically
    const sortedModels = [...models].sort((a, b) => {
        const aLoaded = loadedModelIds.some(id => a.path === id || a.id === id);
        const bLoaded = loadedModelIds.some(id => b.path === id || b.id === id);
        if (aLoaded && !bLoaded) return -1;
        if (!aLoaded && bLoaded) return 1;
        return a.name.localeCompare(b.name);
    });

    // Filter models based on search
    const filteredModels = sortedModels.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
    );

    // Check if a model is loaded
    const isModelLoaded = (model) => {
        return loadedModelIds.some(id => model.path === id || model.id === id);
    };

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
                ${hasModel && html`
                    <span class="model-selector-loaded">
                        <span class="model-selector-badge">loaded</span>
                        <button
                            class="model-selector-unload"
                            onClick=${unloadModel}
                            title="Unload model"
                        >
                            <${EjectIcon} size=${12} />
                        </button>
                    </span>
                `}
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
                        ${filteredModels.length === 0 ? html`
                            <div class="model-dropdown-empty">
                                No models found
                            </div>
                        ` : filteredModels.map((model, idx) => {
                            const loaded = isModelLoaded(model);
                            const isActive = model.id === currentModel?.id;
                            return html`
                                <div
                                    class="model-dropdown-item ${isActive ? 'active' : ''} ${idx === selectedIndex ? 'selected' : ''} ${loaded ? 'loaded' : ''}"
                                    onClick=${() => selectModel(model)}
                                    onMouseEnter=${() => setSelectedIndex(idx)}
                                >
                                    <${BrainIcon} size=${16} />
                                    <div class="model-dropdown-item-info">
                                        <span class="model-dropdown-item-name">${model.name}</span>
                                        <span class="model-dropdown-item-meta">${model.vram}</span>
                                    </div>
                                    ${loaded && html`
                                        <span class="model-dropdown-item-badge">loaded</span>
                                    `}
                                </div>
                            `;
                        })}
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
