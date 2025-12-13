// Settings Modal - Main settings interface with tabs
const { html, useState, useEffect } = window.preact;
import { useStore, actions } from '../hooks/useStore.js';
import { InferenceTab } from './settings/InferenceTab.js';
import { RoutingTab } from './settings/RoutingTab.js';
import { AliasesTab } from './settings/AliasesTab.js';
import { CacheTab } from './settings/CacheTab.js';
import { AppearanceTab } from './settings/AppearanceTab.js';
import { RemotesTab } from './settings/RemotesTab.js';
import { GGUFTab } from './settings/GGUFTab.js';

const TABS = [
    { id: 'inference', label: 'Inference', icon: 'zap' },
    { id: 'routing', label: 'Model Routing', icon: 'git-branch' },
    { id: 'gguf', label: 'GGUF Backend', icon: 'cpu' },
    { id: 'aliases', label: 'Aliases', icon: 'tag' },
    { id: 'remotes', label: 'Remotes', icon: 'globe' },
    { id: 'cache', label: 'Cache', icon: 'database' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
];

export function SettingsModal() {
    const { showSettings } = useStore(s => ({ showSettings: s.showSettings }));
    const [activeTab, setActiveTab] = useState('inference');

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && showSettings) {
                actions.toggleSettings();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showSettings]);

    if (!showSettings) return null;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'inference': return html`<${InferenceTab} />`;
            case 'routing': return html`<${RoutingTab} />`;
            case 'aliases': return html`<${AliasesTab} />`;
            case 'remotes': return html`<${RemotesTab} />`;
            case 'cache': return html`<${CacheTab} />`;
            case 'appearance': return html`<${AppearanceTab} />`;
            case 'gguf': return html`<${GGUFTab} />`;
            default: return null;
        }
    };

    const getTabIcon = (icon) => {
        const icons = {
            'zap': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
            'git-branch': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
            'tag': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
            'globe': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
            'database': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
            'palette': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>`,
            'cpu': html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
        };
        return icons[icon] || null;
    };

    return html`
        <div class="settings-modal-overlay" onClick=${(e) => {
            if (e.target.classList.contains('settings-modal-overlay')) {
                actions.toggleSettings();
            }
        }}>
            <div class="settings-modal">
                <div class="settings-modal-header">
                    <h2>Settings</h2>
                    <button class="settings-modal-close" onClick=${() => actions.toggleSettings()}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                <div class="settings-modal-body">
                    <nav class="settings-tabs">
                        ${TABS.map(tab => html`
                            <button
                                key=${tab.id}
                                class="settings-tab ${activeTab === tab.id ? 'active' : ''}"
                                onClick=${() => setActiveTab(tab.id)}
                            >
                                ${getTabIcon(tab.icon)}
                                <span>${tab.label}</span>
                            </button>
                        `)}
                    </nav>

                    <div class="settings-content">
                        ${renderTabContent()}
                    </div>
                </div>
            </div>
        </div>
    `;
}
