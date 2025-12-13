// Stats Panel - Real-time model performance monitoring
const { html, useState, useEffect } = window.preact;
import { useStore, actions } from '../hooks/useStore.js';
import { XIcon, RefreshCwIcon, ZapIcon, ClockIcon, ActivityIcon, DatabaseIcon } from './Icons.js';

export function StatsPanel() {
    const { showStatsPanel, modelStats, currentModel } = useStore(s => ({
        showStatsPanel: s.showStatsPanel,
        modelStats: s.modelStats,
        currentModel: s.currentModel
    }));

    const [view, setView] = useState('summary'); // 'summary' | 'history' | 'chart'

    if (!showStatsPanel) return null;

    const { requests, sessionStart, totalTokens, totalRequests, cacheHits } = modelStats;

    // Calculate aggregated stats
    const sessionDuration = (Date.now() - sessionStart) / 1000 / 60; // minutes
    const recentRequests = requests.slice(-20);

    // Average TPS (only from requests with tps > 0)
    const tpsValues = recentRequests.filter(r => r.tps > 0).map(r => r.tps);
    const avgTps = tpsValues.length > 0
        ? (tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length).toFixed(1)
        : '—';
    const minTps = tpsValues.length > 0 ? Math.min(...tpsValues).toFixed(1) : '—';
    const maxTps = tpsValues.length > 0 ? Math.max(...tpsValues).toFixed(1) : '—';

    // Average TTFT
    const ttftValues = recentRequests.filter(r => r.ttft > 0).map(r => r.ttft);
    const avgTtft = ttftValues.length > 0
        ? (ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length / 1000).toFixed(2)
        : '—';
    const minTtft = ttftValues.length > 0 ? (Math.min(...ttftValues) / 1000).toFixed(2) : '—';
    const maxTtft = ttftValues.length > 0 ? (Math.max(...ttftValues) / 1000).toFixed(2) : '—';

    // Cache hit rate
    const cacheHitRate = totalRequests > 0
        ? ((cacheHits / totalRequests) * 100).toFixed(0)
        : '0';

    // Tokens per minute
    const tokensPerMin = sessionDuration > 0
        ? (totalTokens / sessionDuration).toFixed(0)
        : '0';

    return html`
        <div class="stats-panel">
            <div class="stats-panel-header">
                <h3>
                    <${ActivityIcon} size=${16} />
                    Performance Stats
                </h3>
                <div class="stats-panel-actions">
                    <button
                        class="stats-reset-btn"
                        onClick=${() => actions.resetStats()}
                        title="Reset stats"
                    >
                        <${RefreshCwIcon} size=${14} />
                    </button>
                    <button
                        class="stats-close-btn"
                        onClick=${() => actions.toggleStatsPanel()}
                    >
                        <${XIcon} size=${16} />
                    </button>
                </div>
            </div>

            <div class="stats-panel-tabs">
                <button
                    class=${view === 'summary' ? 'active' : ''}
                    onClick=${() => setView('summary')}
                >Summary</button>
                <button
                    class=${view === 'history' ? 'active' : ''}
                    onClick=${() => setView('history')}
                >History</button>
            </div>

            ${view === 'summary' && html`
                <div class="stats-summary">
                    <div class="stats-model-info">
                        <span class="stats-model-name">${currentModel?.name || 'No model loaded'}</span>
                        <span class="stats-session-time">${sessionDuration.toFixed(0)}m session</span>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card primary">
                            <div class="stat-icon"><${ZapIcon} size=${18} /></div>
                            <div class="stat-content">
                                <div class="stat-value">${avgTps}</div>
                                <div class="stat-label">Avg tok/s</div>
                                <div class="stat-range">${minTps} – ${maxTps}</div>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-icon"><${ClockIcon} size=${18} /></div>
                            <div class="stat-content">
                                <div class="stat-value">${avgTtft}s</div>
                                <div class="stat-label">Avg TTFT</div>
                                <div class="stat-range">${minTtft}s – ${maxTtft}s</div>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-icon"><${DatabaseIcon} size=${18} /></div>
                            <div class="stat-content">
                                <div class="stat-value">${cacheHitRate}%</div>
                                <div class="stat-label">Cache Hit</div>
                                <div class="stat-range">${cacheHits}/${totalRequests} requests</div>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-icon"><${ActivityIcon} size=${18} /></div>
                            <div class="stat-content">
                                <div class="stat-value">${formatNumber(totalTokens)}</div>
                                <div class="stat-label">Total Tokens</div>
                                <div class="stat-range">${tokensPerMin}/min avg</div>
                            </div>
                        </div>
                    </div>

                    ${recentRequests.length > 0 && html`
                        <div class="stats-sparkline">
                            <div class="sparkline-label">Recent TPS</div>
                            <div class="sparkline-chart">
                                ${recentRequests.slice(-15).map((r, i) => {
                                    const maxVal = Math.max(...recentRequests.slice(-15).map(x => x.tps)) || 1;
                                    const height = (r.tps / maxVal) * 100;
                                    return html`
                                        <div
                                            class="sparkline-bar ${r.cacheHit ? 'cache-hit' : ''}"
                                            style="height: ${Math.max(height, 5)}%"
                                            title="${r.tps.toFixed(1)} tok/s${r.cacheHit ? ' (cached)' : ''}"
                                        ></div>
                                    `;
                                })}
                            </div>
                        </div>
                    `}
                </div>
            `}

            ${view === 'history' && html`
                <div class="stats-history">
                    ${requests.length === 0 && html`
                        <div class="stats-empty">No requests yet</div>
                    `}
                    <div class="stats-history-list">
                        ${[...requests].reverse().slice(0, 50).map((r, i) => html`
                            <div class="stats-history-item" key=${i}>
                                <div class="history-time">
                                    ${new Date(r.timestamp).toLocaleTimeString()}
                                </div>
                                <div class="history-model">${r.model}</div>
                                <div class="history-metrics">
                                    <span class="metric">${r.tokens} tok</span>
                                    <span class="metric highlight">${r.tps.toFixed(1)} tok/s</span>
                                    ${r.ttft && html`<span class="metric">${(r.ttft/1000).toFixed(2)}s TTFT</span>`}
                                    ${r.cacheHit && html`<span class="metric cache"><${ZapIcon} size=${10} /> cached</span>`}
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            `}
        </div>
    `;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}
