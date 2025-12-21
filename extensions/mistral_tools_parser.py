"""
Mistral/Devstral Tool Call Parser

Parses tool calls from Devstral's native format:
[TOOL_CALLS]function_name[ARGS]{"key": "value"}

This parser extracts function names and arguments and converts
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


# Regex pattern for Mistral/Devstral tool calls
# Format: [TOOL_CALLS]function_name[ARGS]{json_arguments}
MISTRAL_TOOL_PATTERN = re.compile(
    r'\[TOOL_CALLS\](\w+)\[ARGS\](\{[^}]*\}|\{.*?\})',
    re.DOTALL
)

# Alternative pattern for multi-line JSON
MISTRAL_TOOL_PATTERN_MULTILINE = re.compile(
    r'\[TOOL_CALLS\](\w+)\[ARGS\](.*?)(?=\[TOOL_CALLS\]|$)',
    re.DOTALL
)


def parse_mistral_tool_calls(text: str) -> List[ParsedToolCall]:
    """
    Parse tool calls from Mistral/Devstral format text.

    Args:
        text: Raw text output from Devstral model

    Returns:
        List of ParsedToolCall objects
    """
    if not text:
        return []

    # Quick check - must have tool call marker
    if '[TOOL_CALLS]' not in text:
        return []

    tool_calls = []
    seen_calls = set()  # Deduplicate

    # Try simple pattern first
    matches = MISTRAL_TOOL_PATTERN.findall(text)

    # If no matches, try multiline pattern
    if not matches:
        matches = MISTRAL_TOOL_PATTERN_MULTILINE.findall(text)

    for match in matches:
        if len(match) >= 2:
            func_name = match[0].strip()
            args_str = match[1].strip()

            # Skip if we've seen this exact call
            call_key = f"{func_name}:{args_str}"
            if call_key in seen_calls:
                continue
            seen_calls.add(call_key)

            # Parse arguments JSON
            arguments = _parse_json_args(args_str)
            if arguments is None:
                continue

            tool_calls.append(ParsedToolCall(
                id=f"call_{uuid.uuid4().hex[:8]}",
                name=func_name,
                arguments=arguments
            ))

    return tool_calls


def _parse_json_args(args_str: str) -> Optional[dict]:
    """
    Parse JSON arguments, handling potential malformed JSON.

    Args:
        args_str: JSON string (potentially malformed)

    Returns:
        Parsed dict or None if parsing fails
    """
    if not args_str:
        return {}

    # Clean up the string
    args_str = args_str.strip()

    # Ensure it starts with { and ends with }
    if not args_str.startswith('{'):
        # Try to find the JSON object
        start = args_str.find('{')
        if start == -1:
            return {}
        args_str = args_str[start:]

    if not args_str.endswith('}'):
        # Try to find the closing brace
        end = args_str.rfind('}')
        if end != -1:
            args_str = args_str[:end + 1]
        else:
            args_str += '}'

    try:
        return json.loads(args_str)
    except json.JSONDecodeError:
        # Try to fix common issues
        return _parse_malformed_json(args_str)


def _parse_malformed_json(text: str) -> Optional[dict]:
    """
    Attempt to parse malformed JSON by extracting key-value pairs.

    Args:
        text: Potentially malformed JSON string

    Returns:
        Dictionary of extracted values, or None if parsing fails
    """
    result = {}

    # Match "key": "value" or "key": value patterns
    kv_pattern = re.compile(r'"(\w+)"\s*:\s*(?:"([^"]*)"|([\w./\-]+)|\[([^\]]*)\])')
    matches = kv_pattern.findall(text)

    for match in matches:
        key = match[0]
        # Check which group matched
        if match[1]:  # Quoted string
            value = match[1]
        elif match[2]:  # Unquoted value
            value = match[2]
            # Try to convert to appropriate type
            if value.lower() == 'true':
                value = True
            elif value.lower() == 'false':
                value = False
            elif value.replace('.', '').replace('-', '').isdigit():
                try:
                    value = int(value) if '.' not in value else float(value)
                except ValueError:
                    pass
        elif match[3]:  # Array
            try:
                value = json.loads(f"[{match[3]}]")
            except json.JSONDecodeError:
                value = match[3].split(',')
        else:
            continue

        result[key] = value

    return result if result else None


def has_mistral_tool_calls(text: str) -> bool:
    """
    Quick check if text contains Mistral/Devstral format tool calls.

    Args:
        text: Text to check

    Returns:
        True if text likely contains tool calls
    """
    if not text:
        return False
    return '[TOOL_CALLS]' in text and '[ARGS]' in text


def extract_content_before_tools(text: str) -> str:
    """
    Extract content that appears before any tool calls.

    Args:
        text: Full response text

    Returns:
        Content before tool calls (may be empty)
    """
    if not text or '[TOOL_CALLS]' not in text:
        return text

    idx = text.find('[TOOL_CALLS]')
    return text[:idx].strip()
