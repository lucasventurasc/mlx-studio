"""
GGUF Backend API endpoints - llama-server management.
"""
import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("mlx-studio.gguf")
router = APIRouter(prefix="/api/gguf", tags=["GGUF"])


# =============================================================================
# Pydantic Models
# =============================================================================

class GGUFConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    port: Optional[int] = None
    auto_start: Optional[bool] = None
    llama_server_path: Optional[str] = None
    default_args: Optional[list] = None
    # Speculative decoding settings
    draft_model: Optional[str] = None
    draft_n: Optional[int] = None
    draft_p_min: Optional[float] = None


# =============================================================================
# GGUF Endpoints
# =============================================================================

@router.get("/config")
def get_gguf_config():
    """Get GGUF backend configuration."""
    from extensions.gguf_backend import load_gguf_config
    return load_gguf_config()


@router.post("/config")
def update_gguf_config(update: GGUFConfigUpdate):
    """Update GGUF backend configuration."""
    from extensions.gguf_backend import load_gguf_config, save_gguf_config, gguf_server

    config = load_gguf_config()

    if update.enabled is not None:
        config["enabled"] = update.enabled
    if update.port is not None:
        config["port"] = update.port
    if update.auto_start is not None:
        config["auto_start"] = update.auto_start
    if update.llama_server_path is not None:
        config["llama_server_path"] = update.llama_server_path
    if update.default_args is not None:
        config["default_args"] = update.default_args
    # Speculative decoding settings
    if update.draft_model is not None:
        config["draft_model"] = update.draft_model if update.draft_model else None
    if update.draft_n is not None:
        config["draft_n"] = update.draft_n
    if update.draft_p_min is not None:
        config["draft_p_min"] = update.draft_p_min

    save_gguf_config(config)
    gguf_server.reload_config()
    return {"status": "updated", "config": config}


@router.get("/status")
def get_gguf_status():
    """Get GGUF server status."""
    from extensions.gguf_backend import gguf_server
    return gguf_server.get_status()


@router.post("/start")
def start_gguf_server(model_path: str, port: Optional[int] = None):
    """Start llama-server with specified GGUF model.

    Args:
        model_path: Path to GGUF model file
        port: Server port (default from config)
    """
    from extensions.gguf_backend import gguf_server

    try:
        result = gguf_server.start(model_path, port)
        return result
    except FileNotFoundError as e:
        return {"status": "error", "error": str(e)}
    except RuntimeError as e:
        return {"status": "error", "error": str(e)}
    except TimeoutError as e:
        return {"status": "error", "error": str(e)}


@router.post("/stop")
def stop_gguf_server():
    """Stop llama-server."""
    from extensions.gguf_backend import gguf_server
    return gguf_server.stop()


@router.get("/health")
async def gguf_health_check():
    """Check if llama-server is healthy."""
    from extensions.gguf_backend import gguf_server, GGUFBackend

    if not gguf_server.is_running():
        return {"healthy": False, "reason": "not_running"}

    backend = GGUFBackend(gguf_server.server_url)
    try:
        healthy = await backend.health_check()
        return {"healthy": healthy, "server_url": gguf_server.server_url}
    finally:
        await backend.close()
