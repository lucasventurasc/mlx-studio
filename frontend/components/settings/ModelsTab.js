// Models Tab - Unified model configuration (routing + aliases + per-model settings)
const { html, useState, useEffect, useCallback } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { InfoHint } from '../ui/Tooltip.js';
import { PlusIcon, TrashIcon, SettingsIcon } from '../Icons.js';

const TIER_INFO = {
    haiku: {
        name: 'Haiku',
        color: '#10b981',
        description: 'Fast, lightweight tasks',
        hint: 'Used for file exploration, quick questions, simple edits. Map to a smaller/faster model.'
    },
    sonnet: {
        name: 'Sonnet',
        color: '#3b82f6',
        description: 'Balanced reasoning',
        hint: 'Used for most tasks including code generation and analysis. Use your main model here.'
    },
    opus: {
        name: 'Opus',
        color: '#8b5cf6',
        description: 'Complex reasoning',
        hint: 'Used for architecture decisions and difficult problems. Map to your most capable model.'
    }
};

const CONTEXT_OPTIONS = [
    { value: 8192, label: '8K' },
    { value: 16384, label: '16K' },
    { value: 32768, label: '32K' },
    { value: 65536, label: '64K' },
    { value: 131072, label: '128K' },
];

const MAX_TOKENS_OPTIONS = [
    { value: 2048, label: '2K' },
    { value: 4096, label: '4K' },
    { value: 8192, label: '8K' },
    { value: 16384, label: '16K' },
    { value: 32000, label: '32K' },
];

