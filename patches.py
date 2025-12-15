"""
Compatibility patches for mlx-omni-server.

These patches fix compatibility issues between mlx-omni-server
and newer versions of mlx-lm.
"""

import json
import re
import fnmatch
from pathlib import Path

# Model aliases - loaded from config file
_MODEL_ALIASES = {}
ALIASES_FILE = Path(__file__).parent / "model_aliases.json"

# Claude model routing configuration
_ROUTING_CONFIG = {}
ROUTING_FILE = Path(__file__).parent / "claude_routing.json"



def load_aliases():
    """Load model aliases from config file."""
    global _MODEL_ALIASES
    if ALIASES_FILE.exists():
        try:
            with open(ALIASES_FILE) as f:
                _MODEL_ALIASES = json.load(f)
        except Exception:
            pass
    return _MODEL_ALIASES


def reload_aliases():
    """Force reload of aliases configuration (called from routers)."""
    global _MODEL_ALIASES
    _MODEL_ALIASES = {}
    return load_aliases()


def load_routing_config():
    """Load Claude routing configuration."""
    global _ROUTING_CONFIG
    if ROUTING_FILE.exists():
        try:
            with open(ROUTING_FILE) as f:
                _ROUTING_CONFIG = json.load(f)
        except Exception:
            pass
    return _ROUTING_CONFIG


def reload_routing_config():
    """Force reload of routing configuration (called from server.py)."""
    global _ROUTING_CONFIG
    _ROUTING_CONFIG = {}
    return load_routing_config()


def _detect_claude_tier(model_id: str) -> str:
    """Detect which tier (haiku/sonnet/opus) a Claude model ID belongs to."""
    model_lower = model_id.lower()

    # Check patterns from config first
    if _ROUTING_CONFIG.get("patterns"):
        for pattern, tier in _ROUTING_CONFIG["patterns"].items():
            if re.match(pattern, model_id, re.IGNORECASE):
                return tier

    # Fallback to simple keyword matching
    if "haiku" in model_lower:
        return "haiku"
    elif "opus" in model_lower:
        return "opus"
    elif "sonnet" in model_lower:
        return "sonnet"

    return "sonnet"  # Default to sonnet if unknown


def _detect_backend(model_path: str, tier_config: dict = None) -> str:
    """Detect which backend to use for a model.

    Args:
        model_path: Resolved model path
        tier_config: Tier configuration dict (may contain 'backend' key)

    Returns:
        Backend type: 'mlx' or 'gguf'
    """
    # 1. Check tier config for explicit backend
    if tier_config and tier_config.get("backend"):
        return tier_config["backend"]

    # 2. Check file extension
    if model_path.endswith(".gguf"):
        return "gguf"

    # 3. Check if path looks like GGUF (contains .gguf anywhere)
    if ".gguf" in model_path.lower():
        return "gguf"

    # Default to MLX
    return "mlx"


def _expand_path(path: str) -> str:
    """Expand ~ and environment variables in path."""
    import os
    if path.startswith("~"):
        path = os.path.expanduser(path)
    return os.path.expandvars(path)


def resolve_alias(model_id: str) -> str:
    """Resolve a model alias to its full path, with Claude routing and wildcard support.

    Supports wildcards using fnmatch patterns:
    - claude-haiku-* matches claude-haiku-4-5-20251001, claude-haiku-3, etc.
    - claude-* matches any claude model
    - qwen* matches qwen3, qwen2.5, etc.

    Note: For backend detection, use resolve_alias_with_backend() instead.
    """
    resolved, _ = resolve_alias_with_backend(model_id)
    return resolved


