// Chat Messages component
const { html, useEffect, useRef, useState } = window.preact;
import { useStore } from '../hooks/useStore.js';
import { renderMarkdown, formatTime, parseThinkingContent, isStillThinking, getCurrentThinking } from '../utils/helpers.js';
import { UserIcon, SparklesIcon, InfoIcon, ChevronDownIcon } from './Icons.js';

export function ChatMessages() {
    const { messages, isGenerating, currentModel, isLoadingModel } = useStore(s => ({
        messages: s.messages,
        isGenerating: s.isGenerating,
        currentModel: s.currentModel,
        isLoadingModel: s.isLoadingModel
    }));

    const containerRef = useRef(null);
    const userScrolledRef = useRef(false);
    const lastScrollTopRef = useRef(0);

    // Track if user manually scrolled up
    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold

        // User scrolled up if scroll position decreased and not at bottom
        if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
            userScrolledRef.current = true;
        }
        // User scrolled back to bottom - re-enable auto-scroll
        if (isAtBottom) {
            userScrolledRef.current = false;
        }
        lastScrollTopRef.current = scrollTop;
    };

    // Auto-scroll to bottom only if user hasn't scrolled up
    useEffect(() => {
        if (containerRef.current && !userScrolledRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages]);

    // Reset scroll tracking when generation starts
    useEffect(() => {
        if (isGenerating) {
            userScrolledRef.current = false;
        }
    }, [isGenerating]);

    // Show loading overlay when model is loading
    if (isLoadingModel) {
        return html`
            <div class="chat-messages">
                <div class="model-loading-overlay">
                    <div class="model-loading-spinner"></div>
                    <div class="model-loading-text">Loading model...</div>
                    <div class="model-loading-hint">This may take a minute for large models</div>
                </div>
            </div>
        `;
    }

    if (messages.length === 0) {
        return html`<${EmptyState} />`;
    }

    return html`
        <div class="chat-messages" ref=${containerRef} onScroll=${handleScroll}>
            <div class="chat-messages-inner">
                ${messages.map((msg, idx) => html`
                    <${Message}
                        key=${idx}
                        role=${msg.role}
                        content=${msg.content}
                        modelName=${msg.modelName || currentModel?.name}
                        isLast=${idx === messages.length - 1}
                        isGenerating=${isGenerating && idx === messages.length - 1 && msg.role === 'assistant'}
                    />
                `)}
            </div>
        </div>
    `;
}

function Message({ role, content, modelName, isLast, isGenerating }) {
    const time = formatTime(new Date());
    const [thinkingExpanded, setThinkingExpanded] = useState(false);

    // Get display name based on role
    const getDisplayName = () => {
        if (role === 'user') return 'You';
        if (role === 'system') return 'System';
        // For assistant, show model name
        return modelName || 'Assistant';
    };

    // Get avatar icon
    const getAvatar = () => {
        if (role === 'user') return html`<${UserIcon} size=${16} />`;
        if (role === 'system') return html`<${InfoIcon} size=${16} />`;
        return html`<${SparklesIcon} size=${16} />`;
    };

    // For assistant messages, parse thinking blocks
    const renderAssistantContent = () => {
        if (!content) {
            return html`
                <div class="generating-indicator">
                    <div class="thinking-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span class="generating-text">Processing prompt...</span>
                </div>
            `;
        }

        // Check if currently thinking (unclosed think tag)
        const stillThinking = isStillThinking(content);
        const currentThinkingText = getCurrentThinking(content);

        // Parse completed thinking blocks and content
        const parts = parseThinkingContent(content);

        // If still in thinking phase, show the live thinking
        if (stillThinking && currentThinkingText !== null) {
            return html`
                <div class="thinking-block active">
                    <div class="thinking-header">
                        <div class="thinking-indicator">
                            <span class="thinking-pulse"></span>
                            <span>Thinking...</span>
                        </div>
                    </div>
                    <div class="thinking-content">
                        <pre>${currentThinkingText}</pre>
                    </div>
                </div>
            `;
        }

        // Render parsed parts
        return parts.map((part, idx) => {
            if (part.type === 'thinking') {
                return html`
                    <div class="thinking-block completed" key=${idx}>
                        <button
                            class="thinking-toggle ${thinkingExpanded ? 'expanded' : ''}"
                            onClick=${() => setThinkingExpanded(!thinkingExpanded)}
                        >
                            <${ChevronDownIcon} size=${14} />
                            <span>Thought process</span>
                            <span class="thinking-length">${part.text.length} chars</span>
                        </button>
                        ${thinkingExpanded && html`
                            <div class="thinking-content">
                                <pre>${part.text}</pre>
                            </div>
                        `}
                    </div>
                `;
            } else {
                return html`
                    <div
                        class="message-text"
                        key=${idx}
                        dangerouslySetInnerHTML=${{ __html: renderMarkdown(part.text) }}
                    ></div>
                `;
            }
        });
    };

    // User messages - escape HTML
    const renderUserContent = () => {
        return html`
            <div
                class="message-text"
                dangerouslySetInnerHTML=${{ __html: content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') }}
            ></div>
        `;
    };

    return html`
        <div class="message ${role}">
            <div class="message-avatar ${role}">
                ${getAvatar()}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-role">${getDisplayName()}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-bubble">
                    ${role === 'assistant' ? renderAssistantContent() : renderUserContent()}
                </div>
            </div>
        </div>
    `;
}

function EmptyState() {
    return html`
        <div class="chat-messages">
            <div class="empty-state">
                <pre class="empty-state-ascii">
    __  ___ __    _  __
   /  |/  // /   | |/ /
  / /|_/ // /    |   /
 / /  / // /___  /   |
/_/  /_//_____/ /_/|_|
                </pre>
                <h2>MLX Chat Server</h2>
                <p>Select a model to start chatting</p>
                <div class="empty-state-shortcuts">
                    <div class="shortcut">
                        <kbd>⌘</kbd><kbd>K</kbd>
                        <span>Select model</span>
                    </div>
                    <div class="shortcut">
                        <kbd>⌘</kbd><kbd>N</kbd>
                        <span>New chat</span>
                    </div>
                    <div class="shortcut">
                        <kbd>⌘</kbd><kbd>,</kbd>
                        <span>Settings</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}
