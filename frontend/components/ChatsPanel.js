// Chats Panel component
const { html } = window.preact;
import { useStore, actions } from '../hooks/useStore.js';
import { formatTime, escapeHtml } from '../utils/helpers.js';
import { ChatIcon, PlusIcon, XIcon } from './Icons.js';

export function ChatsPanel() {
    const { show, chats, currentChatId } = useStore(s => ({
        show: s.showChats,
        chats: s.chats,
        currentChatId: s.currentChatId
    }));

    return html`
        <aside class="panel panel-left ${show ? 'open' : ''}">
            <div class="panel-header">
                <span class="panel-title">Chats</span>
                <button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px; gap: 4px;" onClick=${actions.newChat}>
                    <${PlusIcon} size=${14} /> New
                </button>
            </div>
            <div class="panel-content">
                <div class="chats-list">
                    ${chats.map(chat => html`
                        <div
                            class="chat-item ${chat.id === currentChatId ? 'active' : ''}"
                            onClick=${() => actions.switchChat(chat.id)}
                        >
                            <span class="chat-item-icon"><${ChatIcon} size=${16} /></span>
                            <span class="chat-item-text">${escapeHtml(chat.name)}</span>
                            <span class="chat-item-time">${formatTime(chat.time)}</span>
                        </div>
                    `)}
                </div>
            </div>
        </aside>
    `;
}
