"""
Context Warning for MLX Studio

Warns users when context is getting too large, suggesting they run /compact or /compress.
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mlx-studio.context-warning")

# Default configuration
DEFAULT_CONFIG = {
    "context_limit": 32768,  # Default ctx-size
    "threshold_percent": 75,  # Warn at 75% of limit
}


def estimate_tokens(text: str) -> int:
    """Estimate token count from text.

    Uses a simple heuristic: ~4 chars per token for English.

    Args:
        text: Text to estimate

    Returns:
        Estimated token count
    """
    if not text:
        return 0
    return len(text) // 4


def estimate_messages_tokens(messages: List[Dict[str, Any]]) -> int:
    """Estimate total tokens in a list of messages.

    Args:
        messages: List of chat messages

    Returns:
        Estimated total token count
    """
    total = 0
    for msg in messages:
        # Count role overhead
        total += 2

        # Count content
        content = msg.get("content", "")
        if isinstance(content, str):
            total += estimate_tokens(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if "text" in block:
                        total += estimate_tokens(block["text"])
                    elif "content" in block:
                        total += estimate_tokens(str(block["content"]))

        # Count tool calls
        tool_calls = msg.get("tool_calls", [])
        for tc in tool_calls:
            total += 10  # overhead
            func = tc.get("function", {})
            total += estimate_tokens(func.get("name", ""))
            total += estimate_tokens(func.get("arguments", ""))

    return total


def estimate_tools_tokens(tools: Optional[List[Dict[str, Any]]]) -> int:
    """Estimate tokens used by tool definitions.

    Args:
        tools: List of tool definitions

    Returns:
        Estimated token count
    """
    if not tools:
        return 0

    tools_json = json.dumps(tools)
    return estimate_tokens(tools_json)


class ContextWarning:
    """Warning when context is getting too large."""

    def __init__(
        self,
        should_warn: bool = False,
        estimated_tokens: int = 0,
        context_limit: int = 0,
        usage_percent: int = 0,
    ):
        self.should_warn = should_warn
        self.estimated_tokens = estimated_tokens
        self.context_limit = context_limit
        self.usage_percent = usage_percent

    @property
    def warning_message(self) -> str:
        if not self.should_warn:
            return ""
        return (
            f"⚠️ Context is {self.usage_percent}% full ({self.estimated_tokens}/{self.context_limit} tokens). "
            f"Please run /compact (Claude) or /compress (Qwen) to avoid errors."
        )

    @property
    def header_value(self) -> str:
        if not self.should_warn:
            return ""
        return f"usage={self.usage_percent}%;tokens={self.estimated_tokens};limit={self.context_limit}"


def check_context_warning(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    max_tokens: int = 4096,
    config: Optional[Dict[str, Any]] = None,
) -> ContextWarning:
    """Check if context usage warrants a warning.

    Args:
        messages: Chat messages
        tools: Tool definitions
        max_tokens: Max tokens for response
        config: Configuration with context_limit and threshold

    Returns:
        ContextWarning with warning info
    """
    cfg = {**DEFAULT_CONFIG, **(config or {})}

    # Calculate token usage (input only, not including max_tokens for output)
    msg_tokens = estimate_messages_tokens(messages)
    tool_tokens = estimate_tools_tokens(tools)
    total_tokens = msg_tokens + tool_tokens

    context_limit = cfg["context_limit"]
    # Reserve space for output - warn when input takes up too much of the context
    available_for_input = context_limit - min(max_tokens, context_limit // 2)
    usage_percent = int(total_tokens * 100 / available_for_input) if available_for_input > 0 else 0

    # Warn at threshold (default 75%)
    threshold = cfg["threshold_percent"]
    should_warn = usage_percent >= threshold

    if should_warn:
        logger.warning(
            f"Context warning: {usage_percent}% usage ({total_tokens}/{context_limit} tokens)"
        )

    return ContextWarning(
        should_warn=should_warn,
        estimated_tokens=total_tokens,
        context_limit=available_for_input,  # Show available space, not total limit
        usage_percent=usage_percent,
    )
