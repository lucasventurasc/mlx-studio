// Voice Activity Detection (VAD) hook
// Detects when user starts/stops speaking using audio level analysis

const { useState, useRef, useCallback, useEffect } = window.preact;

/**
 * Default VAD options
 */
const DEFAULT_OPTIONS = {
    threshold: 0.5,           // Audio level threshold for speech detection (very high = only loud speech)
    silenceDuration: 1500,    // ms of silence before speech ends
    minSpeechDuration: 1000,  // ms minimum speech duration to be valid (1 second of continuous speech)
    debounceDelay: 300        // ms debounce for state changes
};

/**
 * Hook for Voice Activity Detection
 * Monitors audio stream and detects speech start/end
 *
 * @param {object} options - VAD configuration
 * @param {number} options.threshold - Audio level threshold (0-1)
 * @param {number} options.silenceDuration - Silence duration to end speech (ms)
 * @param {number} options.minSpeechDuration - Minimum speech duration (ms)
 * @returns {object} VAD state and controls
 */
export function useVoiceActivity(options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };

    const [isEnabled, setIsEnabled] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState(null);

    const streamRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);

    const speechStartTimeRef = useRef(null);
    const silenceStartTimeRef = useRef(null);
    const isSpeakingRef = useRef(false);
    const isEnabledRef = useRef(false);

    const onSpeechStartRef = useRef(null);
    const onSpeechEndRef = useRef(null);

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
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Process audio levels and detect speech
    const processAudio = useCallback(() => {
        if (!analyserRef.current || !isEnabledRef.current) return;

        const dataArray = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 10);

        setAudioLevel(level);

        const now = Date.now();
        const isAboveThreshold = level > config.threshold;

        if (isAboveThreshold) {
            // Sound detected
            silenceStartTimeRef.current = null;

            if (!isSpeakingRef.current) {
                // Start of speech
                speechStartTimeRef.current = now;
                isSpeakingRef.current = true;
                setIsSpeaking(true);

                if (onSpeechStartRef.current) {
                    onSpeechStartRef.current();
                }
            }
        } else {
            // Silence detected
            if (isSpeakingRef.current) {
                if (!silenceStartTimeRef.current) {
                    silenceStartTimeRef.current = now;
                }

                const silenceDuration = now - silenceStartTimeRef.current;
                const speechDuration = now - (speechStartTimeRef.current || now);

                // Check if silence duration exceeds threshold
                if (silenceDuration >= config.silenceDuration) {
                    // Only trigger end if speech was long enough
                    if (speechDuration >= config.minSpeechDuration) {
                        isSpeakingRef.current = false;
                        setIsSpeaking(false);

                        if (onSpeechEndRef.current) {
                            onSpeechEndRef.current();
                        }
                    }
                    speechStartTimeRef.current = null;
                    silenceStartTimeRef.current = null;
                }
            }
        }

        // Continue monitoring
        animationFrameRef.current = requestAnimationFrame(processAudio);
    }, [config.threshold, config.silenceDuration, config.minSpeechDuration]);

    // Start VAD monitoring
    const start = useCallback(async (callbacks = {}, deviceId = null) => {
        if (isEnabled) return true;

        onSpeechStartRef.current = callbacks.onSpeechStart || null;
        onSpeechEndRef.current = callbacks.onSpeechEnd || null;

        try {
            setError(null);

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

            // Set up audio context
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            analyserRef.current.smoothingTimeConstant = 0.5;
            source.connect(analyserRef.current);

            isEnabledRef.current = true;
            setIsEnabled(true);

            // Start processing after a small delay to ensure state is updated
            setTimeout(() => {
                animationFrameRef.current = requestAnimationFrame(processAudio);
            }, 50);

            return true;
        } catch (err) {
            console.error('Failed to start VAD:', err);
            setError(err.message);
            cleanup();
            return false;
        }
    }, [isEnabled, processAudio, cleanup]);

    // Stop VAD monitoring
    const stop = useCallback(() => {
        isEnabledRef.current = false;
        setIsEnabled(false);
        setIsSpeaking(false);
        setAudioLevel(0);
        isSpeakingRef.current = false;
        speechStartTimeRef.current = null;
        silenceStartTimeRef.current = null;
        cleanup();
    }, [cleanup]);

    // Get the current audio stream (for recording)
    const getStream = useCallback(() => {
        return streamRef.current;
    }, []);

    // Pause VAD processing (keeps stream alive but stops detection)
    const pause = useCallback(() => {
        isEnabledRef.current = false;
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        setAudioLevel(0);
    }, []);

    // Resume VAD processing
    const resume = useCallback(() => {
        if (!analyserRef.current || !streamRef.current) return;
        isEnabledRef.current = true;
        animationFrameRef.current = requestAnimationFrame(processAudio);
    }, [processAudio]);

    return {
        isEnabled,
        isSpeaking,
        audioLevel,
        error,
        start,
        stop,
        pause,
        resume,
        getStream
    };
}
