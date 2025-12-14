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
    ./venv-omni/bin/python server.py --port 8080 --model-cache-size 1

Environment Variables (Cache Configuration):
    MLX_CACHE_BLOCK_SIZE   - Token block size for hashing (default: 256)
    MLX_CACHE_MAX_SLOTS    - Maximum cache slots (default: 4)
    MLX_CACHE_MIN_REUSE    - Minimum tokens to reuse cache (default: 512)
    MLX_CACHE_MAX_TOKENS   - Maximum tokens per slot (default: 65536)
    MLX_MODEL_CACHE_SIZE   - Max models in memory (default: 1)
"""

import os
import sys
import argparse
import logging
import threading
from pathlib import Path

# =============================================================================
# Parse args FIRST (before setting env vars)
# =============================================================================

def parse_args():
    parser = argparse.ArgumentParser(description="MLX Studio Server")
    parser.add_argument("--port", type=int, default=8080, help="Server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Server host")
    parser.add_argument("--model-cache-size", type=int, default=None,
                        help="Max models in memory (default: 1, use env MLX_MODEL_CACHE_SIZE)")
    parser.add_argument("--kv-bits", type=int, default=None,
                        help="KV cache quantization bits (default: None, use env MLX_KV_BITS)")
    return parser.parse_args()

_args = parse_args()

# Global lock for MLX GPU operations - prevents Metal command buffer conflicts
_mlx_lock = threading.Lock()

# =============================================================================
# Cache Configuration (set before importing mlx-omni-server)
# =============================================================================

CACHE_DEFAULTS = {
    "MLX_CACHE_BLOCK_SIZE": "256",
    "MLX_CACHE_MAX_SLOTS": "4",
    "MLX_CACHE_MIN_REUSE": "512",
    "MLX_CACHE_MAX_TOKENS": "65536",
    "MLX_MODEL_CACHE_SIZE": "1",  # Default: 1 model in memory
    "MLX_MODEL_CACHE_TTL": "0",
}

# Apply defaults, then override with command line args
for key, default in CACHE_DEFAULTS.items():
    if key not in os.environ:
        os.environ[key] = default

# Command line args override env vars
if _args.model_cache_size is not None:
    os.environ["MLX_MODEL_CACHE_SIZE"] = str(_args.model_cache_size)
if _args.kv_bits is not None:
    os.environ["MLX_KV_BITS"] = str(_args.kv_bits)

# Add vendor mlx-omni-server to path
VENDOR_PATH = Path(__file__).parent / "vendor" / "mlx-omni-server" / "src"
sys.path.insert(0, str(VENDOR_PATH))

# Apply compatibility patches before importing mlx-omni-server
from patches import apply_patches
apply_patches()

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Import mlx-omni-server chat routers
from mlx_omni_server.chat.openai.router import router as openai_router
from mlx_omni_server.chat.anthropic.router import router as anthropic_router

# Import audio routers (STT/TTS)
from mlx_omni_server.stt import stt as stt_router
from mlx_omni_server.tts import tts as tts_router

# Import our custom routers
from routers.routing import router as routing_router
from routers.gguf import router as gguf_router
from routers.models import router as models_router, set_mlx_lock as set_models_lock
from routers.cache import router as cache_router, set_mlx_lock as set_cache_lock, trigger_prewarm_if_needed
from routers.misc import router as misc_router, setup_log_handler
from routers.model_configs import router as model_configs_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mlx-studio")

# Setup log handler for web streaming
setup_log_handler()

# Share the MLX lock with routers that need it
set_models_lock(_mlx_lock)
set_cache_lock(_mlx_lock)

# =============================================================================
# Create FastAPI App
# =============================================================================

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

# Configure pre-warm hook for Anthropic router
try:
    from mlx_omni_server.chat.anthropic.router import set_post_generation_hook

    def prewarm_hook(resolved_model: str, messages: list):
        """Hook called after each Anthropic generation to trigger pre-warm."""
        trigger_prewarm_if_needed(resolved_model, messages, logger)

    set_post_generation_hook(prewarm_hook)
    logger.info("Pre-warm hook configured for Anthropic router")
except ImportError as e:
    logger.warning(f"Could not configure pre-warm hook: {e}")

# Mount audio routers (STT/TTS for Voice Mode)
app.include_router(stt_router.router, tags=["Audio"])
app.include_router(tts_router.router, tags=["Audio"])

# Mount our custom routers
app.include_router(routing_router)
app.include_router(gguf_router)
app.include_router(models_router)
app.include_router(cache_router)
app.include_router(misc_router)
app.include_router(model_configs_router)


# =============================================================================
# Static Files (Frontend)
# =============================================================================

frontend_dir = Path(__file__).parent / "frontend"
if frontend_dir.exists() and (frontend_dir / "index.html").exists():
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
    lan_ip = get_network_ip()
    model_cache_size = os.environ.get("MLX_MODEL_CACHE_SIZE", "1")
    kv_bits = os.environ.get("MLX_KV_BITS", "off")

    print(f"""
╔═══════════════════════════════════════════════════════════╗
║              ⚡ MLX Studio v2.0                            ║
║     Powered by mlx-omni-server + custom extensions        ║
╠═══════════════════════════════════════════════════════════╣
║  Local: http://localhost:{_args.port:<5}                         ║""")

    if lan_ip:
        print(f"║  LAN:   http://{lan_ip}:{_args.port:<5}                      ║")

    print(f"""║  API:   /v1/chat/completions (OpenAI)                   ║
║  API:   /anthropic/v1/messages (Anthropic)              ║
║  Max cache size: {model_cache_size:<3}  | KV bits: {kv_bits:<4}                  ║
╚═══════════════════════════════════════════════════════════╝
""")

    uvicorn.run(app, host=_args.host, port=_args.port, log_level="info")


if __name__ == "__main__":
    main()
