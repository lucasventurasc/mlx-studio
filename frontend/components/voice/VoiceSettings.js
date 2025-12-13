// VoiceSettings - Voice mode settings panel
// Modern, professional settings interface with table layout

const { html, useState, useCallback, useEffect } = window.preact;
import { actions } from '../../hooks/useStore.js';
import { TTS_VOICES, TTS_MODELS, STT_MODELS, EDGE_TTS_VOICES, MARVIS_VOICES } from '../../utils/audioApi.js';
import { XIcon } from '../Icons.js';

// Supported languages for STT (Whisper)
const STT_LANGUAGES = {
    'auto': 'Auto-detect',
    'en': 'English',
    'pt': 'Português (Brasil)',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'ja': '日本語',
    'ko': '한국어',
    'zh': '中文',
    'ru': 'Русский',
    'ar': 'العربية',
    'nl': 'Nederlands',
    'pl': 'Polski',
    'tr': 'Türkçe'
};

/**
 * VoiceSettings Component
 * Settings panel for voice mode configuration
 */
export function VoiceSettings({ settings = {}, onClose }) {
    const [localSettings, setLocalSettings] = useState({
        ttsVoice: settings.ttsVoice || 'conversational_a',
        ttsSpeed: settings.ttsSpeed || 1.0,
        ttsModel: settings.ttsModel || 'Marvis-AI/marvis-tts-250m-v0.1',
        ttsEnabled: settings.ttsEnabled !== false,
        sttModel: settings.sttModel || 'mlx-community/whisper-large-v3-turbo',
        vadThreshold: settings.vadThreshold || 0.3,
        vadSilenceDuration: settings.vadSilenceDuration || 2000,
        audioDeviceId: settings.audioDeviceId || 'default',
        sttLanguage: settings.sttLanguage || 'en'
    });

    const [audioDevices, setAudioDevices] = useState([]);

    useEffect(() => {
        async function loadDevices() {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                setAudioDevices(audioInputs);
            } catch (err) {
                console.error('Failed to enumerate audio devices:', err);
            }
        }
        loadDevices();
    }, []);

    const updateSetting = useCallback((key, value) => {
        let updates = { [key]: value };

        if (key === 'ttsModel') {
            if (value === 'edge-tts') {
                updates.ttsVoice = 'pt-BR-FranciscaNeural';
            } else if (value.includes('marvis')) {
                updates.ttsVoice = 'conversational_a';
            } else {
                updates.ttsVoice = 'pf_dora';
            }
        }

        setLocalSettings(prev => ({ ...prev, ...updates }));
        actions.updateVoiceSettings(updates);
    }, []);

    return html`
        <div class="voice-settings" onClick=${(e) => e.stopPropagation()}>
            <div class="settings-header">
                <h2>Voice Settings</h2>
                <button class="settings-close" onClick=${onClose}>
                    <${XIcon} size=${16} />
                </button>
            </div>

            <div class="settings-content">
                <!-- TTS Section -->
                <section class="settings-section">
                    <div class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                        Text-to-Speech
                    </div>

                    <table class="settings-table">
                        <tbody>
                            <tr>
                                <td class="setting-label-cell">Auto-play</td>
                                <td class="setting-control-cell">
                                    <button
                                        class="toggle-btn ${localSettings.ttsEnabled ? 'active' : ''}"
                                        onClick=${() => updateSetting('ttsEnabled', !localSettings.ttsEnabled)}
                                    >
                                        <span class="toggle-slider"></span>
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td class="setting-label-cell">Model</td>
                                <td class="setting-control-cell">
                                    <select
                                        class="setting-select"
                                        value=${localSettings.ttsModel}
                                        onChange=${(e) => updateSetting('ttsModel', e.target.value)}
                                    >
                                        ${Object.entries(TTS_MODELS).map(([id, name]) => html`
                                            <option value=${id} key=${id}>${name}</option>
                                        `)}
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td class="setting-label-cell">Voice</td>
                                <td class="setting-control-cell">
                                    <select
                                        class="setting-select"
                                        value=${localSettings.ttsVoice}
                                        onChange=${(e) => updateSetting('ttsVoice', e.target.value)}
                                    >
                                        ${localSettings.ttsModel === 'edge-tts' ?
                                            Object.entries(EDGE_TTS_VOICES).map(([id, name]) => html`
                                                <option value=${id} key=${id}>${name}</option>
                                            `) :
                                          localSettings.ttsModel.includes('marvis') ?
                                            Object.entries(MARVIS_VOICES).map(([id, name]) => html`
                                                <option value=${id} key=${id}>${name}</option>
                                            `) :
                                            Object.entries(TTS_VOICES).map(([id, name]) => html`
                                                <option value=${id} key=${id}>${name}</option>
                                            `)
                                        }
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td class="setting-label-cell">Speed</td>
                                <td class="setting-control-cell">
                                    <div class="slider-row">
                                        <input
                                            type="range"
                                            class="setting-slider"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value=${localSettings.ttsSpeed}
                                            onChange=${(e) => updateSetting('ttsSpeed', parseFloat(e.target.value))}
                                        />
                                        <span class="slider-value">${localSettings.ttsSpeed.toFixed(1)}x</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <!-- STT Section -->
                <section class="settings-section">
                    <div class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        </svg>
                        Speech-to-Text
                    </div>

                    <table class="settings-table">
                        <tbody>
                            <tr>
                                <td class="setting-label-cell">Model</td>
                                <td class="setting-control-cell">
                                    <select
                                        class="setting-select"
                                        value=${localSettings.sttModel}
                                        onChange=${(e) => updateSetting('sttModel', e.target.value)}
                                    >
                                        ${Object.entries(STT_MODELS).map(([id, name]) => html`
                                            <option value=${id} key=${id}>${name}</option>
                                        `)}
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td class="setting-label-cell">Language</td>
                                <td class="setting-control-cell">
                                    <select
                                        class="setting-select"
                                        value=${localSettings.sttLanguage}
                                        onChange=${(e) => updateSetting('sttLanguage', e.target.value)}
                                    >
                                        ${Object.entries(STT_LANGUAGES).map(([code, name]) => html`
                                            <option value=${code} key=${code}>${name}</option>
                                        `)}
                                    </select>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <!-- Microphone Section -->
                <section class="settings-section">
                    <div class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="23"/>
                        </svg>
                        Input
                    </div>

                    <table class="settings-table">
                        <tbody>
                            <tr>
                                <td class="setting-label-cell">Device</td>
                                <td class="setting-control-cell">
                                    <select
                                        class="setting-select"
                                        value=${localSettings.audioDeviceId}
                                        onChange=${(e) => updateSetting('audioDeviceId', e.target.value)}
                                    >
                                        <option value="default">Default Microphone</option>
                                        ${audioDevices.map(device => html`
                                            <option value=${device.deviceId} key=${device.deviceId}>
                                                ${device.label || 'Microphone ' + device.deviceId.substring(0, 8)}
                                            </option>
                                        `)}
                                    </select>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <!-- VAD Section -->
                <section class="settings-section">
                    <div class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        Voice Detection
                        <span class="section-badge">Auto mode</span>
                    </div>

                    <table class="settings-table">
                        <tbody>
                            <tr>
                                <td class="setting-label-cell">Sensitivity</td>
                                <td class="setting-control-cell">
                                    <div class="slider-row">
                                        <input
                                            type="range"
                                            class="setting-slider"
                                            min="0.1"
                                            max="0.9"
                                            step="0.05"
                                            value=${localSettings.vadThreshold}
                                            onChange=${(e) => updateSetting('vadThreshold', parseFloat(e.target.value))}
                                        />
                                        <span class="slider-value ${localSettings.vadThreshold <= 0.2 ? 'high' : localSettings.vadThreshold <= 0.5 ? 'medium' : 'low'}">
                                            ${localSettings.vadThreshold <= 0.2 ? 'High' :
                                              localSettings.vadThreshold <= 0.5 ? 'Med' : 'Low'}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="setting-label-cell">Silence delay</td>
                                <td class="setting-control-cell">
                                    <div class="slider-row">
                                        <input
                                            type="range"
                                            class="setting-slider"
                                            min="500"
                                            max="3000"
                                            step="100"
                                            value=${localSettings.vadSilenceDuration}
                                            onChange=${(e) => updateSetting('vadSilenceDuration', parseInt(e.target.value))}
                                        />
                                        <span class="slider-value">${(localSettings.vadSilenceDuration / 1000).toFixed(1)}s</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </div>

            <div class="settings-footer">
                <button
                    class="reset-btn"
                    onClick=${() => {
                        const defaults = {
                            ttsVoice: 'conversational_a',
                            ttsSpeed: 1.0,
                            ttsModel: 'Marvis-AI/marvis-tts-250m-v0.1',
                            ttsEnabled: true,
                            sttModel: 'mlx-community/whisper-large-v3-turbo',
                            sttLanguage: 'en',
                            vadThreshold: 0.3,
                            vadSilenceDuration: 2000,
                            inputMode: 'ptt'
                        };
                        setLocalSettings(defaults);
                        actions.updateVoiceSettings(defaults);
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                    </svg>
                    Reset
                </button>
            </div>
        </div>
    `;
}
