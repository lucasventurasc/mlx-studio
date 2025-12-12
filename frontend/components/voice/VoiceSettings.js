// VoiceSettings - Voice mode settings panel
// Allows configuration of STT, TTS, and VAD parameters

const { html, useState, useCallback, useEffect } = window.preact;
import { actions } from '../../hooks/useStore.js';
import { TTS_VOICES, TTS_MODELS, STT_MODELS, EDGE_TTS_VOICES, MARVIS_VOICES, DIA_VOICES } from '../../utils/audioApi.js';
import { XIcon } from '../Icons.js';

// Supported languages for STT (Whisper)
const STT_LANGUAGES = {
    'auto': 'Auto-detect',
    'pt': 'Português (Brasil)',
    'en': 'English',
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
 *
 * @param {object} props
 * @param {object} props.settings - Current voice settings
 * @param {function} props.onClose - Close handler
 */
export function VoiceSettings({ settings = {}, onClose }) {
    // Local state for immediate UI feedback
    const [localSettings, setLocalSettings] = useState({
        ttsVoice: settings.ttsVoice || 'af_sky',
        ttsSpeed: settings.ttsSpeed || 1.0,
        ttsModel: settings.ttsModel || 'mlx-community/Kokoro-82M-4bit',
        ttsEnabled: settings.ttsEnabled !== false,
        sttModel: settings.sttModel || 'mlx-community/whisper-large-v3-turbo',
        vadThreshold: settings.vadThreshold || 0.3,
        vadSilenceDuration: settings.vadSilenceDuration || 2000,
        audioDeviceId: settings.audioDeviceId || 'default',
        sttLanguage: settings.sttLanguage || 'pt'
    });

    // Available audio input devices
    const [audioDevices, setAudioDevices] = useState([]);

    // Load available microphones
    useEffect(() => {
        async function loadDevices() {
            try {
                // Request permission first to get device labels
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

    // Update setting
    const updateSetting = useCallback((key, value) => {
        let updates = { [key]: value };

        // When changing TTS model, reset voice to appropriate default
        if (key === 'ttsModel') {
            if (value === 'edge-tts') {
                updates.ttsVoice = 'pt-BR-FranciscaNeural';  // Default to Francisca (Brazil) for Edge TTS
            } else if (value.includes('marvis')) {
                updates.ttsVoice = 'conversational_a';  // Default Marvis speaker
            } else if (value.includes('Dia')) {
                updates.ttsVoice = 'S1';  // Default Dia speaker
            } else {
                updates.ttsVoice = 'pf_dora';  // Default Kokoro PT-BR voice
            }
        }

        setLocalSettings(prev => ({ ...prev, ...updates }));
        actions.updateVoiceSettings(updates);
    }, []);

    return html`
        <div class="voice-settings-panel" onClick=${(e) => e.stopPropagation()}>
            <div class="voice-settings-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div class="voice-settings-title" style="margin: 0; padding: 0; border: none;">
                    Voice Settings
                </div>
                <button
                    class="voice-mode-btn"
                    onClick=${onClose}
                    style="width: 32px; height: 32px;"
                >
                    <${XIcon} size=${16} />
                </button>
            </div>

            <!-- TTS Settings -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 12px; color: var(--text-tertiary); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                    Text-to-Speech
                </h4>

                <!-- TTS Enabled -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Auto-play responses</span>
                        <input
                            type="checkbox"
                            checked=${localSettings.ttsEnabled}
                            onChange=${(e) => updateSetting('ttsEnabled', e.target.checked)}
                            style="width: 18px; height: 18px; cursor: pointer;"
                        />
                    </label>
                </div>

                <!-- TTS Model -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>TTS Model</span>
                    </label>
                    <select
                        class="voice-setting-select"
                        value=${localSettings.ttsModel}
                        onChange=${(e) => updateSetting('ttsModel', e.target.value)}
                    >
                        ${Object.entries(TTS_MODELS).map(([id, name]) => html`
                            <option value=${id} key=${id}>${name}</option>
                        `)}
                    </select>
                </div>

                <!-- Voice Selection -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Voice</span>
                    </label>
                    <select
                        class="voice-setting-select"
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
                          localSettings.ttsModel.includes('Dia') ?
                            Object.entries(DIA_VOICES).map(([id, name]) => html`
                                <option value=${id} key=${id}>${name}</option>
                            `) :
                            Object.entries(TTS_VOICES).map(([id, name]) => html`
                                <option value=${id} key=${id}>${name}</option>
                            `)
                        }
                    </select>
                </div>

                <!-- Speed -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Speed</span>
                        <span class="voice-setting-value">${localSettings.ttsSpeed.toFixed(1)}x</span>
                    </label>
                    <input
                        type="range"
                        class="voice-setting-slider"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value=${localSettings.ttsSpeed}
                        onChange=${(e) => updateSetting('ttsSpeed', parseFloat(e.target.value))}
                    />
                </div>
            </div>

            <!-- STT Settings -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 12px; color: var(--text-tertiary); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                    Speech-to-Text
                </h4>

                <!-- STT Model -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>STT Model</span>
                    </label>
                    <select
                        class="voice-setting-select"
                        value=${localSettings.sttModel}
                        onChange=${(e) => updateSetting('sttModel', e.target.value)}
                    >
                        ${Object.entries(STT_MODELS).map(([id, name]) => html`
                            <option value=${id} key=${id}>${name}</option>
                        `)}
                    </select>
                </div>

                <!-- STT Language -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Language</span>
                    </label>
                    <select
                        class="voice-setting-select"
                        value=${localSettings.sttLanguage}
                        onChange=${(e) => updateSetting('sttLanguage', e.target.value)}
                    >
                        ${Object.entries(STT_LANGUAGES).map(([code, name]) => html`
                            <option value=${code} key=${code}>${name}</option>
                        `)}
                    </select>
                </div>
            </div>

            <!-- Microphone Settings -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 12px; color: var(--text-tertiary); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                    Microphone
                </h4>

                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Input Device</span>
                    </label>
                    <select
                        class="voice-setting-select"
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
                </div>
            </div>

            <!-- VAD Settings -->
            <div>
                <h4 style="font-size: 12px; color: var(--text-tertiary); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                    Voice Detection (Auto-detect mode)
                </h4>

                <!-- Sensitivity -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Sensitivity</span>
                        <span class="voice-setting-value">
                            ${localSettings.vadThreshold <= 0.2 ? 'High' :
                              localSettings.vadThreshold <= 0.5 ? 'Medium' : 'Low'}
                        </span>
                    </label>
                    <input
                        type="range"
                        class="voice-setting-slider"
                        min="0.1"
                        max="0.9"
                        step="0.05"
                        value=${localSettings.vadThreshold}
                        onChange=${(e) => updateSetting('vadThreshold', parseFloat(e.target.value))}
                    />
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">
                        <span>High</span>
                        <span>Low</span>
                    </div>
                </div>

                <!-- Silence Duration -->
                <div class="voice-setting-group">
                    <label class="voice-setting-label">
                        <span>Silence before send</span>
                        <span class="voice-setting-value">${(localSettings.vadSilenceDuration / 1000).toFixed(1)}s</span>
                    </label>
                    <input
                        type="range"
                        class="voice-setting-slider"
                        min="500"
                        max="3000"
                        step="100"
                        value=${localSettings.vadSilenceDuration}
                        onChange=${(e) => updateSetting('vadSilenceDuration', parseInt(e.target.value))}
                    />
                </div>
            </div>

            <!-- Reset Button -->
            <button
                style="
                    width: 100%;
                    padding: 10px;
                    margin-top: 16px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    color: var(--text-secondary);
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                "
                onClick=${() => {
                    const defaults = {
                        ttsVoice: 'af_sky',
                        ttsSpeed: 1.0,
                        ttsModel: 'mlx-community/Kokoro-82M-4bit',
                        ttsEnabled: true,
                        sttModel: 'mlx-community/whisper-large-v3-turbo',
                        sttLanguage: 'pt',
                        vadThreshold: 0.3,
                        vadSilenceDuration: 2000,
                        inputMode: 'ptt'
                    };
                    setLocalSettings(defaults);
                    actions.updateVoiceSettings(defaults);
                }}
            >
                Reset to Defaults
            </button>
        </div>
    `;
}
