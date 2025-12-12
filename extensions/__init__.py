"""
MLX Studio Extensions

Custom features that extend mlx-omni-server:
- KV cache multi-slot with disk persistence
- Inference profiles
- Model discovery and HuggingFace integration
"""

from .kv_cache import KVCacheManager
from .profiles import InferenceProfiles, PROFILES
from .models import ModelManager

__all__ = ['KVCacheManager', 'InferenceProfiles', 'PROFILES', 'ModelManager']
