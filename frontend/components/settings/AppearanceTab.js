// Appearance Tab - Theme and UI settings
const { html } = window.preact;
import { useStore, actions } from '../../hooks/useStore.js';

export function AppearanceTab() {
    const { theme } = useStore(s => ({ theme: s.theme }));

    return html`
        <div class="settings-tab-content">
            <!-- Theme Selection -->
            <section class="settings-card">
                <h3 class="settings-card-title">Theme</h3>
                <p class="settings-card-desc">Choose your preferred color scheme</p>

                <div class="theme-options">
                    <button
                        class="theme-option-card ${theme === 'light' ? 'active' : ''}"
                        onClick=${() => actions.setTheme('light')}
                    >
                        <div class="theme-preview light">
                            <div class="theme-preview-header"></div>
                            <div class="theme-preview-content">
                                <div class="theme-preview-line"></div>
                                <div class="theme-preview-line short"></div>
                            </div>
                        </div>
                        <div class="theme-option-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="5"/>
                                <line x1="12" y1="1" x2="12" y2="3"/>
                                <line x1="12" y1="21" x2="12" y2="23"/>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                <line x1="1" y1="12" x2="3" y2="12"/>
                                <line x1="21" y1="12" x2="23" y2="12"/>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                            </svg>
                            Light
                        </div>
                    </button>

                    <button
                        class="theme-option-card ${theme === 'dark' ? 'active' : ''}"
                        onClick=${() => actions.setTheme('dark')}
                    >
                        <div class="theme-preview dark">
                            <div class="theme-preview-header"></div>
                            <div class="theme-preview-content">
                                <div class="theme-preview-line"></div>
                                <div class="theme-preview-line short"></div>
                            </div>
                        </div>
                        <div class="theme-option-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                            </svg>
                            Dark
                        </div>
                    </button>

                    <button
                        class="theme-option-card ${theme === 'system' ? 'active' : ''}"
                        onClick=${() => actions.setTheme('system')}
                    >
                        <div class="theme-preview system">
                            <div class="theme-preview-header"></div>
                            <div class="theme-preview-content">
                                <div class="theme-preview-line"></div>
                                <div class="theme-preview-line short"></div>
                            </div>
                        </div>
                        <div class="theme-option-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                            System
                        </div>
                    </button>

                    <button
                        class="theme-option-card ${theme === 'pink' ? 'active' : ''}"
                        onClick=${() => actions.setTheme('pink')}>
                    <div class="theme-preview pink">
                        <div class="theme-preview-header"></div>
                        <div class="theme-preview-content">
                            <div class="theme-preview-line"></div>
                            <div class="theme-preview-line short"></div>
                        </div>
                    </div>
                    <div class="theme-option-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="5"/>
                            <line x1="12" y1="1" x2="12" y2="3"/>
                            <line x1="12" y1="21" x2="12" y2="23"/>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                            <line x1="1" y1="12" x2="3" y2="12"/>
                            <line x1="21" y1="12" x2="23" y2="12"/>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                        </svg>
                        Pink
                    </div>
                </button>

                </div>
            </section>

            <!-- Keyboard Shortcuts -->
            <section class="settings-card">
                <h3 class="settings-card-title">Keyboard Shortcuts</h3>
                <p class="settings-card-desc">Quick actions for power users</p>

                <div class="shortcuts-list">
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>⌘</kbd><kbd>K</kbd>
                        </div>
                        <span class="shortcut-desc">Open model selector</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>⌘</kbd><kbd>N</kbd>
                        </div>
                        <span class="shortcut-desc">New chat</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>⌘</kbd><kbd>,</kbd>
                        </div>
                        <span class="shortcut-desc">Open settings</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>⌘</kbd><kbd>B</kbd>
                        </div>
                        <span class="shortcut-desc">Toggle chat history</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>⌘</kbd><kbd>D</kbd>
                        </div>
                        <span class="shortcut-desc">Open model browser</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>Enter</kbd>
                        </div>
                        <span class="shortcut-desc">Send message</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>Shift</kbd><kbd>Enter</kbd>
                        </div>
                        <span class="shortcut-desc">New line in message</span>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>Esc</kbd>
                        </div>
                        <span class="shortcut-desc">Close modal/panel</span>
                    </div>
                </div>
            </section>

            <!-- About -->
            <section class="settings-card">
                <h3 class="settings-card-title">About</h3>
                <div class="about-info">
                    <div class="about-row">
                        <span class="about-label">Version</span>
                        <span class="about-value">2.0.0</span>
                    </div>
                    <div class="about-row">
                        <span class="about-label">Backend</span>
                        <span class="about-value">mlx-omni-server + extensions</span>
                    </div>
                    <div class="about-row">
                        <span class="about-label">Framework</span>
                        <span class="about-value">Apple MLX</span>
                    </div>
                </div>
            </section>
        </div>
    `;
}
