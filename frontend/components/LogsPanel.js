// Logs Panel component
const { html, useEffect, useRef, useState } = window.preact;
import { useStore, actions } from '../hooks/useStore.js';
import { escapeHtml } from '../utils/helpers.js';

export function LogsPanel() {
    const { logs, logFilter } = useStore(s => ({
        logs: s.logs,
        logFilter: s.logFilter
    }));

    const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'client', 'server'
    const contentRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [logs]);

    // Apply both level and source filters
    const filteredLogs = logs.filter(l => {
        const levelMatch = logFilter === 'all' || l.level === logFilter;
        const sourceMatch = sourceFilter === 'all' || l.source === sourceFilter;
        return levelMatch && sourceMatch;
    });

    const levelFilters = ['all', 'info', 'warn', 'error'];
    const sourceFilters = ['all', 'client', 'server'];

    return html`
        <div class="logs-panel">
            <div class="logs-header">
                <div class="logs-title">Logs</div>
                <div class="logs-filters">
                    ${levelFilters.map(filter => html`
                        <button
                            class="log-filter ${logFilter === filter ? 'active' : ''}"
                            onClick=${() => actions.setLogFilter(filter)}
                        >
                            ${filter}
                        </button>
                    `)}
                    <span class="filter-separator">|</span>
                    ${sourceFilters.map(filter => html`
                        <button
                            class="log-filter source ${sourceFilter === filter ? 'active' : ''}"
                            onClick=${() => setSourceFilter(filter)}
                        >
                            ${filter === 'server' ? '🖥' : filter === 'client' ? '💻' : '📋'} ${filter}
                        </button>
                    `)}
                </div>
                <button
                    class="log-filter"
                    style="margin-left: auto;"
                    onClick=${actions.clearLogs}
                >
                    clear
                </button>
            </div>
            <div class="logs-content" ref=${contentRef}>
                ${filteredLogs.map(log => html`
                    <div class="log-entry ${log.source || 'client'}">
                        <span class="log-time">${log.timestamp}</span>
                        <span class="log-source">${log.source === 'server' ? '🖥' : '💻'}</span>
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-msg">${escapeHtml(log.message)}</span>
                    </div>
                `)}
            </div>
        </div>
    `;
}
