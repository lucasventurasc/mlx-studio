// Model Comparator - Side by side comparison of model outputs
const { html, useState, useCallback, useEffect, useRef } = window.preact;
import { useStore, actions, showToast } from '../hooks/useStore.js';
import { endpoints } from '../utils/api.js';
import { XIcon, SendIcon, RefreshIcon } from './Icons.js';

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
    const textareaRef = useRef(null);

    // Initialize models when component opens
    useEffect(() => {
        if (show && models.length >= 2) {
            if (!modelA) setModelA(models[0]);
            if (!modelB && models.length >= 2) setModelB(models[1]);
        }
    }, [show, models]);

    const runComparison = useCallback(async () => {
        if (!prompt.trim() || !modelA || !modelB) {
            showToast('Enter a prompt and select both models');
            return;
        }

        // Reset results
        setResultA({ text: '', loading: true, stats: null });
        setResultB({ text: '', loading: true, stats: null });

        const messages = [{ role: 'user', content: prompt }];

        // Run both models in parallel
        const runModel = async (model, setResult) => {
            const startTime = Date.now();
            let fullText = '';

            try {
                await endpoints.chatStream({
                    model: model.id,
                    messages,
                    max_tokens: 1024,
                    stream: true
                },
                (delta) => {
                    fullText += delta;
                    setResult(r => ({ ...r, text: fullText }));
                },
                (stats) => {
                    setResult(r => ({ ...r, stats }));
                });

                const elapsed = (Date.now() - startTime) / 1000;
                setResult(r => ({
                    ...r,
                    loading: false,
                    stats: { ...r.stats, time: elapsed.toFixed(1) }
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
                            value=${modelA?.id || ''}
                            onChange=${e => setModelA(models.find(m => m.id === e.target.value))}
                            disabled=${isLoading}
                        >
                            <option value="">Select model...</option>
                            ${models.map(m => html`
                                <option key=${m.id} value=${m.id}>${m.name}</option>
                            `)}
                        </select>
                    </div>
                    <div class="comparator-model-select">
                        <label>Model B</label>
                        <select
                            value=${modelB?.id || ''}
                            onChange=${e => setModelB(models.find(m => m.id === e.target.value))}
                            disabled=${isLoading}
                        >
                            <option value="">Select model...</option>
                            ${models.map(m => html`
                                <option key=${m.id} value=${m.id}>${m.name}</option>
                            `)}
                        </select>
                    </div>
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
    return html`
        <div class="compare-result">
            <div class="compare-result-header">
                <span class="compare-result-title">${title}</span>
                ${result.stats && html`
                    <div class="compare-result-stats">
                        ${result.stats.tokens > 0 && html`
                            <span>${result.stats.tokens} tok</span>
                        `}
                        ${result.stats.tps > 0 && html`
                            <span>${result.stats.tps} tok/s</span>
                        `}
                        ${result.stats.time && html`
                            <span>${result.stats.time}s</span>
                        `}
                    </div>
                `}
            </div>
            <div class="compare-result-content">
                ${result.loading
                    ? html`<div class="compare-loading"><span class="loading-spinner"></span> Generating...</div>`
                    : result.text
                        ? html`<div class="compare-text">${result.text}</div>`
                        : html`<div class="compare-empty">Output will appear here</div>`
                }
            </div>
        </div>
    `;
}
