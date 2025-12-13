// VoiceMode - Main voice conversation component
// Modern, professional voice interface with STT, Chat, and TTS

const { html, useState, useEffect, useRef, useCallback } = window.preact;
import { useStore, actions, getStore, showToast } from '../hooks/useStore.js';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { useAudioPlayer } from '../hooks/useAudioPlayer.js';
import { useVoiceActivity } from '../hooks/useVoiceActivity.js';
import { transcribeAudio, synthesizeSpeech } from '../utils/audioApi.js';
import { api } from '../utils/api.js';
import { VoiceOrb } from './voice/VoiceOrb.js';
import { VoiceSettings } from './voice/VoiceSettings.js';
import {
    XIcon,
    SettingsIcon,
    MicrophoneIcon,
    MicrophoneOffIcon,
    KeyboardIcon,
    TrashIcon
} from './Icons.js';

/**
 * VoiceMode Component
 * Full-screen voice conversation interface with modern design
 */
export function VoiceMode() {
    // Store state
    const {
        currentModel,
        voiceSettings,
        voiceMessages
    } = useStore(s => ({
        currentModel: s.currentModel,
        voiceSettings: s.voiceSettings,
        voiceMessages: s.voiceMessages || []
    }));

    // Local state
    const [voiceState, setVoiceState] = useState('idle'); // idle, listening, processing, speaking
    const [transcript, setTranscript] = useState('');
    const [lastResponse, setLastResponse] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [error, setError] = useState(null);

    // Refs
    const abortControllerRef = useRef(null);
    const isProcessingRef = useRef(false);

    // Audio hooks
    const recorder = useAudioRecorder();
    const player = useAudioPlayer();
    const vad = useVoiceActivity({
        threshold: voiceSettings?.vadThreshold || 0.3,
        silenceDuration: voiceSettings?.vadSilenceDuration || 2000
    });

    // Get current audio level for visualization
    const audioLevel = voiceState === 'listening' ? recorder.audioLevel :
                       voiceState === 'speaking' ? player.getAudioLevel() : 0;

    // Get frequency data for real-time visualization (only when speaking)
    const getFrequencyData = voiceState === 'speaking' ? player.getFrequencyData : null;

    // Handle transcription and chat
    const processAudio = useCallback(async (audioBlob) => {
        if (!audioBlob || isProcessingRef.current) return;

        isProcessingRef.current = true;
        setVoiceState('processing');
        setError(null);

        try {
            // Step 1: Transcribe audio (STT)
            const sttStart = performance.now();
            const sttLanguage = voiceSettings?.sttLanguage;
            const text = await transcribeAudio(audioBlob, {
                model: voiceSettings?.sttModel || 'mlx-community/whisper-large-v3-turbo',
                language: sttLanguage === 'auto' ? null : sttLanguage
            });
            console.log(`Voice: STT took ${(performance.now() - sttStart).toFixed(0)}ms`);

            if (!text || text.trim().length === 0) {
                setVoiceState('idle');
                isProcessingRef.current = false;
                return;
            }

            setTranscript(text);

            // Add user message to voice history
            actions.addVoiceMessage({ role: 'user', content: text });

            // Step 2: Build messages for chat
            const messages = [
                ...(voiceMessages || []),
                { role: 'user', content: text }
            ];

            // Add system prompt
            const voiceSystemPrompt = getStore().voiceSystemPrompt;
            if (voiceSystemPrompt) {
                messages.unshift({ role: 'system', content: voiceSystemPrompt });
            }

            // Use local path if available, otherwise use model ID (same as ChatInput)
            const modelPath = currentModel?.path || currentModel?.id;
            if (!modelPath) {
                setError('No model selected. Please select a model first.');
                setVoiceState('idle');
                isProcessingRef.current = false;
                return;
            }

            console.log('Voice: Sending to chat', {
                model: modelPath,
                messageCount: messages.length,
                systemPrompt: messages[0]?.role === 'system' ? messages[0].content : 'none',
                userMessage: text
            });
            console.log('Voice: Full messages:', JSON.stringify(messages, null, 2));
            abortControllerRef.current = new AbortController();

            const chatStart = performance.now();
            let responseText = '';
            let pendingText = '';  // Text waiting to be sent to TTS
            const audioQueue = []; // Queue of audio blobs to play
            const ttsTextQueue = []; // Queue of text chunks waiting for TTS
            let isPlayingQueue = false;
            let isProcessingTTS = false;
            let ttsEnabled = voiceSettings?.ttsEnabled !== false;

            const ttsOptions = {
                model: voiceSettings?.ttsModel || 'Marvis-AI/marvis-tts-250m-v0.1',
                voice: voiceSettings?.ttsVoice || 'conversational_a',
                speed: voiceSettings?.ttsSpeed || 1.0
            };

            // Process TTS queue sequentially (one at a time)
            const processTTSQueue = async () => {
                if (isProcessingTTS || ttsTextQueue.length === 0) return;
                isProcessingTTS = true;

                while (ttsTextQueue.length > 0) {
                    const sentence = ttsTextQueue.shift();
                    console.log('Voice: TTS processing:', sentence);
                    try {
                        const audioBlob = await synthesizeSpeech(sentence, ttsOptions);
                        if (audioBlob && audioBlob.size > 0) {
                            audioQueue.push(audioBlob);
                            playNextInQueue();  // Start playing if not already
                        }
                    } catch (err) {
                        console.error('Voice: TTS error for sentence:', err);
                    }
                }

                isProcessingTTS = false;
            };

            // Function to play audio queue sequentially
            const playNextInQueue = async () => {
                if (isPlayingQueue || audioQueue.length === 0) return;
                isPlayingQueue = true;

                // Pause VAD while playing to prevent feedback loop
                const inputMode = voiceSettings?.inputMode || 'ptt';
                if (inputMode === 'vad') {
                    vad.pause();
                    console.log('Voice: Paused VAD for TTS playback');
                }

                while (audioQueue.length > 0) {
                    const audioBlob = audioQueue.shift();
                    if (audioBlob && audioBlob.size > 0) {
                        await new Promise((resolve) => {
                            player.play(audioBlob, resolve);
                        });
                    }
                }

                isPlayingQueue = false;

                // Resume VAD after playback + small delay for echo to settle
                if (inputMode === 'vad') {
                    setTimeout(() => {
                        vad.resume();
                        console.log('Voice: Resumed VAD after TTS');
                    }, 300);
                }

                // Check if we're done (no more audio coming)
                if (audioQueue.length === 0 && ttsTextQueue.length === 0 && !isProcessingRef.current) {
                    setVoiceState('idle');
                }
            };

            // Queue text for TTS (processes in order)
            const sendToTTS = (sentence) => {
                if (!sentence.trim() || !ttsEnabled) return;
                if (sentence.length < 3) return;

                console.log('Voice: Queuing for TTS:', sentence);
                ttsTextQueue.push(sentence);
                processTTSQueue();  // Start processing if not already
            };

            // Stream response and send sentences to TTS as they complete
            if (ttsEnabled) {
                setVoiceState('speaking');
            }

            const doStreamRequest = async (enableTTS = true) => {
                await api.stream(
                    '/v1/chat/completions',
                    {
                        model: modelPath,
                        messages: messages,
                        max_tokens: 150,  // Keep voice responses SHORT
                        temperature: 0.7,
                        // Disable thinking mode for voice - we don't want to speak thoughts
                        extra_body: { enable_thinking: false }
                    },
                    (chunk) => {
                        responseText += chunk;
                        pendingText += chunk;

                        // Filter out <think>...</think> blocks from pending text
                        // Some models generate thinking even with enable_thinking: false
                        pendingText = pendingText.replace(/<think>[\s\S]*?<\/think>/g, '');
                        // Also handle unclosed think tags (still thinking)
                        if (pendingText.includes('<think>') && !pendingText.includes('</think>')) {
                            // Don't process until think block closes
                            const thinkStart = pendingText.indexOf('<think>');
                            pendingText = pendingText.slice(0, thinkStart);
                        }

                        // Show response (but filter thinking for display too)
                        const displayText = responseText
                            .replace(/<think>[\s\S]*?<\/think>/g, '')
                            .replace(/<think>[\s\S]*$/, ''); // Remove unclosed think
                        setLastResponse(displayText);

                        // If TTS disabled for this request, just accumulate
                        if (!enableTTS) return;

                        // Hybrid TTS chunking: prioritize punctuation, fallback to length
                        // This creates more natural speech breaks

                        // Check for sentence-ending punctuation (highest priority)
                        const sentenceMatch = pendingText.match(/^(.*?[.!?])\s*/);
                        if (sentenceMatch) {
                            const sentence = sentenceMatch[1].trim();
                            pendingText = pendingText.slice(sentenceMatch[0].length);
                            if (sentence.length > 3) {
                                sendToTTS(sentence);
                            }
                            return;
                        }

                        // Check for newline (also high priority)
                        const newlineIdx = pendingText.indexOf('\n');
                        if (newlineIdx > 3) {
                            const textBefore = pendingText.slice(0, newlineIdx).trim();
                            pendingText = pendingText.slice(newlineIdx + 1);
                            if (textBefore.length > 3) {
                                sendToTTS(textBefore);
                            }
                            return;
                        }

                        // Check for comma/colon/semicolon after reasonable length (medium priority)
                        if (pendingText.length > 20) {
                            const clauseMatch = pendingText.match(/^(.{15,}?[,;:])\s*/);
                            if (clauseMatch) {
                                const clause = clauseMatch[1].trim();
                                pendingText = pendingText.slice(clauseMatch[0].length);
                                if (clause.length > 5) {
                                    sendToTTS(clause);
                                }
                                return;
                            }
                        }

                        // Force break at word boundary if too long (lowest priority fallback)
                        if (pendingText.length > 120) {
                            const breakPoint = pendingText.lastIndexOf(' ', 100);
                            if (breakPoint > 30) {
                                const textToSend = pendingText.slice(0, breakPoint).trim();
                                pendingText = pendingText.slice(breakPoint + 1);
                                if (textToSend.length > 10) {
                                    sendToTTS(textToSend);
                                }
                            }
                        }
                    },
                    null,
                    abortControllerRef.current.signal
                );
            };

            // Stream the response with TTS enabled
            await doStreamRequest(true);

            // Send any remaining text to TTS
            if (pendingText.length > 5 && ttsEnabled) {
                console.log('Voice: TTS final chunk:', pendingText);
                try {
                    const audioBlob = await synthesizeSpeech(pendingText, ttsOptions);
                    if (audioBlob && audioBlob.size > 0) {
                        audioQueue.push(audioBlob);
                        playNextInQueue();
                    }
                } catch (err) {
                    console.error('Voice: TTS error:', err);
                }
            }

            console.log(`Voice: Chat took ${(performance.now() - chatStart).toFixed(0)}ms, response:`, responseText?.substring(0, 100));

            // Add assistant message to voice history
            actions.addVoiceMessage({ role: 'assistant', content: responseText });

            // If TTS disabled, resume VAD and go idle
            if (!ttsEnabled) {
                setVoiceState('idle');
                // Resume VAD for next input
                const inputMode = voiceSettings?.inputMode || 'ptt';
                if (inputMode === 'vad') {
                    vad.resume();
                }
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Voice processing error:', err);
                setError(err.message);
                showToast('Voice processing failed: ' + err.message);
            }
            setVoiceState('idle');
        } finally {
            isProcessingRef.current = false;
        }
    }, [currentModel, voiceSettings, voiceMessages, player, vad]);

    // Handle PTT start
    const handlePTTStart = useCallback(async () => {
        if (voiceState !== 'idle') {
            // Interrupt if speaking
            if (voiceState === 'speaking') {
                player.stop();
            }
            return;
        }

        setError(null);
        const deviceId = voiceSettings?.audioDeviceId || 'default';
        const started = await recorder.startRecording(deviceId);
        if (started) {
            setVoiceState('listening');
        }
    }, [voiceState, recorder, player, voiceSettings?.audioDeviceId]);

    // Handle PTT end
    const handlePTTEnd = useCallback(async () => {
        if (voiceState !== 'listening') return;

        const audioBlob = await recorder.stopRecording();
        if (audioBlob) {
            await processAudio(audioBlob);
        } else {
            setVoiceState('idle');
        }
    }, [voiceState, recorder, processAudio]);

    // Refs for VAD callbacks
    const processAudioRef = useRef(processAudio);
    processAudioRef.current = processAudio;

    // Refs for stable hook references (avoid re-running effects)
    const vadRef = useRef(vad);
    const recorderRef = useRef(recorder);
    const playerRef = useRef(player);
    vadRef.current = vad;
    recorderRef.current = recorder;
    playerRef.current = player;

    // Track if VAD has been started
    const vadStartedRef = useRef(false);

    // Handle VAD mode
    useEffect(() => {
        const inputMode = voiceSettings?.inputMode || 'ptt';
        if (inputMode !== 'vad') {
            // Clean up if switching away from VAD
            if (vadStartedRef.current) {
                vadRef.current.stop();
                recorderRef.current.cancelRecording();
                vadStartedRef.current = false;
            }
            return;
        }

        // Prevent multiple starts
        if (vadStartedRef.current) return;

        let isActive = true;
        let wasPlayingBeforeVAD = false;

        const startVAD = async () => {
            vadStartedRef.current = true;
            const deviceId = voiceSettings?.audioDeviceId || 'default';
            const started = await vadRef.current.start({
                onSpeechStart: async () => {
                    if (!isActive) return;
                    console.log('VAD: Speech started (recording in background)');
                    // Remember if TTS was playing - DON'T interrupt yet
                    wasPlayingBeforeVAD = playerRef.current.isPlaying;
                    // Start recording but don't change UI state yet
                    await recorderRef.current.startRecording(deviceId);
                },
                onSpeechEnd: async () => {
                    if (!isActive) return;
                    console.log('VAD: Speech ended, processing...');

                    // Pause VAD while we process to avoid multiple triggers
                    vadRef.current.pause();

                    const audioBlob = await recorderRef.current.stopRecording();

                    if (!audioBlob || audioBlob.size < 2000) {
                        // Too short, probably noise - ignore
                        console.log('VAD: Audio too short, ignoring', audioBlob?.size);
                        vadRef.current.resume();
                        return;
                    }

                    // NOW interrupt TTS if it was playing
                    if (wasPlayingBeforeVAD) {
                        console.log('VAD: Interrupting TTS for user speech');
                        playerRef.current.stop();
                    }

                    // Process audio (STT + LLM + TTS) - VAD will resume after TTS playback
                    setVoiceState('processing');
                    await processAudioRef.current(audioBlob);
                }
            }, deviceId);
            console.log('VAD started:', started);
        };

        startVAD();

        return () => {
            isActive = false;
            vadRef.current.stop();
            recorderRef.current.cancelRecording();
            vadStartedRef.current = false;
        };
    }, [voiceSettings?.inputMode]);

    // Refs for PTT handlers to avoid stale closures
    const handlePTTStartRef = useRef(handlePTTStart);
    const handlePTTEndRef = useRef(handlePTTEnd);
    handlePTTStartRef.current = handlePTTStart;
    handlePTTEndRef.current = handlePTTEnd;

    // Keyboard shortcuts (Spacebar for PTT)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && !e.repeat && !e.target.matches('input, textarea')) {
                e.preventDefault();
                handlePTTStartRef.current();
            }
            if (e.code === 'Escape') {
                recorder.cancelRecording();
                player.stop();
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
                setVoiceState('idle');
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                handlePTTEndRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [recorder, player]);

    // Close voice mode
    const handleClose = useCallback(() => {
        // Cleanup
        recorder.cancelRecording();
        player.stop();
        vad.stop();
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        actions.toggleVoiceMode();
    }, [recorder, player, vad]);

    // Clear conversation
    const handleClearHistory = useCallback(() => {
        console.log('Voice: Clearing history');
        actions.clearVoiceMessages();
        setTranscript('');
        setLastResponse('');
        console.log('Voice: History cleared');
    }, []);

    // Toggle input mode
    const handleToggleMode = useCallback((mode) => {
        actions.updateVoiceSettings({ inputMode: mode });

        // Stop current mode
        if (mode === 'vad') {
            recorder.cancelRecording();
        } else {
            vad.stop();
        }
        setVoiceState('idle');
    }, [recorder, vad]);

    const inputMode = voiceSettings?.inputMode || 'ptt';

    // Get mic level for VAD mode feedback
    const micLevel = inputMode === 'vad' ? vad.audioLevel : recorder.audioLevel;
    const micActive = inputMode === 'vad' ? vad.isEnabled : recorder.isRecording;

    return html`
        <div class="voice-mode">
            <!-- Background gradient -->
            <div class="voice-mode-bg"></div>

            <!-- Header -->
            <header class="voice-header">
                <div class="voice-header-left">
                    <div class="voice-logo">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="23"/>
                            <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                        <span>Voice Mode</span>
                    </div>
                    <div class="voice-status-badge ${micActive ? 'active' : ''} ${recorder.error || vad.error ? 'error' : ''}">
                        <span class="status-dot"></span>
                        ${recorder.error || vad.error ? 'Error' : micActive ? 'Active' : 'Ready'}
                    </div>
                </div>

                <div class="voice-header-right">
                    <button
                        class="voice-header-btn"
                        onClick=${handleClearHistory}
                        title="Clear conversation"
                    >
                        <${TrashIcon} size=${16} />
                    </button>
                    <button
                        class="voice-header-btn ${showSettings ? 'active' : ''}"
                        onClick=${() => setShowSettings(!showSettings)}
                        title="Settings"
                    >
                        <${SettingsIcon} size=${16} />
                    </button>
                    <button
                        class="voice-header-btn close"
                        onClick=${handleClose}
                        title="Close"
                    >
                        <${XIcon} size=${16} />
                    </button>
                </div>
            </header>

            <!-- Settings Panel -->
            ${showSettings && html`
                <${VoiceSettings}
                    settings=${voiceSettings}
                    onClose=${() => setShowSettings(false)}
                />
            `}

            <!-- Main Content -->
            <main class="voice-main">
                <!-- Visualizer Section -->
                <div class="voice-visualizer-section">
                    <${VoiceOrb}
                        state=${voiceState}
                        audioLevel=${audioLevel}
                        getFrequencyData=${getFrequencyData}
                        onClick=${inputMode === 'ptt' ? handlePTTStart : null}
                    />
                </div>

                <!-- Transcript Section -->
                <div class="voice-transcript-section">
                    <div class="voice-transcript-card">
                        <div class="transcript-header">
                            <span class="transcript-label">
                                ${voiceState === 'listening' ? 'Listening...' :
                                  voiceState === 'processing' ? 'Processing...' :
                                  voiceState === 'speaking' ? 'Response' : 'Transcript'}
                            </span>
                            ${voiceState !== 'idle' && html`
                                <div class="transcript-indicator">
                                    <span class="indicator-dot"></span>
                                    <span class="indicator-dot"></span>
                                    <span class="indicator-dot"></span>
                                </div>
                            `}
                        </div>
                        <div class="transcript-content ${!transcript && !lastResponse ? 'empty' : ''}">
                            ${voiceState === 'speaking' || lastResponse ?
                                lastResponse || 'Generating response...' :
                                transcript || 'Press and hold Space to speak...'}
                        </div>
                    </div>
                </div>

                <!-- Audio Level Bar -->
                <div class="voice-level-section">
                    <div class="level-bar-container">
                        <div class="level-bar-track">
                            <div class="level-bar-fill" style="width: ${Math.min(100, micLevel * 300)}%"></div>
                        </div>
                        <span class="level-label">${micLevel > 0.01 ? 'Audio detected' : 'No audio'}</span>
                    </div>
                </div>

                <!-- Error Display -->
                ${error && html`
                    <div class="voice-error-card">
                        <${MicrophoneOffIcon} size=${16} />
                        <span>${error}</span>
                    </div>
                `}

                <!-- Control Section -->
                <div class="voice-control-section">
                    ${inputMode === 'ptt' && html`
                        <button
                            class="voice-ptt-btn ${voiceState === 'listening' ? 'recording' : ''}"
                            onMouseDown=${handlePTTStart}
                            onMouseUp=${handlePTTEnd}
                            onMouseLeave=${voiceState === 'listening' ? handlePTTEnd : null}
                            onTouchStart=${handlePTTStart}
                            onTouchEnd=${handlePTTEnd}
                        >
                            <${MicrophoneIcon} size=${24} />
                            <span>${voiceState === 'listening' ? 'Release to send' : 'Hold to speak'}</span>
                        </button>
                    `}

                    <!-- Mode Toggle -->
                    <div class="voice-mode-switch">
                        <button
                            class="mode-switch-btn ${inputMode === 'ptt' ? 'active' : ''}"
                            onClick=${() => handleToggleMode('ptt')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="6" y="4" width="12" height="16" rx="2"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                            </svg>
                            Push-to-talk
                        </button>
                        <button
                            class="mode-switch-btn ${inputMode === 'vad' ? 'active' : ''}"
                            onClick=${() => handleToggleMode('vad')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            Auto-detect
                        </button>
                    </div>
                </div>
            </main>

            <!-- Conversation History -->
            ${voiceMessages.length > 0 && html`
                <aside class="voice-history">
                    <div class="history-header">
                        <span>Conversation</span>
                        <span class="history-count">${voiceMessages.length} messages</span>
                    </div>
                    <div class="history-list">
                        ${voiceMessages.slice(-8).map((msg, i) => html`
                            <div class="history-item ${msg.role}" key=${i}>
                                <div class="history-avatar">
                                    ${msg.role === 'user' ? html`
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                            <circle cx="12" cy="7" r="4"/>
                                        </svg>
                                    ` : html`
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                                        </svg>
                                    `}
                                </div>
                                <div class="history-content">
                                    ${msg.content.length > 120 ?
                                        msg.content.substring(0, 120) + '...' :
                                        msg.content}
                                </div>
                            </div>
                        `)}
                    </div>
                </aside>
            `}

            <!-- Footer -->
            <footer class="voice-footer">
                <div class="voice-shortcuts">
                    <div class="shortcut">
                        <kbd>Space</kbd>
                        <span>Hold to talk</span>
                    </div>
                    <div class="shortcut">
                        <kbd>Esc</kbd>
                        <span>Cancel</span>
                    </div>
                </div>
                <div class="voice-model-info">
                    ${currentModel?.id || 'No model selected'}
                </div>
            </footer>
        </div>
    `;
}
