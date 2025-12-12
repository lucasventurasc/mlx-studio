// Audio recording hook using MediaRecorder + Web Audio API
// Captures microphone audio for speech-to-text

const { useState, useRef, useCallback, useEffect } = window.preact;

/**
 * Convert audio blob to WAV format using Web Audio API
 * This ensures compatibility with Whisper which can have issues with some WebM files
 */
async function convertToWav(audioBlob, sampleRate = 16000) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Check for valid audio duration
        if (audioBuffer.duration < 0.3) {
            console.warn('Audio too short:', audioBuffer.duration, 'seconds');
            audioContext.close();
            return null;
        }

        // Get audio data (mono)
        const numberOfChannels = 1;
        const length = audioBuffer.length;
        const outputBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

        // Mix down to mono if stereo
        const outputData = outputBuffer.getChannelData(0);
        if (audioBuffer.numberOfChannels > 1) {
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
                outputData[i] = (left[i] + right[i]) / 2;
            }
        } else {
            const inputData = audioBuffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                outputData[i] = inputData[i];
            }
        }

        // Convert to WAV
        const wavBuffer = encodeWAV(outputData, sampleRate);
        audioContext.close();

        return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (err) {
        console.warn('WAV conversion failed:', err);
        return null; // Return null instead of broken original
    }
}

/**
 * Encode PCM data to WAV format
 */
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Hook for recording audio from the microphone
 * @returns {object} Recording state and controls
 */
export function useAudioRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState(null);
    const [hasPermission, setHasPermission] = useState(null);

    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const animationFrameRef = useRef(null);
    const resolveRef = useRef(null);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        mediaRecorderRef.current = null;
        chunksRef.current = [];
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Monitor audio levels
    const monitorAudioLevel = useCallback(() => {
        if (!analyserRef.current) return;

        const dataArray = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Calculate RMS (root mean square) for audio level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 10); // Normalize to 0-1

        setAudioLevel(level);

        if (isRecording) {
            animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
        }
    }, [isRecording]);

    // Request microphone permission
    const requestPermission = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setHasPermission(true);
            setError(null);
            return true;
        } catch (err) {
            setHasPermission(false);
            setError('Microphone permission denied');
            return false;
        }
    }, []);

    // Start recording
    const startRecording = useCallback(async (deviceId = null) => {
        if (isRecording) return null;

        try {
            setError(null);
            chunksRef.current = [];

            // Get microphone stream with optional device selection
            const audioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000
            };

            // Use specific device if provided
            if (deviceId && deviceId !== 'default') {
                audioConstraints.deviceId = { exact: deviceId };
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });
            streamRef.current = stream;
            setHasPermission(true);

            // Set up audio context for level monitoring
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);

            // Set up MediaRecorder
            // Try to use webm/opus first (better compression), fall back to alternatives
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                'audio/wav'
            ];
            let mimeType = '';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    break;
                }
            }

            const options = mimeType ? { mimeType } : {};
            mediaRecorderRef.current = new MediaRecorder(stream, options);

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const originalBlob = new Blob(chunksRef.current, {
                    type: mediaRecorderRef.current?.mimeType || 'audio/webm'
                });

                // Check minimum size - very short recordings are likely noise
                const MIN_AUDIO_SIZE = 1000; // 1KB minimum
                if (originalBlob.size < MIN_AUDIO_SIZE) {
                    console.warn('Recording too short, discarding:', originalBlob.size, 'bytes');
                    if (resolveRef.current) {
                        resolveRef.current(null);
                        resolveRef.current = null;
                    }
                    return;
                }

                // Convert to WAV for better Whisper compatibility
                console.log('Recording stopped, converting to WAV...', { originalSize: originalBlob.size, type: originalBlob.type });
                const wavBlob = await convertToWav(originalBlob);
                console.log('WAV conversion complete', { wavSize: wavBlob.size, type: wavBlob.type });

                if (resolveRef.current) {
                    resolveRef.current(wavBlob);
                    resolveRef.current = null;
                }
            };

            // Start recording with timeslice for streaming chunks
            mediaRecorderRef.current.start(100);
            setIsRecording(true);

            // Start monitoring audio levels
            monitorAudioLevel();

            return true;
        } catch (err) {
            console.error('Failed to start recording:', err);
            setError(err.message);
            setHasPermission(false);
            cleanup();
            return false;
        }
    }, [isRecording, cleanup, monitorAudioLevel]);

    // Stop recording and return audio blob
    const stopRecording = useCallback(() => {
        return new Promise((resolve) => {
            if (!isRecording || !mediaRecorderRef.current) {
                resolve(null);
                return;
            }

            resolveRef.current = resolve;
            setIsRecording(false);
            setAudioLevel(0);

            if (mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }

            // Clean up stream and audio context
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        });
    }, [isRecording]);

    // Cancel recording without returning audio
    const cancelRecording = useCallback(() => {
        resolveRef.current = null;
        setIsRecording(false);
        setAudioLevel(0);
        cleanup();
    }, [cleanup]);

    // Get audio level data for visualization
    const getAudioData = useCallback(() => {
        if (!analyserRef.current) return null;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        return dataArray;
    }, []);

    return {
        isRecording,
        audioLevel,
        error,
        hasPermission,
        startRecording,
        stopRecording,
        cancelRecording,
        requestPermission,
        getAudioData
    };
}
