// Chat Input component - Claude UI style with streaming stats
const { html, useState, useRef, useEffect, useCallback } = window.preact;
import { useStore, actions, showToast, getStore } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { SendIcon, ZapIcon, StopIcon } from './Icons.js';

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

        // Use setTimeout to ensure UI updates before blocking fetch
        await new Promise(resolve => setTimeout(resolve, 0));

        // Update chat name if first message
        const chat = chats.find(c => c.id === currentChatId);
        if (chat && chat.name === 'New Chat') {
            actions.updateChatName(currentChatId, content.substring(0, 30) + (content.length > 30 ? '...' : ''));
        }

        const startTime = Date.now();
        let responseText = '';
        let finalStats = { tokens: 0, tps: 0, cache_hit: false };
        let wasCancelled = false;

        try {
            const store = getStore();
            const messages = [...(store.messages || [])];

            const messagesWithSystem = settings.systemPrompt
                ? [{ role: 'system', content: settings.systemPrompt }, ...messages]
                : messages;

            // Debug: log settings being sent
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

            // Check if model supports thinking mode from model capabilities
            // Capabilities come from model config files (tokenizer_config.json has <think> token)
            let supportsThinking = false;
            if (currentModel.capabilities?.supports_thinking) {
                supportsThinking = true;
                console.log('[ChatInput] Model supports thinking mode:', currentModel.name);
            }

            if (settings.streamEnabled) {
                let firstChunk = true;
                const requestBody = {
                    model: modelPath,
                    messages: messagesWithSystem,
                    temperature: settings.temperature ?? 0.7,
                    max_tokens: settings.maxTokens ?? 4096,
                    top_p: settings.topP ?? 0.9,
                    max_kv_size: settings.contextLength ?? 32768,
                    stream_options: { include_usage: true }
                };

                // Add thinking mode for supported models
                if (supportsThinking) {
                    requestBody.extra_body = { enable_thinking: true };
                }

                await endpoints.chatStream(requestBody,
                // onChunk callback
                (delta) => {
                    if (firstChunk) {
                        firstChunk = false;
                        setLiveStats(s => ({ ...s, processing: false }));
                        actions.addLog('info', 'First token received, streaming...');
                    }
                    responseText += delta;
                    actions.updateLastMessage(responseText);
                },
                // onStats callback (real-time)
                (stats) => {
                    setLiveStats({ ...stats, processing: false });
                    finalStats = stats;
                },
                // AbortSignal
                abortControllerRef.current.signal);
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

                // Add thinking mode for supported models
                if (supportsThinking) {
                    requestBody.extra_body = { enable_thinking: true };
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
                cache_hit: finalStats.cache_hit
            });
            setLiveStats(null);
            actions.addLog('info', `Response: ${finalStats.tokens} tokens in ${elapsed.toFixed(1)}s (${finalStats.tps.toFixed(1)} tok/s)${finalStats.cache_hit ? ' [cache hit]' : ''}`);

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

    const disabled = isGenerating || !currentModel;
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
                            disabled=${isGenerating}
                        />
                        <div class="chat-input-bottom">
                            <div class="chat-input-hints">
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
