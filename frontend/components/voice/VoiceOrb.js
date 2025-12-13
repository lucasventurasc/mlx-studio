// VoiceOrb - Real-time audio frequency visualizer for Voice Mode
// Uses FFT data to display actual audio frequencies

const { html, useEffect, useRef, useCallback } = window.preact;

/**
 * VoiceOrb Component
 * Visualizes real audio frequencies using FFT data
 *
 * @param {object} props
 * @param {string} props.state - Current state: 'idle', 'listening', 'processing', 'speaking'
 * @param {number} props.audioLevel - Audio level 0-1 for visualization (used for listening/processing)
 * @param {function} props.getFrequencyData - Function that returns FFT frequency data array
 * @param {function} props.onClick - Optional click handler
 */
export function VoiceOrb({ state = 'idle', audioLevel = 0, getFrequencyData = null, onClick }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const barsRef = useRef([]);
    const smoothedLevelRef = useRef(0);

    const barCount = 64;

    // Initialize bars
    useEffect(() => {
        barsRef.current = new Array(barCount).fill(0);
    }, []);

    // Get color based on state
    const getColor = useCallback(() => {
        switch (state) {
            case 'listening':
                return '#10b981'; // Green
            case 'processing':
                return '#f59e0b'; // Amber
            case 'speaking':
                return '#a855f7'; // Purple
            default:
                return '#3f3f46'; // Zinc-700
        }
    }, [state]);

    // Draw the visualization
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const color = getColor();
        const isActive = state !== 'idle';

        // Calculate bar dimensions
        const barWidth = 4;
        const barGap = 3;
        const totalBarWidth = barWidth + barGap;
        const totalWidth = barCount * totalBarWidth - barGap;
        const startX = (width - totalWidth) / 2;
        const maxHeight = 70;
        const minHeight = 2;

        // Get frequency data if available (speaking state)
        let frequencyData = null;
        if (getFrequencyData && state === 'speaking') {
            frequencyData = getFrequencyData();
        }

        // Update bars based on data source
        if (frequencyData && frequencyData.length > 0) {
            // Real FFT data - map frequency bins to bars
            const binCount = frequencyData.length;
            for (let i = 0; i < barCount; i++) {
                // Map bar index to frequency bin (with some overlap for smoother look)
                const binIndex = Math.floor((i / barCount) * binCount);
                const value = frequencyData[binIndex] / 255; // Normalize to 0-1

                // Smooth transition
                barsRef.current[i] += (value - barsRef.current[i]) * 0.4;
            }
        } else if (isActive && audioLevel > 0.01) {
            // Fallback: use audio level for listening/processing
            const targetLevel = audioLevel;
            smoothedLevelRef.current += (targetLevel - smoothedLevelRef.current) * 0.3;
            const level = smoothedLevelRef.current;

            for (let i = 0; i < barCount; i++) {
                const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
                const frequencyWeight = 1 - Math.pow(centerDist, 0.7);
                const randomness = 0.7 + Math.random() * 0.6;
                const target = level * frequencyWeight * randomness;

                barsRef.current[i] += (target - barsRef.current[i]) * 0.4;
            }
        } else {
            // Idle or no audio - decay to zero
            for (let i = 0; i < barCount; i++) {
                barsRef.current[i] *= 0.85;
                if (barsRef.current[i] < 0.01) barsRef.current[i] = 0;
            }
            smoothedLevelRef.current *= 0.9;
        }

        // Draw bars
        for (let i = 0; i < barCount; i++) {
            const x = startX + i * totalBarWidth;
            const barHeight = Math.max(minHeight, barsRef.current[i] * maxHeight);

            // Color intensity based on height
            const intensity = Math.min(1, barsRef.current[i] * 1.5);

            // Draw bar (from center, extends both up and down)
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.3 + intensity * 0.7;
            ctx.beginPath();
            ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        // Add glow effect when active with audio
        const avgLevel = barsRef.current.reduce((a, b) => a + b, 0) / barCount;
        if (isActive && avgLevel > 0.1) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 20 * avgLevel;

            // Redraw center bars with glow
            const glowStart = Math.floor(barCount * 0.25);
            const glowEnd = Math.ceil(barCount * 0.75);

            for (let i = glowStart; i < glowEnd; i++) {
                const x = startX + i * totalBarWidth;
                const barHeight = Math.max(minHeight, barsRef.current[i] * maxHeight);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;
        }

        // Processing state: scanning effect when no audio
        if (state === 'processing' && avgLevel < 0.05) {
            const time = Date.now() / 1000;
            const scanPos = (Math.sin(time * 3) + 1) / 2;
            const scanIndex = Math.floor(scanPos * barCount);

            for (let i = 0; i < barCount; i++) {
                const dist = Math.abs(i - scanIndex);
                if (dist < 6) {
                    const intensity = 1 - dist / 6;
                    const x = startX + i * totalBarWidth;
                    const barHeight = minHeight + intensity * 20;

                    ctx.fillStyle = color;
                    ctx.globalAlpha = intensity * 0.8;
                    ctx.beginPath();
                    ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        // Continue animation
        animationRef.current = requestAnimationFrame(draw);
    }, [state, audioLevel, getFrequencyData, getColor]);

    // Start/stop animation
    useEffect(() => {
        draw();
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [draw]);

    // Handle canvas resize for HiDPI
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const width = 420;
            const height = 120;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            canvas.getContext('2d').scale(dpr, dpr);
        }
    }, []);

    const color = getColor();

    return html`
        <div class="voice-visualizer minimal" onClick=${onClick}>
            <canvas
                ref=${canvasRef}
                class="voice-visualizer-canvas"
            />
            <div class="voice-visualizer-status voice-visualizer-status-${state}" style="--status-color: ${color}">
                ${state === 'idle' && html`<span>Ready</span>`}
                ${state === 'listening' && html`<span>Listening</span>`}
                ${state === 'processing' && html`<span>Processing</span>`}
                ${state === 'speaking' && html`<span>Speaking</span>`}
            </div>
        </div>
    `;
}
