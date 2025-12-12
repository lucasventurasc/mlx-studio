// Settings Panel component
const { html, useCallback, useState, useEffect } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { presets } from '../utils/helpers.js';
import { endpoints } from '../utils/api.js';
import { XIcon, SunIcon, MoonIcon, MonitorIcon, TrashIcon, PlusIcon } from './Icons.js';

// Inference profiles with descriptions
const INFERENCE_PROFILES = {
    speed: { name: 'Speed', description: 'Maximum generation speed', icon: 'zap' },
    balanced: { name: 'Balanced', description: 'Balance speed and quality', icon: 'target' },
    quality: { name: 'Quality', description: 'Maximum output quality', icon: 'sparkles' },
    creative: { name: 'Creative', description: 'Higher temperature for creative tasks', icon: 'sparkles' },
    precise: { name: 'Precise', description: 'Low temperature for factual responses', icon: 'target' }
};

export function SettingsPanel() {
    const { show, settings, theme, currentProfile } = useStore(s => ({
        show: s.showSettings,
        settings: s.settings,
        theme: s.theme,
        currentProfile: s.currentProfile || 'balanced'
    }));

    const updateSetting = useCallback((key, value) => {
        actions.updateSettings({ [key]: value });
    }, []);

    const loadPreset = useCallback((presetName) => {
        const preset = presets[presetName];
        if (preset) {
            actions.updateSettings({
                temperature: preset.temperature,
                topP: preset.topP,
                topK: preset.topK,
                repPenalty: preset.repPenalty,
                maxTokens: preset.maxTokens
            });
        }
    }, []);

    const changeProfile = useCallback(async (profile) => {
        actions.setProfile(profile);
        try {
            await endpoints.setProfile(profile);
        } catch (e) {
            console.warn('Failed to sync profile to server:', e);
        }
    }, []);

    return html`
        <aside class="panel panel-right ${show ? 'open' : ''}">
            <div class="panel-header">
                <span class="panel-title">Settings</span>
                <button class="panel-close" onClick=${actions.toggleSettings}><${XIcon} size=${18} /></button>
            </div>
            <div class="panel-content">
                <div class="settings-section">
                    <div class="settings-section-title">Inference Profile</div>
                    <div class="profile-selector">
                        ${Object.entries(INFERENCE_PROFILES).map(([key, profile]) => html`
                            <button
                                key=${key}
                                class="profile-option ${currentProfile === key ? 'active' : ''}"
                                onClick=${() => changeProfile(key)}
                                title=${profile.description}
                            >
                                <span class="profile-name">${profile.name}</span>
                            </button>
                        `)}
                    </div>
                    <div class="profile-description">
                        ${INFERENCE_PROFILES[currentProfile]?.description || ''}
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-section-title">Generation</div>

                    <${SliderSetting}
                        label="Temperature"
                        value=${settings.temperature}
                        min="0"
                        max="2"
                        step="0.05"
                        onChange=${v => updateSetting('temperature', v)}
                    />

                    <${SliderSetting}
                        label="Max Tokens"
                        value=${settings.maxTokens}
                        min="256"
                        max="32768"
                        step="256"
                        onChange=${v => updateSetting('maxTokens', v)}
                    />

                    <${SliderSetting}
                        label="Top P"
                        value=${settings.topP}
                        min="0"
                        max="1"
                        step="0.05"
                        onChange=${v => updateSetting('topP', v)}
                    />

                    <${SliderSetting}
                        label="Top K"
                        value=${settings.topK}
                        min="1"
                        max="100"
                        step="1"
                        onChange=${v => updateSetting('topK', v)}
                    />

                    <${SliderSetting}
                        label="Repetition Penalty"
                        value=${settings.repPenalty}
                        min="1"
                        max="2"
                        step="0.05"
                        onChange=${v => updateSetting('repPenalty', v)}
                    />
                </div>

                <div class="settings-section">
                    <div class="settings-section-title">Context</div>

                    <${SliderSetting}
                        label="Context Length"
                        value=${settings.contextLength}
                        min="1024"
                        max="131072"
                        step="1024"
                        displayValue=${formatContextSize(settings.contextLength)}
                        onChange=${v => updateSetting('contextLength', v)}
                    />

                    <div class="setting-item setting-toggle">
                        <span style="font-size: 13px; color: var(--fg-1)">Stream Response</span>
                        <div
                            class="toggle-switch ${settings.streamEnabled ? 'active' : ''}"
                            onClick=${() => updateSetting('streamEnabled', !settings.streamEnabled)}
                        ></div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-section-title">System Prompt</div>
                    <div class="setting-item">
                        <textarea
                            class="setting-textarea"
                            placeholder="You are a helpful assistant..."
                            value=${settings.systemPrompt}
                            onInput=${e => updateSetting('systemPrompt', e.target.value)}
                            rows="4"
                        />
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-section-title">Presets</div>
                    <div class="setting-item">
                        <select class="setting-input" onChange=${e => loadPreset(e.target.value)}>
                            <option value="default">Default</option>
                            <option value="creative">Creative</option>
                            <option value="precise">Precise</option>
                            <option value="code">Code</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-section-title">Appearance</div>
                    <div class="setting-item">
                        <div class="theme-selector">
                            <button
                                class="theme-option ${theme === 'light' ? 'active' : ''}"
                                onClick=${() => actions.setTheme('light')}
                                title="Light mode"
                            >
                                <${SunIcon} size=${16} />
                                <span>Light</span>
                            </button>
                            <button
                                class="theme-option ${theme === 'dark' ? 'active' : ''}"
                                onClick=${() => actions.setTheme('dark')}
                                title="Dark mode"
                            >
                                <${MoonIcon} size=${16} />
                                <span>Dark</span>
                            </button>
                            <button
                                class="theme-option ${theme === 'system' ? 'active' : ''}"
                                onClick=${() => actions.setTheme('system')}
                                title="System preference"
                            >
                                <${MonitorIcon} size=${16} />
                                <span>System</span>
                            </button>
                        </div>
                    </div>
                </div>

                <${AliasesSection} />

                <${ClaudeRoutingSection} />

                <${PromptCacheSection} />
            </div>
        </aside>
    `;
}

