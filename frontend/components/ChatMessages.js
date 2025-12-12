// Chat Messages component
const { html, useEffect, useRef } = window.preact;
import { useStore } from '../hooks/useStore.js';
import { renderMarkdown, formatTime } from '../utils/helpers.js';
import { UserIcon, SparklesIcon, InfoIcon } from './Icons.js';

export function ChatMessages() {
    const { messages, isGenerating, currentModel, isLoadingModel } = useStore(s => ({
        messages: s.messages,
        isGenerating: s.isGenerating,
        currentModel: s.currentModel,
        isLoadingModel: s.isLoadingModel
    }));

    const containerRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages]);

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
        <div class="chat-messages" ref=${containerRef}>
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

    const renderedContent = role === 'assistant'
        ? { __html: renderMarkdown(content) }
        : { __html: content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') };

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
                    ${isGenerating && !content ? html`
                        <div class="thinking-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    ` : html`
                        <div class="message-text" dangerouslySetInnerHTML=${renderedContent}></div>
                    `}
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
