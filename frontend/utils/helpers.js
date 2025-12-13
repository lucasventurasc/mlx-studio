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

// Clean special tokens from model output
export function cleanModelOutput(text) {
    if (!text) return text;

    // Remove common special tokens that may leak through
    const specialTokens = [
        /<\|endoftext\|>/g,
        /<\|im_start\|>/g,
        /<\|im_end\|>/g,
        /<\|end\|>/g,
        /<\|eot_id\|>/g,
        /<\|start_header_id\|>.*?<\|end_header_id\|>/gs,
        /Human:/g,  // Leaked role markers
        /Assistant:/g,
    ];

    let cleaned = text;
    for (const token of specialTokens) {
        cleaned = cleaned.replace(token, '');
    }

    return cleaned.trim();
}

// Parse thinking blocks and regular content from response
export function parseThinkingContent(text) {
    // First clean any special tokens
    text = cleanModelOutput(text);

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
    if (!text) return false;
    const openTags = (text.match(/<think>/g) || []).length;
    const closeTags = (text.match(/<\/think>/g) || []).length;
    return openTags > closeTags;
}

// Get current thinking content (inside unclosed think tag)
export function getCurrentThinking(text) {
    if (!text) return null;
    const lastOpenIndex = text.lastIndexOf('<think>');
    if (lastOpenIndex === -1) return null;

    const afterOpen = text.slice(lastOpenIndex + 7);
    const closeIndex = afterOpen.indexOf('</think>');

    if (closeIndex === -1) {
        // Unclosed - still thinking
        return cleanModelOutput(afterOpen);
    }
    return null;
}

// Markdown renderer using marked.js with syntax highlighting
export function renderMarkdown(text) {
    // First, handle <markdown> tags - extract and process their content
    text = text.replace(/<markdown>([\s\S]*?)<\/markdown>/g, (match, content) => {
        return content;
    });

    // Configure marked
    if (window.marked) {
        // Custom renderer for code blocks with syntax highlighting
        const renderer = new window.marked.Renderer();

        renderer.code = function(code, language) {
            // Handle both old and new marked API
            const codeText = typeof code === 'object' ? code.text : code;
            const lang = typeof code === 'object' ? code.lang : language;

            const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
            let highlightedCode;
            try {
                if (lang && window.hljs?.getLanguage(lang)) {
                    highlightedCode = window.hljs.highlight(codeText, { language: lang }).value;
                } else if (window.hljs) {
                    highlightedCode = window.hljs.highlightAuto(codeText).value;
                } else {
                    highlightedCode = escapeHtml(codeText);
                }
            } catch (e) {
                highlightedCode = escapeHtml(codeText);
            }
            return `<div class="code-block"><div class="code-header">${langLabel}<button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div><code class="hljs">${highlightedCode}</code></div>`;
        };

        renderer.codespan = function(code) {
            const codeText = typeof code === 'object' ? code.text : code;
            return `<code class="inline-code">${escapeHtml(codeText)}</code>`;
        };

        renderer.link = function(href, title, text) {
            // Handle both old and new marked API
            const url = typeof href === 'object' ? href.href : href;
            const linkTitle = typeof href === 'object' ? href.title : title;
            const linkText = typeof href === 'object' ? href.text : text;

            const titleAttr = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"${titleAttr}>${linkText}</a>`;
        };

        window.marked.setOptions({
            renderer,
            gfm: true,        // GitHub Flavored Markdown (tables, strikethrough, etc.)
            breaks: true,     // Convert \n to <br>
            pedantic: false,
            sanitize: false,  // We trust model output
            smartypants: false
        });

        return window.marked.parse(text);
    }

    // Fallback if marked not loaded - basic escaping
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// Presets for generation
export const presets = {
    default: { temperature: 0.7, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 4096 },
    creative: { temperature: 1.0, topP: 0.95, topK: 50, repPenalty: 1.0, maxTokens: 4096 },
    precise: { temperature: 0.3, topP: 0.8, topK: 20, repPenalty: 1.05, maxTokens: 4096 },
    code: { temperature: 0.6, topP: 0.9, topK: 40, repPenalty: 1.0, maxTokens: 8192 }
};
