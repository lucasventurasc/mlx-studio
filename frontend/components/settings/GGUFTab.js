// GGUF Tab - GGUF backend configuration with speculative decoding
const { html, useState, useEffect, useCallback } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { SettingLabel } from '../ui/Tooltip.js';

export function GGUFTab() {
    const [status, setStatus] = useState(null);
    const [config, setConfig] = useState(null);
    const [localModels, setLocalModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        loadData();
        // Poll status every 5 seconds
        const interval = setInterval(loadStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statusRes, configRes, modelsRes] = await Promise.all([
                endpoints.ggufStatus(),
                endpoints.ggufConfig(),
                endpoints.localModels()
            ]);
            setStatus(statusRes);
            setConfig(configRes);
            setLocalModels((modelsRes.models || []).filter(m =>
                m.path?.endsWith('.gguf') || m.id?.includes('GGUF')
            ));
        } catch (e) {
            console.error('Failed to load GGUF data:', e);
        }
        setLoading(false);
    };

    const loadStatus = async () => {
        try {
            const statusRes = await endpoints.ggufStatus();
            setStatus(statusRes);
        } catch (e) {
            console.warn('Failed to poll GGUF status:', e);
        }
    };

    const handleConfigChange = useCallback(async (key, value) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);
        try {
            await endpoints.updateGgufConfig({ [key]: value });
        } catch (e) {
            showToast('Failed to update config');
        }
    }, [config]);

    const handleStop = async () => {
        try {
            await endpoints.ggufStop();
            showToast('llama-server stopped');
            loadStatus();
        } catch (e) {
            showToast('Failed to stop llama-server');
        }
    };

    const handleRestart = async () => {
        if (!status?.model) {
            showToast('No model loaded');
            return;
        }
        setStarting(true);
        try {
            await endpoints.ggufStop();
            await new Promise(r => setTimeout(r, 1000));
            const result = await endpoints.ggufStart(status.model, config?.port);
            if (result.status === 'started' || result.status === 'already_running') {
                showToast('llama-server restarted with new settings');
            } else if (result.error) {
                showToast(`Error: ${result.error}`);
            }
            loadStatus();
        } catch (e) {
            showToast('Failed to restart llama-server');
        }
        setStarting(false);
    };

    const getShortPath = (path) => {
        if (!path) return '';
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    // Extract context size from default_args array
    const getContextSize = (args) => {
        if (!args || !Array.isArray(args)) return 32768;
        const idx = args.findIndex(a => a === '-c' || a === '--ctx-size');
        if (idx !== -1 && args[idx + 1]) {
            return parseInt(args[idx + 1]) || 32768;
        }
        return 32768;
    };

    // Update context size in default_args
    const handleContextSizeChange = useCallback(async (size) => {
        const args = [...(config?.default_args || [])];
        const idx = args.findIndex(a => a === '-c' || a === '--ctx-size');
        if (idx !== -1) {
            args[idx + 1] = String(size);
        } else {
            args.push('-c', String(size));
        }
        await handleConfigChange('default_args', args);
    }, [config, handleConfigChange]);

    if (loading) {
        return html`<div class="settings-tab-content"><p>Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Server Status -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Server Status
                    <span style="
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        margin-left: 12px;
                        font-size: 12px;
                        font-weight: normal;
                    ">
                        <span style="
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            background: ${status?.running ? (status?.healthy ? 'var(--success)' : 'var(--warning)') : 'var(--fg-3)'};
                        "></span>
                        ${status?.running ? (status?.healthy ? 'Running' : 'Unhealthy') : 'Stopped'}
                    </span>
                </h3>

                ${status?.running ? html`
                    <div class="settings-card-desc">
                        Model: <strong>${getShortPath(status.model)}</strong> on port ${status.port}
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button class="btn btn-secondary" onClick=${handleStop}>
                            Stop Server
                        </button>
                        <button class="btn btn-primary" onClick=${handleRestart} disabled=${starting}>
                            ${starting ? 'Restarting...' : 'Restart with New Settings'}
                        </button>
                    </div>
                ` : html`
                    <p class="settings-card-desc">
                        llama-server is not running. Load a GGUF model from the model selector to start.
                    </p>
                `}
            </section>

            <!-- Server Configuration -->
            <section class="settings-card">
                <h3 class="settings-card-title">Server Configuration</h3>
                <p class="settings-card-desc">Settings for llama-server (llama.cpp)</p>

                <div class="settings-grid">
                    <div class="setting-row">
                        <${SettingLabel}
                            label="Server Port"
                            hint="Port for llama-server to listen on"
                        />
                        <input
                            type="number"
                            class="setting-input"
                            style="width: 100px;"
                            value=${config?.port || 8080}
                            onInput=${e => handleConfigChange('port', parseInt(e.target.value))}
                        />
                    </div>

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Auto-start on request"
                            hint="Automatically start llama-server when a GGUF model is requested"
                        />
                        <div
                            class="toggle-switch ${config?.auto_start ? 'active' : ''}"
                            onClick=${() => handleConfigChange('auto_start', !config?.auto_start)}
                            role="switch"
                            aria-checked=${config?.auto_start}
                        ></div>
                    </div>

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Context Size"
                            hint="Maximum context window size (8K-128K tokens). Larger = more memory usage."
                        />
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <input
                                type="range"
                                style="width: 140px;"
                                min="8192"
                                max="131072"
                                step="8192"
                                value=${getContextSize(config?.default_args)}
                                onInput=${e => handleContextSizeChange(parseInt(e.target.value))}
                            />
                            <span style="font-family: monospace; font-size: 13px; min-width: 50px;">
                                ${Math.round(getContextSize(config?.default_args) / 1024)}K
                            </span>
                        </div>
                    </div>

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Enable Thinking"
                            hint="Allow model to generate reasoning before response. Disable for faster responses (skips ~3K tokens of reasoning per response)."
                        />
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <select
                                class="setting-input"
                                style="width: 140px;"
                                value=${config?.enable_thinking === true ? 'true' : config?.enable_thinking === false ? 'false' : 'default'}
                                onChange=${e => {
                                    const val = e.target.value;
                                    if (val === 'default') {
                                        // Remove the key by setting to undefined
                                        const newConfig = { ...config };
                                        delete newConfig.enable_thinking;
                                        setConfig(newConfig);
                                        endpoints.updateGgufConfig({ enable_thinking: null });
                                    } else {
                                        handleConfigChange('enable_thinking', val === 'true');
                                    }
                                }}
                            >
                                <option value="default">Default (model decides)</option>
                                <option value="true">Enabled</option>
                                <option value="false">Disabled (faster)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Context Warning -->
            <section class="settings-card">
                <h3 class="settings-card-title">Context Warning</h3>
                <p class="settings-card-desc">
                    Warns when context is near the limit. User should run /compact (Claude) or /compress (Qwen).
                </p>

                <div class="settings-grid">
                    <div class="setting-row">
                        <${SettingLabel}
                            label="Warning Threshold"
                            hint="Show warning when context usage exceeds this percentage"
                        />
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <input
                                type="range"
                                style="width: 100px;"
                                min="50"
                                max="90"
                                step="5"
                                value=${config?.context_warning_threshold || 75}
                                onInput=${e => handleConfigChange('context_warning_threshold', parseInt(e.target.value))}
                            />
                            <span style="font-family: monospace; font-size: 13px;">
                                ${config?.context_warning_threshold || 75}%
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Speculative Decoding -->
            <section class="settings-card">
                <h3 class="settings-card-title">Speculative Decoding</h3>
                <p class="settings-card-desc">
                    Use a small draft model to speculate tokens, then verify with the main model.
                    Can speed up generation 1.5-3x.
                </p>

                <div class="settings-grid">
                    <div class="setting-row" style="flex-direction: column; align-items: stretch;">
                        <${SettingLabel}
                            label="Draft Model"
                            hint="Small GGUF model for speculation (e.g., Qwen2-0.5B). Leave empty to disable."
                        />
                        <select
                            class="setting-input"
                            style="width: 100%; margin-top: 8px;"
                            value=${config?.draft_model || ''}
                            onChange=${e => handleConfigChange('draft_model', e.target.value)}
                        >
                            <option value="">None (disabled)</option>
                            ${localModels.map(m => html`
                                <option key=${m.id} value=${m.path || m.id}>
                                    ${getShortPath(m.path || m.id)}
                                </option>
                            `)}
                            <option value="~/.lmstudio/models/Qwen/Qwen2-0.5B-Instruct-GGUF/qwen2-0_5b-instruct-q4_k_m.gguf">
                                Qwen2-0.5B (recommended)
                            </option>
                        </select>
                        ${config?.draft_model && html`
                            <div style="font-size: 11px; color: var(--fg-3); margin-top: 4px;">
                                Current: ${getShortPath(config.draft_model)}
                            </div>
                        `}
                    </div>

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Draft Tokens"
                            hint="Number of tokens to speculate per step (8-32 recommended)"
                        />
                        <input
                            type="number"
                            class="setting-input"
                            style="width: 80px;"
                            value=${config?.draft_n || 16}
                            min="1"
                            max="64"
                            onInput=${e => handleConfigChange('draft_n', parseInt(e.target.value) || 16)}
                        />
                    </div>

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Min Probability"
                            hint="Minimum probability threshold for accepting speculated tokens (0.5-0.9)"
                        />
                        <input
                            type="number"
                            class="setting-input"
                            style="width: 80px;"
                            value=${config?.draft_p_min || 0.8}
                            min="0"
                            max="1"
                            step="0.1"
                            onInput=${e => handleConfigChange('draft_p_min', parseFloat(e.target.value) || 0.8)}
                        />
                    </div>
                </div>

                ${config?.draft_model && html`
                    <div style="
                        margin-top: 16px;
                        padding: 12px;
                        background: var(--bg-2);
                        border-radius: 8px;
                        font-size: 12px;
                    ">
                        <strong style="color: var(--success);">Speculative decoding enabled</strong>
                        <br/>
                        <span style="color: var(--fg-2);">
                            Restart the server to apply changes.
                        </span>
                    </div>
                `}
            </section>

            <!-- Advanced Settings -->
            <section class="settings-card">
                <h3 class="settings-card-title">Advanced</h3>
                <p class="settings-card-desc">Additional llama-server arguments</p>

                <div class="setting-row" style="flex-direction: column; align-items: stretch;">
                    <${SettingLabel}
                        label="Default Arguments"
                        hint="Command line arguments passed to llama-server (JSON array)"
                    />
                    <textarea
                        class="setting-input"
                        style="width: 100%; margin-top: 8px; font-family: monospace; font-size: 12px;"
                        rows="3"
                        value=${JSON.stringify(config?.default_args || [], null, 2)}
                        onInput=${e => {
                            try {
                                const args = JSON.parse(e.target.value);
                                if (Array.isArray(args)) {
                                    handleConfigChange('default_args', args);
                                }
                            } catch {}
                        }}
                    />
                    <div style="font-size: 11px; color: var(--fg-3); margin-top: 4px;">
                        Common: --jinja, -ngl 99, -fa auto, -c 32768
                    </div>
                </div>
            </section>

            <!-- Help -->
            <section class="settings-card">
                <h3 class="settings-card-title">Tips</h3>
                <ul style="font-size: 13px; color: var(--fg-2); margin: 0; padding-left: 20px;">
                    <li><strong>Context Size:</strong> Use 64K+ for Claude Code (large tool definitions)</li>
                    <li><code>-ngl 99</code> - Use GPU for all layers (faster)</li>
                    <li><code>-fa auto</code> - Enable Flash Attention</li>
                    <li>Speculative decoding works best when draft model is from same family</li>
                    <li>For Qwen models, use Qwen2-0.5B as draft</li>
                    <li><strong>Restart server</strong> after changing context size</li>
                </ul>
            </section>
        </div>
    `;
}
