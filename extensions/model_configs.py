"""
Per-model configuration management.

Allows setting context_length, max_tokens, temperature, etc. per model.
Works for both MLX and GGUF models, regardless of Claude tier routing.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("mlx-studio.model-configs")

# Config file path
CONFIG_FILE = Path(__file__).parent.parent / "model_configs.json"

# Default configuration for new models
DEFAULT_MODEL_CONFIG = {
    "context_length": 65536,
    "max_tokens": 8192,
    "temperature": None,  # None = use global setting
    "top_p": None,
}

# Global defaults (fallback when model has no config)
GLOBAL_DEFAULTS = {
    "context_length": 65536,
    "max_tokens": 8192,
}


def load_model_configs() -> dict:
    """Load all model configurations from file."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load model configs: {e}")
    return {"configs": {}, "defaults": GLOBAL_DEFAULTS}


def save_model_configs(data: dict):
    """Save model configurations to file."""
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save model configs: {e}")


def get_model_config(model_id: str) -> dict:
    """Get configuration for a specific model.

    Args:
        model_id: Model path or ID

    Returns:
        Dict with context_length, max_tokens, temperature, top_p
        Falls back to defaults if model has no specific config
    """
    data = load_model_configs()
    configs = data.get("configs", {})
    defaults = data.get("defaults", GLOBAL_DEFAULTS)

    # Try exact match first
    if model_id in configs:
        config = configs[model_id]
        # Merge with defaults for any None values
        return {
            "context_length": config.get("context_length") or defaults.get("context_length", 65536),
            "max_tokens": config.get("max_tokens") or defaults.get("max_tokens", 8192),
            "temperature": config.get("temperature"),
            "top_p": config.get("top_p"),
        }

    # Try matching by model filename (for aliases)
    model_name = Path(model_id).name if "/" in model_id else model_id
    for path, config in configs.items():
        if Path(path).name == model_name:
            return {
                "context_length": config.get("context_length") or defaults.get("context_length", 65536),
                "max_tokens": config.get("max_tokens") or defaults.get("max_tokens", 8192),
                "temperature": config.get("temperature"),
                "top_p": config.get("top_p"),
            }

    # Return defaults
    return {
        "context_length": defaults.get("context_length", 65536),
        "max_tokens": defaults.get("max_tokens", 8192),
        "temperature": None,
        "top_p": None,
    }


def set_model_config(model_id: str, **kwargs) -> dict:
    """Set configuration for a specific model.

    Args:
        model_id: Model path or ID
        **kwargs: Config values to set (context_length, max_tokens, temperature, top_p)

    Returns:
        Updated config for the model
    """
    data = load_model_configs()
    if "configs" not in data:
        data["configs"] = {}

    # Get existing or create new
    if model_id not in data["configs"]:
        data["configs"][model_id] = dict(DEFAULT_MODEL_CONFIG)

    # Update only provided values
    for key in ["context_length", "max_tokens", "temperature", "top_p"]:
        if key in kwargs:
            data["configs"][model_id][key] = kwargs[key]

    save_model_configs(data)
    logger.info(f"Updated config for {model_id}: {kwargs}")

    return data["configs"][model_id]


def delete_model_config(model_id: str) -> bool:
    """Delete configuration for a specific model.

    Args:
        model_id: Model path or ID

    Returns:
        True if deleted, False if not found
    """
    data = load_model_configs()
    if model_id in data.get("configs", {}):
        del data["configs"][model_id]
        save_model_configs(data)
        logger.info(f"Deleted config for {model_id}")
        return True
    return False


def set_defaults(**kwargs) -> dict:
    """Set global default configuration.

    Args:
        **kwargs: Default values to set

    Returns:
        Updated defaults
    """
    data = load_model_configs()
    if "defaults" not in data:
        data["defaults"] = dict(GLOBAL_DEFAULTS)

    for key in ["context_length", "max_tokens"]:
        if key in kwargs and kwargs[key] is not None:
            data["defaults"][key] = kwargs[key]

    save_model_configs(data)
    return data["defaults"]


def list_configured_models() -> list:
    """List all models that have custom configurations.

    Returns:
        List of model IDs with custom configs
    """
    data = load_model_configs()
    return list(data.get("configs", {}).keys())
