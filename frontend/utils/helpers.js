// Helper utilities

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
}

export function formatContextSize(size) {
    if (size >= 1000000) return `${(size / 1000000).toFixed(0)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(0)}K`;
    return size;
}

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}

// Markdown renderer with syntax highlighting
export function renderMarkdown(text) {
    let html = escapeHtml(text);

    // Code blocks with syntax highlighting
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
        let highlightedCode;
        try {
            if (lang && window.hljs?.getLanguage(lang)) {
                highlightedCode = window.hljs.highlight(code.trim(), { language: lang }).value;
            } else {
                highlightedCode = window.hljs?.highlightAuto(code.trim()).value || escapeHtml(code.trim());
            }
        } catch (e) {
            highlightedCode = escapeHtml(code.trim());
        }
        return `<div class="code-block"><div class="code-header">${langLabel}<button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div><code class="hljs">${highlightedCode}</code></div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    return html;
}

// Presets for generation
export const presets = {
    default: { temperature: 0.7, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 4096 },
    creative: { temperature: 1.0, topP: 0.95, topK: 50, repPenalty: 1.0, maxTokens: 4096 },
    precise: { temperature: 0.3, topP: 0.8, topK: 20, repPenalty: 1.05, maxTokens: 4096 },
    code: { temperature: 0.6, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 8192 }
};
