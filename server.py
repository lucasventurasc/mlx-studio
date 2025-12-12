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
"""

import sys
import json
import argparse
import logging
from pathlib import Path

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
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Import mlx-omni-server chat routers
from mlx_omni_server.chat.openai.router import router as openai_router
from mlx_omni_server.chat.anthropic.router import router as anthropic_router

# Import our extensions
from extensions import KVCacheManager, InferenceProfiles, ModelManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mlx-studio")

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
    return profiles.set_current(profile_name)


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
# Model Management Endpoints
# =============================================================================

@app.get("/api/models/local")
def list_local_models():
    """List all MLX models downloaded locally."""
    models = model_manager.list_local_models()
    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "size": m.size_human,
                "size_bytes": m.size_bytes,
                "quantization": m.quantization,
                "path": m.path
            }
            for m in models
        ],
        "count": len(models),
        "cache_dir": str(model_manager.get_cache_dir())
    }


@app.post("/api/models/load")
def load_model(model_id: str, warmup_prompt: str = None):
    """Pre-load a model into memory cache with optional prompt warmup."""
    import time
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator

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


@app.post("/api/models/unload")
def unload_model(model_id: str = None):
    """Unload model(s) from memory cache."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    try:
        wrapper_cache.clear_cache()
        logger.info("Cleared all model cache - memory freed")
        return {"status": "cleared", "message": "All models unloaded"}
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
