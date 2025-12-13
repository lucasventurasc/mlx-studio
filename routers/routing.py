"""
Routing API endpoints - Claude tier routing and remote instances.
"""
import json
import logging
import httpx
from pathlib import Path
from typing import Dict, Optional
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("mlx-studio.routing")
router = APIRouter(prefix="/api", tags=["Routing"])

# Config files
ROUTING_FILE = Path(__file__).parent.parent / "claude_routing.json"
REMOTES_FILE = Path(__file__).parent.parent / "remotes.json"


# =============================================================================
# Routing Config Helpers
# =============================================================================

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
            "haiku": {"model": None, "draft_model": None, "backend": "mlx"},
            "sonnet": {"model": None, "draft_model": None, "backend": "mlx"},
            "opus": {"model": None, "draft_model": None, "backend": "mlx"},
        },
        "default_model": None,
    }


def save_routing_config(config: dict):
    """Save Claude routing configuration."""
    with open(ROUTING_FILE, "w") as f:
        json.dump(config, f, indent=2)


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


# =============================================================================
# Pydantic Models
# =============================================================================

class TierConfig(BaseModel):
    model: Optional[str] = None
    draft_model: Optional[str] = None
    backend: Optional[str] = "mlx"


class RoutingConfig(BaseModel):
    enabled: bool = True
    tiers: Dict[str, TierConfig] = {}
    default_model: Optional[str] = None


class AliasConfig(BaseModel):
    alias: str
    model_path: str


class RemoteConfig(BaseModel):
    name: str
    url: str
    enabled: bool = True


# =============================================================================
# Routing Endpoints
# =============================================================================

@router.get("/routing/config")
def get_routing_config_endpoint():
    """Get Claude model routing configuration."""
    return load_routing_config()


@router.post("/routing/config")
def set_routing_config_endpoint(config: RoutingConfig):
    """Update Claude model routing configuration."""
    from patches import reload_routing_config

    existing = load_routing_config()
    existing["enabled"] = config.enabled
    existing["default_model"] = config.default_model

    for tier_name, tier_config in config.tiers.items():
        if tier_name in existing.get("tiers", {}):
            existing["tiers"][tier_name]["model"] = tier_config.model
            existing["tiers"][tier_name]["draft_model"] = tier_config.draft_model

    save_routing_config(existing)
    reload_routing_config()

    logger.info(f"Updated routing config: {config}")
    return {"status": "updated", "config": existing}


@router.post("/routing/tier/{tier_name}")
def set_tier_model(
    tier_name: str,
    model: Optional[str] = None,
    draft_model: Optional[str] = None,
    backend: Optional[str] = None
):
    """Set model for a specific tier (haiku/sonnet/opus).

    Auto-detects backend from model path if not explicitly provided:
    - .gguf files -> backend="gguf"
    - Everything else -> backend="mlx"
    """
    from patches import reload_routing_config

    config = load_routing_config()

    if tier_name not in config.get("tiers", {}):
        return {"status": "error", "message": f"Unknown tier: {tier_name}"}

    config["tiers"][tier_name]["model"] = model
    config["tiers"][tier_name]["draft_model"] = draft_model

    # Auto-detect backend from model path if not explicitly provided
    if backend:
        config["tiers"][tier_name]["backend"] = backend
    elif model:
        if model.lower().endswith(".gguf") or ".gguf" in model.lower():
            config["tiers"][tier_name]["backend"] = "gguf"
            logger.info(f"Auto-detected GGUF backend for model: {model}")
        else:
            config["tiers"][tier_name]["backend"] = "mlx"

    save_routing_config(config)
    reload_routing_config()

    final_backend = config["tiers"][tier_name].get("backend", "mlx")
    logger.info(f"Set {tier_name} -> model={model}, draft={draft_model}, backend={final_backend}")
    return {
        "status": "updated",
        "tier": tier_name,
        "model": model,
        "draft_model": draft_model,
        "backend": final_backend
    }


@router.get("/routing/resolve/{model_id:path}")
def resolve_model_routing(model_id: str):
    """Preview how a model ID would be resolved with current routing config."""
    from patches import resolve_alias_with_backend
    resolved, backend = resolve_alias_with_backend(model_id)
    return {
        "original": model_id,
        "resolved": resolved,
        "backend": backend,
        "is_claude": model_id.startswith("claude-")
    }


