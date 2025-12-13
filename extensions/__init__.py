"""
MLX Studio Extensions

Custom features that extend mlx-omni-server:
- KV cache multi-slot with disk persistence
- Inference profiles
- Model discovery and HuggingFace integration
- Global inference settings
- GGUF backend via llama-server
"""

from .kv_cache import KVCacheManager
from .profiles import InferenceProfiles, PROFILES
from .models import ModelManager
from .global_settings import get_global_settings, GlobalSettingsManager
from .gguf_backend import GGUFServerManager, GGUFBackend, gguf_server, load_gguf_config, save_gguf_config
from .gguf_adapter import GGUFAnthropicAdapter
from .gguf_openai_adapter import GGUFOpenAIAdapter

__all__ = [
    'KVCacheManager',
    'InferenceProfiles',
    'PROFILES',
    'ModelManager',
    'get_global_settings',
    'GlobalSettingsManager',
    'GGUFServerManager',
    'GGUFBackend',
    'GGUFAnthropicAdapter',
    'GGUFOpenAIAdapter',
    'gguf_server',
    'load_gguf_config',
    'save_gguf_config',
]
