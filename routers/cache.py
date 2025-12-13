"""
Cache API endpoints - KV cache, prompt cache, and pre-warm system.
"""
import os
import logging
import threading
import hashlib
from typing import Optional
from dataclasses import dataclass, field
from fastapi import APIRouter
from pydantic import BaseModel

from extensions import KVCacheManager

logger = logging.getLogger("mlx-studio.cache")
router = APIRouter(prefix="/api", tags=["Cache"])

# Initialize KV cache manager
kv_cache = KVCacheManager(max_slots=8)

# Global lock for MLX GPU operations (set from main server)
_mlx_lock = None

def set_mlx_lock(lock: threading.Lock):
    """Set the MLX lock from the main server."""
    global _mlx_lock
    _mlx_lock = lock


# =============================================================================
# Pre-warm System
# =============================================================================

@dataclass
class PrewarmState:
    """Track pre-warm state for cross-model cache optimization."""
    last_system_prompt_hash: str = ""
    is_warming: bool = False
    last_model_used: str = ""
    warmed_models: set = field(default_factory=set)

_prewarm_state = PrewarmState()
_prewarm_lock = threading.Lock()


def _compute_system_prompt_hash(messages: list) -> str:
    """Compute hash of system prompt for change detection."""
    system_content = ""
    for m in messages:
        role = m.get("role", "")
        if role == "system":
            content = m.get("content", "")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        system_content += block.get("text", "")
            else:
                system_content += str(content)
    if not system_content:
        return ""
    return hashlib.sha256(system_content.encode()).hexdigest()[:16]


def _prewarm_model_cache(model_id: str, messages: list, logger_ref):
    """Pre-warm cache for a model in background thread."""
    try:
        from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

        logger_ref.info(f"[Pre-warm] Loading model: {model_id}")
        wrapper = wrapper_cache.get_wrapper(model_id)

        system_msgs = [m for m in messages if m.get("role") == "system"]
        if not system_msgs:
            logger_ref.info("[Pre-warm] No system messages to warm")
            return

        warm_messages = system_msgs + [{"role": "user", "content": "test"}]
        prompt = wrapper.tokenizer.apply_chat_template(
            warm_messages,
            add_generation_prompt=True
        )

        with _mlx_lock:
            wrapper.prompt_cache.get_prompt_cache(wrapper.model, prompt)

        with _prewarm_lock:
            _prewarm_state.warmed_models.add(model_id)

        logger_ref.info(f"[Pre-warm] Completed for {model_id} ({len(prompt)} tokens)")

    except Exception as e:
        logger_ref.warning(f"[Pre-warm] Failed for {model_id}: {e}")
    finally:
        with _prewarm_lock:
            _prewarm_state.is_warming = False


def trigger_prewarm_if_needed(current_model: str, messages: list, logger_ref):
    """Check if we should pre-warm another model's cache."""
    from patches import get_tier_config

    with _prewarm_lock:
        if _prewarm_state.is_warming:
            return

        haiku_config = get_tier_config("haiku")
        sonnet_config = get_tier_config("sonnet")

        haiku_model = haiku_config.get("model", "")
        sonnet_model = sonnet_config.get("model", "")
        haiku_backend = haiku_config.get("backend", "mlx")
        sonnet_backend = sonnet_config.get("backend", "mlx")

        target_model = None
        if current_model == haiku_model and sonnet_model and sonnet_backend == "mlx":
            target_model = sonnet_model
        elif current_model == sonnet_model and haiku_model and haiku_backend == "mlx":
            target_model = haiku_model
        else:
            return

        prompt_hash = _compute_system_prompt_hash(messages)
        if not prompt_hash:
            return

        if (prompt_hash == _prewarm_state.last_system_prompt_hash and
            target_model in _prewarm_state.warmed_models):
            return

        _prewarm_state.last_system_prompt_hash = prompt_hash
        _prewarm_state.is_warming = True
        _prewarm_state.last_model_used = current_model

    thread = threading.Thread(
        target=_prewarm_model_cache,
        args=(target_model, messages, logger_ref),
        daemon=True
    )
    thread.start()
    logger_ref.info(f"[Pre-warm] Started background warm-up for {target_model}")


# =============================================================================
# Pydantic Models
# =============================================================================

class PromptCacheConfig(BaseModel):
    block_size: int = 256
    max_slots: int = 4
    min_reuse_tokens: int = 512
    max_cached_tokens: int = 65536


class PrewarmRequest(BaseModel):
    model_id: str
    system_prompt: Optional[str] = None


# =============================================================================
# KV Cache Endpoints
# =============================================================================

@router.get("/cache/stats")
def get_cache_stats():
    """Get KV cache statistics."""
    return kv_cache.get_stats()


