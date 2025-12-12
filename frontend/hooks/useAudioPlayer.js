// Audio playback hook for TTS output
// Handles playing, stopping, and interrupting audio

const { useState, useRef, useCallback, useEffect } = window.preact;

/**
 * Hook for playing audio blobs (TTS output)
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

    // Cleanup function
    const cleanup = useCallback(() => {
        if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
            updateIntervalRef.current = null;
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
        return cleanup;
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
    }, [cleanup]);

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

    // Get audio level for visualization (requires AudioContext)
    const getAudioLevel = useCallback(() => {
        // For simple visualization, we can estimate from time position
        // Real audio level would require AudioContext analysis
        return isPlaying ? 0.5 + Math.sin(currentTime * 10) * 0.3 : 0;
    }, [isPlaying, currentTime]);

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
        getAudioLevel
    };
}
