"""
Mistral/Devstral Tool Call Adapter

Handles the native tool call format from Devstral models:
[TOOL_CALLS]function_name[ARGS]{"key": "value"}

This module:
1. Detects Mistral/Devstral tool calls in responses
2. Parses them and converts to OpenAI format
3. Works with both streaming and non-streaming responses

IMPORTANT: Only applies to Mistral/Devstral models.
"""

import json
from typing import Generator

from extensions.mistral_tools_parser import (
    parse_mistral_tool_calls,
    has_mistral_tool_calls,
    extract_content_before_tools,
)


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

                    # Get content before tool calls (if any)
                    content_before = extract_content_before_tools(content)

                    response.choices[0].message.tool_calls = tool_calls
                    response.choices[0].message.content = content_before
                    response.choices[0].finish_reason = "tool_calls"
                    print(f"[mistral] Parsed {len(tool_calls)} tool call(s)")

        return response

    def patched_generate_stream(self, request):
        """Wrapper that processes Mistral tool calls in streaming responses."""
        # Only process Mistral models - pass through directly for others
        if not is_mistral_model(request.model):
            yield from original_generate_stream(self, request)
            return

        from mlx_omni_server.chat.openai.schema import (
            ChatCompletionChunk,
            ChatCompletionChunkChoice,
            ChatMessage,
            ToolCall,
            FunctionCall,
            ToolType,
            Role,
        )

        # Buffer ALL chunks and accumulated text
        all_chunks = []
        accumulated_text = ""
        first_chunk = None
        last_chunk = None

        for chunk in original_generate_stream(self, request):
            if first_chunk is None:
                first_chunk = chunk
            last_chunk = chunk
            all_chunks.append(chunk)

            # Extract content from chunk
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    accumulated_text += delta.content

        # Check if we have tool calls
        if has_mistral_tool_calls(accumulated_text):
            parsed_tools = parse_mistral_tool_calls(accumulated_text)

            if parsed_tools:
                # Get content before tool calls
                content_before = extract_content_before_tools(accumulated_text)

                # Yield content before tool call (if any)
                if content_before:
                    yield ChatCompletionChunk(
                        id=first_chunk.id if first_chunk else "chatcmpl-0",
                        created=first_chunk.created if first_chunk else 0,
                        model=request.model,
                        choices=[
                            ChatCompletionChunkChoice(
                                index=0,
                                delta=ChatMessage(role=Role.ASSISTANT, content=content_before),
                                finish_reason=None,
                            )
                        ],
                    )

                # Build tool_calls with index for streaming format
                # Create ToolCall objects and add index attribute dynamically
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
                    # Add index for streaming format (OpenAI requires this)
                    tool_call.index = idx
                    tool_calls.append(tool_call)

                # Yield chunk with tool calls
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
                print(f"[mistral] Parsed {len(parsed_tools)} tool call(s) from stream")
                return

        # No tool calls - yield all buffered chunks
        for chunk in all_chunks:
            yield chunk

    OpenAIAdapter.generate = patched_generate
    OpenAIAdapter.generate_stream = patched_generate_stream
    print("[mistral] Tool call adapter installed")
