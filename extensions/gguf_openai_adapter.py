"""
GGUF OpenAI Adapter for MLX Studio

Provides OpenAI Chat Completions API compatibility for GGUF models via llama-server.
Since llama-server already provides OpenAI-compatible API, this is essentially a passthrough.
"""

import logging
from typing import Any, Dict, Generator, List, Optional

from .gguf_backend import GGUFBackend

logger = logging.getLogger("mlx-studio.gguf")

# Import OpenAI schema types
import sys
from pathlib import Path

# Add vendor path for mlx-omni-server imports
VENDOR_PATH = Path(__file__).parent.parent / "vendor" / "mlx-omni-server" / "src"
if str(VENDOR_PATH) not in sys.path:
    sys.path.insert(0, str(VENDOR_PATH))

from mlx_omni_server.chat.openai.schema import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChunk,
)


class GGUFOpenAIAdapter:
    """OpenAI Chat Completions adapter for GGUF backend via llama-server.

    Since llama-server already provides an OpenAI-compatible API,
    this adapter is mostly a passthrough that converts request/response
    formats to match our internal schema.
    """

    def __init__(self, backend: GGUFBackend):
        """Initialize adapter with GGUF backend.

        Args:
            backend: GGUFBackend instance connected to llama-server
        """
        self.backend = backend

    def _normalize_chunk(self, chunk: dict) -> dict:
        """Normalize streaming chunk from llama-server.

        Fixes issues like:
        - Missing 'role' in delta when only reasoning_content is present
        - Converts reasoning_content to reasoning (schema field name)
        - Ensures role is always present in delta (when delta has content)
        - Extracts tokens_per_second from timings field
        - Normalizes tool_calls to have required fields (id, function.name)

        Args:
            chunk: Raw chunk from llama-server

        Returns:
            Normalized chunk compatible with OpenAI schema
        """
        # Extract tokens_per_second and cache stats from llama-server's timings field
        if "timings" in chunk:
            timings = chunk.pop("timings")
            # llama-server returns predicted_per_second in timings
            tps = timings.get("predicted_per_second", 0)
            cache_n = timings.get("cache_n", 0)  # Number of cached tokens

            if "usage" not in chunk:
                chunk["usage"] = {}

            if tps:
                chunk["usage"]["tokens_per_second"] = round(tps, 1)

            # Add cache stats if available (use prompt_tokens_details format for frontend compatibility)
            if cache_n > 0:
                chunk["usage"]["cache_read_input_tokens"] = cache_n
                chunk["usage"]["cache_creation_input_tokens"] = 0
                # Also add prompt_tokens_details for frontend's cache_hit detection
                chunk["usage"]["prompt_tokens_details"] = {"cached_tokens": cache_n}

        if "choices" not in chunk:
            return chunk

        for choice in chunk["choices"]:
            delta = choice.get("delta", {})

            # Convert reasoning_content to reasoning (llama-server uses different field name)
            if "reasoning_content" in delta:
                delta["reasoning"] = delta.pop("reasoning_content")

            # Normalize tool_calls - llama-server sends incremental chunks
            # where only first chunk has id/name, subsequent only have arguments
            if "tool_calls" in delta:
                for tool_call in delta["tool_calls"]:
                    # Ensure id is present (use index as fallback)
                    if "id" not in tool_call:
                        idx = tool_call.get("index", 0)
                        tool_call["id"] = f"call_{idx}"
                    # Ensure type is present
                    if "type" not in tool_call:
                        tool_call["type"] = "function"
                    # Ensure function.name is present
                    if "function" in tool_call:
                        if "name" not in tool_call["function"]:
                            tool_call["function"]["name"] = ""

            # Ensure role is always present in delta (required by ChatMessage schema)
            # But only if delta has actual content - empty delta {} should get role too
            # since the schema requires it
            if "role" not in delta:
                delta["role"] = "assistant"

        return chunk

    def generate(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """Generate a complete (non-streaming) response.

        Note: This is a sync wrapper around async backend.
        Use generate_async for async contexts.

        Args:
            request: OpenAI chat completion request

        Returns:
            OpenAI chat completion response
        """
        import asyncio

        # Run async method in sync context
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(self.generate_async(request))
            return result
        finally:
            loop.close()

    async def generate_async(
        self, request: ChatCompletionRequest
    ) -> ChatCompletionResponse:
        """Generate a complete (non-streaming) response asynchronously.

        Args:
            request: OpenAI chat completion request

        Returns:
            OpenAI chat completion response
        """
        # Convert request to dict format for backend
        messages = []
        for msg in request.messages:
            msg_dict = {"role": msg.role, "content": msg.content}
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                msg_dict["tool_calls"] = [tc.model_dump() for tc in msg.tool_calls]
            if hasattr(msg, "tool_call_id") and msg.tool_call_id:
                msg_dict["tool_call_id"] = msg.tool_call_id
            messages.append(msg_dict)

        tools = None
        if request.tools:
            tools = [tool.model_dump() for tool in request.tools]

        # Call llama-server
        result = await self.backend.generate(
            messages=messages,
            tools=tools,
            max_tokens=request.max_tokens or 4096,
            temperature=request.temperature or 0.7,
            top_p=request.top_p or 0.9,
        )

        # Parse response into our schema
        return ChatCompletionResponse.model_validate(result)

    def generate_stream(
        self, request: ChatCompletionRequest
    ) -> Generator[ChatCompletionChunk, None, None]:
        """Generate a streaming response.

        Note: This is a sync generator wrapper around async backend.

        Args:
            request: OpenAI chat completion request

        Yields:
            OpenAI streaming response chunks
        """
        import asyncio

        # Run async generator in sync context
        loop = asyncio.new_event_loop()
        try:
            async_gen = self.generate_stream_async(request)

            while True:
                try:
                    chunk = loop.run_until_complete(async_gen.__anext__())
                    yield chunk
                except StopAsyncIteration:
                    break
        finally:
            loop.close()

    async def generate_stream_async(
        self, request: ChatCompletionRequest
    ):
        """Generate a streaming response asynchronously.

        Args:
            request: OpenAI chat completion request

        Yields:
            OpenAI streaming response chunks
        """
        # Convert request to dict format for backend
        messages = []
        for msg in request.messages:
            msg_dict = {"role": msg.role, "content": msg.content}
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                msg_dict["tool_calls"] = [tc.model_dump() for tc in msg.tool_calls]
            if hasattr(msg, "tool_call_id") and msg.tool_call_id:
                msg_dict["tool_call_id"] = msg.tool_call_id
            messages.append(msg_dict)

        tools = None
        if request.tools:
            tools = [tool.model_dump() for tool in request.tools]

        # Stream from llama-server
        chunk_count = 0
        accumulated_content = ""
        accumulated_reasoning = ""
        has_tool_calls = False
        finish_reason = None

        async for chunk in self.backend.generate_stream(
            messages=messages,
            tools=tools,
            max_tokens=request.max_tokens or 4096,
            temperature=request.temperature or 0.7,
            top_p=request.top_p or 0.9,
        ):
            chunk_count += 1

            # Track what we're receiving for debugging
            choices = chunk.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                if delta.get("content"):
                    accumulated_content += delta["content"]
                if delta.get("reasoning_content"):
                    accumulated_reasoning += delta["reasoning_content"]
                if delta.get("tool_calls"):
                    has_tool_calls = True
                if choices[0].get("finish_reason"):
                    finish_reason = choices[0]["finish_reason"]

            # Normalize chunk before validation
            # llama-server may send reasoning_content without role in delta
            chunk = self._normalize_chunk(chunk)
            # Parse chunk into our schema
            yield ChatCompletionChunk.model_validate(chunk)

        # Log what we received
        logger.info(f"GGUF OpenAI stream completed: {chunk_count} chunks, content={len(accumulated_content)} chars, reasoning={len(accumulated_reasoning)} chars, has_tool_calls={has_tool_calls}, finish_reason={finish_reason}")
        if not accumulated_content and not has_tool_calls:
            logger.warning("GGUF OpenAI stream produced no content and no tool calls - potential empty response")
        if accumulated_content:
            preview = accumulated_content[:150].replace('\n', '\\n')
            logger.debug(f"GGUF OpenAI content preview: '{preview}...'")