def resolve_alias_with_backend(model_id: str) -> tuple:
    """Resolve a model alias and determine the backend to use.

    Supports wildcards using fnmatch patterns:
    - claude-haiku-* matches claude-haiku-4-5-20251001, claude-haiku-3, etc.
    - claude-* matches any claude model
    - qwen* matches qwen3, qwen2.5, etc.

    Returns:
        Tuple of (resolved_model_id, backend_type)
        backend_type is 'mlx' or 'gguf'
    """
    if not _MODEL_ALIASES:
        load_aliases()
    if not _ROUTING_CONFIG:
        load_routing_config()

    tier_config = None

    # 1. Direct alias match (highest priority - exact match)
    if model_id in _MODEL_ALIASES:
        resolved = _expand_path(_MODEL_ALIASES[model_id])
        backend = _detect_backend(resolved)
        print(f"[patches] Resolved alias '{model_id}' -> '{resolved}' (backend={backend})")
        return resolved, backend

    # 2. Wildcard pattern matching in aliases
    # Check each alias key to see if it's a pattern that matches model_id
    for pattern, target in _MODEL_ALIASES.items():
        # Only check patterns that contain wildcards
        if '*' in pattern or '?' in pattern:
            if fnmatch.fnmatch(model_id, pattern):
                resolved = _expand_path(target)
                backend = _detect_backend(resolved)
                print(f"[patches] Resolved wildcard alias '{pattern}' for '{model_id}' -> '{resolved}' (backend={backend})")
                return resolved, backend

    # 3. Claude model routing (for claude-* models not matched by aliases)
    if model_id.startswith("claude-"):
        routing_enabled = _ROUTING_CONFIG.get("enabled", True)

        if routing_enabled:
            # Detect tier and get configured model
            tier = _detect_claude_tier(model_id)
            tier_config = _ROUTING_CONFIG.get("tiers", {}).get(tier, {})
            tier_model = tier_config.get("model")

            if tier_model:
                resolved = _expand_path(tier_model)
                backend = _detect_backend(resolved, tier_config)
                print(f"[patches] Routed Claude '{model_id}' ({tier}) -> '{resolved}' (backend={backend})")
                return resolved, backend

        # Fallback to default_model from routing config
        default_model = _ROUTING_CONFIG.get("default_model")
        if default_model:
            resolved = _expand_path(default_model)
            backend = _detect_backend(resolved)
            print(f"[patches] Routed Claude '{model_id}' (default) -> '{resolved}' (backend={backend})")
            return resolved, backend

        # Final fallback to aliases
        fallback = _MODEL_ALIASES.get("qwen3-coder-30b") or _MODEL_ALIASES.get("qwen")
        if fallback:
            resolved = _expand_path(fallback)
            backend = _detect_backend(resolved)
            print(f"[patches] Resolved Claude model '{model_id}' -> '{resolved}' (fallback, backend={backend})")
            return resolved, backend

    # No resolution - detect backend from original model_id
    backend = _detect_backend(model_id)
    return model_id, backend


def get_draft_model_for(model_id: str) -> str:
    """Get the draft model configured for a model (for speculative decoding)."""
    if not _ROUTING_CONFIG:
        load_routing_config()

    # Check if this is a Claude model with tier-specific draft model
    if model_id.startswith("claude-"):
        tier = _detect_claude_tier(model_id)
        tier_config = _ROUTING_CONFIG.get("tiers", {}).get(tier, {})
        draft_model = tier_config.get("draft_model")
        if draft_model:
            return draft_model

    return None


def get_tier_config(tier: str) -> dict:
    """Get the configuration for a specific tier (haiku/sonnet/opus).

    Args:
        tier: One of 'haiku', 'sonnet', 'opus'

    Returns:
        Dict with 'model', 'draft_model', 'backend', 'context_length', 'max_tokens' keys
    """
    if not _ROUTING_CONFIG:
        load_routing_config()

    # Default values per tier
    tier_defaults = {
        "haiku": {"context_length": 32768, "max_tokens": 4096},      # Small/fast model
        "sonnet": {"context_length": 131072, "max_tokens": 16384},   # Medium model
        "opus": {"context_length": 131072, "max_tokens": 32000},     # Large model
    }

    config = _ROUTING_CONFIG.get("tiers", {}).get(tier, {})
    defaults = tier_defaults.get(tier, {"context_length": 65536, "max_tokens": 8192})

    # Merge with defaults
    return {
        "model": config.get("model", ""),
        "draft_model": config.get("draft_model", ""),
        "backend": config.get("backend", "mlx"),
        "context_length": config.get("context_length", defaults["context_length"]),
        "max_tokens": config.get("max_tokens", defaults["max_tokens"]),
    }


