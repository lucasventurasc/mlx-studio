// Audio API functions for Voice Mode
// STT (Speech-to-Text) and TTS (Text-to-Speech) via mlx-omni-server

// Use current host for API calls (supports network access)
const API_BASE = `${window.location.protocol}//${window.location.host}`;

/**
 * Transcribe audio to text using Whisper (STT)
 * @param {Blob} audioBlob - Audio file blob (WAV, WebM, MP3, etc.)
 * @param {object} options - Transcription options
 * @param {string} options.model - Whisper model to use
 * @param {string} options.language - ISO-639-1 language code (optional)
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeAudio(audioBlob, options = {}) {
    const {
        model = 'mlx-community/whisper-large-v3-turbo',
        language = null
    } = options;

    const formData = new FormData();

    // Determine file extension from blob type
    const mimeType = audioBlob.type || 'audio/wav';
    const extension = mimeType.includes('webm') ? 'webm' :
                      mimeType.includes('mp3') ? 'mp3' :
                      mimeType.includes('ogg') ? 'ogg' : 'wav';

    formData.append('file', audioBlob, `recording.${extension}`);
    formData.append('model', model);
    formData.append('response_format', 'json');

    if (language) {
        formData.append('language', language);
    }

    const response = await fetch(`${API_BASE}/v1/audio/transcriptions`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Transcription failed: ${error}`);
    }

    const result = await response.json();
    return result.text || '';
}

/**
 * Synthesize speech from text (TTS)
 * @param {string} text - Text to convert to speech
 * @param {object} options - TTS options
 * @param {string} options.model - TTS model to use
 * @param {string} options.voice - Voice ID
 * @param {number} options.speed - Speech speed (0.25 - 4.0)
 * @param {AbortSignal} options.signal - Optional abort signal
 * @returns {Promise<Blob>} - Audio blob (WAV)
 */
export async function synthesizeSpeech(text, options = {}) {
    const {
        model = 'mlx-community/Kokoro-82M-4bit',
        voice = 'af_sky',
        speed = 1.0,
        signal = null
    } = options;

    // Use Edge TTS endpoint for edge-tts model (Microsoft Neural Voices)
    if (model === 'edge-tts') {
        // Convert speed multiplier to rate percentage: 1.0 = +0%, 1.5 = +50%, 0.5 = -50%
        const ratePercent = Math.round((speed - 1) * 100);
        const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

        const requestBody = {
            input: text,
            voice: voice,  // e.g., 'pt-BR-FranciscaNeural'
            rate: rate
        };

        console.log('Edge TTS Request:', requestBody);

        const response = await fetch(`${API_BASE}/api/tts/edge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal
        });

        console.log('Edge TTS Response status:', response.status, response.statusText);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Edge TTS synthesis failed: ${error}`);
        }

        const blob = await response.blob();
        console.log('Edge TTS Audio blob:', { size: blob.size, type: blob.type });

        return blob;
    }

    // Default: use mlx-omni-server TTS (Kokoro, Marvis)
    const requestBody = {
        model,
        input: text,
        voice,
        response_format: 'wav',
        speed
    };

    console.log('TTS Request:', requestBody);

    const response = await fetch(`${API_BASE}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
    });

    console.log('TTS Response status:', response.status, response.statusText);
    console.log('TTS Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Speech synthesis failed: ${error}`);
    }

    const blob = await response.blob();
    console.log('TTS Audio blob:', { size: blob.size, type: blob.type });

    return blob;
}

/**
 * Available TTS voices (from mlx-omni-server Kokoro model)
 * Format: voice_id -> display name
 * Prefixes: af=American Female, am=American Male, bf=British Female, bm=British Male
 *           pf=Portuguese Female, pm=Portuguese Male
 */
export const TTS_VOICES = {
    // Brazilian Portuguese
    'pf_dora': 'Dora (PT-BR Feminina)',
    'pm_alex': 'Alex (PT-BR Masculino)',
    'pm_santa': 'Santa (PT-BR Masculino)',
    // American English
    'af_sky': 'Sky (US Female)',
    'af_bella': 'Bella (US Female)',
    'af_nicole': 'Nicole (US Female)',
    'af_sarah': 'Sarah (US Female)',
    'am_adam': 'Adam (US Male)',
    'am_michael': 'Michael (US Male)',
    // British English
    'bf_emma': 'Emma (UK Female)',
    'bf_isabella': 'Isabella (UK Female)',
    'bm_george': 'George (UK Male)',
    'bm_lewis': 'Lewis (UK Male)'
};

/**
 * Default TTS models
 * Note: Marvis has GPU conflicts with LLM in Voice Mode - use Kokoro or Edge TTS instead
 */
export const TTS_MODELS = {
    'mlx-community/Kokoro-82M-4bit': 'Kokoro 82M (Local, PT-BR) - Recommended',
    'edge-tts': 'Edge TTS (Online, High Quality)',
    'Marvis-AI/marvis-tts-250m-v0.1': 'Marvis 250M (English only, unstable in Voice Mode)'
};

/**
 * Marvis TTS voices (speaker prompt files)
 */
export const MARVIS_VOICES = {
    'conversational_a': 'Conversational A (Female)',
    'conversational_b': 'Conversational B (Male)'
};

/**
 * Edge TTS voices (Microsoft Neural - High Quality)
 */
export const EDGE_TTS_VOICES = {
    // Portuguese - Brazil
    'pt-BR-FranciscaNeural': 'Francisca (Brazil, Female)',
    'pt-BR-AntonioNeural': 'Antonio (Brazil, Male)',
    'pt-BR-ThalitaMultilingualNeural': 'Thalita (Brazil, Multilingual)',
    // Portuguese - Portugal
    'pt-PT-RaquelNeural': 'Raquel (Portugal, Female)',
    'pt-PT-DuarteNeural': 'Duarte (Portugal, Male)',
    // English - US
    'en-US-JennyNeural': 'Jenny (US, Female)',
    'en-US-GuyNeural': 'Guy (US, Male)',
    'en-US-AriaNeural': 'Aria (US, Female)',
    'en-US-DavisNeural': 'Davis (US, Male)',
    // English - UK
    'en-GB-SoniaNeural': 'Sonia (UK, Female)',
    'en-GB-RyanNeural': 'Ryan (UK, Male)',
    // Spanish
    'es-ES-ElviraNeural': 'Elvira (Spain, Female)',
    'es-MX-DaliaNeural': 'Dalia (Mexico, Female)',
    // French
    'fr-FR-DeniseNeural': 'Denise (France, Female)',
    // German
    'de-DE-KatjaNeural': 'Katja (Germany, Female)',
    // Italian
    'it-IT-ElsaNeural': 'Elsa (Italy, Female)',
    // Japanese
    'ja-JP-NanamiNeural': 'Nanami (Japan, Female)',
    // Chinese
    'zh-CN-XiaoxiaoNeural': 'Xiaoxiao (China, Female)',
};

/**
 * Default STT models (ordered by speed: fastest first)
 */
export const STT_MODELS = {
    'mlx-community/whisper-small-mlx': 'Whisper Small (Fastest)',
    'mlx-community/whisper-medium-mlx': 'Whisper Medium (Fast)',
    'mlx-community/whisper-large-v3-turbo': 'Whisper Large v3 Turbo',
    'mlx-community/whisper-large-v3-mlx': 'Whisper Large v3 (Best)'
};
