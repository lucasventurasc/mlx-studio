"""
Mistral/Devstral Tool Call Adapter

Handles the native tool call format from Devstral models:
[TOOL_CALLS]function_name[ARGS]{"key": "value"}

This module:
1. Detects Mistral/Devstral tool calls in responses
2. Parses them and converts to OpenAI format
3. Works with both streaming and non-streaming responses

IMPORTANT: Only applies to Mistral/Devstral models.

Performance: Uses stream-first approach - yields tokens immediately
until [TOOL_CALLS] marker is detected, then buffers for parsing.
"""

import json

# Import schema classes at module level (not in hot path)
from mlx_omni_server.chat.openai.schema import (
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatMessage,
    ToolCall,
    FunctionCall,
    ToolType,
    Role,
)

from extensions.mistral_tools_parser import (
    parse_mistral_tool_calls,
    has_mistral_tool_calls,
)

# Tool call marker
TOOL_MARKER = '[TOOL_CALLS]'


def is_mistral_model(model_id: str) -> bool:
    """Check if a model is a Mistral/Devstral model that needs tool call parsing."""
    if not model_id:
        return False
    model_lower = model_id.lower()
    return any(x in model_lower for x in [
        'devstral',
        'mistral',
        'ministral',
    ])


def patch_openai_adapter():
    """
    Patch OpenAI adapter to parse Mistral/Devstral tool calls.

    IMPORTANT: Only applies to Mistral/Devstral models.
    """
    from mlx_omni_server.chat.openai.openai_adapter import OpenAIAdapter

    # Store original methods
    original_generate = OpenAIAdapter.generate
    original_generate_stream = OpenAIAdapter.generate_stream

    def patched_generate(self, request):
        """Wrapper that processes Mistral tool calls in non-streaming responses."""
        response = original_generate(self, request)

        # Only process Mistral models
        if not is_mistral_model(request.model):
            return response

        # Check if response content has Mistral tool calls
        if response.choices and response.choices[0].message:
            content = response.choices[0].message.content or ""

            if content and has_mistral_tool_calls(content):
                # Parse tool calls
                parsed_tools = parse_mistral_tool_calls(content)

                if parsed_tools:
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

                    # Skip content before tool calls - match llama.cpp behavior
                    response.choices[0].message.tool_calls = tool_calls
                    response.choices[0].message.content = None
                    response.choices[0].finish_reason = "tool_calls"

        return response

    def patched_generate_stream(self, request):
        """
        Stream-first wrapper that processes Mistral tool calls.

        Strategy:
        - Stream chunks immediately (true streaming UX)
        - Watch for [TOOL_CALLS] marker in the stream
        - If marker detected, switch to buffering mode for parsing
        - This gives best of both worlds: fast streaming + tool support
        """
        # Only process Mistral models - pass through directly for others
        if not is_mistral_model(request.model):
            yield from original_generate_stream(self, request)
            return

        # If no tools in request, stream directly without any overhead
        if not request.tools:
            yield from original_generate_stream(self, request)
            return

        # Stream-first approach with lazy tool detection
        text_parts = []  # Use list for O(n) instead of string concat O(n²)
        buffered_chunks = []
        first_chunk = None
        last_chunk = None
        tool_marker_detected = False
        yielded_count = 0

        # Rolling window to detect marker across chunk boundaries
        recent_text = ""

        for chunk in original_generate_stream(self, request):
            if first_chunk is None:
                first_chunk = chunk
            last_chunk = chunk

            # Extract content from chunk
            content = None
            if chunk.choices and chunk.choices[0].delta:
                content = chunk.choices[0].delta.content

            if content:
                text_parts.append(content)
                recent_text += content
                # Keep only last 50 chars for marker detection (marker is ~12 chars)
                if len(recent_text) > 50:
                    recent_text = recent_text[-50:]

            # Check for tool marker in recent text
            if not tool_marker_detected and TOOL_MARKER in recent_text:
                tool_marker_detected = True
                # Start buffering from here - don't yield this or future chunks
                buffered_chunks.append(chunk)
                continue

            if tool_marker_detected:
                # In buffering mode - collect remaining chunks
                buffered_chunks.append(chunk)
            else:
                # Stream mode - yield immediately for real-time UX
                yield chunk
                yielded_count += 1

        # After generation completes, handle based on whether tools were detected
        if tool_marker_detected:
            full_text = ''.join(text_parts)

            if has_mistral_tool_calls(full_text):
                parsed_tools = parse_mistral_tool_calls(full_text)

                if parsed_tools:
                    # Build tool_calls with index for streaming format
                    tool_calls = []
                    for idx, tc in enumerate(parsed_tools):
                        tool_call = ToolCall(
                            id=tc.id,
                            type=ToolType.FUNCTION,
                            function=FunctionCall(
                                name=tc.name,
                                arguments=json.dumps(tc.arguments)
                            )
                        )
                        tool_call.index = idx
                        tool_calls.append(tool_call)

                    # Yield single chunk with all tool calls
                    yield ChatCompletionChunk(
                        id=first_chunk.id if first_chunk else "chatcmpl-0",
                        created=first_chunk.created if first_chunk else 0,
                        model=request.model,
                        choices=[
                            ChatCompletionChunkChoice(
                                index=0,
                                delta=ChatMessage(
                                    role=Role.ASSISTANT,
                                    content=None,
                                    tool_calls=tool_calls
                                ),
                                finish_reason="tool_calls",
                            )
                        ],
                        usage=last_chunk.usage if last_chunk and hasattr(last_chunk, 'usage') else None,
                    )
                    return

            # Tool marker was detected but parsing failed - yield buffered chunks
            for chunk in buffered_chunks:
                yield chunk

    OpenAIAdapter.generate = patched_generate
    OpenAIAdapter.generate_stream = patched_generate_stream