def get_tier_for_model(model_id: str) -> str:
    """Get the tier name for a model ID.

    Args:
        model_id: Model ID (e.g., 'claude-sonnet-4-5-20250929')

    Returns:
        Tier name ('haiku', 'sonnet', 'opus') or 'sonnet' as default
    """
    if not _ROUTING_CONFIG:
        load_routing_config()

    if model_id.startswith("claude-"):
        return _detect_claude_tier(model_id)

    return "sonnet"  # Default


# Models that use RotatingKVCache and don't support kv_bits quantization
ROTATING_KV_CACHE_MODELS = [
    "gpt-oss",
    "openai-gpt-oss",
]


def model_supports_kv_quantization(model_id: str) -> bool:
    """Check if a model supports KV cache quantization.

    Some models use RotatingKVCache which doesn't support quantization yet.
    """
    model_lower = model_id.lower()
    for pattern in ROTATING_KV_CACHE_MODELS:
        if pattern in model_lower:
            return False
    return True


def apply_patches():
    """Apply all necessary patches to mlx-omni-server."""
    _patch_mlx_lm_utils()
    _patch_chat_generator()
    _patch_kv_bits_for_rotating_cache()
    _patch_stream_generation_debug()  # Add detailed logging for stream debugging
    # GPT-OSS channel format support (isolated in separate module)
    from extensions.gpt_oss_adapter import patch_openai_adapter as patch_gpt_oss
    patch_gpt_oss()
    # _patch_chat_template_tools()  # Disabled - mlx-omni-server has native Qwen3 tool support


def _patch_mlx_lm_utils():
    """
    Patch mlx_lm.utils for compatibility with mlx-omni-server.

    Issues fixed:
    1. get_model_path was removed in newer mlx-lm versions
    2. load_config expects Path but mlx-omni-server passes str
    """
    import mlx_lm.utils as mlx_utils

    # Patch 1: Add get_model_path if missing
    if not hasattr(mlx_utils, 'get_model_path'):
        def get_model_path(model_id: str):
            """Compatibility shim for get_model_path."""
            path = Path(model_id)
            if path.exists():
                return (path,)  # Return Path object

            try:
                from huggingface_hub import snapshot_download
                local_path = snapshot_download(model_id)
                return (Path(local_path),)  # Return Path object
            except Exception:
                return (Path(model_id),)

        mlx_utils.get_model_path = get_model_path

    # Patch 2: Wrap load_config to accept str or Path
    original_load_config = mlx_utils.load_config

    def patched_load_config(model_path, **kwargs):
        """Wrapper that ensures model_path is a Path object."""
        if isinstance(model_path, str):
            model_path = Path(model_path)
        return original_load_config(model_path, **kwargs)

    mlx_utils.load_config = patched_load_config


def _patch_chat_generator():
    """
    Patch ChatGenerator to resolve model aliases and apply draft model for speculative decoding.
    """
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator

    original_get_or_create = ChatGenerator.get_or_create

    @classmethod
    def patched_get_or_create(cls, model_id: str, adapter_path=None, draft_model_id=None):
        """Wrapper that resolves model aliases and applies draft model configuration."""
        # Resolve main model alias
        resolved_model_id = resolve_alias(model_id)

        # Check for configured draft model (speculative decoding)
        if draft_model_id is None:
            configured_draft = get_draft_model_for(model_id)
            if configured_draft:
                # Resolve draft model alias too
                draft_model_id = resolve_alias(configured_draft)
                print(f"[patches] Using draft model '{draft_model_id}' for speculative decoding")

        return original_get_or_create.__func__(cls, resolved_model_id, adapter_path, draft_model_id)

    ChatGenerator.get_or_create = patched_get_or_create


