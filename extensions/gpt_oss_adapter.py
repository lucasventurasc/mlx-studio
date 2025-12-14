"""
GPT-OSS Channel Format Adapter

Handles the channel format output from GPT-OSS models which use structured responses
with multiple channels like:
<|channel|>analysis<|message|>thinking...<|end|><|start|>assistant<|channel|>final<|message|>response<|end|>

This module:
1. Extracts only the 'final' channel for user-facing responses
2. Parses tool calls from 'commentary' channel and converts to OpenAI format

IMPORTANT: Only applies to GPT-OSS models to avoid breaking other models.
"""

import re
import json
from typing import Generator, List, Optional

# Compiled regex patterns (lazy init)
_GPT_OSS_PATTERNS = None


def is_gpt_oss_model(model_id: str) -> bool:
    """Check if a model is a GPT-OSS model that needs channel format extraction."""
    if not model_id:
        return False
    model_lower = model_id.lower()
    return 'gpt-oss' in model_lower or 'gpt_oss' in model_lower


def _get_channel_patterns():
    """Get compiled regex patterns for GPT-OSS channels (lazy init)."""
    global _GPT_OSS_PATTERNS
    if _GPT_OSS_PATTERNS is None:
        _GPT_OSS_PATTERNS = {
            # Match <|channel|>name<|message|>content until next marker or end
            'channel': re.compile(
                r'<\|channel\|>([^<|]+)<\|message\|>(.*?)(?=<\|(?:end|start|channel|call)\|>|$)',
                re.DOTALL
            ),
            # Match special tokens to strip
            'special_tokens': re.compile(
                r'<\|(?:start|end|call|constrain)\|>(?:[^<]*)?',
                re.DOTALL
            ),
            # Detect GPT-OSS format
            'detect': re.compile(r'<\|(?:channel|start)\|>')
        }
    return _GPT_OSS_PATTERNS


def extract_final_channel(text: str) -> str:
    """Extract the 'final' channel content from GPT-OSS format.

    If text contains channel markers, returns only the 'final' channel content.
    If no 'final' channel but has tool calls (commentary channel), returns empty string.
    Otherwise returns the original text unchanged.
    """
    patterns = _get_channel_patterns()

    # Quick check - if no channel markers, return as-is
    if not patterns['detect'].search(text):
        return text

    # Find all channels
    matches = patterns['channel'].findall(text)

    channels = {}
    has_internal_channels = False
    for channel_name, content in matches:
        # Clean channel name (remove stuff like "commentary to=functions.view")
        clean_name = channel_name.split()[0].strip()
        # Track if we found internal channels (analysis, commentary)
        if clean_name in ('commentary', 'analysis'):
            has_internal_channels = True
            continue
        if clean_name not in channels:  # Keep first occurrence
            channels[clean_name] = content.strip()

    # Prefer 'final' channel
    if 'final' in channels:
        result = channels['final']
        # Clean any remaining special tokens
        result = patterns['special_tokens'].sub('', result)
        return result.strip()

    # If we found internal channels (analysis/commentary) but no final,
    # this is likely a tool-only response - return empty to avoid leaking thinking
    if has_internal_channels:
        print("[gpt-oss] No final channel found, returning empty (tool-only response)")
        return ""

    # No channel markers found at all - might be malformed, return cleaned text
    cleaned = patterns['special_tokens'].sub('', text)
    cleaned = re.sub(r'<\|[^|]+\|>', '', cleaned)  # Remove any remaining tokens
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()  # Normalize whitespace

    return cleaned if cleaned else text


def _fix_tool_calls_in_conversation(request):
    """
    Fix conversation history for GPT-OSS Harmony format compatibility.

    The Harmony chat template requires that when a 'tool' message is present,
    the preceding 'assistant' message MUST have 'tool_calls'. Some clients
    don't include tool_calls when sending back tool results.

    This function:
    1. Finds tool messages in the conversation
    2. Ensures preceding assistant messages have tool_calls
    3. Creates synthetic tool_calls from tool_call_id if missing
    """
    if not request.messages:
        return

    messages = list(request.messages)

    # Get available function names from tools
    available_functions = []
    if request.tools:
        for tool in request.tools:
            if hasattr(tool, 'function') and tool.function:
                func = tool.function
                if hasattr(func, 'name') and func.name:
                    available_functions.append(func.name)

    for i, msg in enumerate(messages):
        msg_role = msg.role.value if hasattr(msg.role, "value") else msg.role
        if msg_role == "tool":
            tool_call_id = msg.tool_call_id
            if not tool_call_id:
                continue

            # Find the preceding assistant message
            for j in range(i - 1, -1, -1):
                prev_msg = messages[j]
                prev_role = prev_msg.role.value if hasattr(prev_msg.role, "value") else prev_msg.role
                if prev_role == "assistant":
                    # Check if it has tool_calls
                    if not prev_msg.tool_calls:
                        # Try to guess function name - use first available or "unknown"
                        func_name = available_functions[0] if available_functions else "unknown"

                        from mlx_omni_server.chat.openai.schema import ToolCall, FunctionCall, ToolType
                        synthetic_tool_call = ToolCall(
                            id=tool_call_id,
                            type=ToolType.FUNCTION,
                            function=FunctionCall(
                                name=func_name,
                                arguments="{}"
                            )
                        )
                        prev_msg.tool_calls = [synthetic_tool_call]
                        print(f"[gpt-oss] Injected synthetic tool_call: {func_name} (id={tool_call_id})")
                    break


