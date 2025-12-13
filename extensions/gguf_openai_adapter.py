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

        Args:
            chunk: Raw chunk from llama-server

        Returns:
            Normalized chunk compatible with OpenAI schema
        """
        # Extract tokens_per_second from llama-server's timings field
        if "timings" in chunk:
            timings = chunk.pop("timings")
            # llama-server returns predicted_per_second in timings
            tps = timings.get("predicted_per_second", 0)
            if tps and "usage" in chunk:
                chunk["usage"]["tokens_per_second"] = round(tps, 1)
            elif tps:
                # Create usage if not present
                chunk["usage"] = {"tokens_per_second": round(tps, 1)}

        if "choices" not in chunk:
            return chunk

        for choice in chunk["choices"]:
            delta = choice.get("delta", {})

            # Convert reasoning_content to reasoning (llama-server uses different field name)
            if "reasoning_content" in delta:
                delta["reasoning"] = delta.pop("reasoning_content")

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
        async for chunk in self.backend.generate_stream(
            messages=messages,
            tools=tools,
            max_tokens=request.max_tokens or 4096,
            temperature=request.temperature or 0.7,
            top_p=request.top_p or 0.9,
        ):
            # Normalize chunk before validation
            # llama-server may send reasoning_content without role in delta
            chunk = self._normalize_chunk(chunk)
            # Parse chunk into our schema
            yield ChatCompletionChunk.model_validate(chunk)