@router.post("/cache/clear")
def clear_cache(include_persisted: bool = False):
    """Clear the KV cache."""
    kv_cache.clear(include_persisted=include_persisted)
    return {"status": "cleared", "include_persisted": include_persisted}


@router.get("/cache/persisted")
def list_persisted_cache():
    """List persisted cache entries."""
    return {"entries": kv_cache.list_persisted()}


@router.delete("/cache/persisted/{cache_key}")
def delete_persisted_cache(cache_key: str):
    """Delete a persisted cache entry."""
    success = kv_cache.delete_persisted(cache_key)
    return {"status": "deleted" if success else "not_found", "cache_key": cache_key}


@router.post("/cache/persist/{slot_id}")
def persist_cache_slot(slot_id: str):
    """Persist a cache slot to disk."""
    success = kv_cache.persist_slot(slot_id)
    return {"status": "persisted" if success else "not_found", "slot_id": slot_id}


# =============================================================================
# Prompt Cache Endpoints
# =============================================================================

@router.get("/prompt-cache/config")
def get_prompt_cache_config():
    """Get current prompt cache configuration."""
    return {
        "block_size": int(os.environ.get("MLX_CACHE_BLOCK_SIZE", "256")),
        "max_slots": int(os.environ.get("MLX_CACHE_MAX_SLOTS", "4")),
        "min_reuse_tokens": int(os.environ.get("MLX_CACHE_MIN_REUSE", "512")),
        "max_cached_tokens": int(os.environ.get("MLX_CACHE_MAX_TOKENS", "65536")),
    }


@router.post("/prompt-cache/config")
def set_prompt_cache_config(config: PromptCacheConfig):
    """Update prompt cache configuration."""
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


@router.get("/prompt-cache/stats")
def get_prompt_cache_stats():
    """Get SmartPromptCache statistics from loaded models."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    stats = {}
    try:
        for key, wrapper in wrapper_cache._cache.items():
            if hasattr(wrapper, 'prompt_cache') and wrapper._prompt_cache is not None:
                cache_stats = wrapper.prompt_cache.get_stats()
                key_str = str(key)
                stats[key_str] = cache_stats
    except Exception as e:
        logger.warning(f"Failed to get prompt cache stats: {e}")

    return {
        "caches": stats,
        "total_caches": len(stats),
        "config": get_prompt_cache_config()
    }


@router.get("/prompt-cache/health")
def get_prompt_cache_health():
    """Get human-readable health report for prompt caches."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    reports = []
    try:
        for key, wrapper in wrapper_cache._cache.items():
            if hasattr(wrapper, 'prompt_cache') and wrapper._prompt_cache is not None:
                report = wrapper.prompt_cache.get_health_report()
                reports.append({"model": str(key), "report": report})
    except Exception as e:
        logger.warning(f"Failed to get prompt cache health: {e}")

    return {"reports": reports, "count": len(reports)}


@router.post("/prompt-cache/clear")
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
# Pre-warm Endpoints
# =============================================================================

@router.get("/prewarm/status")
def get_prewarm_status():
    """Get current pre-warm system status."""
    with _prewarm_lock:
        return {
            "enabled": True,
            "is_warming": _prewarm_state.is_warming,
            "last_model_used": _prewarm_state.last_model_used,
            "warmed_models": list(_prewarm_state.warmed_models),
            "system_prompt_hash": _prewarm_state.last_system_prompt_hash[:8] + "..." if _prewarm_state.last_system_prompt_hash else None
        }


@router.post("/prewarm/trigger")
def trigger_prewarm_manual(request: PrewarmRequest):
    """Manually trigger pre-warm for a specific model."""
    from patches import resolve_alias_with_backend

    resolved_model, backend = resolve_alias_with_backend(request.model_id)

    if backend != "mlx":
        return {"status": "skipped", "reason": "GGUF models don't support KV cache pre-warming"}

    messages = []
    if request.system_prompt:
        messages = [{"role": "system", "content": request.system_prompt}]
    else:
        messages = [{"role": "system", "content": "You are a helpful assistant."}]

    with _prewarm_lock:
        if _prewarm_state.is_warming:
            return {"status": "busy", "message": "Pre-warm already in progress"}
        _prewarm_state.is_warming = True

    thread = threading.Thread(
        target=_prewarm_model_cache,
        args=(resolved_model, messages, logger),
        daemon=True
    )
    thread.start()

    return {
        "status": "started",
        "model": resolved_model,
        "backend": backend
    }


@router.post("/prewarm/clear")
def clear_prewarm_state():
    """Clear pre-warm state to force re-warming on next request."""
    with _prewarm_lock:
        _prewarm_state.warmed_models.clear()
        _prewarm_state.last_system_prompt_hash = ""
        _prewarm_state.last_model_used = ""
    return {"status": "cleared"}
