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
