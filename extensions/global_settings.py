"""
Global inference settings shared across all endpoints.

This module provides a singleton for inference settings that can be
accessed by both OpenAI and Anthropic routers.
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass, field
import threading
import json
from pathlib import Path

# Settings file path
SETTINGS_FILE = Path(__file__).parent.parent / "inference_settings.json"


@dataclass
class InferenceSettings:
    """Global inference settings.

    Defaults optimized for reasoning and reduced hallucination:
    - Low temperature (0.3) for focused, deterministic output
    - Lower top_p (0.85) for more predictable responses
    - Moderate top_k (30) to limit vocabulary
    """
    temperature: float = 0.3
    top_p: float = 0.85
    top_k: int = 30
    max_tokens: int = 8192

    def to_dict(self) -> Dict[str, Any]:
        return {
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
            "max_tokens": self.max_tokens
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "InferenceSettings":
        return cls(
            temperature=data.get("temperature", 0.7),
            top_p=data.get("top_p", 0.9),
            top_k=data.get("top_k", 40),
            max_tokens=data.get("max_tokens", 8192)
        )


class GlobalSettingsManager:
    """Singleton manager for global inference settings."""

    _instance: Optional["GlobalSettingsManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._settings = InferenceSettings()
        self._load()

    def _load(self):
        """Load settings from file if exists."""
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE) as f:
                    data = json.load(f)
                    self._settings = InferenceSettings.from_dict(data)
            except Exception:
                pass  # Use defaults

    def _save(self):
        """Save settings to file."""
        try:
            with open(SETTINGS_FILE, "w") as f:
                json.dump(self._settings.to_dict(), f, indent=2)
        except Exception:
            pass  # Ignore save errors

    @property
    def settings(self) -> InferenceSettings:
        """Get current settings."""
        return self._settings

    def update(self, **kwargs) -> InferenceSettings:
        """Update settings and save."""
        for key, value in kwargs.items():
            if hasattr(self._settings, key) and value is not None:
                setattr(self._settings, key, value)
        self._save()
        return self._settings

    def get_sampler_config(self,
                           request_temp: Optional[float] = None,
                           request_top_p: Optional[float] = None,
                           request_top_k: Optional[int] = None) -> Dict[str, Any]:
        """Get sampler config, with request values taking precedence over global settings."""
        return {
            "temp": request_temp if request_temp is not None else self._settings.temperature,
            "top_p": request_top_p if request_top_p is not None else self._settings.top_p,
            "top_k": request_top_k if request_top_k is not None else self._settings.top_k,
        }


# Global singleton instance
global_settings = GlobalSettingsManager()


def get_global_settings() -> GlobalSettingsManager:
    """Get the global settings manager instance."""
    return global_settings