def _patch_chat_template_tools():
    """
    Patch ChatTemplate to always parse tool calls in response,
    even when tools weren't sent in the request.
    This fixes Qwen CLI which uses tools but doesn't send them in the API.

    The key difference from original: we keep the content text even when
    tool_calls are found, so Qwen CLI gets both the structured tool_calls
    AND the raw text for display.
    """
    from mlx_omni_server.chat.mlx.tools.chat_template import ChatTemplate
    from mlx_omni_server.chat.mlx.tools.qwen3_moe_tools_parser import Qwen3MoeToolParser
    from mlx_omni_server.chat.mlx.core_types import ChatTemplateResult
    import re

    # Create parser for Qwen3 format
    qwen3_parser = Qwen3MoeToolParser()

    original_parse = ChatTemplate.parse_chat_response

    def patched_parse(self, text: str):
        """Always try to parse tool calls, keeping content intact."""
        # First, run the original parse for thinking extraction etc.
        result = original_parse(self, text)

        # If tools were not sent in request but text contains tool calls,
        # try to parse them with Qwen3 format
        if not self.has_tools and result.content:
            # Check if content looks like it has tool calls
            if '<function=' in result.content or '<tool_call>' in result.content:
                tool_calls = qwen3_parser.parse_tools(result.content)

                if tool_calls:
                    # Extract content before the tool call (intro text)
                    content_before_tool = result.content
                    # Remove tool call XML from display content
                    content_before_tool = re.sub(
                        r'<tool_call>.*?</tool_call>',
                        '',
                        content_before_tool,
                        flags=re.DOTALL
                    ).strip()
                    # Also handle malformed (missing opening tag)
                    content_before_tool = re.sub(
                        r'<function=.*?</tool_call>',
                        '',
                        content_before_tool,
                        flags=re.DOTALL
                    ).strip()

                    return ChatTemplateResult(
                        content=content_before_tool,
                        thinking=result.thinking,
                        tool_calls=tool_calls
                    )

        return result

    ChatTemplate.parse_chat_response = patched_parse
    print("[patches] Enabled Qwen3 tool call parsing")


def _patch_kv_bits_for_rotating_cache():
    """
    Patch ChatGenerator._create_mlx_kwargs to disable kv_bits for models
    that use RotatingKVCache (like gpt-oss), which doesn't support quantization.
    """
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator

    original_create_mlx_kwargs = ChatGenerator._create_mlx_kwargs

    def patched_create_mlx_kwargs(self, sampler=None, max_tokens=4096, **kwargs):
        """Wrapper that disables kv_bits for models with RotatingKVCache."""
        result = original_create_mlx_kwargs(self, sampler=sampler, max_tokens=max_tokens, **kwargs)

        # Check if model supports KV cache quantization
        model_id = getattr(self.model, 'model_id', '') or ''
        if not model_supports_kv_quantization(model_id):
            if 'kv_bits' in result:
                print(f"[patches] Disabling kv_bits for model '{model_id}' (uses RotatingKVCache)")
                del result['kv_bits']

        return result

    ChatGenerator._create_mlx_kwargs = patched_create_mlx_kwargs
    print("[patches] Added RotatingKVCache compatibility for kv_bits")


