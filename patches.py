"""
Compatibility patches for mlx-omni-server.

These patches fix compatibility issues between mlx-omni-server
and newer versions of mlx-lm.
"""

import json
import hashlib
import re
from pathlib import Path

# Model aliases - loaded from config file
_MODEL_ALIASES = {}
ALIASES_FILE = Path(__file__).parent / "model_aliases.json"

# Claude model routing configuration
_ROUTING_CONFIG = {}
ROUTING_FILE = Path(__file__).parent / "claude_routing.json"

# Learned system prompts cache
_LEARNED_PROMPTS = {}
PROMPTS_CACHE_FILE = Path(__file__).parent / "learned_prompts.json"


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


def resolve_alias(model_id: str) -> str:
    """Resolve a model alias to its full path, with Claude routing support."""
    if not _MODEL_ALIASES:
        load_aliases()
    if not _ROUTING_CONFIG:
        load_routing_config()

    # Direct alias match (highest priority)
    if model_id in _MODEL_ALIASES:
        resolved = _MODEL_ALIASES[model_id]
        print(f"[patches] Resolved alias '{model_id}' -> '{resolved}'")
        return resolved

    # Claude model routing
    if model_id.startswith("claude-"):
        routing_enabled = _ROUTING_CONFIG.get("enabled", True)

        if routing_enabled:
            # Detect tier and get configured model
            tier = _detect_claude_tier(model_id)
            tier_config = _ROUTING_CONFIG.get("tiers", {}).get(tier, {})
            tier_model = tier_config.get("model")

            if tier_model:
                print(f"[patches] Routed Claude '{model_id}' ({tier}) -> '{tier_model}'")
                return tier_model

        # Fallback to default_model from routing config
        default_model = _ROUTING_CONFIG.get("default_model")
        if default_model:
            print(f"[patches] Routed Claude '{model_id}' (default) -> '{default_model}'")
            return default_model

        # Final fallback to aliases
        fallback = _MODEL_ALIASES.get("qwen3-coder-30b") or _MODEL_ALIASES.get("qwen")
        if fallback:
            print(f"[patches] Resolved Claude model '{model_id}' -> '{fallback}' (fallback)")
            return fallback

    return model_id


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


# =============================================================================
# System Prompt Learning & Caching
# =============================================================================

def load_learned_prompts():
    """Load learned system prompts from cache file."""
    global _LEARNED_PROMPTS
    if PROMPTS_CACHE_FILE.exists():
        try:
            with open(PROMPTS_CACHE_FILE) as f:
                _LEARNED_PROMPTS = json.load(f)
        except Exception:
            pass
    return _LEARNED_PROMPTS


def save_learned_prompts():
    """Save learned system prompts to cache file."""
    with open(PROMPTS_CACHE_FILE, "w") as f:
        json.dump(_LEARNED_PROMPTS, f, indent=2)


def learn_system_prompt(model_id: str, messages: list):
    """Learn and cache system prompt from messages if present."""
    global _LEARNED_PROMPTS
    if not _LEARNED_PROMPTS:
        load_learned_prompts()

    # Extract system message if present
    system_msg = None
    for msg in messages:
        role = msg.get("role", "")
        if role == "system":
            content = msg.get("content", "")
            if isinstance(content, str) and len(content) > 100:  # Only cache substantial prompts
                system_msg = content
                break

    if not system_msg:
        return None

    # Create hash to detect changes
    prompt_hash = hashlib.md5(system_msg.encode()).hexdigest()[:8]

    # Check if we already have this exact prompt
    existing = _LEARNED_PROMPTS.get(model_id, {})
    if existing.get("hash") == prompt_hash:
        return None  # Already learned

    # Save the new prompt
    _LEARNED_PROMPTS[model_id] = {
        "hash": prompt_hash,
        "length": len(system_msg),
        "prompt": system_msg
    }
    save_learned_prompts()
    print(f"[patches] Learned system prompt for '{model_id}' ({len(system_msg)} chars)")
    return system_msg


def get_learned_prompt(model_id: str) -> str:
    """Get the learned system prompt for a model."""
    if not _LEARNED_PROMPTS:
        load_learned_prompts()
    entry = _LEARNED_PROMPTS.get(model_id, {})
    return entry.get("prompt")


def warmup_with_learned_prompt(model_id: str):
    """Warmup model with learned system prompt if available."""
    prompt = get_learned_prompt(model_id)
    if not prompt:
        return None

    print(f"[patches] Warming up '{model_id}' with learned prompt ({len(prompt)} chars)...")

    from mlx_omni_server.chat.mlx.chat_generator import ChatGenerator
    wrapper = ChatGenerator.get_or_create(model_id=model_id)

    messages = [{"role": "system", "content": prompt}]
    result = wrapper.generate(
        messages=messages,
        max_tokens=1,
        enable_prompt_cache=True
    )

    tokens = result.stats.prompt_tokens if result.stats else 0
    print(f"[patches] Warmed up KV cache: {tokens} tokens")
    return tokens


def apply_patches():
    """Apply all necessary patches to mlx-omni-server."""
    _patch_mlx_lm_utils()
    _patch_chat_generator()
    _patch_openai_adapter()
    _patch_chat_template_tools()  # Enable tool parsing for Qwen CLI


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


def _patch_openai_adapter():
    """
    Patch OpenAI adapter to learn system prompts from requests.
    """
    from mlx_omni_server.chat.openai.openai_adapter import OpenAIAdapter

    original_prepare = OpenAIAdapter._prepare_generation_params

    def patched_prepare(self, request):
        """Wrapper that learns system prompts from requests."""
        params = original_prepare(self, request)

        # Learn system prompt from messages
        messages = params.get("messages", [])
        model_id = request.model
        learn_system_prompt(model_id, messages)

        return params

    OpenAIAdapter._prepare_generation_params = patched_prepare


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
