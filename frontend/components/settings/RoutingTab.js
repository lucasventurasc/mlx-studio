// Routing Tab - Claude model tier routing configuration
const { html, useState, useEffect } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { InfoHint } from '../ui/Tooltip.js';

const TIER_INFO = {
    haiku: {
        name: 'Haiku',
        color: '#10b981',
        description: 'Fast, lightweight tasks',
        examples: 'File exploration, quick questions, simple edits',
        hint: 'Claude uses Haiku for fast operations like glob, grep, and code exploration. Map to a smaller/faster model.'
    },
    sonnet: {
        name: 'Sonnet',
        color: '#3b82f6',
        description: 'Balanced reasoning',
        examples: 'Code generation, analysis, planning',
        hint: 'Claude uses Sonnet for most tasks including code generation and analysis. Use your main model here.'
    },
    opus: {
        name: 'Opus',
        color: '#8b5cf6',
        description: 'Complex reasoning',
        examples: 'Architecture decisions, difficult problems',
        hint: 'Claude uses Opus for complex tasks requiring deep reasoning. Map to your most capable model.'
    }
};

export function RoutingTab() {
    const [config, setConfig] = useState(null);
    const [localModels, setLocalModels] = useState([]);
    const [remotes, setRemotes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [routingRes, modelsRes] = await Promise.all([
                endpoints.routingConfig(),
                endpoints.localModels(),
            ]);
            setConfig(routingRes);
            setLocalModels(modelsRes.models || []);

            // Try to load remotes if available
            try {
                const remotesRes = await endpoints.remotes?.() || { remotes: [] };
                setRemotes(remotesRes.remotes || []);
            } catch {
                setRemotes([]);
            }
        } catch (e) {
            console.error('Failed to load routing config:', e);
        }
        setLoading(false);
    };

    const handleTierChange = async (tier, field, value) => {
        const newConfig = { ...config };
        if (!newConfig.tiers[tier]) {
            newConfig.tiers[tier] = { model: null, draft_model: null, remote: null };
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
        if (!path) return '';
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    if (loading) {
        return html`<div class="settings-tab-content"><p class="loading-text">Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Enable/Disable Toggle -->
            <section class="settings-card">
                <div class="routing-header">
                    <div>
                        <h3 class="settings-card-title">Claude Model Routing</h3>
                        <p class="settings-card-desc">
                            Map Claude Code's model tiers to your local (or remote) models
                        </p>
                    </div>
                    <div
                        class="toggle-switch large ${config?.enabled ? 'active' : ''}"
                        onClick=${handleToggleEnabled}
                        role="switch"
                        aria-checked=${config?.enabled}
                    ></div>
                </div>

                ${!config?.enabled && html`
                    <div class="routing-disabled-notice">
                        Routing is disabled. All Claude requests will use the default model.
                    </div>
                `}
            </section>

            ${config?.enabled && html`
                <!-- Tier Cards -->
                <section class="settings-card">
                    <h3 class="settings-card-title">Model Tiers</h3>
                    <p class="settings-card-desc">
                        Configure which model handles each tier of requests
                    </p>

                    <div class="tier-cards">
                        ${Object.entries(TIER_INFO).map(([tier, info]) => html`
                            <div key=${tier} class="tier-card" style="--tier-color: ${info.color}">
                                <div class="tier-card-header">
                                    <div class="tier-card-dot"></div>
                                    <h4 class="tier-card-name">${info.name}</h4>
                                    <${InfoHint} text=${info.hint} />
                                </div>

                                <p class="tier-card-desc">${info.description}</p>
                                <p class="tier-card-examples">${info.examples}</p>

                                <div class="tier-card-fields">
                                    <!-- Source Selection -->
                                    <div class="tier-field">
                                        <label>Source</label>
                                        <select
                                            class="tier-select"
                                            value=${config.tiers[tier]?.remote ? 'remote' : 'local'}
                                            onChange=${e => {
                                                if (e.target.value === 'local') {
                                                    handleTierChange(tier, 'remote', null);
                                                }
                                            }}
                                        >
                                            <option value="local">Local</option>
                                            ${remotes.map(r => html`
                                                <option key=${r.name} value="remote:${r.name}">
                                                    ${r.name} (${r.url})
                                                </option>
                                            `)}
                                        </select>
                                    </div>

                                    <!-- Model Selection -->
                                    <div class="tier-field">
                                        <label>Model</label>
                                        <select
                                            class="tier-select"
                                            value=${config.tiers[tier]?.model || ''}
                                            onChange=${e => handleTierChange(tier, 'model', e.target.value)}
                                        >
                                            <option value="">Not configured</option>
                                            ${localModels.map(m => html`
                                                <option key=${m.id} value=${m.path || m.id}>
                                                    ${getShortName(m.id)}
                                                </option>
                                            `)}
                                        </select>
                                    </div>

                                    <!-- Draft Model (for speculative decoding) -->
                                    <div class="tier-field">
                                        <label>
                                            Draft Model
                                            <${InfoHint} text="Smaller model for speculative decoding. Speeds up generation by predicting tokens ahead." />
                                        </label>
                                        <select
                                            class="tier-select"
                                            value=${config.tiers[tier]?.draft_model || ''}
                                            onChange=${e => handleTierChange(tier, 'draft_model', e.target.value)}
                                        >
                                            <option value="">None</option>
                                            ${localModels.map(m => html`
                                                <option key=${m.id} value=${m.path || m.id}>
                                                    ${getShortName(m.id)}
                                                </option>
                                            `)}
                                        </select>
                                    </div>
                                </div>

                                ${config.tiers[tier]?.model && html`
                                    <div class="tier-card-current">
                                        Current: ${getShortName(config.tiers[tier].model)}
                                    </div>
                                `}
                            </div>
                        `)}
                    </div>
                </section>

                <!-- Default Fallback -->
                <section class="settings-card">
                    <h3 class="settings-card-title">Default Fallback</h3>
                    <p class="settings-card-desc">
                        Model to use when a tier isn't configured or for unknown requests
                    </p>

                    <select
                        class="default-model-select"
                        value=${config.default_model || ''}
                        onChange=${e => handleDefaultChange(e.target.value)}
                    >
                        <option value="">Use alias fallback chain</option>
                        ${localModels.map(m => html`
                            <option key=${m.id} value=${m.path || m.id}>
                                ${getShortName(m.id)}
                            </option>
                        `)}
                    </select>
                </section>
            `}
        </div>
    `;
}
