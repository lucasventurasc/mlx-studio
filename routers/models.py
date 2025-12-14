"""
Models API endpoints - model listing, loading, unloading, search.
"""
import gc
import json
import logging
import time
import threading
from pathlib import Path
from fastapi import APIRouter

from extensions import ModelManager

logger = logging.getLogger("mlx-studio.models")
router = APIRouter(prefix="/api/models", tags=["Models"])

# Shared model manager
model_manager = ModelManager()

# Global lock for MLX GPU operations (imported from main server)
_mlx_lock = None

def set_mlx_lock(lock: threading.Lock):
    """Set the MLX lock from the main server."""
    global _mlx_lock
    _mlx_lock = lock


# =============================================================================
# Helper Functions
# =============================================================================

def _get_model_capabilities(model_path: str) -> dict:
    """Get model capabilities by reading config files."""
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

            added_tokens = config.get("added_tokens_decoder", {})
            for token_info in added_tokens.values():
                content = token_info.get("content", "")
                if content == "<think>":
                    capabilities["supports_thinking"] = True
                    break

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

            capabilities["context_length"] = config.get("max_position_embeddings") or config.get("max_seq_len")
        except Exception:
            pass

    return capabilities


# =============================================================================
# Model Endpoints
# =============================================================================

@router.get("/local")
def list_local_models():
    """List all MLX and GGUF models downloaded locally with capabilities."""
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
                "backend": "mlx" if m.is_mlx else "gguf",
                "capabilities": _get_model_capabilities(m.path) if m.is_mlx else {}
            }
            for m in models
        ],
        "count": len(models),
        "cache_dir": str(model_manager.get_cache_dir())
    }


@router.post("/load")
def load_model(model_id: str, warmup_prompt: str = None, draft_model: str = None):
    """Pre-load a model into memory cache with optional prompt warmup.

    This is the only safe way to load models - prevents concurrent GPU access.
    Must be called before making chat/completion requests to a model.

    Automatically detects GGUF models and routes to llama-server backend.
    """
    from patches import resolve_alias_with_backend, get_draft_model_for, resolve_alias
    from extensions.gguf_backend import gguf_server

    start = time.time()

    try:
        local_models = model_manager.list_local_models()
        local_model = next((m for m in local_models if m.id == model_id), None)
        load_path = local_model.path if local_model else model_id

        resolved_path, backend = resolve_alias_with_backend(load_path)

        if backend == "mlx" and draft_model is None:
            draft_model = get_draft_model_for(model_id)
        if draft_model:
            draft_model = resolve_alias(draft_model)
        logger.info(f"Pre-loading model: {model_id} -> {resolved_path} (backend={backend})")

        if backend == "gguf":
            result = gguf_server.start(resolved_path)
            elapsed = time.time() - start
            return {
                "status": result.get("status", "loaded"),
                "model_id": model_id,
                "path": resolved_path,
                "backend": "gguf",
                "time": round(elapsed, 2),
                "port": result.get("port"),
                "warmup": None
            }
        else:
            from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator

            if draft_model:
                logger.info(f"Pre-loading model: {model_id} -> {resolved_path} with draft={draft_model}")

            with _mlx_lock:
                wrapper = ChatGenerator.get_or_create(
                    model_id=resolved_path,
                    draft_model_id=draft_model
                )
                model_time = time.time() - start
                logger.info(f"Model loaded in {model_time:.1f}s: {model_id}" + (f" (draft: {draft_model})" if draft_model else ""))

                warmup_time = 0
                warmup_tokens = 0

                if warmup_prompt:
                    warmup_start = time.time()
                    logger.info(f"Warming up KV cache with prompt ({len(warmup_prompt)} chars)...")

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
                    "path": resolved_path,
                    "backend": "mlx",
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


@router.get("/loaded")
def get_loaded_models():
    """Get list of currently loaded models in memory (MLX and GGUF)."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache
    from extensions.gguf_backend import gguf_server

    cache_info = wrapper_cache.get_cache_info()

    loaded_models = []
    for key_str in cache_info.get("cached_keys", []):
        if "model_id='" in key_str:
            start = key_str.find("model_id='") + len("model_id='")
            end = key_str.find("'", start)
            model_id = key_str[start:end]
            loaded_models.append({
                "model_id": model_id,
                "backend": "mlx",
                "key": key_str
            })

    if gguf_server.is_running() and gguf_server.current_model:
        loaded_models.append({
            "model_id": gguf_server.current_model,
            "backend": "gguf",
            "port": gguf_server.port
        })

    return {
        "loaded": loaded_models,
        "count": len(loaded_models),
        "max_size": cache_info.get("max_size", 0)
    }


@router.post("/unload")
def unload_model(model_id: str = None):
    """Unload model(s) from memory cache and free GPU memory.

    Args:
        model_id: Specific model to unload. If None, unloads ALL models.
    """
    import mlx.core as mx
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache
    from extensions.gguf_backend import gguf_server

    with _mlx_lock:
        try:
            gguf_stopped = False

            # If specific model_id provided, only unload that model
            if model_id:
                removed = wrapper_cache.remove_model(model_id)

                # Clear GPU memory
                gc.collect()
                mx.metal.clear_cache()

                if removed:
                    logger.info(f"Unloaded model: {model_id}")
                    return {
                        "status": "unloaded",
                        "model_id": model_id,
                        "message": f"Model {model_id} unloaded"
                    }
                else:
                    return {
                        "status": "not_found",
                        "model_id": model_id,
                        "message": f"Model {model_id} was not loaded"
                    }

            # No model_id = unload ALL models
            if gguf_server.is_running():
                gguf_server.stop()
                gguf_stopped = True
                logger.info("Stopped llama-server (GGUF backend)")

            wrapper_cache.clear_cache()

            try:
                from mlx_omni_server.chat.mlx.smart_prompt_cache import smart_cache
                smart_cache.clear()
            except ImportError:
                pass

            gc.collect()
            mx.eval(mx.zeros(1))
            mx.metal.clear_cache()

            logger.info("Unloaded all models and cleared GPU memory")
            return {
                "status": "cleared",
                "message": "All models unloaded and GPU memory freed",
                "gguf_stopped": gguf_stopped
            }
        except Exception as e:
            logger.error(f"Failed to unload model: {e}")
            return {"status": "error", "error": str(e)}


@router.get("/search")
def search_models(q: str = "", limit: int = 20, backend: str = "all"):
    """Search for MLX and GGUF models on HuggingFace."""
    results = model_manager.search_hf_models(q, limit, backend)
    return {"results": results, "query": q, "backend": backend}


@router.get("/info/{author}/{model}")
def get_model_info(author: str, model: str):
    """Get detailed info about a model from HuggingFace."""
    repo_id = f"{author}/{model}"
    info = model_manager.get_model_info(repo_id)
    if info:
        return info
    return {"error": "Model not found", "repo_id": repo_id}


@router.get("/capabilities")
def get_model_capabilities_endpoint(model_path: str):
    """Get model capabilities by reading config files."""
    path = Path(model_path)
    if not path.exists():
        return {"error": "Model path not found", "path": model_path}
    return _get_model_capabilities(model_path)


@router.post("/download")
def start_download(repo_id: str):
    """Start downloading a model from HuggingFace."""
    return model_manager.start_download(repo_id)


@router.get("/downloads")
def get_downloads():
    """Get status of all downloads."""
    return {"downloads": model_manager.get_download_status()}


@router.get("/downloads/{author}/{model}")
def get_download_status(author: str, model: str):
    """Get download status for a specific model."""
    repo_id = f"{author}/{model}"
    return model_manager.get_download_status(repo_id)
