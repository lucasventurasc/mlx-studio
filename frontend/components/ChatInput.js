// Chat Input component - Claude UI style with streaming stats
const { html, useState, useRef, useEffect, useCallback } = window.preact;
import { useStore, actions, showToast, getStore } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { SendIcon, ZapIcon, StopIcon, BrainIcon } from './Icons.js';

export function ChatInput() {
    const { currentModel, isGenerating, settings, currentChatId, chats, currentProfile } = useStore(s => ({
        currentModel: s.currentModel,
        isGenerating: s.isGenerating,
        settings: s.settings,
        currentChatId: s.currentChatId,
        chats: s.chats,
        currentProfile: s.currentProfile || 'balanced'
    }));

    const [value, setValue] = useState('');
    const [stats, setStats] = useState(null);
    const [liveStats, setLiveStats] = useState(null); // Real-time during generation
    const textareaRef = useRef(null);
    const abortControllerRef = useRef(null); // For cancelling streaming

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [value]);

    // Cancel streaming
    const handleCancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            actions.addLog('info', 'Generation cancelled by user');
            showToast('Generation cancelled');
        }
    }, []);

    // Global Esc key listener to cancel generation
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.key === 'Escape' && isGenerating) {
                e.preventDefault();
                handleCancel();
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isGenerating, handleCancel]);

    const handleSend = useCallback(async () => {
        const content = value.trim();
        if (!content || isGenerating) return;

        if (!currentModel) {
            showToast('Select a model first');
            actions.addLog('warn', 'Attempted to send message without model');
            return;
        }

        // Create abort controller for this request
        abortControllerRef.current = new AbortController();

        setValue('');
        setStats(null);
        setLiveStats({ tokens: 0, tps: 0, cache_hit: false, processing: true });
        actions.setIsGenerating(true);
        actions.addMessage({ role: 'user', content });
        actions.addLog('info', `Sending message (${content.length} chars)...`);

        // Keep focus on input after sending
        textareaRef.current?.focus();

        // Use setTimeout to ensure UI updates before blocking fetch
        await new Promise(resolve => setTimeout(resolve, 0));

        // Update chat name if first message
        const chat = chats.find(c => c.id === currentChatId);
        if (chat && chat.name === 'New Chat') {
            actions.updateChatName(currentChatId, content.substring(0, 30) + (content.length > 30 ? '...' : ''));
        }

        const startTime = Date.now();
        let responseText = '';
        let finalStats = { tokens: 0, tps: 0, cache_hit: false, ttft: null };
        let wasCancelled = false;
        let ttftRecorded = false;

        try {
            const store = getStore();
            // Filter out empty assistant messages (from previous failed generations)
            const messages = [...(store.messages || [])].filter(m =>
                !(m.role === 'assistant' && (!m.content || m.content.trim() === ''))
            );

            // Build system prompt
            let systemContent = settings.systemPrompt || '';

            // Only add system message if there's actual content
            const messagesWithSystem = systemContent.trim()
                ? [{ role: 'system', content: systemContent }, ...messages]
                : messages;

            // Debug: log what we're sending
            console.log('[ChatInput] Messages being sent:', messagesWithSystem);
            console.log('[ChatInput] Settings:', {
                maxTokens: settings.maxTokens,
                temperature: settings.temperature,
                topP: settings.topP,
                contextLength: settings.contextLength,
                profile: currentProfile
            });

            // Add placeholder for assistant response
            actions.addMessage({ role: 'assistant', content: '', modelName: currentModel.name });

            // Use local path if available, otherwise use model ID
            const modelPath = currentModel.path || currentModel.id;

            // Check if this is a Coder model (they have <think> token but it doesn't work properly)
            const isCoderModel = currentModel.name?.toLowerCase().includes('coder');

            if (settings.streamEnabled) {
                let firstChunk = true;
                let wasThinking = false;

                const doStreamRequest = async () => {
                    const requestBody = {
                        model: modelPath,
                        messages: messagesWithSystem,
                        temperature: settings.temperature ?? 0.7,
                        max_tokens: settings.maxTokens ?? 4096,
                        top_p: settings.topP ?? 0.9,
                        max_kv_size: settings.contextLength ?? 32768,
                        stream_options: { include_usage: true }
                    };

                    // For models that support thinking:
                    // - When enableThinking is true: don't send anything, let model use default behavior with <think> tags
                    // - When enableThinking is false: explicitly disable thinking to suppress <think> tags
                    if (currentModel.capabilities?.supports_thinking && !isCoderModel) {
                        if (!settings.enableThinking) {
                            requestBody.extra_body = { enable_thinking: false };
                        } else if (settings.thinkingBudget > 0) {
                            // Add thinking budget if set (limits reasoning length)
                            requestBody.extra_body = { thinking_budget: settings.thinkingBudget };
                        }
                    }

                    await endpoints.chatStream(requestBody,
                    // onChunk callback - receives content with <think> tags intact
                    (delta) => {
                        if (firstChunk) {
                            firstChunk = false;
                            // Record Time to First Token
                            if (!ttftRecorded) {
                                const ttft = Date.now() - startTime;
                                finalStats.ttft = ttft;
                                ttftRecorded = true;
                                setLiveStats(s => ({ ...s, processing: false, ttft }));
                                actions.addLog('info', `First token in ${(ttft / 1000).toFixed(2)}s`);
                            }
                        }
                        responseText += delta;
                        actions.updateLastMessage(responseText);
                    },
                    // onStats callback (real-time) - includes isThinking flag
                    (stats) => {
                        // Log when thinking starts
                        if (stats.isThinking && !wasThinking) {
                            actions.addLog('info', 'Model is thinking...');
                            wasThinking = true;
                        } else if (!stats.isThinking && wasThinking) {
                            actions.addLog('info', 'Model finished thinking, generating response...');
                            wasThinking = false;
                        }
                        setLiveStats({ ...stats, processing: false });
                        finalStats = stats;
                    },
                    // AbortSignal
                    abortControllerRef.current.signal);
                };

                // First request
                await doStreamRequest();

            } else {
                const requestBody = {
                    model: modelPath,
                    messages: messagesWithSystem,
                    temperature: settings.temperature ?? 0.7,
                    max_tokens: settings.maxTokens ?? 4096,
                    top_p: settings.topP ?? 0.9,
                    max_kv_size: settings.contextLength ?? 32768,
                    stream: false
                };

                // For models that support thinking:
                // - When enableThinking is true: don't send anything, let model use default behavior with <think> tags
                // - When enableThinking is false: explicitly disable thinking to suppress <think> tags
                if (currentModel.capabilities?.supports_thinking && !isCoderModel) {
                    if (!settings.enableThinking) {
                        requestBody.extra_body = { enable_thinking: false };
                    } else if (settings.thinkingBudget > 0) {
                        requestBody.extra_body = { thinking_budget: settings.thinkingBudget };
                    }
                }

                const result = await endpoints.chat(requestBody);
                responseText = result.choices[0].message.content;
                finalStats = {
                    tokens: result.usage?.completion_tokens || 0,
                    tps: result.usage?.tokens_per_second || 0,
                    cache_hit: result.usage?.cache_hit || false
                };
                actions.updateLastMessage(responseText);
            }

            const elapsed = (Date.now() - startTime) / 1000;
            setStats({
                tokens: finalStats.tokens,
                time: elapsed.toFixed(1),
                tps: finalStats.tps.toFixed(1),
                cache_hit: finalStats.cache_hit,
                ttft: finalStats.ttft
            });
            setLiveStats(null);

            // Record stats for performance monitoring
            actions.recordRequestStats({
                model: currentModel?.name,
                tokens: finalStats.tokens,
                tps: finalStats.tps,
                ttft: finalStats.ttft,
                duration: elapsed * 1000,
                cacheHit: finalStats.cache_hit
            });

            const ttftStr = finalStats.ttft ? ` TTFT: ${(finalStats.ttft / 1000).toFixed(2)}s` : '';
            actions.addLog('info', `Response: ${finalStats.tokens} tokens in ${elapsed.toFixed(1)}s (${finalStats.tps.toFixed(1)} tok/s)${finalStats.cache_hit ? ' [cache hit]' : ''}${ttftStr}`);

        } catch (error) {
            // Check if cancelled
            if (error.name === 'AbortError') {
                wasCancelled = true;
                // Keep partial response if any
                if (responseText) {
                    actions.updateLastMessage(responseText + '\n\n*[Generation cancelled]*');
                }
                const elapsed = (Date.now() - startTime) / 1000;
                setStats({
                    tokens: finalStats.tokens || liveStats?.tokens || 0,
                    time: elapsed.toFixed(1),
                    tps: (finalStats.tps || liveStats?.tps || 0).toFixed?.(1) || '0',
                    cache_hit: false,
                    cancelled: true
                });
            } else {
                actions.addLog('error', `Generation error: ${error.message}`);
                actions.updateLastMessage(`Error: ${error.message}\n\nMake sure the server is running.`);
            }
            setLiveStats(null);
        }

        abortControllerRef.current = null;
        actions.setIsGenerating(false);
        textareaRef.current?.focus();
    }, [value, currentModel, isGenerating, settings, currentChatId, chats, currentProfile, liveStats]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
        // Esc cancels generation
        if (e.key === 'Escape' && isGenerating) {
            e.preventDefault();
            handleCancel();
        }
    }, [handleSend, handleCancel, isGenerating]);

    const displayStats = liveStats || stats;

    return html`
        <div class="chat-input-container">
            <div class="chat-input-wrapper">
                <div class="chat-input-box">
                    <div class="chat-input-inner">
                        <textarea
                            ref=${textareaRef}
                            class="chat-input-field"
                            placeholder="Write here..."
                            value=${value}
                            onInput=${e => setValue(e.target.value)}
                            onKeyDown=${handleKeyDown}
                            rows="1"
                        />
                        <div class="chat-input-bottom">
                            <div class="chat-input-hints">
                                ${(() => {
                                    // Show reasoning toggle only for models that support it AND are not Coder models
                                    const supportsThinking = currentModel?.capabilities?.supports_thinking;
                                    const isCoderModel = currentModel?.name?.toLowerCase().includes('coder');
                                    const showToggle = supportsThinking && !isCoderModel;

                                    return showToggle && html`
                                        <button
                                            class="reasoning-toggle ${settings.enableThinking ? 'active' : ''}"
                                            onClick=${() => actions.updateSettings({ enableThinking: !settings.enableThinking })}
                                            title=${settings.enableThinking ? 'Reasoning enabled - click to disable' : 'Enable reasoning mode'}
                                        >
                                            <${BrainIcon} size=${14} />
                                            <span>Reasoning</span>
                                        </button>
                                    `;
                                })()}
                                <span><kbd>Enter</kbd> send</span>
                                <span><kbd>Shift + Enter</kbd> new line</span>
                            </div>
                            <div class="chat-input-right">
                                ${displayStats && html`
                                    <div class="chat-input-stats ${liveStats ? 'live' : ''}">
                                        ${displayStats.processing && html`
                                            <span class="stat-badge processing" title="Processing prompt...">
                                                <span class="processing-spinner"></span> processing
                                            </span>
                                        `}
                                        ${displayStats.isThinking && !displayStats.processing && html`
                                            <span class="stat-badge thinking" title="Model is thinking...">
                                                <span class="thinking-spinner"></span> thinking
                                            </span>
                                        `}
                                        ${displayStats.cache_hit && !displayStats.processing && html`
                                            <span class="stat-badge cache-hit" title="KV Cache Hit">
                                                <${ZapIcon} size=${12} /> cached
                                            </span>
                                        `}
                                        ${!displayStats.processing && html`
                                            <span class="stat-item">
                                                <strong>${displayStats.tokens || 0}</strong> tokens
                                            </span>
                                            <span class="stat-item">
                                                <strong>${displayStats.tps || liveStats?.tps?.toFixed(1) || '0'}</strong> tok/s
                                            </span>
                                        `}
                                        ${stats && html`
                                            <span class="stat-item">
                                                <strong>${stats.time}</strong>s
                                            </span>
                                        `}
                                        ${displayStats.ttft && html`
                                            <span class="stat-item ttft" title="Time to First Token">
                                                <strong>${(displayStats.ttft / 1000).toFixed(2)}</strong>s TTFT
                                            </span>
                                        `}
                                    </div>
                                `}
                                <div class="chat-input-actions">
                                    ${isGenerating ? html`
                                        <button
                                            class="chat-input-stop"
                                            onClick=${handleCancel}
                                            title="Stop generation (Esc)"
                                        >
                                            <${StopIcon} size=${18} />
                                        </button>
                                    ` : html`
                                        <button
                                            class="chat-input-send"
                                            onClick=${handleSend}
                                            disabled=${!currentModel || !value.trim()}
                                            title="Send message"
                                        >
                                            <${SendIcon} size=${18} />
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
