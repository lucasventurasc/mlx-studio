// Model Comparator - Side by side comparison of model outputs
const { html, useState, useCallback, useEffect, useRef } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { renderMarkdown } from '../utils/helpers.js';
import { XIcon, SendIcon, RefreshIcon, ZapIcon } from './Icons.js';

export function ModelComparator() {
    const { show, models, currentModel } = useStore(s => ({
        show: s.showModelComparator,
        models: s.models,
        currentModel: s.currentModel
    }));

    const [prompt, setPrompt] = useState('');
    const [modelA, setModelA] = useState(null);
    const [modelB, setModelB] = useState(null);
    const [resultA, setResultA] = useState({ text: '', loading: false, stats: null });
    const [resultB, setResultB] = useState({ text: '', loading: false, stats: null });
    const [loadedModels, setLoadedModels] = useState([]);
    const textareaRef = useRef(null);

    // Load list of loaded models when component opens
    useEffect(() => {
        if (show) {
            loadLoadedModels();
        }
    }, [show]);

    const loadLoadedModels = async () => {
        try {
            const data = await endpoints.loadedModels();
            const loaded = data.loaded || [];
            // Map loaded model IDs to full model info from models list
            const loadedWithInfo = loaded.map(l => {
                const fullModel = models.find(m => m.path === l.model_id || m.id === l.model_id);
                return fullModel || { id: l.model_id, name: l.model_id.split('/').pop(), path: l.model_id };
            });
            setLoadedModels(loadedWithInfo);

            // Auto-select first two loaded models
            if (loadedWithInfo.length >= 1 && !modelA) {
                setModelA(loadedWithInfo[0]);
            }
            if (loadedWithInfo.length >= 2 && !modelB) {
                setModelB(loadedWithInfo[1]);
            }
        } catch (e) {
            console.warn('Failed to load loaded models:', e);
            setLoadedModels([]);
        }
    };

    const runComparison = useCallback(async () => {
        if (!prompt.trim() || !modelA || !modelB) {
            showToast('Enter a prompt and select both models');
            return;
        }

        // Reset results
        setResultA({ text: '', loading: true, stats: { processing: true } });
        setResultB({ text: '', loading: true, stats: { processing: true } });

        const messages = [{ role: 'user', content: prompt }];

        // Run both models in parallel
        const runModel = async (model, setResult) => {
            const startTime = Date.now();
            let fullText = '';
            let firstChunk = true;

            try {
                // Use model.path for local models
                const modelPath = model.path || model.id;

                await endpoints.chatStream({
                    model: modelPath,
                    messages,
                    max_tokens: 2048,
                    temperature: 0.7,
                    stream_options: { include_usage: true }
                },
                (delta) => {
                    if (firstChunk) {
                        firstChunk = false;
                        setResult(r => ({ ...r, stats: { ...r.stats, processing: false } }));
                    }
                    fullText += delta;
                    setResult(r => ({ ...r, text: fullText }));
                },
                (stats) => {
                    setResult(r => ({ ...r, stats: { ...stats, processing: false } }));
                });

                const elapsed = (Date.now() - startTime) / 1000;
                setResult(r => ({
                    ...r,
                    loading: false,
                    stats: { ...r.stats, time: elapsed.toFixed(1), processing: false }
                }));
            } catch (error) {
                setResult({
                    text: `Error: ${error.message}`,
                    loading: false,
                    stats: null
                });
            }
        };

        // Run both in parallel
        await Promise.all([
            runModel(modelA, setResultA),
            runModel(modelB, setResultB)
        ]);
    }, [prompt, modelA, modelB]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            runComparison();
        }
    }, [runComparison]);

    const clearResults = useCallback(() => {
        setResultA({ text: '', loading: false, stats: null });
        setResultB({ text: '', loading: false, stats: null });
        setPrompt('');
    }, []);

    if (!show) return null;

    const isLoading = resultA.loading || resultB.loading;

    return html`
        <div class="modal-overlay" onClick=${() => actions.closeModelComparator()}>
            <div class="comparator-modal" onClick=${e => e.stopPropagation()}>
                <div class="comparator-header">
                    <h2>Model Comparator</h2>
                    <button class="btn-icon" onClick=${() => actions.closeModelComparator()}>
                        <${XIcon} size=${18} />
                    </button>
                </div>

                <div class="comparator-input">
                    <textarea
                        ref=${textareaRef}
                        class="comparator-prompt"
                        placeholder="Enter a prompt to compare model outputs..."
                        value=${prompt}
                        onInput=${e => setPrompt(e.target.value)}
                        onKeyDown=${handleKeyDown}
                        rows="3"
                        disabled=${isLoading}
                    />
                    <div class="comparator-actions">
                        <span class="hint"><kbd>⌘</kbd>+<kbd>Enter</kbd> to run</span>
                        <div class="comparator-buttons">
                            <button
                                class="btn btn-ghost"
                                onClick=${clearResults}
                                disabled=${isLoading}
                            >
                                <${RefreshIcon} size=${14} /> Clear
                            </button>
                            <button
                                class="btn btn-primary"
                                onClick=${runComparison}
                                disabled=${isLoading || !prompt.trim() || !modelA || !modelB}
                            >
                                <${SendIcon} size=${14} /> Compare
                            </button>
                        </div>
                    </div>
                </div>

                <div class="comparator-models">
                    <div class="comparator-model-select">
                        <label>Model A</label>
                        <select
                            value=${modelA?.path || modelA?.id || ''}
                            onChange=${e => setModelA(loadedModels.find(m => (m.path || m.id) === e.target.value))}
                            disabled=${isLoading}
                        >
                            <option value="">Select model...</option>
                            ${loadedModels.map(m => html`
                                <option key=${m.path || m.id} value=${m.path || m.id}>${m.name}</option>
                            `)}
                        </select>
                        ${loadedModels.length === 0 && html`
                            <span class="hint-error">No models loaded</span>
                        `}
                    </div>
                    <div class="comparator-model-select">
                        <label>Model B</label>
                        <select
                            value=${modelB?.path || modelB?.id || ''}
                            onChange=${e => setModelB(loadedModels.find(m => (m.path || m.id) === e.target.value))}
                            disabled=${isLoading}
                        >
                            <option value="">Select model...</option>
                            ${loadedModels.map(m => html`
                                <option key=${m.path || m.id} value=${m.path || m.id}>${m.name}</option>
                            `)}
                        </select>
                    </div>
                    <button
                        class="btn btn-ghost btn-sm"
                        onClick=${loadLoadedModels}
                        title="Refresh loaded models list"
                    >
                        <${RefreshIcon} size=${14} />
                    </button>
                </div>

                <div class="comparator-results">
                    <${CompareResult}
                        title=${modelA?.name || 'Model A'}
                        result=${resultA}
                    />
                    <${CompareResult}
                        title=${modelB?.name || 'Model B'}
                        result=${resultB}
                    />
                </div>
            </div>
        </div>
    `;
}

