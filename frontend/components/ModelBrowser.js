// Model Browser component - HuggingFace search and download
const { html, useState, useCallback, useEffect } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { formatNumber } from '../utils/helpers.js';
import { XIcon, DownloadIcon, ExternalLinkIcon, HeartIcon, SearchIcon, CheckIcon, FolderIcon } from './Icons.js';

export function ModelBrowser() {
    const { show } = useStore(s => ({
        show: s.showModelBrowser
    }));

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [localModels, setLocalModels] = useState([]);
    const [activeTab, setActiveTab] = useState('local');
    const [isSearching, setIsSearching] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({});

    // Load local models on mount and tab change
    useEffect(() => {
        if (show && activeTab === 'local') {
            loadLocalModels();
        }
    }, [show, activeTab]);

    const loadLocalModels = useCallback(async () => {
        try {
            const data = await endpoints.localModels();
            setLocalModels(data.models || []);
        } catch (e) {
            console.error('Failed to load local models:', e);
        }
    }, []);

    const handleSearch = useCallback(async () => {
        const query = searchQuery.trim() || 'mlx-community';
        setIsSearching(true);

        try {
            const data = await endpoints.hfSearch(query, 20);
            setSearchResults(data.results || []);
            actions.addLog('info', `Found ${data.results?.length || 0} models for "${query}"`);
        } catch (e) {
            actions.addLog('error', `HF search failed: ${e.message}`);
            showToast('Search failed. Check server logs.');
        }

        setIsSearching(false);
    }, [searchQuery]);

    const handleDownload = useCallback(async (repoId) => {
        setDownloadProgress(prev => ({
            ...prev,
            [repoId]: { status: 'starting' }
        }));

        try {
            await endpoints.hfDownload(repoId);
            showToast(`Download started: ${repoId}`);
            actions.addLog('info', `Started downloading ${repoId}`);

            // Start polling for progress
            pollDownloadProgress(repoId);
        } catch (e) {
            showToast(`Download failed: ${e.message}`);
            actions.addLog('error', `Download failed: ${e.message}`);
            setDownloadProgress(prev => ({
                ...prev,
                [repoId]: { status: 'error', message: e.message }
            }));
        }
    }, []);

    const pollDownloadProgress = useCallback(async (repoId) => {
        const poll = async () => {
            try {
                const data = await endpoints.hfDownloads();
                const progress = data.downloads?.[repoId];

                if (progress) {
                    setDownloadProgress(prev => ({
                        ...prev,
                        [repoId]: progress
                    }));

                    if (progress.status === 'downloading') {
                        setTimeout(poll, 2000);
                    } else if (progress.status === 'completed') {
                        showToast(`Downloaded: ${repoId}`);
                        actions.addLog('info', `Completed download: ${repoId}`);
                        // Refresh local models
                        loadLocalModels();
                    }
                } else {
                    setTimeout(poll, 2000);
                }
            } catch (e) {
                console.error('Poll error:', e);
            }
        };

        poll();
    }, [loadLocalModels]);

    const handleTabChange = useCallback((tab) => {
        setActiveTab(tab);
        if (tab === 'local') {
            loadLocalModels();
        }
    }, [loadLocalModels]);

    // Check if model is already downloaded
    const isDownloaded = useCallback((modelId) => {
        return localModels.some(m => m.id === modelId);
    }, [localModels]);

    return html`
        <aside class="panel panel-right model-browser ${show ? 'open' : ''}">
            <div class="panel-header" style="background: var(--bg-2);">
                <span class="panel-title">Models</span>
                <button class="panel-close" onClick=${actions.toggleModelBrowser}><${XIcon} size=${18} /></button>
            </div>

            <div class="browser-tabs">
                <button
                    class="browser-tab ${activeTab === 'local' ? 'active' : ''}"
                    onClick=${() => handleTabChange('local')}
                >
                    <${FolderIcon} size=${14} /> Local (${localModels.length})
                </button>
                <button
                    class="browser-tab ${activeTab === 'search' ? 'active' : ''}"
                    onClick=${() => handleTabChange('search')}
                >
                    <${SearchIcon} size=${14} /> Search HF
                </button>
            </div>

            <div class="panel-content">
                ${activeTab === 'local' ? html`
                    ${localModels.length === 0 ? html`
                        <div style="text-align: center; padding: 40px; color: var(--fg-2);">
                            <p>No local models found</p>
                            <p style="font-size: 11px; margin-top: 8px;">
                                Search and download models from HuggingFace
                            </p>
                        </div>
                    ` : html`
                        ${localModels.map(model => html`
                            <div class="model-card" key=${model.id}>
                                <div class="model-card-header">
                                    <div>
                                        <div class="model-card-name">${model.name}</div>
                                        <div class="model-card-author">${model.id.split('/')[0]}</div>
                                    </div>
                                </div>
                                <div class="model-card-stats">
                                    <span>${model.size}</span>
                                    ${model.quantization && html`
                                        <span class="model-tag quant">${model.quantization}</span>
                                    `}
                                </div>
                            </div>
                        `)}
                    `}
                ` : html`
                    <div class="browser-search" style="padding: 0 0 var(--space-3) 0; border: none;">
                        <input
                            type="text"
                            placeholder="Search MLX models..."
                            value=${searchQuery}
                            onInput=${e => setSearchQuery(e.target.value)}
                            onKeyDown=${e => e.key === 'Enter' && handleSearch()}
                        />
                        <button class="btn btn-primary" style="gap: 4px" onClick=${handleSearch} disabled=${isSearching}>
                            <${SearchIcon} size=${14} /> ${isSearching ? '...' : 'Search'}
                        </button>
                    </div>

                    ${isSearching ? html`
                        <div style="text-align: center; padding: 40px; color: var(--fg-2);">
                            Searching HuggingFace...
                        </div>
                    ` : searchResults.length === 0 ? html`
                        <div style="text-align: center; padding: 40px; color: var(--fg-2);">
                            <p>Search for MLX models on HuggingFace</p>
                            <p style="font-size: 11px; margin-top: 8px;">
                                Try: "Qwen", "Llama", "DeepSeek", "Mistral"
                            </p>
                        </div>
                    ` : html`
                        ${searchResults.map(model => html`
                            <${ModelCard}
                                key=${model.id}
                                model=${model}
                                progress=${downloadProgress[model.id]}
                                isDownloaded=${isDownloaded(model.id)}
                                onDownload=${() => handleDownload(model.id)}
                            />
                        `)}
                    `}
                `}
            </div>
        </aside>
    `;
}