function SliderSetting({ label, value, min, max, step, displayValue, onChange }) {
    return html`
        <div class="setting-item">
            <div class="setting-label">
                <span>${label}</span>
                <span class="setting-value">${displayValue || value}</span>
            </div>
            <input
                type="range"
                class="setting-slider"
                value=${value}
                min=${min}
                max=${max}
                step=${step}
                onInput=${e => onChange(parseFloat(e.target.value))}
            />
        </div>
    `;
}

function formatContextSize(size) {
    if (size >= 1000) return `${Math.round(size / 1024)}K`;
    return size;
}

// Claude Model Routing Section
function ClaudeRoutingSection() {
    const [config, setConfig] = useState(null);
    const [localModels, setLocalModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [routingRes, modelsRes] = await Promise.all([
                endpoints.routingConfig(),
                endpoints.localModels()
            ]);
            setConfig(routingRes);
            setLocalModels(modelsRes.models || []);
        } catch (e) {
            console.error('Failed to load routing config:', e);
        }
        setLoading(false);
    };

    const handleTierChange = async (tier, field, value) => {
        const newConfig = { ...config };
        if (!newConfig.tiers[tier]) {
            newConfig.tiers[tier] = { model: null, draft_model: null };
        }
        newConfig.tiers[tier][field] = value || null;
        setConfig(newConfig);

        try {
            const tierConfig = newConfig.tiers[tier];
            await endpoints.setTierModel(tier, tierConfig.model, tierConfig.draft_model);
            showToast(`Updated ${tier} routing`);
        } catch (e) {
            showToast('Failed to update routing');
        }
    };

    const handleDefaultChange = async (value) => {
        const newConfig = { ...config, default_model: value || null };
        setConfig(newConfig);

        try {
            await endpoints.setRoutingConfig({
                enabled: newConfig.enabled,
                tiers: newConfig.tiers,
                default_model: newConfig.default_model
            });
            showToast('Updated default model');
        } catch (e) {
            showToast('Failed to update default');
        }
    };

    const handleToggleEnabled = async () => {
        const newConfig = { ...config, enabled: !config.enabled };
        setConfig(newConfig);

        try {
            await endpoints.setRoutingConfig({
                enabled: newConfig.enabled,
                tiers: newConfig.tiers,
                default_model: newConfig.default_model
            });
            showToast(newConfig.enabled ? 'Routing enabled' : 'Routing disabled');
        } catch (e) {
            showToast('Failed to toggle routing');
        }
    };

    const getShortName = (path) => {
        if (!path) return 'Not set';
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    const TIER_INFO = {
        haiku: { name: 'Haiku', desc: 'Fast tasks (glob, grep, explore)', color: '#10b981' },
        sonnet: { name: 'Sonnet', desc: 'Reasoning, planning', color: '#3b82f6' },
        opus: { name: 'Opus', desc: 'Implementation, complex tasks', color: '#8b5cf6' }
    };

    return html`
        <div class="settings-section">
            <div class="settings-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Claude Model Routing</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${config && html`
                        <div
                            class="toggle-switch ${config.enabled ? 'active' : ''}"
                            onClick=${handleToggleEnabled}
                            title="${config.enabled ? 'Disable' : 'Enable'} routing"
                            style="transform: scale(0.8);"
                        ></div>
                    `}
                    <button
                        class="section-toggle"
                        onClick=${() => setExpanded(!expanded)}
                        style="background: none; border: none; color: var(--fg-2); cursor: pointer; font-size: 12px;"
                    >
                        ${expanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            ${loading ? html`
                <div class="setting-item" style="color: var(--fg-2); font-size: 13px;">Loading...</div>
            ` : html`
                <!-- Quick status -->
                <div style="font-size: 12px; color: var(--fg-2); margin-bottom: 8px;">
                    ${config?.enabled ? 'Routes Claude API calls to local models by tier' : 'Routing disabled - using default model'}
                </div>

                ${expanded && config && html`
                    <!-- Tier configurations -->
                    ${Object.entries(TIER_INFO).map(([tier, info]) => html`
                        <div key=${tier} class="tier-config" style="margin-bottom: 12px; padding: 8px; background: var(--bg-2); border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${info.color};"></span>
                                <span style="font-weight: 500; font-size: 13px;">${info.name}</span>
                                <span style="font-size: 11px; color: var(--fg-3);">${info.desc}</span>
                            </div>

                            <div style="display: flex; gap: 8px;">
                                <select
                                    class="setting-input"
                                    style="flex: 1; font-size: 12px;"
                                    value=${config.tiers[tier]?.model || ''}
                                    onChange=${e => handleTierChange(tier, 'model', e.target.value)}
                                >
                                    <option value="">Model: Not set</option>
                                    ${localModels.map(m => html`
                                        <option key=${m.id} value=${m.path || m.id}>${getShortName(m.id)}</option>
                                    `)}
                                </select>

                                <select
                                    class="setting-input"
                                    style="flex: 1; font-size: 12px;"
                                    value=${config.tiers[tier]?.draft_model || ''}
                                    onChange=${e => handleTierChange(tier, 'draft_model', e.target.value)}
                                    title="Draft model for speculative decoding"
                                >
                                    <option value="">Draft: None</option>
                                    ${localModels.map(m => html`
                                        <option key=${m.id} value=${m.path || m.id}>${getShortName(m.id)}</option>
                                    `)}
                                </select>
                            </div>
                        </div>
                    `)}

                    <!-- Default fallback -->
                    <div style="margin-top: 12px;">
                        <div style="font-size: 12px; color: var(--fg-2); margin-bottom: 4px;">Default (fallback)</div>
                        <select
                            class="setting-input"
                            style="width: 100%; font-size: 12px;"
                            value=${config.default_model || ''}
                            onChange=${e => handleDefaultChange(e.target.value)}
                        >
                            <option value="">Use alias fallback</option>
                            ${localModels.map(m => html`
                                <option key=${m.id} value=${m.path || m.id}>${getShortName(m.id)}</option>
                            `)}
                        </select>
                    </div>

                    <div style="font-size: 11px; color: var(--fg-3); margin-top: 8px;">
                        Maps Claude Code model tiers (haiku/sonnet/opus) to your local models.
                        Draft model enables speculative decoding for faster generation.
                    </div>
                `}
            `}
        </div>
    `;
}