export function ModelsTab() {
    const [config, setConfig] = useState(null);
    const [aliases, setAliases] = useState({});
    const [localModels, setLocalModels] = useState([]);
    const [modelConfigs, setModelConfigs] = useState({});
    const [loading, setLoading] = useState(true);
    const [newAlias, setNewAlias] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [showAliases, setShowAliases] = useState(false);
    const [expandedModel, setExpandedModel] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [routingRes, aliasesRes, modelsRes, configsRes] = await Promise.all([
                endpoints.routingConfig(),
                endpoints.aliases(),
                endpoints.localModels(),
                endpoints.modelConfigs(),
            ]);
            setConfig(routingRes);
            setAliases(aliasesRes.aliases || {});
            setLocalModels(modelsRes.models || []);
            setModelConfigs(configsRes.configs || {});
        } catch (e) {
            console.error('Failed to load config:', e);
        }
        setLoading(false);
    };

    const handleModelConfigChange = useCallback(async (modelId, field, value) => {
        // Optimistic update
        setModelConfigs(prev => ({
            ...prev,
            [modelId]: {
                ...(prev[modelId] || {}),
                [field]: value
            }
        }));

        try {
            await endpoints.setModelConfig(modelId, { [field]: value });
        } catch (e) {
            showToast('Failed to update model config');
            // Reload to reset
            loadData();
        }
    }, []);

    const handleTierChange = async (tier, model) => {
        const newConfig = { ...config };
        if (!newConfig.tiers[tier]) {
            newConfig.tiers[tier] = { model: null, draft_model: null, backend: 'mlx' };
        }
        newConfig.tiers[tier].model = model || null;
        setConfig(newConfig);

        try {
            await endpoints.setTierModel(tier, model, newConfig.tiers[tier].draft_model);
            showToast(`Updated ${tier}`);
        } catch (e) {
            showToast('Failed to update');
        }
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
        if (!confirm(`Delete alias "${alias}"?`)) return;
        try {
            await endpoints.deleteAlias(alias);
            const newAliases = { ...aliases };
            delete newAliases[alias];
            setAliases(newAliases);
            showToast(`Deleted "${alias}"`);
        } catch (e) {
            showToast('Failed to delete');
        }
    };

    const getShortName = (path) => {
        if (!path) return '';
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    // Filter out claude-* aliases since they're handled by routing
    const customAliases = Object.entries(aliases).filter(([key]) => !key.startsWith('claude-'));

    if (loading) {
        return html`<div class="settings-tab-content"><p class="loading-text">Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Claude Tiers - Main Section -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Claude Code Routing
                    <${InfoHint} text="When using Claude Code with ANTHROPIC_BASE_URL pointed here, requests for claude-haiku/sonnet/opus are automatically routed to your configured local models." />
                </h3>
                <p class="settings-card-desc">
                    Map Claude's model tiers to your local models
                </p>

                <div class="tier-list">
                    ${Object.entries(TIER_INFO).map(([tier, info]) => html`
                        <div key=${tier} class="tier-row" style="--tier-color: ${info.color}">
                            <div class="tier-row-info">
                                <div class="tier-row-dot"></div>
                                <div class="tier-row-text">
                                    <span class="tier-row-name">${info.name}</span>
                                    <span class="tier-row-desc">${info.description}</span>
                                </div>
                                <${InfoHint} text=${info.hint} />
                            </div>
                            <select
                                class="tier-row-select"
                                value=${config.tiers[tier]?.model || ''}
                                onChange=${e => handleTierChange(tier, e.target.value)}
                            >
                                <option value="">Not configured</option>
                                ${localModels.map(m => html`
                                    <option key=${m.id} value=${m.path || m.id}>
                                        ${getShortName(m.id)}
                                    </option>
                                `)}
                            </select>
                        </div>
                    `)}
                </div>
            </section>

            <!-- Model Settings - Per model context/max_tokens -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Model Settings
                    <${InfoHint} text="Configure context window and output limits per model. These settings apply regardless of how the model is accessed (via API, routing, or aliases)." />
                </h3>
                <p class="settings-card-desc">
                    Set context length and max output tokens for each model
                </p>

                <div class="model-settings-list">
                    ${localModels.map(model => {
                        const modelId = model.path || model.id;
                        const modelConfig = modelConfigs[modelId] || {};
                        const isExpanded = expandedModel === modelId;
                        const hasCustomConfig = modelId in modelConfigs;

                        return html`
                            <div key=${modelId} class="model-settings-row ${isExpanded ? 'expanded' : ''}">
                                <div
                                    class="model-settings-header"
                                    onClick=${() => setExpandedModel(isExpanded ? null : modelId)}
                                >
                                    <div class="model-settings-name">
                                        <span class="model-name-text">${getShortName(modelId)}</span>
                                        ${hasCustomConfig && html`
                                            <span class="model-config-badge">configured</span>
                                        `}
                                    </div>
                                    <div class="model-settings-summary">
                                        <span class="model-stat">
                                            ${CONTEXT_OPTIONS.find(o => o.value === (modelConfig.context_length || 65536))?.label || '64K'} ctx
                                        </span>
                                        <span class="model-stat">
                                            ${MAX_TOKENS_OPTIONS.find(o => o.value === (modelConfig.max_tokens || 8192))?.label || '8K'} out
                                        </span>
                                        <div class="expand-icon ${isExpanded ? 'expanded' : ''}">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polyline points="6 9 12 15 18 9"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                ${isExpanded && html`
                                    <div class="model-settings-body">
                                        <div class="model-setting-field">
                                            <label>Context Length</label>
                                            <select
                                                class="model-setting-select"
                                                value=${modelConfig.context_length || 65536}
                                                onChange=${e => handleModelConfigChange(modelId, 'context_length', parseInt(e.target.value))}
                                            >
                                                ${CONTEXT_OPTIONS.map(opt => html`
                                                    <option key=${opt.value} value=${opt.value}>${opt.label}</option>
                                                `)}
                                            </select>
                                        </div>
                                        <div class="model-setting-field">
                                            <label>Max Output</label>
                                            <select
                                                class="model-setting-select"
                                                value=${modelConfig.max_tokens || 8192}
                                                onChange=${e => handleModelConfigChange(modelId, 'max_tokens', parseInt(e.target.value))}
                                            >
                                                ${MAX_TOKENS_OPTIONS.map(opt => html`
                                                    <option key=${opt.value} value=${opt.value}>${opt.label}</option>
                                                `)}
                                            </select>
                                        </div>
                                        <div class="model-setting-path">
                                            <code>${modelId}</code>
                                        </div>
                                    </div>
                                `}
                            </div>
                        `;
                    })}
                </div>
            </section>

            <!-- Custom Aliases - Collapsible -->
            <section class="settings-card">
                <div
                    class="settings-card-header-row clickable"
                    onClick=${() => setShowAliases(!showAliases)}
                >
                    <div>
                        <h3 class="settings-card-title">
                            Custom Aliases
                            <span class="alias-count-badge">${customAliases.length}</span>
                        </h3>
                        <p class="settings-card-desc">
                            Short names for API requests (e.g., "qwen" instead of full path)
                        </p>
                    </div>
                    <div class="expand-icon ${showAliases ? 'expanded' : ''}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                </div>

                ${showAliases && html`
                    <div class="aliases-section">
                        <!-- Add New -->
                        <div class="alias-add-row">
                            <input
                                type="text"
                                class="alias-input-sm"
                                placeholder="Alias name"
                                value=${newAlias}
                                onInput=${e => setNewAlias(e.target.value)}
                                onKeyDown=${e => e.key === 'Enter' && handleAddAlias()}
                            />
                            <span class="alias-arrow-sm">→</span>
                            <select
                                class="alias-select-sm"
                                value=${selectedModel}
                                onChange=${e => setSelectedModel(e.target.value)}
                            >
                                <option value="">Select model...</option>
                                ${localModels.map(model => html`
                                    <option key=${model.id} value=${model.path || model.id}>
                                        ${getShortName(model.id)}
                                    </option>
                                `)}
                            </select>
                            <button
                                class="btn btn-sm btn-primary"
                                onClick=${handleAddAlias}
                                disabled=${!newAlias.trim() || !selectedModel}
                            >
                                <${PlusIcon} size=${14} />
                            </button>
                        </div>

                        <!-- List -->
                        ${customAliases.length === 0 ? html`
                            <div class="aliases-empty-sm">
                                No custom aliases. Add one above.
                            </div>
                        ` : html`
                            <div class="aliases-list-sm">
                                ${customAliases.map(([alias, modelPath]) => html`
                                    <div key=${alias} class="alias-row">
                                        <code class="alias-name">${alias}</code>
                                        <span class="alias-arrow-sm">→</span>
                                        <span class="alias-model" title=${modelPath}>
                                            ${getShortName(modelPath)}
                                        </span>
                                        <button
                                            class="btn btn-icon btn-sm btn-ghost"
                                            onClick=${() => handleDeleteAlias(alias)}
                                            title="Delete"
                                        >
                                            <${TrashIcon} size=${14} />
                                        </button>
                                    </div>
                                `)}
                            </div>
                        `}
                    </div>
                `}
            </section>

            <!-- Usage -->
            <section class="settings-card">
                <h3 class="settings-card-title">Usage</h3>
                <div class="usage-code-block">
                    <code>ANTHROPIC_BASE_URL=${window.location.origin}/anthropic claude</code>
                </div>
                <p class="usage-hint">
                    Claude Code will automatically use your configured tiers
                </p>
            </section>
        </div>
    `;
}