function ModelCard({ model, progress, isDownloaded, onDownload }) {
    const isDownloading = progress?.status === 'downloading' || progress?.status === 'starting';

    return html`
        <div class="model-card">
            <div class="model-card-header">
                <div>
                    <div class="model-card-name">${model.name}</div>
                    <div class="model-card-author">by ${model.author}</div>
                </div>
            </div>

            <div class="model-card-stats">
                <span style="display: flex; align-items: center; gap: 4px;">
                    <${DownloadIcon} size=${12} /> ${formatNumber(model.downloads)}
                </span>
                <span style="display: flex; align-items: center; gap: 4px;">
                    <${HeartIcon} size=${12} /> ${formatNumber(model.likes)}
                </span>
            </div>

            <div class="model-card-tags">
                ${model.quantization && html`
                    <span class="model-tag quant">${model.quantization}</span>
                `}
                ${(model.tags || []).slice(0, 3).map(t => html`
                    <span class="model-tag">${t}</span>
                `)}
            </div>

            <div class="model-card-actions">
                <button
                    class="btn btn-secondary"
                    style="flex: 1; gap: 4px;"
                    onClick=${() => window.open(`https://huggingface.co/${model.id}`, '_blank')}
                >
                    <${ExternalLinkIcon} size=${14} /> View
                </button>
                ${isDownloaded ? html`
                    <button class="btn btn-success" style="flex: 1; gap: 4px;" disabled>
                        <${CheckIcon} size=${14} /> Downloaded
                    </button>
                ` : html`
                    <button
                        class="btn btn-primary"
                        style="flex: 1; gap: 4px;"
                        onClick=${onDownload}
                        disabled=${isDownloading}
                    >
                        <${DownloadIcon} size=${14} />
                        ${isDownloading ? 'Downloading...' : 'Download'}
                    </button>
                `}
            </div>

            ${progress && progress.status !== 'completed' && html`
                <div class="download-progress">
                    <div class="download-progress-bar">
                        <div
                            class="download-progress-fill ${progress.status === 'error' ? 'error' : ''}"
                            style="width: ${progress.status === 'completed' ? '100' : progress.status === 'error' ? '100' : '50'}%"
                        />
                    </div>
                    <div class="download-status ${progress.status}">
                        ${progress.status === 'completed' ? 'Download complete!' :
                          progress.status === 'error' ? `Error: ${progress.message}` :
                          progress.message || 'Downloading...'}
                    </div>
                </div>
            `}
        </div>
    `;
}