// Aliases Section Component
function AliasesSection() {
    const [aliases, setAliases] = useState({});
    const [localModels, setLocalModels] = useState([]);
    const [newAlias, setNewAlias] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [loading, setLoading] = useState(true);

    // Load aliases and models on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [aliasesRes, modelsRes] = await Promise.all([
                endpoints.aliases(),
                endpoints.localModels()
            ]);
            setAliases(aliasesRes.aliases || {});
            setLocalModels(modelsRes.models || []);
        } catch (e) {
            console.error('Failed to load aliases:', e);
        }
        setLoading(false);
    };

    const handleAddAlias = async () => {
        if (!newAlias.trim() || !selectedModel) {
            showToast('Enter alias name and select a model');
            return;
        }
        try {
            await endpoints.addAlias(newAlias.trim(), selectedModel);
            setAliases({ ...aliases, [newAlias.trim()]: selectedModel });
            setNewAlias('');
            setSelectedModel('');
            showToast(`Alias "${newAlias}" created`);
        } catch (e) {
            showToast('Failed to create alias');
        }
    };

    const handleDeleteAlias = async (alias) => {
        try {
            await endpoints.deleteAlias(alias);
            const newAliases = { ...aliases };
            delete newAliases[alias];
            setAliases(newAliases);
            showToast(`Alias "${alias}" deleted`);
        } catch (e) {
            showToast('Failed to delete alias');
        }
    };

    const handleAutoCreate = async () => {
        try {
            const result = await endpoints.autoCreateAliases();
            showToast(`Created ${result.created} aliases`);
            loadData();
        } catch (e) {
            showToast('Failed to auto-create aliases');
        }
    };

    // Get short model name for display
    const getShortName = (path) => {
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    return html`
        <div class="settings-section">
            <div class="settings-section-title">Model Aliases</div>

            ${loading ? html`
                <div class="setting-item" style="color: var(--fg-2); font-size: 13px;">Loading...</div>
            ` : html`
                <!-- Existing aliases -->
                <div class="aliases-list">
                    ${Object.entries(aliases).length === 0 ? html`
                        <div class="setting-item" style="color: var(--fg-2); font-size: 13px;">No aliases configured</div>
                    ` : Object.entries(aliases).map(([alias, modelPath]) => html`
                        <div class="alias-item" key=${alias}>
                            <div class="alias-info">
                                <span class="alias-name">${alias}</span>
                                <span class="alias-model" title=${modelPath}>${getShortName(modelPath)}</span>
                            </div>
                            <button
                                class="alias-delete"
                                onClick=${() => handleDeleteAlias(alias)}
                                title="Delete alias"
                            >
                                <${TrashIcon} size=${14} />
                            </button>
                        </div>
                    `)}
                </div>

                <!-- Add new alias -->
                <div class="alias-add-form">
                    <input
                        type="text"
                        class="setting-input alias-input"
                        placeholder="Alias name (e.g. qwen)"
                        value=${newAlias}
                        onInput=${e => setNewAlias(e.target.value)}
                    />
                    <select
                        class="setting-input alias-select"
                        value=${selectedModel}
                        onChange=${e => setSelectedModel(e.target.value)}
                    >
                        <option value="">Select model...</option>
                        ${localModels.map(model => html`
                            <option key=${model.id} value=${model.id}>${getShortName(model.id)}</option>
                        `)}
                    </select>
                    <button class="alias-add-btn" onClick=${handleAddAlias} title="Add alias">
                        <${PlusIcon} size=${16} />
                    </button>
                </div>

                <!-- Auto-create button -->
                <button class="alias-auto-btn" onClick=${handleAutoCreate}>
                    Auto-create aliases
                </button>
            `}
        </div>
    `;
}


