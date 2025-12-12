#!/usr/bin/env python3
"""
MLX Studio Server

Combines mlx-omni-server backend with MLX Studio extensions:
- KV cache multi-slot with disk persistence
- Inference profiles
- Model aliases
- Web GUI

Usage:
    ./venv-omni/bin/python server.py --port 1234

Environment Variables (Cache Configuration):
    MLX_CACHE_BLOCK_SIZE   - Token block size for hashing (default: 256)
    MLX_CACHE_MAX_SLOTS    - Maximum cache slots (default: 4)
    MLX_CACHE_MIN_REUSE    - Minimum tokens to reuse cache (default: 512)
    MLX_CACHE_MAX_TOKENS   - Maximum tokens per slot (default: 65536)
"""

import os
import sys
import json
import argparse
import logging
import asyncio
import threading
from pathlib import Path
from collections import deque
from typing import Dict, Optional, AsyncGenerator

# Global lock for MLX GPU operations - prevents Metal command buffer conflicts
_mlx_lock = threading.Lock()

# =============================================================================
# Cache Configuration (set before importing mlx-omni-server)
# =============================================================================

# Default cache settings optimized for Claude Code workloads
# These can be overridden via environment variables
CACHE_DEFAULTS = {
    # Prompt/KV cache settings
    "MLX_CACHE_BLOCK_SIZE": "256",     # Tokens per block for hashing
    "MLX_CACHE_MAX_SLOTS": "4",        # Number of cache slots
    "MLX_CACHE_MIN_REUSE": "512",      # Min tokens to consider cache hit
    "MLX_CACHE_MAX_TOKENS": "65536",   # Max tokens per slot (64K)
    # Model cache settings
    "MLX_MODEL_CACHE_SIZE": "3",       # Max models in memory
    "MLX_MODEL_CACHE_TTL": "0",        # Model TTL in seconds (0=never expire)
}

# Apply defaults if not already set
for key, default in CACHE_DEFAULTS.items():
    if key not in os.environ:
        os.environ[key] = default

# Add vendor mlx-omni-server to path
VENDOR_PATH = Path(__file__).parent / "vendor" / "mlx-omni-server" / "src"
sys.path.insert(0, str(VENDOR_PATH))

# Apply compatibility patches before importing mlx-omni-server
from patches import apply_patches
apply_patches()

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

# Import mlx-omni-server chat routers
from mlx_omni_server.chat.openai.router import router as openai_router
from mlx_omni_server.chat.anthropic.router import router as anthropic_router

# Import audio routers (STT/TTS)
from mlx_omni_server.stt import stt as stt_router
from mlx_omni_server.tts import tts as tts_router

# Import our extensions
from extensions import KVCacheManager, InferenceProfiles, ModelManager
from extensions.global_settings import get_global_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mlx-studio")

# =============================================================================
# Server Log Streaming (SSE)
# =============================================================================

# Store recent logs and connected clients
_log_buffer: deque = deque(maxlen=100)  # Keep last 100 logs
_log_clients: set = set()  # Connected SSE clients

class WebLogHandler(logging.Handler):
    """Custom log handler that broadcasts logs to SSE clients."""

    def emit(self, record):
        try:
            log_entry = {
                "timestamp": self.formatTime(record),
                "level": record.levelname.lower(),
                "logger": record.name,
                "message": record.getMessage()
            }
            _log_buffer.append(log_entry)

            # Broadcast to all connected clients
            for queue in list(_log_clients):
                try:
                    queue.put_nowait(log_entry)
                except:
                    pass  # Queue full or closed
        except Exception:
            pass

    def formatTime(self, record):
        import time
        ct = time.localtime(record.created)
        return time.strftime("%H:%M:%S", ct)

# Add web handler to root logger to capture all logs
_web_handler = WebLogHandler()
_web_handler.setLevel(logging.INFO)
logging.getLogger().addHandler(_web_handler)

# Also capture uvicorn and mlx logs
for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "mlx_omni_server", "mlx-studio"]:
    log = logging.getLogger(logger_name)
    log.addHandler(_web_handler)

# Initialize extensions
kv_cache = KVCacheManager(max_slots=8)
profiles = InferenceProfiles(default_profile='balanced')
model_manager = ModelManager()


# =============================================================================
# Model Aliases
# =============================================================================

# Load aliases from config file or use defaults
ALIASES_FILE = Path(__file__).parent / "model_aliases.json"

def load_aliases() -> dict:
    """Load model aliases from config file."""
    if ALIASES_FILE.exists():
        try:
            with open(ALIASES_FILE) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load aliases: {e}")
    return {}

def save_aliases(aliases: dict):
    """Save model aliases to config file."""
    with open(ALIASES_FILE, "w") as f:
        json.dump(aliases, f, indent=2)

