// Audio playback hook for TTS output
// Handles playing, stopping, and interrupting audio with real-time frequency analysis

const { useState, useRef, useCallback, useEffect } = window.preact;

/**
 * Hook for playing audio blobs (TTS output)
 * Includes real-time FFT analysis for visualization
 * @returns {object} Playback state and controls
 */
export function useAudioPlayer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(null);

    const audioRef = useRef(null);
    const blobUrlRef = useRef(null);
    const onEndCallbackRef = useRef(null);
    const updateIntervalRef = useRef(null);

    // Web Audio API refs for frequency analysis
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const frequencyDataRef = useRef(null);

    // Get or create AudioContext
    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (required by browsers)
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
            updateIntervalRef.current = null;
        }
        if (sourceRef.current) {
            try {
                sourceRef.current.disconnect();
            } catch (e) {}
            sourceRef.current = null;
        }
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, [cleanup]);

    // Play audio from blob
    const play = useCallback(async (audioBlob, onEnd = null) => {
        if (!audioBlob) return false;

        try {
            setError(null);
            cleanup();

            // Create blob URL
            blobUrlRef.current = URL.createObjectURL(audioBlob);

            // Create audio element
            audioRef.current = new Audio(blobUrlRef.current);
            onEndCallbackRef.current = onEnd;

            // Set up Web Audio API for frequency analysis
            const audioContext = getAudioContext();

            // Create analyser node
            analyserRef.current = audioContext.createAnalyser();
            analyserRef.current.fftSize = 128; // 64 frequency bins
            analyserRef.current.smoothingTimeConstant = 0.8;

            // Create frequency data array
            frequencyDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

            // Set up event listeners
            audioRef.current.onloadedmetadata = () => {
                setDuration(audioRef.current.duration);
            };

            let hasEnded = false;

            audioRef.current.onended = () => {
                hasEnded = true;
                setIsPlaying(false);
                setCurrentTime(0);
                if (onEndCallbackRef.current) {
                    onEndCallbackRef.current();
                }
                cleanup();
            };

            audioRef.current.onerror = (e) => {
                // Ignore errors after playback ended (can happen during cleanup)
                if (hasEnded) return;

                const audio = e.target;
                const error = audio.error;
                console.error('Audio playback error:', {
                    errorCode: error?.code,
                    errorMessage: error?.message,
                    networkState: audio.networkState,
                    readyState: audio.readyState
                });
                setError('Failed to play audio');
                setIsPlaying(false);
                cleanup();
            };

            // Connect audio element to analyser
            audioRef.current.oncanplay = () => {
                if (!sourceRef.current && audioRef.current) {
                    try {
                        sourceRef.current = audioContext.createMediaElementSource(audioRef.current);
                        sourceRef.current.connect(analyserRef.current);
                        analyserRef.current.connect(audioContext.destination);
                    } catch (e) {
                        // Source might already be connected
                        console.log('Audio source already connected or error:', e.message);
                    }
                }
            };

            // Start playback
            await audioRef.current.play();
            setIsPlaying(true);

            // Update current time periodically
            updateIntervalRef.current = setInterval(() => {
                if (audioRef.current) {
                    setCurrentTime(audioRef.current.currentTime);
                }
            }, 100);

            return true;
        } catch (err) {
            console.error('Failed to play audio:', err);
            setError(err.message);
            cleanup();
            return false;
        }
    }, [cleanup, getAudioContext]);

    // Stop playback
    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPlaying(false);
        setCurrentTime(0);
        cleanup();
    }, [cleanup]);

    // Pause playback
    const pause = useCallback(() => {
        if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    }, [isPlaying]);

    // Resume playback
    const resume = useCallback(async () => {
        if (audioRef.current && !isPlaying) {
            try {
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (err) {
                console.error('Failed to resume:', err);
                setError(err.message);
            }
        }
    }, [isPlaying]);

    // Toggle play/pause
    const toggle = useCallback(async () => {
        if (isPlaying) {
            pause();
        } else {
            await resume();
        }
    }, [isPlaying, pause, resume]);

    // Get frequency data for visualization (real FFT analysis)
    const getFrequencyData = useCallback(() => {
        if (analyserRef.current && frequencyDataRef.current && isPlaying) {
            analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
            return frequencyDataRef.current;
        }
        return null;
    }, [isPlaying]);

    // Get audio level (average of frequencies)
    const getAudioLevel = useCallback(() => {
        const data = getFrequencyData();
        if (data) {
            const sum = data.reduce((a, b) => a + b, 0);
            return sum / (data.length * 255);
        }
        return 0;
    }, [getFrequencyData]);

    return {
        isPlaying,
        currentTime,
        duration,
        error,
        play,
        stop,
        pause,
        resume,
        toggle,
        getAudioLevel,
        getFrequencyData
    };
}
