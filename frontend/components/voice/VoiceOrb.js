// VoiceOrb - Animated visualization component for Voice Mode
// Displays a pulsing orb that responds to voice state and audio levels

const { html, useState, useEffect, useRef, useCallback } = window.preact;

/**
 * VoiceOrb Component
 * A Jarvis-style animated orb visualization
 *
 * @param {object} props
 * @param {string} props.state - Current state: 'idle', 'listening', 'processing', 'speaking'
 * @param {number} props.audioLevel - Audio level 0-1 for visualization
 * @param {function} props.onClick - Optional click handler
 */
export function VoiceOrb({ state = 'idle', audioLevel = 0, onClick }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const phaseRef = useRef(0);

    // Animation parameters based on state
    const getStateParams = useCallback(() => {
        switch (state) {
            case 'listening':
                return {
                    baseRadius: 80,
                    pulseAmount: 30,
                    pulseSpeed: 0.05,
                    glowIntensity: 1.0,
                    color: { h: 200, s: 100, l: 50 }, // Blue
                    waveCount: 6,
                    waveAmplitude: 15 + audioLevel * 40
                };
            case 'processing':
                return {
                    baseRadius: 70,
                    pulseAmount: 20,
                    pulseSpeed: 0.15,
                    glowIntensity: 0.8,
                    color: { h: 45, s: 100, l: 50 }, // Orange/Yellow
                    waveCount: 8,
                    waveAmplitude: 10
                };
            case 'speaking':
                return {
                    baseRadius: 85,
                    pulseAmount: 25,
                    pulseSpeed: 0.08,
                    glowIntensity: 1.0,
                    color: { h: 280, s: 80, l: 55 }, // Purple
                    waveCount: 5,
                    waveAmplitude: 12 + audioLevel * 30
                };
            default: // idle
                return {
                    baseRadius: 60,
                    pulseAmount: 10,
                    pulseSpeed: 0.02,
                    glowIntensity: 0.4,
                    color: { h: 200, s: 60, l: 45 }, // Muted blue
                    waveCount: 4,
                    waveAmplitude: 5
                };
        }
    }, [state, audioLevel]);

    // Draw the orb
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const params = getStateParams();
        phaseRef.current += params.pulseSpeed;

        // Calculate current radius with pulse
        const pulse = Math.sin(phaseRef.current) * params.pulseAmount;
        const currentRadius = params.baseRadius + pulse + (audioLevel * 20);

        // Draw outer glow
        const glowGradient = ctx.createRadialGradient(
            centerX, centerY, currentRadius * 0.8,
            centerX, centerY, currentRadius * 2
        );
        glowGradient.addColorStop(0, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l}%, ${params.glowIntensity * 0.3})`);
        glowGradient.addColorStop(0.5, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l}%, ${params.glowIntensity * 0.1})`);
        glowGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw waveform ring (when active)
        if (state !== 'idle') {
            ctx.strokeStyle = `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l}%, 0.4)`;
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i <= 360; i++) {
                const angle = (i * Math.PI) / 180;
                const waveOffset = Math.sin(angle * params.waveCount + phaseRef.current * 3) * params.waveAmplitude;
                const r = currentRadius + 20 + waveOffset;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Draw main orb gradient
        const orbGradient = ctx.createRadialGradient(
            centerX - currentRadius * 0.3, centerY - currentRadius * 0.3, 0,
            centerX, centerY, currentRadius
        );
        orbGradient.addColorStop(0, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l + 20}%, 0.9)`);
        orbGradient.addColorStop(0.5, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l}%, 0.8)`);
        orbGradient.addColorStop(1, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l - 10}%, 0.7)`);

        ctx.fillStyle = orbGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw inner highlight
        const highlightGradient = ctx.createRadialGradient(
            centerX - currentRadius * 0.3, centerY - currentRadius * 0.3, 0,
            centerX, centerY, currentRadius * 0.8
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        highlightGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw audio level indicator bars (when listening or speaking)
        if ((state === 'listening' || state === 'speaking') && audioLevel > 0.01) {
            const barCount = 12;
            const barWidth = 4;
            const maxBarHeight = 40;

            ctx.save();
            ctx.translate(centerX, centerY);

            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const variation = Math.sin(phaseRef.current * 2 + i * 0.5);
                const barHeight = (audioLevel + variation * 0.2) * maxBarHeight;

                ctx.save();
                ctx.rotate(angle);
                ctx.translate(0, -currentRadius - 35);

                const barGradient = ctx.createLinearGradient(0, 0, 0, -barHeight);
                barGradient.addColorStop(0, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l}%, 0.8)`);
                barGradient.addColorStop(1, `hsla(${params.color.h}, ${params.color.s}%, ${params.color.l + 10}%, 0.4)`);

                ctx.fillStyle = barGradient;
                ctx.fillRect(-barWidth / 2, 0, barWidth, -Math.max(2, barHeight));

                ctx.restore();
            }

            ctx.restore();
        }

        // Continue animation
        animationRef.current = requestAnimationFrame(draw);
    }, [state, audioLevel, getStateParams]);

    // Start/stop animation
    useEffect(() => {
        draw();
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [draw]);

    // Handle canvas resize
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const size = 300;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            canvas.getContext('2d').scale(dpr, dpr);
        }
    }, []);

    return html`
        <div class="voice-orb-container" onClick=${onClick}>
            <canvas
                ref=${canvasRef}
                class="voice-orb-canvas"
                width="300"
                height="300"
            />
            <div class="voice-orb-state voice-orb-state-${state}">
                ${state === 'idle' && 'Ready'}
                ${state === 'listening' && 'Listening...'}
                ${state === 'processing' && 'Processing...'}
                ${state === 'speaking' && 'Speaking...'}
            </div>
        </div>
    `;
}