# Global aliases dict - maps short names to full model paths
MODEL_ALIASES = load_aliases()

def resolve_model_alias(model_name: str) -> str:
    """Resolve a model alias to its full path."""
    if model_name in MODEL_ALIASES:
        resolved = MODEL_ALIASES[model_name]
        logger.info(f"Resolved alias '{model_name}' -> '{resolved}'")
        return resolved
    return model_name


# Create FastAPI app
app = FastAPI(
    title="MLX Studio",
    version="2.0.0",
    description="High-performance MLX inference with KV caching"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount mlx-omni-server routers
app.include_router(openai_router, tags=["OpenAI"])
app.include_router(anthropic_router, prefix="/anthropic", tags=["Anthropic"])

# Mount audio routers (STT/TTS for Voice Mode)
app.include_router(stt_router.router, tags=["Audio"])
app.include_router(tts_router.router, tags=["Audio"])

# =============================================================================
# Edge TTS (Microsoft Neural Voices - High Quality, Free)
# =============================================================================

import subprocess
import tempfile

EDGE_TTS_VOICES = {
    # Portuguese - Brazil
    "pt-BR-FranciscaNeural": "Francisca (Brazil, Female)",
    "pt-BR-AntonioNeural": "Antonio (Brazil, Male)",
    "pt-BR-ThalitaMultilingualNeural": "Thalita (Brazil, Female, Multilingual)",
    # Portuguese - Portugal
    "pt-PT-RaquelNeural": "Raquel (Portugal, Female)",
    "pt-PT-DuarteNeural": "Duarte (Portugal, Male)",
    # English - US
    "en-US-JennyNeural": "Jenny (US, Female)",
    "en-US-GuyNeural": "Guy (US, Male)",
    "en-US-AriaNeural": "Aria (US, Female)",
    "en-US-DavisNeural": "Davis (US, Male)",
    # English - UK
    "en-GB-SoniaNeural": "Sonia (UK, Female)",
    "en-GB-RyanNeural": "Ryan (UK, Male)",
    # Spanish
    "es-ES-ElviraNeural": "Elvira (Spain, Female)",
    "es-MX-DaliaNeural": "Dalia (Mexico, Female)",
    # French
    "fr-FR-DeniseNeural": "Denise (France, Female)",
    # German
    "de-DE-KatjaNeural": "Katja (Germany, Female)",
    # Italian
    "it-IT-ElsaNeural": "Elsa (Italy, Female)",
    # Japanese
    "ja-JP-NanamiNeural": "Nanami (Japan, Female)",
    # Chinese
    "zh-CN-XiaoxiaoNeural": "Xiaoxiao (China, Female)",
}

class EdgeTTSRequest(BaseModel):
    input: str
    voice: str = "pt-BR-FranciscaNeural"
    rate: str = "+0%"  # Speed adjustment: -50% to +100%

@app.get("/api/tts/edge/voices")
def get_edge_tts_voices():
    """Get available Edge TTS voices."""
    return {"voices": EDGE_TTS_VOICES}

@app.post("/api/tts/edge")
async def edge_tts(request: EdgeTTSRequest):
    """
    Generate speech using Microsoft Edge TTS.
    High-quality neural voices, requires internet.
    """
    try:
        import edge_tts

        # Create temp file for output
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            output_path = f.name

        # Generate speech
        communicate = edge_tts.Communicate(request.input, request.voice, rate=request.rate)
        await communicate.save(output_path)

        # Return audio file
        return FileResponse(
            output_path,
            media_type="audio/mpeg",
            filename="speech.mp3"
        )
    except ImportError:
        return {"error": "edge-tts not installed. Run: pip install edge-tts"}
    except Exception as e:
        logger.error(f"Edge TTS error: {e}")
        return {"error": str(e)}


# =============================================================================
# MLX Studio Custom Endpoints
# =============================================================================

@app.get("/api/profiles")
def get_profiles():
    """Get available inference profiles."""
    return profiles.get_all()


@app.post("/api/profiles/{profile_name}")
def set_profile(profile_name: str):
    """Set the current inference profile."""
    result = profiles.set_current(profile_name)
    # Also update global settings to match the profile
    profile = profiles.get(profile_name)
    if profile:
        get_global_settings().update(
            temperature=profile.temperature,
            top_p=profile.top_p,
            max_tokens=profile.max_tokens
        )
    return result


# =============================================================================
# Global Inference Settings (affects all endpoints including Anthropic)
# =============================================================================

@app.get("/api/inference/settings")
def get_inference_settings():
    """Get global inference settings that affect all endpoints."""
    return get_global_settings().settings.to_dict()


class InferenceSettingsUpdate(BaseModel):
    temperature: float = None
    top_p: float = None
    top_k: int = None
    max_tokens: int = None


@app.post("/api/inference/settings")
def update_inference_settings(settings: InferenceSettingsUpdate):
    """Update global inference settings. These affect both OpenAI and Anthropic endpoints."""
    updated = get_global_settings().update(
        temperature=settings.temperature,
        top_p=settings.top_p,
        top_k=settings.top_k,
        max_tokens=settings.max_tokens
    )
    return {"status": "updated", "settings": updated.to_dict()}


@app.get("/api/cache/stats")
def get_cache_stats():
    """Get KV cache statistics."""
    return kv_cache.get_stats()


@app.post("/api/cache/clear")
def clear_cache(include_persisted: bool = False):
    """Clear the KV cache."""
    kv_cache.clear(include_persisted=include_persisted)
    return {"status": "cleared", "include_persisted": include_persisted}


@app.get("/api/cache/persisted")
def list_persisted_cache():
    """List persisted cache entries."""
    return {"entries": kv_cache.list_persisted()}


@app.delete("/api/cache/persisted/{cache_key}")
def delete_persisted_cache(cache_key: str):
    """Delete a persisted cache entry."""
    success = kv_cache.delete_persisted(cache_key)
    return {"status": "deleted" if success else "not_found", "cache_key": cache_key}


@app.post("/api/cache/persist/{slot_id}")
def persist_cache_slot(slot_id: str):
    """Persist a cache slot to disk."""
    success = kv_cache.persist_slot(slot_id)
    return {"status": "persisted" if success else "not_found", "slot_id": slot_id}


# =============================================================================
# Prompt Cache Settings (SmartPromptCache for Anthropic/OpenAI)
# =============================================================================

class PromptCacheConfig(BaseModel):
    block_size: int = 256
    max_slots: int = 4
    min_reuse_tokens: int = 512
    max_cached_tokens: int = 65536


@app.get("/api/prompt-cache/config")
def get_prompt_cache_config():
    """Get current prompt cache configuration."""
    return {
        "block_size": int(os.environ.get("MLX_CACHE_BLOCK_SIZE", "256")),
        "max_slots": int(os.environ.get("MLX_CACHE_MAX_SLOTS", "4")),
        "min_reuse_tokens": int(os.environ.get("MLX_CACHE_MIN_REUSE", "512")),
        "max_cached_tokens": int(os.environ.get("MLX_CACHE_MAX_TOKENS", "65536")),
    }


@app.post("/api/prompt-cache/config")
def set_prompt_cache_config(config: PromptCacheConfig):
    """Update prompt cache configuration.

    Note: Changes take effect on next cache creation (new model load).
    To apply immediately, clear the cache after updating.
    """
    os.environ["MLX_CACHE_BLOCK_SIZE"] = str(config.block_size)
    os.environ["MLX_CACHE_MAX_SLOTS"] = str(config.max_slots)
    os.environ["MLX_CACHE_MIN_REUSE"] = str(config.min_reuse_tokens)
    os.environ["MLX_CACHE_MAX_TOKENS"] = str(config.max_cached_tokens)

    logger.info(f"Updated prompt cache config: {config}")
    return {
        "status": "updated",
        "config": config.model_dump(),
        "note": "Changes apply to new cache instances. Clear cache to apply immediately."
    }


@app.get("/api/prompt-cache/stats")
def get_prompt_cache_stats():
    """Get SmartPromptCache statistics from loaded models."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    stats = {}
    try:
        # Get stats from all cached wrappers
        for key, wrapper in wrapper_cache._cache.items():
            if hasattr(wrapper, 'prompt_cache') and wrapper._prompt_cache is not None:
                cache_stats = wrapper.prompt_cache.get_stats()
                # Convert key to string for JSON serialization
                key_str = str(key)
                stats[key_str] = cache_stats
    except Exception as e:
        logger.warning(f"Failed to get prompt cache stats: {e}")

    return {
        "caches": stats,
        "total_caches": len(stats),
        "config": get_prompt_cache_config()
    }


@app.get("/api/prompt-cache/health")
def get_prompt_cache_health():
    """Get human-readable health report for prompt caches."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    reports = []
    try:
        for key, wrapper in wrapper_cache._cache.items():
            if hasattr(wrapper, 'prompt_cache') and wrapper._prompt_cache is not None:
                report = wrapper.prompt_cache.get_health_report()
                # Convert key to string for JSON serialization
                reports.append({"model": str(key), "report": report})
    except Exception as e:
        logger.warning(f"Failed to get prompt cache health: {e}")

    return {"reports": reports, "count": len(reports)}


@app.post("/api/prompt-cache/clear")
def clear_prompt_cache():
    """Clear all prompt caches."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    cleared = 0
    try:
        for key, wrapper in wrapper_cache._cache.items():
            if hasattr(wrapper, 'prompt_cache') and wrapper._prompt_cache is not None:
                wrapper.prompt_cache.clear()
                cleared += 1
    except Exception as e:
        logger.warning(f"Failed to clear prompt caches: {e}")

    return {"status": "cleared", "caches_cleared": cleared}


# =============================================================================
# Claude Model Routing Configuration
# =============================================================================

ROUTING_FILE = Path(__file__).parent / "claude_routing.json"

def load_routing_config() -> dict:
    """Load Claude routing configuration."""
    if ROUTING_FILE.exists():
        try:
            with open(ROUTING_FILE) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load routing config: {e}")
    return {
        "enabled": True,
        "tiers": {
            "haiku": {"model": None, "draft_model": None},
            "sonnet": {"model": None, "draft_model": None},
            "opus": {"model": None, "draft_model": None}
        },
        "default_model": None
    }

def save_routing_config(config: dict):
    """Save Claude routing configuration."""
    with open(ROUTING_FILE, "w") as f:
        json.dump(config, f, indent=2)


class TierConfig(BaseModel):
    model: Optional[str] = None
    draft_model: Optional[str] = None


class RoutingConfig(BaseModel):
    enabled: bool = True
    tiers: Dict[str, TierConfig] = {}
    default_model: Optional[str] = None


@app.get("/api/routing/config")
def get_routing_config():
    """Get Claude model routing configuration."""
    config = load_routing_config()
    return config


@app.post("/api/routing/config")
def set_routing_config(config: RoutingConfig):
    """Update Claude model routing configuration."""
    # Load existing to preserve patterns and descriptions
    existing = load_routing_config()

    # Update with new values
    existing["enabled"] = config.enabled
    existing["default_model"] = config.default_model

    for tier_name, tier_config in config.tiers.items():
        if tier_name in existing.get("tiers", {}):
            existing["tiers"][tier_name]["model"] = tier_config.model
            existing["tiers"][tier_name]["draft_model"] = tier_config.draft_model

    save_routing_config(existing)

    # Reload in patches module
    from patches import reload_routing_config
    reload_routing_config()

    logger.info(f"Updated routing config: {config}")
    return {"status": "updated", "config": existing}


@app.post("/api/routing/tier/{tier_name}")
def set_tier_model(tier_name: str, model: Optional[str] = None, draft_model: Optional[str] = None):
    """Set model for a specific tier (haiku/sonnet/opus)."""
    config = load_routing_config()

    if tier_name not in config.get("tiers", {}):
        return {"status": "error", "message": f"Unknown tier: {tier_name}"}

    config["tiers"][tier_name]["model"] = model
    config["tiers"][tier_name]["draft_model"] = draft_model

    save_routing_config(config)

    # Reload in patches module
    from patches import reload_routing_config
    reload_routing_config()

    logger.info(f"Set {tier_name} -> model={model}, draft={draft_model}")
    return {"status": "updated", "tier": tier_name, "model": model, "draft_model": draft_model}


@app.get("/api/routing/resolve/{model_id:path}")
def resolve_model_routing(model_id: str):
    """Preview how a model ID would be resolved with current routing config."""
    from patches import resolve_alias
    resolved = resolve_alias(model_id)
    return {
        "original": model_id,
        "resolved": resolved,
        "is_claude": model_id.startswith("claude-")
    }


# =============================================================================
# Remote MLX Studio Instances
# =============================================================================

REMOTES_FILE = Path(__file__).parent / "remotes.json"

def load_remotes() -> list:
    """Load remote instances from config file."""
    if REMOTES_FILE.exists():
        try:
            with open(REMOTES_FILE) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load remotes: {e}")
    return []

def save_remotes(remotes: list):
    """Save remote instances to config file."""
    with open(REMOTES_FILE, "w") as f:
        json.dump(remotes, f, indent=2)


class RemoteConfig(BaseModel):
    name: str
    url: str
    enabled: bool = True


@app.get("/api/remotes")
def get_remotes():
    """Get all configured remote instances."""
    remotes = load_remotes()
    return {"remotes": remotes}


@app.post("/api/remotes")
def add_remote(config: RemoteConfig):
    """Add a new remote instance."""
    remotes = load_remotes()

    # Check if name already exists
    if any(r["name"] == config.name for r in remotes):
        return {"status": "error", "message": f"Remote '{config.name}' already exists"}

    # Normalize URL
    url = config.url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "http://" + url

    # Add default port if not specified
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if not parsed.port:
        url = f"{parsed.scheme}://{parsed.netloc}:1234{parsed.path}"
        logger.info(f"Added default port 1234 to remote URL: {url}")

    remotes.append({
        "name": config.name,
        "url": url,
        "enabled": config.enabled
    })
    save_remotes(remotes)

    logger.info(f"Added remote: {config.name} -> {url}")
    return {"status": "added", "remote": config.name}


@app.post("/api/remotes/{name}")
def update_remote(name: str, enabled: Optional[bool] = None):
    """Update a remote instance."""
    remotes = load_remotes()

    for r in remotes:
        if r["name"] == name:
            if enabled is not None:
                r["enabled"] = enabled
            save_remotes(remotes)
            return {"status": "updated", "remote": name}

    return {"status": "error", "message": f"Remote '{name}' not found"}


@app.delete("/api/remotes/{name}")
def delete_remote(name: str):
    """Delete a remote instance."""
    remotes = load_remotes()
    original_len = len(remotes)
    remotes = [r for r in remotes if r["name"] != name]

    if len(remotes) == original_len:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    save_remotes(remotes)
    logger.info(f"Deleted remote: {name}")
    return {"status": "deleted", "remote": name}


@app.get("/api/remotes/{name}/health")
async def check_remote_health(name: str):
    """Check if a remote instance is healthy."""
    import httpx

    remotes = load_remotes()
    remote = next((r for r in remotes if r["name"] == name), None)

    if not remote:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{remote['url']}/health")
            if response.status_code == 200:
                return {"status": "online", "remote": name}
            else:
                return {"status": "offline", "remote": name, "code": response.status_code}
    except Exception as e:
        return {"status": "offline", "remote": name, "error": str(e)}


@app.get("/api/remotes/{name}/models")
async def get_remote_models(name: str):
    """Get available models from a remote instance."""
    import httpx

    remotes = load_remotes()
    remote = next((r for r in remotes if r["name"] == name), None)

    if not remote:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{remote['url']}/api/models/local")
            if response.status_code == 200:
                data = response.json()
                return {"status": "ok", "remote": name, "models": data.get("models", [])}
            else:
                return {"status": "error", "remote": name, "code": response.status_code}
    except Exception as e:
        return {"status": "error", "remote": name, "error": str(e)}


# =============================================================================
# Model Aliases Endpoints
# =============================================================================

@app.get("/api/aliases")
def get_aliases():
    """Get all model aliases."""
    return {"aliases": MODEL_ALIASES}


class AliasRequest(BaseModel):
    alias: str
    model_path: str

@app.post("/api/aliases")
def set_alias(request: AliasRequest):
    """Create or update a model alias."""
    global MODEL_ALIASES
    MODEL_ALIASES[request.alias] = request.model_path
    save_aliases(MODEL_ALIASES)
    logger.info(f"Set alias: {request.alias} -> {request.model_path}")
    return {"status": "ok", "alias": request.alias, "model_path": request.model_path}


@app.delete("/api/aliases/{alias}")
def delete_alias(alias: str):
    """Delete a model alias."""
    global MODEL_ALIASES
    if alias in MODEL_ALIASES:
        del MODEL_ALIASES[alias]
        save_aliases(MODEL_ALIASES)
        return {"status": "deleted", "alias": alias}
    return {"status": "not_found", "alias": alias}


@app.post("/api/aliases/auto")
def auto_create_aliases():
    """Auto-create aliases for all local models based on their names."""
    global MODEL_ALIASES
    models = model_manager.list_local_models()
    created = []

    for m in models:
        # Create short alias from model name
        # e.g., "Qwen3-Coder-30B-A3B-Instruct-MLX-8bit" -> "Qwen3-Coder-30B"
        name = m.name
        # Try to extract base name (before quantization suffix)
        short_name = name
        for suffix in ["-MLX-8bit", "-MLX-4bit", "-MLX-6bit", "-8bit", "-4bit", "-6bit", "-mlx"]:
            if suffix.lower() in name.lower():
                idx = name.lower().find(suffix.lower())
                short_name = name[:idx]
                break

        if short_name and short_name not in MODEL_ALIASES:
            MODEL_ALIASES[short_name] = m.path
            created.append({"alias": short_name, "path": m.path})

    save_aliases(MODEL_ALIASES)
    return {"status": "ok", "created": created, "total_aliases": len(MODEL_ALIASES)}


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy"}


# =============================================================================
# Anthropic Telemetry Capture (Claude Code CLI sends telemetry here)
# =============================================================================

from fastapi import Request

@app.post("/anthropic/api/event_logging/batch")
async def anthropic_telemetry_capture(request: Request):
    """Capture and log Claude Code CLI telemetry events."""
    try:
        body = await request.json()
        events = body if isinstance(body, list) else body.get("events", [body])

        for event in events:
            event_type = event.get("type", event.get("event_type", "unknown"))
            # Log summary of each event
            if event_type == "unknown":
                # Just log the keys to understand structure
                logger.info(f"[Telemetry] Keys: {list(event.keys())}")
            else:
                # Log event type and relevant details
                details = {k: v for k, v in event.items()
                          if k in ["model", "tokens", "duration", "error", "tool", "status", "message"]}
                if details:
                    logger.info(f"[Telemetry] {event_type}: {details}")
                else:
                    logger.info(f"[Telemetry] {event_type}")
    except Exception as e:
        logger.debug(f"[Telemetry] Failed to parse: {e}")

    return {"status": "ok"}


# =============================================================================
# Server Log Streaming Endpoint
# =============================================================================

async def log_stream_generator() -> AsyncGenerator[str, None]:
    """Generate SSE events for log streaming."""
    import asyncio
    from queue import Queue, Empty

    queue = Queue(maxsize=100)
    _log_clients.add(queue)

    try:
        # Send recent logs first
        for log in list(_log_buffer):
            yield f"data: {json.dumps(log)}\n\n"

        # Stream new logs
        while True:
            try:
                log = queue.get_nowait()
                yield f"data: {json.dumps(log)}\n\n"
            except Empty:
                # No log available, wait a bit
                await asyncio.sleep(0.1)
                # Send keepalive every few seconds
                yield ": keepalive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        _log_clients.discard(queue)


@app.get("/api/logs/stream")
async def stream_logs():
    """Stream server logs via SSE."""
    return StreamingResponse(
        log_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/logs/recent")
def get_recent_logs():
    """Get recent server logs (last 100)."""
    return {"logs": list(_log_buffer)}


# =============================================================================
# Model Management Endpoints
# =============================================================================

def _get_model_capabilities(model_path: str) -> dict:
    """Get model capabilities by reading config files."""
    from pathlib import Path

    path = Path(model_path)
    capabilities = {
        "supports_thinking": False,
        "model_family": None,
        "has_tools": False,
        "context_length": None
    }

    if not path.exists():
        return capabilities

    # Check tokenizer_config.json for think tokens
    tokenizer_config = path / "tokenizer_config.json"
    if tokenizer_config.exists():
        try:
            with open(tokenizer_config) as f:
                config = json.load(f)

            # Check for <think> token in added_tokens_decoder
            added_tokens = config.get("added_tokens_decoder", {})
            for token_info in added_tokens.values():
                content = token_info.get("content", "")
                if content == "<think>":
                    capabilities["supports_thinking"] = True
                    break

            # Also check chat_template for enable_thinking variable
            chat_template = config.get("chat_template", "")
            if "enable_thinking" in chat_template:
                capabilities["supports_thinking"] = True
        except Exception:
            pass

    # Check config.json for model family and context length
    model_config = path / "config.json"
    if model_config.exists():
        try:
            with open(model_config) as f:
                config = json.load(f)

            # Detect model family from architectures
            architectures = config.get("architectures", [])
            model_type = config.get("model_type", "")

            if "Qwen3" in str(architectures) or "qwen3" in model_type.lower():
                capabilities["model_family"] = "qwen3"
            elif "Qwen2" in str(architectures) or "qwen2" in model_type.lower():
                capabilities["model_family"] = "qwen2"
            elif "Llama" in str(architectures) or "llama" in model_type.lower():
                capabilities["model_family"] = "llama"
            elif "Mistral" in str(architectures) or "mistral" in model_type.lower():
                capabilities["model_family"] = "mistral"
            else:
                capabilities["model_family"] = model_type or "unknown"

            # Get context length
            capabilities["context_length"] = config.get("max_position_embeddings") or config.get("max_seq_len")
        except Exception:
            pass

    return capabilities


@app.get("/api/models/local")
def list_local_models():
    """List all MLX models downloaded locally with capabilities."""
    models = model_manager.list_local_models()
    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "size": m.size_human,
                "size_bytes": m.size_bytes,
                "quantization": m.quantization,
                "path": m.path,
                "capabilities": _get_model_capabilities(m.path)
            }
            for m in models
        ],
        "count": len(models),
        "cache_dir": str(model_manager.get_cache_dir())
    }


@app.post("/api/models/load")
def load_model(model_id: str, warmup_prompt: str = None):
    """Pre-load a model into memory cache with optional prompt warmup.

    This is the only safe way to load models - prevents concurrent GPU access.
    Must be called before making chat/completion requests to a model.
    """
    import time
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator

    # Use global lock to prevent concurrent model loading
    with _mlx_lock:
        start = time.time()
        try:
            # Check if model exists locally (LM Studio or HuggingFace cache)
            local_models = model_manager.list_local_models()
            local_model = next((m for m in local_models if m.id == model_id), None)

            # Use local path if available
            load_path = local_model.path if local_model else model_id
            logger.info(f"Pre-loading model: {model_id} from {load_path}")

            wrapper = ChatGenerator.get_or_create(model_id=load_path)
            model_time = time.time() - start
            logger.info(f"Model loaded in {model_time:.1f}s: {model_id}")

            warmup_time = 0
            warmup_tokens = 0

            # Warmup with system prompt if provided
            if warmup_prompt:
                warmup_start = time.time()
                logger.info(f"Warming up KV cache with prompt ({len(warmup_prompt)} chars)...")

                # Generate 1 token to build KV cache for the system prompt
                messages = [{"role": "system", "content": warmup_prompt}]
                result = wrapper.generate(
                    messages=messages,
                    max_tokens=1,
                    enable_prompt_cache=True
                )
                warmup_time = time.time() - warmup_start
                warmup_tokens = result.stats.prompt_tokens if result.stats else 0
                logger.info(f"KV cache warmed: {warmup_tokens} tokens in {warmup_time:.1f}s")

            elapsed = time.time() - start
            return {
                "status": "loaded",
                "model_id": model_id,
                "path": load_path,
                "time": round(elapsed, 2),
                "warmup": {
                    "enabled": warmup_prompt is not None,
                    "tokens": warmup_tokens,
                    "time": round(warmup_time, 2)
                } if warmup_prompt else None
            }
        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            return {"status": "error", "model_id": model_id, "error": str(e)}


@app.post("/api/models/warmup")
def warmup_cache(model_id: str, system_prompt: str = None):
    """Warmup KV cache with a system prompt for faster first response.

    If system_prompt is not provided, uses the learned prompt for this model.
    """
    import time
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator
    from patches import get_learned_prompt

    start = time.time()
    try:
        # Use learned prompt if none provided
        if not system_prompt:
            system_prompt = get_learned_prompt(model_id)
            if not system_prompt:
                return {"status": "no_prompt", "message": "No learned prompt available for this model"}

        wrapper = ChatGenerator.get_or_create(model_id=model_id)

        logger.info(f"Warming up KV cache for {model_id} ({len(system_prompt)} chars)...")

        # Generate 1 token to build KV cache
        messages = [{"role": "system", "content": system_prompt}]
        result = wrapper.generate(
            messages=messages,
            max_tokens=1,
            enable_prompt_cache=True
        )

        elapsed = time.time() - start
        prompt_tokens = result.stats.prompt_tokens if result.stats else 0

        logger.info(f"KV cache warmed: {prompt_tokens} tokens in {elapsed:.1f}s")

        return {
            "status": "warmed",
            "model_id": model_id,
            "prompt_tokens": prompt_tokens,
            "time": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Failed to warmup cache: {e}")
        return {"status": "error", "error": str(e)}


@app.get("/api/prompts/learned")
def get_learned_prompts():
    """Get all learned system prompts."""
    from patches import load_learned_prompts
    prompts = load_learned_prompts()
    return {
        "prompts": {
            k: {"hash": v["hash"], "length": v["length"]}
            for k, v in prompts.items()
        }
    }


@app.delete("/api/prompts/learned/{model_id:path}")
def delete_learned_prompt(model_id: str):
    """Delete a learned system prompt."""
    from patches import _LEARNED_PROMPTS, save_learned_prompts, load_learned_prompts
    load_learned_prompts()
    if model_id in _LEARNED_PROMPTS:
        del _LEARNED_PROMPTS[model_id]
        save_learned_prompts()
        return {"status": "deleted", "model_id": model_id}
    return {"status": "not_found", "model_id": model_id}


@app.get("/api/models/loaded")
def get_loaded_models():
    """Get list of currently loaded models in memory."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    cache_info = wrapper_cache.get_cache_info()

    # Parse the cached_keys to extract model IDs
    loaded_models = []
    for key_str in cache_info.get("cached_keys", []):
        # Key format: WrapperCacheKey(model_id='...', adapter_path=..., draft_model_id=...)
        # Extract model_id from string representation
        if "model_id='" in key_str:
            start = key_str.find("model_id='") + len("model_id='")
            end = key_str.find("'", start)
            model_id = key_str[start:end]
            loaded_models.append({
                "model_id": model_id,
                "key": key_str
            })

    return {
        "loaded": loaded_models,
        "count": len(loaded_models),
        "max_size": cache_info.get("max_size", 0)
    }


@app.post("/api/models/unload")
def unload_model(model_id: str = None):
    """Unload model(s) from memory cache and free GPU memory."""
    import gc
    import mlx.core as mx
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    # Use lock to prevent unloading during generation
    with _mlx_lock:
        try:
            # Clear the wrapper cache (ChatGenerator instances)
            wrapper_cache.clear_cache()

            # Clear SmartPromptCache if available
            try:
                from mlx_omni_server.chat.mlx.smart_prompt_cache import smart_cache
                smart_cache.clear()
            except ImportError:
                pass

            # Force Python garbage collection
            gc.collect()

            # Synchronize GPU before clearing cache to avoid race conditions
            mx.eval(mx.zeros(1))  # Force any pending GPU ops to complete

            # Clear MLX memory cache - this actually frees GPU memory
            mx.metal.clear_cache()

            logger.info("Unloaded all models and cleared GPU memory")
            return {"status": "cleared", "message": "All models unloaded and GPU memory freed"}
        except Exception as e:
            logger.error(f"Failed to unload model: {e}")
            return {"status": "error", "error": str(e)}


@app.get("/api/models/search")
def search_models(q: str = "MLX", limit: int = 20):
    """Search for MLX models on HuggingFace."""
    results = model_manager.search_hf_models(q, limit)
    return {"results": results, "query": q}


@app.get("/api/models/info/{author}/{model}")
def get_model_info(author: str, model: str):
    """Get detailed info about a model from HuggingFace."""
    repo_id = f"{author}/{model}"
    info = model_manager.get_model_info(repo_id)
    if info:
        return info
    return {"error": "Model not found", "repo_id": repo_id}


@app.get("/api/models/capabilities")
def get_model_capabilities(model_path: str):
    """Get model capabilities by reading config files.

    Detects:
    - supports_thinking: Whether model has <think> tokens in tokenizer
    - model_family: Detected model family (qwen3, qwen2.5, llama, etc.)
    """
    from pathlib import Path

    path = Path(model_path)
    if not path.exists():
        return {"error": "Model path not found", "path": model_path}

    return _get_model_capabilities(model_path)


@app.post("/api/models/download")
def start_download(repo_id: str):
    """Start downloading a model from HuggingFace."""
    return model_manager.start_download(repo_id)


@app.get("/api/models/downloads")
def get_downloads():
    """Get status of all downloads."""
    return {"downloads": model_manager.get_download_status()}


@app.get("/api/models/downloads/{author}/{model}")
def get_download_status(author: str, model: str):
    """Get download status for a specific model."""
    repo_id = f"{author}/{model}"
    return model_manager.get_download_status(repo_id)


# =============================================================================
# Static Files (Frontend)
# =============================================================================

frontend_dir = Path(__file__).parent / "frontend"
if frontend_dir.exists() and (frontend_dir / "index.html").exists():
    # Serve static assets
    app.mount("/styles", StaticFiles(directory=frontend_dir / "styles"), name="styles")
    app.mount("/components", StaticFiles(directory=frontend_dir / "components"), name="components")
    app.mount("/hooks", StaticFiles(directory=frontend_dir / "hooks"), name="hooks")
    app.mount("/utils", StaticFiles(directory=frontend_dir / "utils"), name="utils")

    @app.get("/")
    def root():
        return FileResponse(frontend_dir / "index.html")

    @app.get("/app.js")
    def app_js():
        return FileResponse(frontend_dir / "app.js", media_type="application/javascript")
else:
    @app.get("/")
    def root():
        return {
            "status": "ok",
            "message": "MLX Studio API",
            "endpoints": {
                "openai": "/v1/chat/completions",
                "anthropic": "/anthropic/v1/messages",
                "profiles": "/api/profiles",
                "cache": "/api/cache/stats"
            }
        }


# =============================================================================
# Main
# =============================================================================

def get_network_ip():
    """Get LAN IP address."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return None


def main():
    parser = argparse.ArgumentParser(description="MLX Studio Server")
    parser.add_argument("--port", type=int, default=1234, help="Server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Server host")
    args = parser.parse_args()

    lan_ip = get_network_ip()

    print(f"""
╔═══════════════════════════════════════════════════════════╗
║              ⚡ MLX Studio v2.0                            ║
║     Powered by mlx-omni-server + custom extensions        ║
╠═══════════════════════════════════════════════════════════╣
║  Local: http://localhost:{args.port:<5}                         ║""")

    if lan_ip:
        print(f"║  LAN:   http://{lan_ip}:{args.port:<5}                      ║")

    print(f"""║  API:   /v1/chat/completions (OpenAI)                   ║
║  API:   /anthropic/v1/messages (Anthropic)              ║
║  Cache: Multi-slot KV caching with persistence          ║
╚═══════════════════════════════════════════════════════════╝
""")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
