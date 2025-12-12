// Logs Panel component
const { html, useEffect, useRef } = window.preact;
import { useStore, actions } from '../hooks/useStore.js';
import { escapeHtml } from '../utils/helpers.js';

export function LogsPanel() {
    const { logs, logFilter } = useStore(s => ({
        logs: s.logs,
        logFilter: s.logFilter
    }));

    const contentRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [logs]);

    const filteredLogs = logFilter === 'all'
        ? logs
        : logs.filter(l => l.level === logFilter);

    const filters = ['all', 'info', 'warn', 'error'];

    return html`
        <div class="logs-panel">
            <div class="logs-header">
                <div class="logs-title">Server Logs</div>
                <div class="logs-filters">
                    ${filters.map(filter => html`
                        <button
                            class="log-filter ${logFilter === filter ? 'active' : ''}"
                            onClick=${() => actions.setLogFilter(filter)}
                        >
                            ${filter}
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
                    <div class="log-entry">
                        <span class="log-time">${log.timestamp}</span>
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-msg">${escapeHtml(log.message)}</span>
                    </div>
                `)}
            </div>
        </div>
    `;
}
