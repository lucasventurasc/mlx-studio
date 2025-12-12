"""
Inference Profiles for MLX Studio.

Pre-configured generation settings for different use cases.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ProfileSettings:
    """Settings for an inference profile."""
    name: str
    description: str
    temperature: float
    top_p: float
    max_tokens: int
    prefill_step_size: int
    kv_bits: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'description': self.description,
            'temperature': self.temperature,
            'top_p': self.top_p,
            'max_tokens': self.max_tokens,
            'prefill_step_size': self.prefill_step_size,
            'kv_bits': self.kv_bits
        }


# Pre-defined profiles
PROFILES: Dict[str, ProfileSettings] = {
    'speed': ProfileSettings(
        name='Speed',
        description='Maximum generation speed',
        temperature=0.7,
        top_p=0.9,
        max_tokens=2048,
        prefill_step_size=4096,
        kv_bits=8  # Quantize KV cache for speed
    ),
    'balanced': ProfileSettings(
        name='Balanced',
        description='Balance between speed and quality',
        temperature=0.7,
        top_p=0.95,
        max_tokens=8192,
        prefill_step_size=2048,
        kv_bits=None
    ),
    'quality': ProfileSettings(
        name='Quality',
        description='Maximum output quality',
        temperature=0.5,
        top_p=0.98,
        max_tokens=8192,
        prefill_step_size=1024,
        kv_bits=None
    ),
    'creative': ProfileSettings(
        name='Creative',
        description='Higher temperature for creative tasks',
        temperature=1.0,
        top_p=0.95,
        max_tokens=4096,
        prefill_step_size=2048,
        kv_bits=None
    ),
    'precise': ProfileSettings(
        name='Precise',
        description='Low temperature for factual responses',
        temperature=0.2,
        top_p=0.9,
        max_tokens=4096,
        prefill_step_size=2048,
        kv_bits=None
    )
}


class InferenceProfiles:
    """Manager for inference profiles."""

    def __init__(self, default_profile: str = 'balanced'):
        self.profiles = PROFILES
        self.current_profile = default_profile

    def get_all(self) -> Dict[str, Any]:
        """Get all available profiles."""
        return {
            'profiles': {k: v.to_dict() for k, v in self.profiles.items()},
            'current': self.current_profile
        }

    def get(self, name: str) -> Optional[ProfileSettings]:
        """Get a specific profile."""
        return self.profiles.get(name)

    def get_current(self) -> ProfileSettings:
        """Get current profile settings."""
        return self.profiles[self.current_profile]

    def set_current(self, name: str) -> Dict[str, Any]:
        """Set the current profile."""
        if name not in self.profiles:
            raise ValueError(f"Unknown profile: {name}")
        self.current_profile = name
        return {
            'status': 'changed',
            'profile': name,
            'settings': self.profiles[name].to_dict()
        }

    def apply_to_params(
        self,
        profile_name: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        prefill_step_size: Optional[int] = None,
        kv_bits: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Apply profile settings, with explicit params taking precedence.

        Returns dict with resolved generation parameters.
        """
        profile = self.profiles.get(profile_name or self.current_profile)

        return {
            'temperature': temperature if temperature is not None else profile.temperature,
            'top_p': top_p if top_p is not None else profile.top_p,
            'max_tokens': max_tokens if max_tokens is not None else profile.max_tokens,
            'prefill_step_size': prefill_step_size if prefill_step_size is not None else profile.prefill_step_size,
            'kv_bits': kv_bits if kv_bits is not None else profile.kv_bits
        }
