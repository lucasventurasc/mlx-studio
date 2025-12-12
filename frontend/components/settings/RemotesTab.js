// Remotes Tab - Manage remote MLX Studio instances
const { html, useState, useEffect } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { InfoHint } from '../ui/Tooltip.js';

export function RemotesTab() {
    const [remotes, setRemotes] = useState([]);
    const [newRemote, setNewRemote] = useState({ name: '', url: '' });
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState({});

    useEffect(() => {
        loadRemotes();
    }, []);

    const loadRemotes = async () => {
        setLoading(true);
        try {
            const res = await endpoints.remotes?.() || { remotes: [] };
            setRemotes(res.remotes || []);
        } catch (e) {
            console.error('Failed to load remotes:', e);
            setRemotes([]);
        }
        setLoading(false);
    };

    const handleAddRemote = async () => {
        if (!newRemote.name.trim() || !newRemote.url.trim()) {
            showToast('Enter name and URL');
            return;
        }

        // Normalize URL
        let url = newRemote.url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }

        try {
            await endpoints.addRemote?.(newRemote.name.trim(), url);
            setNewRemote({ name: '', url: '' });
            showToast(`Remote "${newRemote.name}" added`);
            loadRemotes();
        } catch (e) {
            showToast('Failed to add remote');
        }
    };

    const handleDeleteRemote = async (name) => {
        if (!confirm(`Delete remote "${name}"?`)) return;
        try {
            await endpoints.deleteRemote?.(name);
            showToast(`Remote "${name}" deleted`);
            loadRemotes();
        } catch (e) {
            showToast('Failed to delete remote');
        }
    };

    const handleCheckHealth = async (name, url) => {
        setChecking(prev => ({ ...prev, [name]: true }));
        try {
            const res = await fetch(`${url}/health`, { method: 'GET', timeout: 5000 });
            if (res.ok) {
                showToast(`${name} is online`);
                setRemotes(prev => prev.map(r =>
                    r.name === name ? { ...r, status: 'online' } : r
                ));
            } else {
                throw new Error('Not healthy');
            }
        } catch (e) {
            showToast(`${name} is offline or unreachable`);
            setRemotes(prev => prev.map(r =>
                r.name === name ? { ...r, status: 'offline' } : r
            ));
        }
        setChecking(prev => ({ ...prev, [name]: false }));
    };

    const handleToggleEnabled = async (name, enabled) => {
        try {
            await endpoints.updateRemote?.(name, { enabled: !enabled });
            loadRemotes();
        } catch (e) {
            showToast('Failed to update remote');
        }
    };

    if (loading) {
        return html`<div class="settings-tab-content"><p class="loading-text">Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Info Card -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Remote Instances
                    <${InfoHint} text="Connect to other MLX Studio servers on your network. Use them in Model Routing to distribute load or access different models." />
                </h3>
                <p class="settings-card-desc">
                    Connect to other MLX Studio instances on your network for distributed inference.
                </p>
            </section>

            <!-- Add New Remote -->
            <section class="settings-card">
                <h3 class="settings-card-title">Add Remote Instance</h3>

                <div class="remote-form">
                    <div class="remote-form-row">
                        <input
                            type="text"
                            class="remote-input"
                            placeholder="Name (e.g. office-mac)"
                            value=${newRemote.name}
                            onInput=${e => setNewRemote({ ...newRemote, name: e.target.value })}
                        />
                        <input
                            type="text"
                            class="remote-input url"
                            placeholder="URL (e.g. 192.168.1.100:1234)"
                            value=${newRemote.url}
                            onInput=${e => setNewRemote({ ...newRemote, url: e.target.value })}
                            onKeyDown=${e => e.key === 'Enter' && handleAddRemote()}
                        />
                        <button
                            class="remote-add-btn"
                            onClick=${handleAddRemote}
                            disabled=${!newRemote.name.trim() || !newRemote.url.trim()}
                        >
                            Add
                        </button>
                    </div>
                </div>
            </section>

            <!-- Configured Remotes -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Configured Remotes
                    <span class="remote-count">(${remotes.length})</span>
                </h3>

                ${remotes.length === 0 ? html`
                    <div class="remotes-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        <p>No remote instances configured</p>
                        <p class="remotes-empty-hint">
                            Add a remote MLX Studio instance to use it in Model Routing.
                        </p>
                    </div>
                ` : html`
                    <div class="remotes-list">
                        ${remotes.map(remote => html`
                            <div key=${remote.name} class="remote-item ${remote.status || ''}">
                                <div class="remote-item-info">
                                    <div class="remote-item-header">
                                        <span class="remote-status-dot ${remote.status || 'unknown'}"></span>
                                        <span class="remote-item-name">${remote.name}</span>
                                        ${remote.enabled === false && html`
                                            <span class="remote-disabled-badge">disabled</span>
                                        `}
                                    </div>
                                    <code class="remote-item-url">${remote.url}</code>
                                </div>

                                <div class="remote-item-actions">
                                    <button
                                        class="remote-action-btn"
                                        onClick=${() => handleCheckHealth(remote.name, remote.url)}
                                        disabled=${checking[remote.name]}
                                        title="Check health"
                                    >
                                        ${checking[remote.name] ? html`
                                            <span class="spinner"></span>
                                        ` : html`
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                <polyline points="22 4 12 14.01 9 11.01"/>
                                            </svg>
                                        `}
                                    </button>

                                    <button
                                        class="remote-action-btn"
                                        onClick=${() => handleToggleEnabled(remote.name, remote.enabled !== false)}
                                        title=${remote.enabled === false ? 'Enable' : 'Disable'}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            ${remote.enabled === false ? html`
                                                <circle cx="12" cy="12" r="10"/>
                                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                            ` : html`
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                                <circle cx="12" cy="12" r="3"/>
                                            `}
                                        </svg>
                                    </button>

                                    <button
                                        class="remote-action-btn danger"
                                        onClick=${() => handleDeleteRemote(remote.name)}
                                        title="Delete"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"/>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `)}
                    </div>
                `}
            </section>

            <!-- Usage Guide -->
            <section class="settings-card">
                <h3 class="settings-card-title">How to Use</h3>
                <div class="usage-steps">
                    <div class="usage-step">
                        <div class="usage-step-num">1</div>
                        <div class="usage-step-text">
                            Start MLX Studio on another machine on your network
                        </div>
                    </div>
                    <div class="usage-step">
                        <div class="usage-step-num">2</div>
                        <div class="usage-step-text">
                            Add the remote instance here using its IP address and port
                        </div>
                    </div>
                    <div class="usage-step">
                        <div class="usage-step-num">3</div>
                        <div class="usage-step-text">
                            Go to Model Routing and select the remote as the source for a tier
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}
