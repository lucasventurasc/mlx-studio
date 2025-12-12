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

// Parse thinking blocks and regular content from response
export function parseThinkingContent(text) {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = thinkRegex.exec(text)) !== null) {
        // Add content before thinking block
        if (match.index > lastIndex) {
            const beforeContent = text.slice(lastIndex, match.index).trim();
            if (beforeContent) {
                parts.push({ type: 'content', text: beforeContent });
            }
        }
        // Add thinking block
        parts.push({ type: 'thinking', text: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining content after last thinking block
    if (lastIndex < text.length) {
        const afterContent = text.slice(lastIndex).trim();
        if (afterContent) {
            parts.push({ type: 'content', text: afterContent });
        }
    }

    // If no thinking blocks found, return whole text as content
    if (parts.length === 0 && text.trim()) {
        parts.push({ type: 'content', text: text });
    }

    return parts;
}

// Check if response is still in thinking phase (has unclosed think tag)
export function isStillThinking(text) {
    const openTags = (text.match(/<think>/g) || []).length;
    const closeTags = (text.match(/<\/think>/g) || []).length;
    return openTags > closeTags;
}

// Get current thinking content (inside unclosed think tag)
export function getCurrentThinking(text) {
    const lastOpenIndex = text.lastIndexOf('<think>');
    if (lastOpenIndex === -1) return null;

    const afterOpen = text.slice(lastOpenIndex + 7);
    const closeIndex = afterOpen.indexOf('</think>');

    if (closeIndex === -1) {
        // Unclosed - still thinking
        return afterOpen;
    }
    return null;
}

// Markdown renderer with syntax highlighting
export function renderMarkdown(text) {
    // First, handle <markdown> tags - extract and process their content
    text = text.replace(/<markdown>([\s\S]*?)<\/markdown>/g, (match, content) => {
        return content; // Just extract the content, it will be processed below
    });

    // Extract code blocks first to protect them from other processing
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
        codeBlocks.push({ lang, code: code.trim() });
        return placeholder;
    });

    let html = escapeHtml(text);

    // Restore code blocks with syntax highlighting
    html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const { lang, code } = codeBlocks[parseInt(index)];
        const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
        let highlightedCode;
        try {
            if (lang && window.hljs?.getLanguage(lang)) {
                highlightedCode = window.hljs.highlight(code, { language: lang }).value;
            } else {
                highlightedCode = window.hljs?.highlightAuto(code).value || escapeHtml(code);
            }
        } catch (e) {
            highlightedCode = escapeHtml(code);
        }
        return `<div class="code-block"><div class="code-header">${langLabel}<button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div><code class="hljs">${highlightedCode}</code></div>`;
    });

    // Headings (must be at start of line)
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');
    html = html.replace(/^\*\*\*+$/gm, '<hr>');

    // Unordered lists (- or *)
    // Process list items to proper <li> tags within <ul>
    html = html.replace(/(?:^|\n)((?:[-*] .+\n?)+)/gm, (match, listContent) => {
        const items = listContent.trim().split('\n').map(item => {
            const text = item.replace(/^[-*] /, '').trim();
            return `<li>${text}</li>`;
        }).join('');
        return `\n<ul>${items}</ul>\n`;
    });

    // Numbered lists
    html = html.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/gm, (match, listContent) => {
        const items = listContent.trim().split('\n').map(item => {
            const text = item.replace(/^\d+\. /, '').trim();
            return `<li>${text}</li>`;
        }).join('');
        return `\n<ol>${items}</ol>\n`;
    });

    // Inline code (after code blocks to avoid conflicts)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold (using ** or __)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (using * or _) - be careful not to match ** or __
    html = html.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Blockquotes (> at start of line)
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // Convert newlines to <br> for paragraph breaks
    // But not before or after block elements, and avoid double breaks
    html = html.replace(/\n\n+/g, '<br><br>'); // Multiple newlines to double break
    html = html.replace(/\n(?!<)/g, '<br>'); // Single newlines to single break

    // Clean up extra breaks around block elements
    html = html.replace(/<br>(<(?:ul|ol|h[1-6]|blockquote|hr|div))/g, '$1');
    html = html.replace(/(<\/(?:ul|ol|h[1-6]|blockquote|div)>)<br>/g, '$1');
    // Remove breaks at the very start
    html = html.replace(/^<br>/, '');

    return html;
}

// Presets for generation
export const presets = {
    default: { temperature: 0.7, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 4096 },
    creative: { temperature: 1.0, topP: 0.95, topK: 50, repPenalty: 1.0, maxTokens: 4096 },
    precise: { temperature: 0.3, topP: 0.8, topK: 20, repPenalty: 1.05, maxTokens: 4096 },
    code: { temperature: 0.6, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 8192 }
};
