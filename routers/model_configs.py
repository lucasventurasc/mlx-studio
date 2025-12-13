"""
Model Configurations API endpoints.

Per-model settings for context_length, max_tokens, etc.
"""

import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from extensions.model_configs import (
    load_model_configs,
    get_model_config,
    set_model_config,
    delete_model_config,
    set_defaults,
    list_configured_models,
)

logger = logging.getLogger("mlx-studio.model-configs-api")
router = APIRouter(prefix="/api/model-configs", tags=["Model Configs"])


class ModelConfigUpdate(BaseModel):
    context_length: Optional[int] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None


class DefaultsUpdate(BaseModel):
    context_length: Optional[int] = None
    max_tokens: Optional[int] = None


@router.get("")
def get_all_configs():
    """Get all model configurations."""
    data = load_model_configs()
    return {
        "configs": data.get("configs", {}),
        "defaults": data.get("defaults", {}),
        "configured_models": list_configured_models(),
    }


@router.get("/{model_id:path}")
def get_config(model_id: str):
    """Get configuration for a specific model."""
    config = get_model_config(model_id)
    return {
        "model_id": model_id,
        "config": config,
    }


@router.post("/{model_id:path}")
def update_config(model_id: str, update: ModelConfigUpdate):
    """Update configuration for a specific model."""
    # Filter out None values to only update what's provided
    updates = {k: v for k, v in update.dict().items() if v is not None}

    if not updates:
        return {"status": "no_changes", "model_id": model_id}

    config = set_model_config(model_id, **updates)
    return {
        "status": "updated",
        "model_id": model_id,
        "config": config,
    }


@router.delete("/{model_id:path}")
def remove_config(model_id: str):
    """Remove custom configuration for a model (reverts to defaults)."""
    deleted = delete_model_config(model_id)
    if deleted:
        return {"status": "deleted", "model_id": model_id}
    return {"status": "not_found", "model_id": model_id}


@router.get("/defaults")
def get_defaults():
    """Get global default configuration."""
    data = load_model_configs()
    return {"defaults": data.get("defaults", {})}


@router.post("/defaults")
def update_defaults(update: DefaultsUpdate):
    """Update global default configuration."""
    updates = {k: v for k, v in update.dict().items() if v is not None}

    if not updates:
        return {"status": "no_changes"}

    defaults = set_defaults(**updates)
    return {
        "status": "updated",
        "defaults": defaults,
    }
