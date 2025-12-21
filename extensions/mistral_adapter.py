"""
Mistral/Devstral Tool Call Adapter

Handles the native tool call format from Devstral models:
[TOOL_CALLS]function_name[ARGS]{"key": "value"}

This module:
1. Detects Mistral/Devstral tool calls in responses
2. Parses them and converts to OpenAI format
3. Works with both streaming and non-streaming responses

IMPORTANT: Only applies to Mistral/Devstral models.

Performance: Uses stream-first approach with lookback buffer to handle
markers that span chunk boundaries.
"""

import json
from collections import deque

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

# Tool call marker (without closing bracket for partial detection)
TOOL_MARKER_START = '[TOOL_CALLS]'
TOOL_MARKER_PARTIAL = '[TOOL_CALLS'  # For early detection


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
        - Use a lookback buffer of N chunks before yielding
        - This allows detecting markers that span chunk boundaries
        - Once marker is detected, buffer everything for parsing
        """
        # Only process Mistral models - pass through directly for others
        if not is_mistral_model(request.model):
            yield from original_generate_stream(self, request)
            return

        # If no tools in request, stream directly without any overhead
        if not request.tools:
            yield from original_generate_stream(self, request)
            return

        # Lookback buffer - hold N chunks before yielding to catch split markers
        LOOKBACK_SIZE = 3
        lookback_buffer = deque(maxlen=LOOKBACK_SIZE)

        text_parts = []  # Use list for O(n) instead of string concat O(n²)
        all_chunks = []  # Keep all chunks in case we need them
        first_chunk = None
        last_chunk = None
        tool_marker_detected = False

        # Accumulated text for marker detection
        accumulated_text = ""

        for chunk in original_generate_stream(self, request):
            if first_chunk is None:
                first_chunk = chunk
            last_chunk = chunk
            all_chunks.append(chunk)

            # Extract content from chunk
            content = None
            if chunk.choices and chunk.choices[0].delta:
                content = chunk.choices[0].delta.content

            if content:
                text_parts.append(content)
                accumulated_text += content

            # Check for tool marker (check partial to catch early)
            if not tool_marker_detected:
                if TOOL_MARKER_PARTIAL in accumulated_text:
                    tool_marker_detected = True
                    # Don't yield anything from here - buffer the rest
                    continue

            if tool_marker_detected:
                # Already in buffer mode, just continue collecting
                continue

            # Add to lookback buffer
            lookback_buffer.append(chunk)

            # Only yield when buffer is full (delayed streaming)
            if len(lookback_buffer) == LOOKBACK_SIZE:
                yield lookback_buffer[0]

        # After generation completes
        if tool_marker_detected:
            # We detected a tool marker - parse the full text
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

            # Tool marker detected but parsing failed - yield all chunks
            for chunk in all_chunks:
                yield chunk
        else:
            # No tool marker - yield remaining chunks in lookback buffer
            for chunk in lookback_buffer:
                yield chunk

    OpenAIAdapter.generate = patched_generate
    OpenAIAdapter.generate_stream = patched_generate_stream