// Prompt Cache Settings Section (works for both OpenAI & Anthropic APIs)
function PromptCacheSection() {
    const [config, setConfig] = useState({
        block_size: 256,
        max_slots: 4,
        min_reuse_tokens: 512,
        max_cached_tokens: 65536
    });
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    // Load config and stats on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [configRes, statsRes] = await Promise.all([
                endpoints.promptCacheConfig(),
                endpoints.promptCacheStats()
            ]);
            setConfig(configRes);
            setStats(statsRes);
        } catch (e) {
            console.error('Failed to load cache config:', e);
        }
        setLoading(false);
    };

    const handleConfigChange = async (key, value) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);

        try {
            await endpoints.setPromptCacheConfig(newConfig);
            showToast('Cache config updated (applies on next request)');
        } catch (e) {
            showToast('Failed to update config');
        }
    };

    const handleClearCache = async () => {
        try {
            const result = await endpoints.promptCacheClear();
            showToast(`Cleared ${result.caches_cleared} cache(s)`);
            loadData();
        } catch (e) {
            showToast('Failed to clear cache');
        }
    };

    // Calculate total stats across all caches
    const getTotalStats = () => {
        if (!stats?.caches) return null;
        const caches = Object.values(stats.caches);
        if (caches.length === 0) return null;

        return caches.reduce((acc, cache) => ({
            total_requests: acc.total_requests + (cache.total_requests || 0),
            cache_hits: acc.cache_hits + (cache.cache_hits || 0),
            tokens_saved: acc.tokens_saved + (cache.tokens_saved || 0),
            active_slots: acc.active_slots + (cache.active_slots || 0)
        }), { total_requests: 0, cache_hits: 0, tokens_saved: 0, active_slots: 0 });
    };

    const totalStats = getTotalStats();
    const hitRate = totalStats && totalStats.total_requests > 0
        ? ((totalStats.cache_hits / totalStats.total_requests) * 100).toFixed(1)
        : '0';

    return html`
        <div class="settings-section">
            <div class="settings-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Prompt Cache (KV)</span>
                <button
                    class="section-toggle"
                    onClick=${() => setExpanded(!expanded)}
                    style="background: none; border: none; color: var(--fg-2); cursor: pointer; font-size: 12px;"
                >
                    ${expanded ? '▼' : '▶'}
                </button>
            </div>

            ${loading ? html`
                <div class="setting-item" style="color: var(--fg-2); font-size: 13px;">Loading...</div>
            ` : html`
                <!-- Stats Summary -->
                <div class="cache-stats-summary" style="display: flex; gap: 12px; margin-bottom: 12px; font-size: 12px;">
                    <div style="color: var(--fg-2);">
                        Hit Rate: <span style="color: ${parseFloat(hitRate) > 50 ? 'var(--success)' : 'var(--fg-1)'}">${hitRate}%</span>
                    </div>
                    <div style="color: var(--fg-2);">
                        Saved: <span style="color: var(--fg-1)">${totalStats ? totalStats.tokens_saved.toLocaleString() : 0}</span> tokens
                    </div>
                    <div style="color: var(--fg-2);">
                        Slots: <span style="color: var(--fg-1)">${totalStats?.active_slots || 0}/${config.max_slots}</span>
                    </div>
                </div>

                ${expanded && html`
                    <!-- Block Size -->
                    <${SliderSetting}
                        label="Block Size"
                        value=${config.block_size}
                        min="64"
                        max="1024"
                        step="64"
                        displayValue="${config.block_size} tokens"
                        onChange=${v => handleConfigChange('block_size', v)}
                    />

                    <!-- Max Slots -->
                    <${SliderSetting}
                        label="Max Slots"
                        value=${config.max_slots}
                        min="1"
                        max="8"
                        step="1"
                        onChange=${v => handleConfigChange('max_slots', v)}
                    />

                    <!-- Min Reuse Tokens -->
                    <${SliderSetting}
                        label="Min Reuse"
                        value=${config.min_reuse_tokens}
                        min="128"
                        max="2048"
                        step="128"
                        displayValue="${config.min_reuse_tokens} tokens"
                        onChange=${v => handleConfigChange('min_reuse_tokens', v)}
                    />

                    <!-- Max Cached Tokens -->
                    <${SliderSetting}
                        label="Max Tokens/Slot"
                        value=${config.max_cached_tokens}
                        min="8192"
                        max="131072"
                        step="8192"
                        displayValue="${Math.round(config.max_cached_tokens / 1024)}K"
                        onChange=${v => handleConfigChange('max_cached_tokens', v)}
                    />

                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button class="alias-auto-btn" onClick=${handleClearCache} style="flex: 1;">
                            Clear Cache
                        </button>
                        <button class="alias-auto-btn" onClick=${loadData} style="flex: 1;">
                            Refresh Stats
                        </button>
                    </div>

                    <div style="font-size: 11px; color: var(--fg-3); margin-top: 8px;">
                        Cache works for both OpenAI and Anthropic APIs.
                        Higher hit rate = faster responses for Claude Code.
                    </div>
                `}
            `}
        </div>
    `;
}
