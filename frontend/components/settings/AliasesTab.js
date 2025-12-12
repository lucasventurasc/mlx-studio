// Aliases Tab - Manage model aliases with inline editing
const { html, useState, useEffect } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { InfoHint } from '../ui/Tooltip.js';

export function AliasesTab() {
    const [aliases, setAliases] = useState({});
    const [localModels, setLocalModels] = useState([]);
    const [newAlias, setNewAlias] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [editingAlias, setEditingAlias] = useState(null);
    const [loading, setLoading] = useState(true);

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

    const handleUpdateAlias = async (alias, newModel) => {
        try {
            await endpoints.addAlias(alias, newModel);
            setAliases({ ...aliases, [alias]: newModel });
            setEditingAlias(null);
            showToast(`Alias "${alias}" updated`);
        } catch (e) {
            showToast('Failed to update alias');
        }
    };

    const handleDeleteAlias = async (alias) => {
        if (!confirm(`Delete alias "${alias}"?`)) return;
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
            showToast(`Created ${result.created?.length || 0} aliases`);
            loadData();
        } catch (e) {
            showToast('Failed to auto-create aliases');
        }
    };

    const getShortName = (path) => {
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    if (loading) {
        return html`<div class="settings-tab-content"><p class="loading-text">Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Info Card -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Model Aliases
                    <${InfoHint} text="Aliases let you reference models by short names instead of full paths. Useful for API requests and routing." />
                </h3>
                <p class="settings-card-desc">
                    Create short names for your models. Use these in API requests or routing configuration.
                </p>
            </section>

            <!-- Add New Alias -->
            <section class="settings-card">
                <h3 class="settings-card-title">Add New Alias</h3>

                <div class="alias-form">
                    <div class="alias-form-row">
                        <input
                            type="text"
                            class="alias-input"
                            placeholder="Alias name (e.g. qwen, llama)"
                            value=${newAlias}
                            onInput=${e => setNewAlias(e.target.value)}
                            onKeyDown=${e => e.key === 'Enter' && handleAddAlias()}
                        />
                        <span class="alias-arrow">→</span>
                        <select
                            class="alias-select"
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
                            class="alias-add-btn"
                            onClick=${handleAddAlias}
                            disabled=${!newAlias.trim() || !selectedModel}
                        >
                            Add
                        </button>
                    </div>
                </div>
            </section>

            <!-- Existing Aliases -->
            <section class="settings-card">
                <div class="aliases-header">
                    <h3 class="settings-card-title">
                        Configured Aliases
                        <span class="alias-count">(${Object.keys(aliases).length})</span>
                    </h3>
                    <button class="auto-create-btn" onClick=${handleAutoCreate}>
                        Auto-create from models
                    </button>
                </div>

                ${Object.keys(aliases).length === 0 ? html`
                    <div class="aliases-empty">
                        <p>No aliases configured yet.</p>
                        <p class="aliases-empty-hint">
                            Create aliases above or click "Auto-create" to generate them from your local models.
                        </p>
                    </div>
                ` : html`
                    <div class="aliases-list">
                        ${Object.entries(aliases).map(([alias, modelPath]) => html`
                            <div key=${alias} class="alias-item">
                                <div class="alias-item-name">
                                    <code>${alias}</code>
                                </div>
                                <span class="alias-arrow">→</span>
                                ${editingAlias === alias ? html`
                                    <select
                                        class="alias-edit-select"
                                        value=${modelPath}
                                        onChange=${e => handleUpdateAlias(alias, e.target.value)}
                                        onBlur=${() => setEditingAlias(null)}
                                        autofocus
                                    >
                                        ${localModels.map(model => html`
                                            <option key=${model.id} value=${model.path || model.id}>
                                                ${getShortName(model.id)}
                                            </option>
                                        `)}
                                    </select>
                                ` : html`
                                    <div
                                        class="alias-item-model"
                                        title=${modelPath}
                                        onClick=${() => setEditingAlias(alias)}
                                    >
                                        ${getShortName(modelPath)}
                                        <span class="edit-hint">click to edit</span>
                                    </div>
                                `}
                                <button
                                    class="alias-delete-btn"
                                    onClick=${() => handleDeleteAlias(alias)}
                                    title="Delete alias"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                </button>
                            </div>
                        `)}
                    </div>
                `}
            </section>

            <!-- Usage Examples -->
            <section class="settings-card">
                <h3 class="settings-card-title">Usage Examples</h3>
                <div class="usage-examples">
                    <div class="usage-example">
                        <code>curl localhost:1234/v1/chat/completions -d '{"model": "qwen", ...}'</code>
                        <span class="usage-desc">Use alias in API requests</span>
                    </div>
                    <div class="usage-example">
                        <code>ANTHROPIC_BASE_URL=http://localhost:1234/anthropic claude</code>
                        <span class="usage-desc">Claude Code will use routing + aliases</span>
                    </div>
                </div>
            </section>
        </div>
    `;
}
