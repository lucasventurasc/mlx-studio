// Inference Tab - Profile, generation settings, and system prompt
const { html, useCallback } = window.preact;
import { useStore, actions } from '../../hooks/useStore.js';
import { presets } from '../../utils/helpers.js';
import { endpoints } from '../../utils/api.js';
import { SettingLabel } from '../ui/Tooltip.js';

// Inference profiles with descriptions
const INFERENCE_PROFILES = {
    speed: { name: 'Speed', description: 'Maximum generation speed, lower quality' },
    balanced: { name: 'Balanced', description: 'Balance between speed and quality' },
    quality: { name: 'Quality', description: 'Maximum output quality, slower' },
    creative: { name: 'Creative', description: 'Higher temperature for creative tasks' },
    precise: { name: 'Precise', description: 'Low temperature for factual responses' }
};

// Hints for each setting
const HINTS = {
    temperature: "Controls randomness. Lower (0.1) = focused and deterministic. Higher (1.5) = creative and varied.",
    maxTokens: "Maximum response length. 4096 tokens is roughly 3000 words. Higher values allow longer responses.",
    topP: "Nucleus sampling threshold. Lower values (0.5) = more focused. Higher (0.95) = more diverse vocabulary.",
    topK: "Limits vocabulary to top K tokens. Lower = more focused, higher = more varied word choices.",
    repPenalty: "Penalizes repeated words/phrases. 1.0 = no penalty, 1.5 = strong penalty against repetition.",
    contextLength: "How much conversation history to include. Higher = better memory but more VRAM usage.",
    systemPrompt: "Instructions that guide the model's behavior. Persists across the conversation."
};

export function InferenceTab() {
    const { settings, currentProfile } = useStore(s => ({
        settings: s.settings,
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
        <div class="settings-tab-content">
            <!-- Inference Profile -->
            <section class="settings-card">
                <h3 class="settings-card-title">Inference Profile</h3>
                <p class="settings-card-desc">Quick presets that optimize for different use cases</p>

                <div class="profile-grid">
                    ${Object.entries(INFERENCE_PROFILES).map(([key, profile]) => html`
                        <button
                            key=${key}
                            class="profile-card ${currentProfile === key ? 'active' : ''}"
                            onClick=${() => changeProfile(key)}
                        >
                            <span class="profile-card-name">${profile.name}</span>
                            <span class="profile-card-desc">${profile.description}</span>
                        </button>
                    `)}
                </div>
            </section>

            <!-- Generation Settings -->
            <section class="settings-card">
                <h3 class="settings-card-title">Generation</h3>
                <p class="settings-card-desc">Fine-tune how the model generates responses</p>

                <div class="settings-grid">
                    <${SliderSetting}
                        label="Temperature"
                        hint=${HINTS.temperature}
                        value=${settings.temperature}
                        min="0"
                        max="2"
                        step="0.05"
                        onChange=${v => updateSetting('temperature', v)}
                    />

                    <${SliderSetting}
                        label="Max Tokens"
                        hint=${HINTS.maxTokens}
                        value=${settings.maxTokens}
                        min="256"
                        max="32768"
                        step="256"
                        onChange=${v => updateSetting('maxTokens', v)}
                    />

                    <${SliderSetting}
                        label="Top P"
                        hint=${HINTS.topP}
                        value=${settings.topP}
                        min="0"
                        max="1"
                        step="0.05"
                        onChange=${v => updateSetting('topP', v)}
                    />

                    <${SliderSetting}
                        label="Top K"
                        hint=${HINTS.topK}
                        value=${settings.topK}
                        min="1"
                        max="100"
                        step="1"
                        onChange=${v => updateSetting('topK', v)}
                    />

                    <${SliderSetting}
                        label="Repetition Penalty"
                        hint=${HINTS.repPenalty}
                        value=${settings.repPenalty}
                        min="1"
                        max="2"
                        step="0.05"
                        onChange=${v => updateSetting('repPenalty', v)}
                    />
                </div>

                <!-- Quick Presets -->
                <div class="presets-row">
                    <span class="presets-label">Quick Presets:</span>
                    <div class="presets-buttons">
                        ${['default', 'creative', 'precise', 'code'].map(preset => html`
                            <button
                                key=${preset}
                                class="preset-btn"
                                onClick=${() => loadPreset(preset)}
                            >
                                ${preset}
                            </button>
                        `)}
                    </div>
                </div>
            </section>

            <!-- Context Settings -->
            <section class="settings-card">
                <h3 class="settings-card-title">Context</h3>
                <p class="settings-card-desc">Memory and streaming options</p>

                <div class="settings-grid">
                    <${SliderSetting}
                        label="Context Length"
                        hint=${HINTS.contextLength}
                        value=${settings.contextLength}
                        min="1024"
                        max="131072"
                        step="1024"
                        displayValue=${formatContextSize(settings.contextLength)}
                        onChange=${v => updateSetting('contextLength', v)}
                    />

                    <div class="setting-row">
                        <${SettingLabel}
                            label="Stream Response"
                            hint="Show response as it's generated instead of waiting for completion"
                        />
                        <div
                            class="toggle-switch ${settings.streamEnabled ? 'active' : ''}"
                            onClick=${() => updateSetting('streamEnabled', !settings.streamEnabled)}
                            role="switch"
                            aria-checked=${settings.streamEnabled}
                        ></div>
                    </div>
                </div>
            </section>

            <!-- System Prompt -->
            <section class="settings-card">
                <h3 class="settings-card-title">System Prompt</h3>
                <p class="settings-card-desc">${HINTS.systemPrompt}</p>

                <textarea
                    class="system-prompt-input"
                    placeholder="You are a helpful assistant..."
                    value=${settings.systemPrompt}
                    onInput=${e => updateSetting('systemPrompt', e.target.value)}
                    rows="6"
                />
            </section>
        </div>
    `;
}

function SliderSetting({ label, hint, value, min, max, step, displayValue, onChange }) {
    return html`
        <div class="slider-setting">
            <div class="slider-header">
                <${SettingLabel} label=${label} hint=${hint} />
                <span class="slider-value">${displayValue || value}</span>
            </div>
            <input
                type="range"
                class="slider-input"
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