function CompareResult({ title, result }) {
    const stats = result.stats;
    const tpsDisplay = stats?.tps ? (typeof stats.tps === 'number' ? stats.tps.toFixed(1) : stats.tps) : '0';

    return html`
        <div class="compare-result">
            <div class="compare-result-header">
                <span class="compare-result-title">${title}</span>
                ${stats && html`
                    <div class="compare-result-stats">
                        ${stats.processing && html`
                            <span class="stat-badge processing">
                                <span class="processing-spinner"></span> processing
                            </span>
                        `}
                        ${stats.cache_hit && !stats.processing && html`
                            <span class="stat-badge cache-hit">
                                <${ZapIcon} size=${10} /> cached
                            </span>
                        `}
                        ${!stats.processing && html`
                            <span class="stat-item">
                                <strong>${stats.tokens || 0}</strong> tokens
                            </span>
                            <span class="stat-item">
                                <strong>${tpsDisplay}</strong> tok/s
                            </span>
                        `}
                        ${stats.time && !stats.processing && html`
                            <span class="stat-item">
                                <strong>${stats.time}</strong>s
                            </span>
                        `}
                    </div>
                `}
            </div>
            <div class="compare-result-content">
                ${result.loading && (!result.text)
                    ? html`<div class="compare-loading"><span class="loading-spinner"></span> Generating...</div>`
                    : result.text
                        ? html`<div class="compare-text" dangerouslySetInnerHTML=${{ __html: renderMarkdown(result.text) }}></div>`
                        : html`<div class="compare-empty">Output will appear here</div>`
                }
            </div>
        </div>
    `;
}
