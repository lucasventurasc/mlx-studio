// Cache Tab - Prompt cache configuration and stats
const { html, useState, useEffect } = window.preact;
import { showToast } from '../../hooks/useStore.js';
import { endpoints } from '../../utils/api.js';
import { SettingLabel, InfoHint } from '../ui/Tooltip.js';

const HINTS = {
    blockSize: "Size of token blocks for cache hashing. Larger blocks = fewer cache entries but coarser matching. Default: 256",
    maxSlots: "Maximum number of cache slots. Each slot holds one conversation context. More slots = more memory usage. Default: 4",
    minReuse: "Minimum tokens that must match to reuse cached computation. Lower = more cache hits but potentially wasted computation. Default: 512",
    maxTokens: "Maximum tokens per cache slot. Larger = longer context support but more memory. Default: 64K"
};

export function CacheTab() {
    const [config, setConfig] = useState({
        block_size: 256,
        max_slots: 4,
        min_reuse_tokens: 512,
        max_cached_tokens: 65536
    });
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [configRes, statsRes] = await Promise.all([
                endpoints.promptCacheConfig(),
                endpoints.promptCacheStats()
            ]);
            setConfig(configRes);
            setStats(statsRes);
        } catch (e) {
            console.error('Failed to load cache config:', e);
        }
        setLoading(false);
    };

    const handleConfigChange = async (key, value) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);

        try {
            await endpoints.setPromptCacheConfig(newConfig);
            showToast('Cache config updated');
        } catch (e) {
            showToast('Failed to update config');
        }
    };

    const handleClearCache = async () => {
        try {
            const result = await endpoints.promptCacheClear();
            showToast(`Cleared ${result.caches_cleared} cache(s)`);
            loadData();
        } catch (e) {
            showToast('Failed to clear cache');
        }
    };

    // Calculate total stats across all caches
    const getTotalStats = () => {
        if (!stats?.caches) return null;
        const caches = Object.values(stats.caches);
        if (caches.length === 0) return null;

        return caches.reduce((acc, cache) => ({
            total_requests: acc.total_requests + (cache.total_requests || 0),
            cache_hits: acc.cache_hits + (cache.cache_hits || 0),
            tokens_saved: acc.tokens_saved + (cache.tokens_saved || 0),
            active_slots: acc.active_slots + (cache.active_slots || 0)
        }), { total_requests: 0, cache_hits: 0, tokens_saved: 0, active_slots: 0 });
    };

    const totalStats = getTotalStats();
    const hitRate = totalStats && totalStats.total_requests > 0
        ? ((totalStats.cache_hits / totalStats.total_requests) * 100).toFixed(1)
        : '0';

    if (loading) {
        return html`<div class="settings-tab-content"><p class="loading-text">Loading...</p></div>`;
    }

    return html`
        <div class="settings-tab-content">
            <!-- Info Card -->
            <section class="settings-card">
                <h3 class="settings-card-title">
                    Prompt Cache (KV Cache)
                    <${InfoHint} text="Caches computed key-value pairs from previous requests. Speeds up responses when prompts share common prefixes (like system prompts)." />
                </h3>
                <p class="settings-card-desc">
                    Automatic caching for faster responses. Works with both OpenAI and Anthropic API formats.
                </p>
            </section>

            <!-- Stats Overview -->
            <section class="settings-card">
                <h3 class="settings-card-title">Cache Statistics</h3>

                <div class="cache-stats-grid">
                    <div class="cache-stat">
                        <div class="cache-stat-value ${parseFloat(hitRate) > 50 ? 'good' : parseFloat(hitRate) > 20 ? 'ok' : ''}">
                            ${hitRate}%
                        </div>
                        <div class="cache-stat-label">Hit Rate</div>
                    </div>

                    <div class="cache-stat">
                        <div class="cache-stat-value">
                            ${totalStats ? totalStats.cache_hits.toLocaleString() : 0}
                        </div>
                        <div class="cache-stat-label">Cache Hits</div>
                    </div>

                    <div class="cache-stat">
                        <div class="cache-stat-value">
                            ${totalStats ? totalStats.tokens_saved.toLocaleString() : 0}
                        </div>
                        <div class="cache-stat-label">Tokens Saved</div>
                    </div>

                    <div class="cache-stat">
                        <div class="cache-stat-value">
                            ${totalStats?.active_slots || 0}/${config.max_slots}
                        </div>
                        <div class="cache-stat-label">Active Slots</div>
                    </div>
                </div>

                <div class="cache-actions">
                    <button class="cache-action-btn" onClick=${loadData}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        Refresh
                    </button>
                    <button class="cache-action-btn danger" onClick=${handleClearCache}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Clear Cache
                    </button>
                </div>
            </section>

            <!-- Configuration -->
            <section class="settings-card">
                <h3 class="settings-card-title">Configuration</h3>
                <p class="settings-card-desc">
                    Adjust cache behavior. Changes apply to new requests.
                </p>

                <div class="cache-config-grid">
                    <${CacheSlider}
                        label="Block Size"
                        hint=${HINTS.blockSize}
                        value=${config.block_size}
                        min="64"
                        max="1024"
                        step="64"
                        unit=" tokens"
                        onChange=${v => handleConfigChange('block_size', v)}
                    />

                    <${CacheSlider}
                        label="Max Slots"
                        hint=${HINTS.maxSlots}
                        value=${config.max_slots}
                        min="1"
                        max="8"
                        step="1"
                        onChange=${v => handleConfigChange('max_slots', v)}
                    />

                    <${CacheSlider}
                        label="Min Reuse Tokens"
                        hint=${HINTS.minReuse}
                        value=${config.min_reuse_tokens}
                        min="128"
                        max="2048"
                        step="128"
                        unit=" tokens"
                        onChange=${v => handleConfigChange('min_reuse_tokens', v)}
                    />

                    <${CacheSlider}
                        label="Max Tokens/Slot"
                        hint=${HINTS.maxTokens}
                        value=${config.max_cached_tokens}
                        min="8192"
                        max="131072"
                        step="8192"
                        displayValue=${`${Math.round(config.max_cached_tokens / 1024)}K`}
                        onChange=${v => handleConfigChange('max_cached_tokens', v)}
                    />
                </div>
            </section>

            <!-- How It Works -->
            <section class="settings-card">
                <h3 class="settings-card-title">How It Works</h3>
                <div class="cache-explanation">
                    <div class="cache-step">
                        <div class="cache-step-num">1</div>
                        <div class="cache-step-text">
                            When you send a message, the system tokenizes and hashes the prompt
                        </div>
                    </div>
                    <div class="cache-step">
                        <div class="cache-step-num">2</div>
                        <div class="cache-step-text">
                            If the hash matches a cached entry, it reuses computed KV pairs
                        </div>
                    </div>
                    <div class="cache-step">
                        <div class="cache-step-num">3</div>
                        <div class="cache-step-text">
                            This skips redundant computation, especially for shared system prompts
                        </div>
                    </div>
                </div>
                <p class="cache-tip">
                    Tip: Claude Code sends the same system prompt with every request. High cache hit rates significantly speed up responses.
                </p>
            </section>
        </div>
    `;
}

function CacheSlider({ label, hint, value, min, max, step, unit = '', displayValue, onChange }) {
    return html`
        <div class="cache-slider">
            <div class="cache-slider-header">
                <${SettingLabel} label=${label} hint=${hint} />
                <span class="cache-slider-value">${displayValue || `${value}${unit}`}</span>
            </div>
            <input
                type="range"
                class="slider-input"
                value=${value}
                min=${min}
                max=${max}
                step=${step}
                onInput=${e => onChange(parseFloat(e.target.value))}
            />
        </div>
    `;
}