def patch_openai_adapter():
    """
    Patch OpenAI adapter to extract 'final' channel from GPT-OSS format responses.

    IMPORTANT: Only applies to GPT-OSS models to avoid breaking other models.
    """
    from mlx_omni_server.chat.openai.openai_adapter import OpenAIAdapter

    # Patch non-streaming generate
    original_generate = OpenAIAdapter.generate

    def patched_generate(self, request):
        """Wrapper that processes GPT-OSS channel format in non-streaming responses."""
        # Fix conversation history for Harmony format compatibility
        if is_gpt_oss_model(request.model):
            _fix_tool_calls_in_conversation(request)

        response = original_generate(self, request)

        # Only process GPT-OSS models
        if not is_gpt_oss_model(request.model):
            return response

        # Check if response content has GPT-OSS format
        if response.choices and response.choices[0].message:
            content = response.choices[0].message.content or ""
            reasoning = getattr(response.choices[0].message, 'reasoning', None) or ""
            full_text = content + reasoning

            if full_text and '<|' in full_text:
                # Extract final channel content
                final_content = extract_final_channel(full_text)
                if final_content != content:
                    print(f"[gpt-oss] Non-stream extraction: {len(full_text)} chars -> {len(final_content)} chars")
                    response.choices[0].message.content = final_content

                # Parse tool calls from Harmony format
                from extensions.gpt_oss_tools_parser import parse_harmony_tool_calls, has_harmony_tool_calls
                if has_harmony_tool_calls(full_text):
                    parsed_tools = parse_harmony_tool_calls(full_text)
                    if parsed_tools:
                        from mlx_omni_server.chat.openai.schema import ToolCall, FunctionCall, ToolType
                        tool_calls = [
                            ToolCall(
                                id=tc.id,
                                type=ToolType.FUNCTION,
                                function=FunctionCall(
                                    name=tc.name,
                                    arguments=json.dumps(tc.arguments)
                                )
                            )
                            for tc in parsed_tools
                        ]
                        response.choices[0].message.tool_calls = tool_calls
                        response.choices[0].message.content = ""  # Clear content when tool_calls present
                        response.choices[0].finish_reason = "tool_calls"
                        print(f"[gpt-oss] Parsed {len(tool_calls)} tool call(s)")

        return response

    OpenAIAdapter.generate = patched_generate

    # Patch streaming generate_stream
    original_generate_stream = OpenAIAdapter.generate_stream

    def patched_generate_stream(self, request):
        """Wrapper that processes GPT-OSS channel format in streaming responses."""
        # Only process GPT-OSS models - pass through directly for others
        if not is_gpt_oss_model(request.model):
            yield from original_generate_stream(self, request)
            return

        # Fix conversation history for Harmony format compatibility
        _fix_tool_calls_in_conversation(request)

        # Import necessary types
        from mlx_omni_server.chat.openai.schema import (
            ChatCompletionChunk,
            ChatCompletionChunkChoice,
            ChatMessage,
            Role,
        )

        # Track accumulated text for channel format extraction
        # GPT-OSS needs full content buffered to extract the 'final' channel
        accumulated_text = ""
        buffered_chunks = []
        first_chunk = None

        for chunk in original_generate_stream(self, request):
            # Keep first chunk as template
            if first_chunk is None:
                first_chunk = chunk

            # Extract content from chunk
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    accumulated_text += delta.content

            # Buffer all chunks for GPT-OSS models (need full content for channel extraction)
            buffered_chunks.append(chunk)

        # Process GPT-OSS format at end of stream
        if accumulated_text and first_chunk:
            final_content = extract_final_channel(accumulated_text)
            print(f"[gpt-oss] Stream extraction: {len(accumulated_text)} chars -> {len(final_content)} chars")

            last_chunk = buffered_chunks[-1] if buffered_chunks else first_chunk

            # Parse tool calls from Harmony format
            tool_calls = None
            finish_reason = "stop"

            from extensions.gpt_oss_tools_parser import parse_harmony_tool_calls, has_harmony_tool_calls
            if has_harmony_tool_calls(accumulated_text):
                parsed_tools = parse_harmony_tool_calls(accumulated_text)
                if parsed_tools:
                    from mlx_omni_server.chat.openai.schema import ToolCall, FunctionCall, ToolType
                    tool_calls = [
                        ToolCall(
                            id=tc.id,
                            type=ToolType.FUNCTION,
                            function=FunctionCall(
                                name=tc.name,
                                arguments=json.dumps(tc.arguments)
                            )
                        )
                        for tc in parsed_tools
                    ]
                    finish_reason = "tool_calls"
                    final_content = ""  # Clear content when tool_calls present
                    print(f"[gpt-oss] Parsed {len(tool_calls)} tool call(s) from stream")

            # Yield single chunk with final content (empty if tool_calls present)
            yield ChatCompletionChunk(
                id=first_chunk.id,
                created=first_chunk.created,
                model=first_chunk.model,
                choices=[
                    ChatCompletionChunkChoice(
                        index=0,
                        delta=ChatMessage(role=Role.ASSISTANT, content=final_content),
                        finish_reason=None,
                    )
                ],
            )

            # Yield finish chunk with tool_calls and usage
            yield ChatCompletionChunk(
                id=first_chunk.id,
                created=first_chunk.created,
                model=first_chunk.model,
                choices=[
                    ChatCompletionChunkChoice(
                        index=0,
                        delta=ChatMessage(role=Role.ASSISTANT, content="", tool_calls=tool_calls),
                        finish_reason=finish_reason,
                    )
                ],
                usage=last_chunk.usage if hasattr(last_chunk, 'usage') else None,
            )
        elif buffered_chunks:
            # No content accumulated (empty response) - flush as-is
            for buffered in buffered_chunks:
                yield buffered

    OpenAIAdapter.generate_stream = patched_generate_stream
    print("[gpt-oss] Channel format adapter installed")
