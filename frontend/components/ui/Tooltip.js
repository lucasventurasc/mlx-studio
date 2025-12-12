// Tooltip component with hover hints
const { html, useState, useRef, useEffect } = window.preact;

/**
 * Tooltip component - shows hint text on hover
 *
 * Usage:
 *   <Tooltip text="This is a helpful hint">
 *     <InfoIcon size={14} />
 *   </Tooltip>
 *
 *   <Tooltip text="Longer explanation" position="bottom">
 *     <span>Hover me</span>
 *   </Tooltip>
 */
export function Tooltip({ text, position = 'top', delay = 300, children }) {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const triggerRef = useRef(null);
    const timeoutRef = useRef(null);

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setCoords({
                    x: rect.left + rect.width / 2,
                    y: position === 'top' ? rect.top : rect.bottom
                });
            }
            setVisible(true);
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return html`
        <span
            class="tooltip-trigger"
            ref=${triggerRef}
            onMouseEnter=${showTooltip}
            onMouseLeave=${hideTooltip}
            onFocus=${showTooltip}
            onBlur=${hideTooltip}
        >
            ${children}
            ${visible && html`
                <div
                    class="tooltip tooltip-${position}"
                    style=${{
                        left: `${coords.x}px`,
                        top: position === 'top' ? `${coords.y}px` : `${coords.y}px`
                    }}
                >
                    <div class="tooltip-content">${text}</div>
                    <div class="tooltip-arrow"></div>
                </div>
            `}
        </span>
    `;
}

/**
 * InfoHint - Tooltip with info icon, commonly used next to labels
 *
 * Usage:
 *   <label>Temperature <InfoHint text="Controls randomness" /></label>
 */
export function InfoHint({ text, position = 'top' }) {
    return html`
        <${Tooltip} text=${text} position=${position}>
            <span class="info-hint-icon" tabindex="0" role="button" aria-label="More info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            </span>
        <//>
    `;
}

/**
 * SettingLabel - Label with optional hint tooltip
 *
 * Usage:
 *   <SettingLabel label="Temperature" hint="Controls randomness" />
 */
export function SettingLabel({ label, hint, htmlFor }) {
    return html`
        <label class="setting-label" for=${htmlFor}>
            <span>${label}</span>
            ${hint && html`<${InfoHint} text=${hint} />`}
        </label>
    `;
}
