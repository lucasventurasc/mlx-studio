"""
MLX Studio Extensions

Custom features that extend mlx-omni-server:
- KV cache multi-slot with disk persistence
- Inference profiles
- Model discovery and HuggingFace integration
- Global inference settings
"""

from .kv_cache import KVCacheManager
from .profiles import InferenceProfiles, PROFILES
from .models import ModelManager
from .global_settings import get_global_settings, GlobalSettingsManager

__all__ = ['KVCacheManager', 'InferenceProfiles', 'PROFILES', 'ModelManager', 'get_global_settings', 'GlobalSettingsManager']