def _patch_stream_generation_debug():
    """
    Add detailed logging to stream generation to diagnose mid-stream cutoffs.
    Logs every step of the streaming process to help identify where it stops.
    Also patches OpenAI adapter to log tool call detection.
    """
    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator
    from mlx_omni_server.chat.openai.openai_adapter import OpenAIAdapter
    import logging

    logger = logging.getLogger("mlx-studio.stream-debug")

    # Patch 1: ChatGenerator stream logging
    original_generate_stream = ChatGenerator.generate_stream

    def patched_generate_stream(self, *args, **kwargs):
        """Wrapper that adds detailed logging to stream generation."""
        try:
            logger.info("=== STREAM START ===")
            chunk_count = 0
            last_text = ""

            for result in original_generate_stream(self, *args, **kwargs):
                chunk_count += 1

                # Log chunk details
                if hasattr(result, 'content'):
                    if hasattr(result.content, 'text_delta') and result.content.text_delta:
                        last_text = result.content.text_delta
                        logger.debug(f"Chunk {chunk_count}: text_delta='{last_text[:50]}...'")
                    elif hasattr(result.content, 'reasoning_delta') and result.content.reasoning_delta:
                        logger.debug(f"Chunk {chunk_count}: reasoning_delta (thinking mode)")

                if hasattr(result, 'finish_reason') and result.finish_reason:
                    logger.info(f"Chunk {chunk_count}: finish_reason={result.finish_reason}")

                yield result

            logger.info(f"=== STREAM END === (total chunks: {chunk_count})")

        except GeneratorExit:
            logger.warning(f"=== STREAM CANCELLED === (client disconnected after {chunk_count} chunks)")
            raise
        except Exception as e:
            logger.error(f"=== STREAM ERROR === after {chunk_count} chunks: {e}", exc_info=True)
            raise

    ChatGenerator.generate_stream = patched_generate_stream

    # Patch 2: OpenAI adapter to log tool call detection
    original_generate_stream_adapter = OpenAIAdapter.generate_stream

    def patched_generate_stream_adapter(self, request):
        """Wrapper that logs tool call marker detection."""
        import time
        from mlx_omni_server.chat.openai.schema import ChatMessage, ChatCompletionChunk, ChatCompletionChunkChoice, Role

        chat_id = f"chatcmpl-{__import__('uuid').uuid4().hex[:10]}"
        accumulated_text = ""
        buffer = ""
        in_tool_call = False
        result = None

        TOOL_MARKERS = ['<tool_call>', '<function=']
        MAX_MARKER_LEN = max(len(m) for m in TOOL_MARKERS)

        include_thinking = (
            request.stream_options.include_thinking
            if request.stream_options
            else False
        )

        try:
            for chunk in self._generate_wrapper.generate_stream(**self._prepare_generation_params(request)):
                created = int(time.time())

                if chunk.content.text_delta:
                    content = chunk.content.text_delta
                    accumulated_text += content
                elif chunk.content.reasoning_delta:
                    if include_thinking:
                        content = chunk.content.reasoning_delta
                    else:
                        result = chunk
                        continue
                else:
                    content = ""

                if not content:
                    result = chunk
                    continue

                # Buffer content to detect tool call markers
                if not in_tool_call:
                    buffer += content

                    # Check if buffer contains start of tool call
                    for marker in TOOL_MARKERS:
                        if marker in buffer:
                            logger.warning(f"⚠️ TOOL MARKER DETECTED: '{marker}' in buffer context: '{buffer[-100:]}'")
                            logger.warning(f"   Accumulated text so far: {len(accumulated_text)} chars")
                            logger.warning(f"   Stopping stream to parse tool call")
                            in_tool_call = True
                            buffer = ""
                            break

                    # If not in tool call, yield buffered content
                    if not in_tool_call and len(buffer) > MAX_MARKER_LEN:
                        to_yield = buffer[:-MAX_MARKER_LEN]
                        buffer = buffer[-MAX_MARKER_LEN:]

                        message = ChatMessage(role=Role.ASSISTANT, content=to_yield)
                        yield ChatCompletionChunk(
                            id=chat_id,
                            created=created,
                            model=request.model,
                            choices=[
                                ChatCompletionChunkChoice(
                                    index=0,
                                    delta=message,
                                    finish_reason=None,
                                    logprobs=chunk.logprobs,
                                )
                            ],
                        )

                result = chunk

            # Flush remaining buffer if not in tool call
            if buffer and not in_tool_call:
                message = ChatMessage(role=Role.ASSISTANT, content=buffer)
                yield ChatCompletionChunk(
                    id=chat_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[
                        ChatCompletionChunkChoice(
                            index=0,
                            delta=message,
                            finish_reason=None,
                            logprobs=None,
                        )
                    ],
                )

            # Continue with rest of original implementation for final chunk and tool parsing
            # Calling original to handle final chunk emission
            for final_chunk in original_generate_stream_adapter(self, request):
                yield final_chunk

        except Exception as e:
            logger.error(f"Error in patched stream adapter: {e}", exc_info=True)
            raise

    # Don't apply this patch - too complex, just use logging from ChatGenerator
    # OpenAIAdapter.generate_stream = patched_generate_stream_adapter

    print("[patches] Added stream generation debug logging")


    # GPT-OSS channel format code moved to extensions/gpt_oss_adapter.py
