// Network Modal component
const { html, useEffect, useCallback, useState } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints, api } from '../utils/api.js';
import { copyToClipboard } from '../utils/helpers.js';
import { XIcon, LockIcon, GlobeIcon, CopyIcon } from './Icons.js';

export function NetworkModal() {
    const { show, networkMode, networkAddresses } = useStore(s => ({
        show: s.showNetworkModal,
        networkMode: s.networkMode,
        networkAddresses: s.networkAddresses
    }));

    // Fetch network addresses when modal opens
    useEffect(() => {
        if (show) {
            fetchAddresses();
        }
    }, [show]);

    const fetchAddresses = useCallback(async () => {
        try {
            const data = await endpoints.network();
            actions.setNetworkAddresses(data.addresses || []);
        } catch (e) {
            actions.setNetworkAddresses([{ ip: '127.0.0.1', name: 'localhost' }]);
        }
    }, []);

    const setMode = useCallback(async (mode) => {
        actions.setNetworkMode(mode);

        try {
            await endpoints.config({ network_mode: mode });
        } catch (e) {}

        showToast(mode === 'network' ? 'Network access enabled' : 'Local only mode');
        actions.addLog('info', `Network mode: ${mode}`);
    }, []);

    const handleCopy = useCallback((addr) => {
        const port = api.base.split(':').pop().split('/')[0];
        copyToClipboard(`http://${addr.ip}:${port}/v1`);
        showToast('Copied to clipboard');
    }, []);

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            actions.closeNetworkModal();
        }
    }, []);

    if (!show) return null;

    const port = api.base.split(':').pop().split('/')[0];

    return html`
        <div class="modal-overlay" onClick=${handleOverlayClick}>
            <div class="modal">
                <div class="modal-header">
                    <span class="modal-title">Server Access</span>
                    <button class="modal-close" onClick=${actions.closeNetworkModal}><${XIcon} size=${18} /></button>
                </div>

                <div class="modal-body">
                    <div
                        class="network-option ${networkMode === 'local' ? 'active' : ''}"
                        onClick=${() => setMode('local')}
                    >
                        <div class="network-option-radio"></div>
                        <div class="network-option-info">
                            <div class="network-option-title" style="display: flex; align-items: center; gap: 8px;">
                                <${LockIcon} size=${16} /> Local Only
                            </div>
                            <div class="network-option-desc">
                                Server accessible only from this machine (localhost)
                            </div>
                        </div>
                    </div>

                    <div
                        class="network-option ${networkMode === 'network' ? 'active' : ''}"
                        onClick=${() => setMode('network')}
                    >
                        <div class="network-option-radio"></div>
                        <div class="network-option-info">
                            <div class="network-option-title" style="display: flex; align-items: center; gap: 8px;">
                                <${GlobeIcon} size=${16} /> Network Access
                            </div>
                            <div class="network-option-desc">
                                Allow connections from other devices on your network
                            </div>
                        </div>
                    </div>

                    ${networkMode === 'network' && html`
                        <div class="network-addresses">
                            <div class="network-addresses-title">Available Endpoints</div>
                            ${networkAddresses.map(addr => html`
                                <div class="network-address">
                                    <code>${addr.ip}:${port}/v1</code>
                                    <button
                                        class="btn btn-secondary"
                                        style="padding: 4px 8px; font-size: 10px; gap: 4px;"
                                        onClick=${() => handleCopy(addr)}
                                    >
                                        <${CopyIcon} size=${12} /> Copy
                                    </button>
                                </div>
                            `)}
                        </div>

                        <div class="network-warning">
                            <span style="font-size: 16px;">⚠</span>
                            <div>
                                Network access exposes your server to all devices on your local network.
                                Only enable this on trusted networks.
                            </div>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}