# =============================================================================
# Remotes Endpoints
# =============================================================================

@router.get("/remotes")
def get_remotes():
    """Get all configured remote instances."""
    return {"remotes": load_remotes()}


@router.post("/remotes")
def add_remote(config: RemoteConfig):
    """Add or update a remote instance."""
    remotes = load_remotes()

    # Update if exists, add if new
    existing = next((r for r in remotes if r["name"] == config.name), None)
    if existing:
        existing["url"] = config.url
        existing["enabled"] = config.enabled
    else:
        remotes.append({"name": config.name, "url": config.url, "enabled": config.enabled})

    save_remotes(remotes)
    return {"status": "added", "remote": config.dict()}


@router.post("/remotes/{name}")
def update_remote(name: str, enabled: Optional[bool] = None, url: Optional[str] = None):
    """Update a remote instance."""
    remotes = load_remotes()
    remote = next((r for r in remotes if r["name"] == name), None)

    if not remote:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    if enabled is not None:
        remote["enabled"] = enabled
    if url is not None:
        remote["url"] = url

    save_remotes(remotes)
    return {"status": "updated", "remote": remote}


@router.delete("/remotes/{name}")
def delete_remote(name: str):
    """Delete a remote instance."""
    remotes = load_remotes()
    remotes = [r for r in remotes if r["name"] != name]
    save_remotes(remotes)
    return {"status": "deleted", "name": name}


@router.get("/remotes/{name}/health")
async def check_remote_health(name: str):
    """Check health of a remote instance."""
    remotes = load_remotes()
    remote = next((r for r in remotes if r["name"] == name), None)

    if not remote:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{remote['url']}/health")
            if response.status_code == 200:
                return {"status": "online", "name": name, "url": remote["url"]}
    except Exception as e:
        logger.debug(f"Remote {name} health check failed: {e}")

    return {"status": "offline", "name": name, "url": remote["url"]}


@router.get("/remotes/{name}/models")
async def get_remote_models(name: str):
    """Get available models from a remote instance."""
    remotes = load_remotes()
    remote = next((r for r in remotes if r["name"] == name), None)

    if not remote:
        return {"status": "error", "message": f"Remote '{name}' not found"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{remote['url']}/api/models/local")
            if response.status_code == 200:
                data = response.json()
                return {"status": "ok", "models": data.get("models", [])}
    except Exception as e:
        logger.warning(f"Failed to get models from {name}: {e}")

    return {"status": "error", "message": "Failed to fetch models"}


# =============================================================================
# Aliases Endpoints
# =============================================================================

ALIASES_FILE = Path(__file__).parent.parent / "model_aliases.json"


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


@router.get("/aliases")
def get_aliases():
    """Get all model aliases."""
    return {"aliases": load_aliases()}


@router.post("/aliases")
def add_alias(config: AliasConfig):
    """Add or update a model alias."""
    from patches import reload_aliases

    aliases = load_aliases()
    aliases[config.alias] = config.model_path
    save_aliases(aliases)
    reload_aliases()
    return {"status": "added", "alias": config.alias, "model": config.model_path}


@router.delete("/aliases/{alias}")
def delete_alias(alias: str):
    """Delete a model alias."""
    from patches import reload_aliases

    aliases = load_aliases()
    if alias in aliases:
        del aliases[alias]
        save_aliases(aliases)
        reload_aliases()
        return {"status": "deleted", "alias": alias}
    return {"status": "not_found", "alias": alias}


@router.post("/aliases/auto")
def auto_create_aliases():
    """Auto-create aliases from local models."""
    from patches import reload_aliases
    from extensions import ModelManager

    model_manager = ModelManager()
    aliases = load_aliases()
    created = []

    for model in model_manager.list_local_models():
        # Extract short name from model id
        name = model.id.split("/")[-1].lower()
        name = name.replace("-mlx", "").replace("-4bit", "").replace("-8bit", "")

        if name not in aliases:
            aliases[name] = model.path
            created.append(name)

    save_aliases(aliases)
    reload_aliases()
    return {"status": "ok", "created": created, "total": len(aliases)}
