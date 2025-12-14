"""
GPT-OSS Harmony Format Tool Parser

Parses tool calls from GPT-OSS's Harmony response format.

Harmony tool call formats:
1. <|start|>assistant<|channel|>commentary to=functions.{name} json<|message|>{args}
2. <|channel|>commentary to=functions.{name}<|constrain|>json<|message|>{args}<|call|>
3. <|channel|>commentary to=functions.{name}<|message|>{args}<|call|>

This parser extracts function names and arguments from these formats and converts
them to OpenAI-compatible tool_calls structure.
"""

import re
import json
import uuid
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ParsedToolCall:
    """Represents a parsed tool call."""
    id: str
    name: str
    arguments: dict


# Regex patterns for Harmony tool calls
HARMONY_PATTERNS = [
    # Pattern 1: <|channel|>commentary to=functions.NAME json<|message|>ARGS
    # or with <|constrain|>json
    re.compile(
        r'<\|channel\|>commentary\s+to=functions\.(\w+)(?:\s+json|<\|constrain\|>json)?<\|message\|>(\{[^}]*\})',
        re.DOTALL
    ),
    # Pattern 2: <|start|>assistant<|channel|>commentary to=functions.NAME json<|message|>ARGS
    re.compile(
        r'<\|start\|>assistant<\|channel\|>commentary\s+to=functions\.(\w+)(?:\s+json)?<\|message\|>(\{[^}]*\})',
        re.DOTALL
    ),
    # Pattern 3: Simpler format - functions.NAME followed by JSON
    re.compile(
        r'to=functions\.(\w+)[^{]*(\{[^}]*\})',
        re.DOTALL
    ),
]


def parse_harmony_tool_calls(text: str) -> List[ParsedToolCall]:
    """
    Parse tool calls from GPT-OSS Harmony format text.

    Args:
        text: Raw text output from GPT-OSS model (may include reasoning_content)

    Returns:
        List of ParsedToolCall objects
    """
    if not text:
        return []

    # Quick check - must have function reference
    if 'functions.' not in text and 'to=functions' not in text:
        return []

    tool_calls = []
    seen_calls = set()  # Deduplicate

    for pattern in HARMONY_PATTERNS:
        matches = pattern.findall(text)
        for match in matches:
            if len(match) >= 2:
                func_name = match[0]
                args_str = match[1]

                # Skip if we've seen this exact call
                call_key = f"{func_name}:{args_str}"
                if call_key in seen_calls:
                    continue
                seen_calls.add(call_key)

                # Parse arguments JSON
                try:
                    # Clean up the JSON string
                    args_str = args_str.strip()
                    # Handle incomplete JSON (model may have been cut off)
                    if not args_str.endswith('}'):
                        args_str += '}'
                    arguments = json.loads(args_str)
                except json.JSONDecodeError:
                    # Try to extract key-value pairs manually
                    arguments = _parse_malformed_json(args_str)
                    if not arguments:
                        continue

                tool_calls.append(ParsedToolCall(
                    id=f"call_{uuid.uuid4().hex[:8]}",
                    name=func_name,
                    arguments=arguments
                ))

    return tool_calls


def _parse_malformed_json(text: str) -> Optional[dict]:
    """
    Attempt to parse malformed JSON by extracting key-value pairs.

    Args:
        text: Potentially malformed JSON string

    Returns:
        Dictionary of extracted values, or None if parsing fails
    """
    try:
        # Try standard parsing first
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to extract quoted string values
    result = {}
    # Match "key": "value" or "key": value patterns
    kv_pattern = re.compile(r'"(\w+)"\s*:\s*(?:"([^"]*)"|([\w.-]+))')
    matches = kv_pattern.findall(text)

    for match in matches:
        key = match[0]
        value = match[1] if match[1] else match[2]
        # Try to convert to appropriate type
        if value.lower() == 'true':
            result[key] = True
        elif value.lower() == 'false':
            result[key] = False
        elif value.replace('.', '').replace('-', '').isdigit():
            try:
                result[key] = int(value) if '.' not in value else float(value)
            except ValueError:
                result[key] = value
        else:
            result[key] = value

    return result if result else None


def has_harmony_tool_calls(text: str) -> bool:
    """
    Quick check if text might contain Harmony format tool calls.

    Args:
        text: Text to check

    Returns:
        True if text likely contains tool calls
    """
    if not text:
        return False
    return ('to=functions.' in text or
            ('functions.' in text and '<|message|>' in text))
