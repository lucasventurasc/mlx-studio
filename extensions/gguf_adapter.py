"""
GGUF Anthropic Adapter for MLX Studio

Provides Anthropic Messages API compatibility for GGUF models via llama-server.
Converts between Anthropic format and OpenAI format, handles streaming,
and parses tool calls using the same Qwen parser as MLX backend.
"""

import json
import logging
import re
import uuid
from typing import Any, AsyncGenerator, Dict, Generator, List, Optional

from .gguf_backend import GGUFBackend

logger = logging.getLogger("mlx-studio.gguf")

# Import Anthropic schema types
import sys
from pathlib import Path

# Add vendor path for mlx-omni-server imports
VENDOR_PATH = Path(__file__).parent.parent / "vendor" / "mlx-omni-server" / "src"
if str(VENDOR_PATH) not in sys.path:
    sys.path.insert(0, str(VENDOR_PATH))

from mlx_omni_server.chat.anthropic.anthropic_schema import (
    AnthropicTool,
    ContentBlock,
    InputMessage,
    MessagesRequest,
    MessagesResponse,
    MessageStreamEvent,
    RequestTextBlock,
    RequestToolResultBlock,
    RequestToolUseBlock,
    StopReason,
    StreamDelta,
    StreamEventType,
    SystemPrompt,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    Usage,
)


class GGUFAnthropicAdapter:
    """Anthropic Messages API adapter for GGUF backend via llama-server.

    Handles:
    - Converting Anthropic messages to OpenAI format
    - Converting Anthropic tools to OpenAI format
    - Streaming responses with proper Anthropic event format
    - Parsing tool calls from response text (Qwen XML format)
    """

    def __init__(self, backend: GGUFBackend):
        """Initialize adapter with GGUF backend.

        Args:
            backend: GGUFBackend instance connected to llama-server
        """
        self.backend = backend
        self._default_max_tokens = 4096

        # Import tool parser (same one used by MLX backend)
        try:
            from mlx_omni_server.chat.mlx.tools.qwen3_moe_tools_parser import (
                Qwen3MoeToolParser,
            )

            self.tool_parser = Qwen3MoeToolParser()
        except ImportError:
            logger.warning("Qwen3MoeToolParser not available, tool parsing disabled")
            self.tool_parser = None

    def _convert_system_to_messages(
        self, system: Optional[SystemPrompt], messages: List[InputMessage]
    ) -> List[Dict[str, Any]]:
        """Convert Anthropic system prompt and messages to OpenAI format.

        Args:
            system: System prompt (string or list of text blocks)
            messages: Input messages in Anthropic format

        Returns:
            List of messages in OpenAI format
        """
        openai_messages = []

        # Tool use guidance (same as MLX adapter)
        tool_guidance = """
IMPORTANT TOOL USE GUIDELINES:
1. ALWAYS use Read tool BEFORE Edit - never edit a file you haven't read
2. Use Edit with SMALL, SURGICAL changes - only the exact lines that need to change
3. NEVER output entire file contents in your response - use Write or Edit tools instead
4. Break complex tasks into steps using TodoWrite
5. One tool call at a time, verify each works before proceeding
6. For Edit: old_string must match EXACTLY (including whitespace)
"""

        # Convert system prompt
        if system:
            system_content = ""
            if isinstance(system, str):
                system_content = system
            else:
                # List of SystemTextBlock
                system_content = "\n".join(block.text for block in system)

            # Prepend tool guidance
            system_content = tool_guidance + "\n\n" + system_content
            openai_messages.append({"role": "system", "content": system_content})

        # Convert input messages
        logger.debug(f"Converting {len(messages)} Anthropic messages to OpenAI format")
        for msg in messages:
            # Handle system messages in the messages array
            if msg.role.value == "system":
                if isinstance(msg.content, str):
                    system_text = msg.content
                else:
                    system_text = "\n".join(
                        block.text
                        for block in msg.content
                        if isinstance(block, RequestTextBlock)
                    )
                openai_messages.append({"role": "system", "content": system_text})
                continue

            openai_msg: Dict[str, Any] = {"role": msg.role.value}

            # Handle content
            if isinstance(msg.content, str):
                openai_msg["content"] = msg.content
            else:
                # List of content blocks
                content_parts = []
                tool_calls = []

                for block in msg.content:
                    if isinstance(block, RequestTextBlock):
                        content_parts.append(block.text)
                    elif isinstance(block, RequestToolUseBlock):
                        # Tool use from assistant
                        tool_calls.append(
                            {
                                "id": block.id,
                                "type": "function",
                                "function": {
                                    "name": block.name,
                                    "arguments": json.dumps(block.input)
                                    if isinstance(block.input, dict)
                                    else block.input,
                                },
                            }
                        )
                    elif isinstance(block, RequestToolResultBlock):
                        # Tool result from user
                        tool_content = block.content
                        if isinstance(tool_content, str):
                            content_parts.append(tool_content)
                        else:
                            for sub_block in tool_content:
                                if isinstance(sub_block, RequestTextBlock):
                                    content_parts.append(sub_block.text)

                        # For tool results, create a separate message
                        openai_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": block.tool_use_id,
                                "content": "\n".join(content_parts) if content_parts else "",
                            }
                        )
                        content_parts = []
                        continue

                if content_parts:
                    openai_msg["content"] = "\n".join(content_parts)
                else:
                    openai_msg["content"] = ""

                if tool_calls:
                    openai_msg["tool_calls"] = tool_calls

            openai_messages.append(openai_msg)

        # Log converted messages for debugging
        logger.info(f"GGUF Anthropic->OpenAI: Converted {len(messages)} Anthropic msgs to {len(openai_messages)} OpenAI msgs")
        for i, m in enumerate(openai_messages[-5:]):  # Last 5 messages
            role = m.get('role', '?')
            content_preview = str(m.get('content', ''))[:80] if m.get('content') else '<null>'
            has_tools = 'tool_calls' in m
            tool_id = m.get('tool_call_id', '')
            logger.info(f"  msg[{len(openai_messages)-5+i}] {role}: '{content_preview}' tool_calls={has_tools} tool_call_id={tool_id}")

        return openai_messages

    def _convert_tools_to_openai(
        self, tools: Optional[List[AnthropicTool]]
    ) -> Optional[List[Dict[str, Any]]]:
        """Convert Anthropic tools to OpenAI format.

        Args:
            tools: List of Anthropic tools

        Returns:
            List of tools in OpenAI format
        """
        if not tools:
            return None

        openai_tools = []
        for tool in tools:
            openai_tool = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description or "",
                    "parameters": {
                        "type": tool.input_schema.type,
                        "properties": tool.input_schema.properties or {},
                        "required": tool.input_schema.required or [],
                    },
                },
            }
            openai_tools.append(openai_tool)

        return openai_tools

    def _parse_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        """Parse tool calls from response text.

        Uses Qwen3 XML format parser (same as MLX backend).

        Args:
            text: Response text that may contain tool calls

        Returns:
            List of parsed tool calls
        """
        if not self.tool_parser:
            return []

        # Check for tool call markers
        if "<function=" not in text and "<tool_call>" not in text:
            return []

        try:
            tool_calls = self.tool_parser.parse_tools(text)
            if tool_calls:
                # Filter out tool calls with empty arguments
                valid_calls = []
                for tc in tool_calls:
                    if tc.arguments and len(tc.arguments) > 0:
                        valid_calls.append(tc)
                    else:
                        logger.warning(
                            f"Filtered out tool call '{tc.name}' with empty arguments"
                        )
                return valid_calls
        except Exception as e:
            logger.warning(f"Failed to parse tool calls: {e}")

        return []

    def _clean_tool_xml(self, text: str) -> str:
        """Remove tool call XML from display text.

        Args:
            text: Text that may contain tool call XML

        Returns:
            Text with tool call XML removed
        """
        # Remove <tool_call>...</tool_call> blocks
        text = re.sub(r"<tool_call>.*?</tool_call>", "", text, flags=re.DOTALL)
        # Remove malformed <function=...></tool_call> blocks
        text = re.sub(r"<function=.*?</tool_call>", "", text, flags=re.DOTALL)
        return text.strip()

    def generate(self, request: MessagesRequest) -> MessagesResponse:
        """Generate complete response (synchronous wrapper).

        Args:
            request: Anthropic Messages API request

        Returns:
            Anthropic Messages API response
        """
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self._generate_async(request))
        finally:
            loop.close()

    async def _generate_async(self, request: MessagesRequest) -> MessagesResponse:
        """Generate complete response (async implementation).

        Args:
            request: Anthropic Messages API request

        Returns:
            Anthropic Messages API response
        """
        # Convert to OpenAI format
        messages = self._convert_system_to_messages(request.system, request.messages)
        tools = self._convert_tools_to_openai(request.tools)

        # Get sampler settings
        try:
            from extensions.global_settings import get_global_settings

            settings = get_global_settings().settings
            temperature = (
                request.temperature
                if request.temperature is not None
                else settings.temperature
            )
            top_p = request.top_p if request.top_p is not None else settings.top_p
        except ImportError:
            temperature = request.temperature or 0.7
            top_p = request.top_p or 0.9

        # Call llama-server
        result = await self.backend.generate(
            messages=messages,
            tools=tools,
            max_tokens=request.max_tokens or self._default_max_tokens,
            temperature=temperature,
            top_p=top_p,
        )

        # Extract response
        choice = result.get("choices", [{}])[0]
        message = choice.get("message", {})
        # Only use content field (reasoning_content is internal thinking, not shown)
        content_text = message.get("content", "")
        # But keep reasoning for tool parsing
        reasoning_text = message.get("reasoning_content", "")

        # Parse tool calls from text or from response
        tool_calls = []
        openai_tool_calls = message.get("tool_calls", [])

        if openai_tool_calls:
            # llama-server returned structured tool calls
            for tc in openai_tool_calls:
                func = tc.get("function", {})
                args = func.get("arguments", "{}")
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}

                tool_calls.append(
                    ToolUseBlock(
                        id=tc.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
                        name=func.get("name", ""),
                        input=args,
                    )
                )
        else:
            # Try parsing tool calls from content or reasoning text (Qwen XML format)
            full_text = reasoning_text + content_text
            parsed = self._parse_tool_calls(full_text)
            for tc in parsed:
                tool_calls.append(
                    ToolUseBlock(
                        id=tc.id,
                        name=tc.name,
                        input=tc.arguments,
                    )
                )
            # Clean XML from display text
            if parsed:
                content_text = self._clean_tool_xml(content_text)

        # Build content blocks
        content_blocks: List[ContentBlock] = []
        if content_text:
            content_blocks.append(TextBlock(text=content_text))
        content_blocks.extend(tool_calls)

        if not content_blocks:
            content_blocks.append(TextBlock(text=""))

        # Determine stop reason
        finish_reason = choice.get("finish_reason", "stop")
        if tool_calls:
            stop_reason = StopReason.TOOL_USE
        elif finish_reason == "length":
            stop_reason = StopReason.MAX_TOKENS
        else:
            stop_reason = StopReason.END_TURN

        # Build usage
        usage_data = result.get("usage", {})
        usage = Usage(
            input_tokens=usage_data.get("prompt_tokens", 0),
            output_tokens=usage_data.get("completion_tokens", 0),
        )

        return MessagesResponse(
            id=f"msg_{uuid.uuid4().hex[:24]}",
            content=content_blocks,
            model=request.model,
            stop_reason=stop_reason,
            usage=usage,
        )

    def generate_stream(
        self, request: MessagesRequest, temp_boost: float = 0.0
    ) -> Generator[MessageStreamEvent, None, None]:
        """Generate streaming response (synchronous wrapper).

        Args:
            request: Anthropic Messages API request
            temp_boost: Additional temperature (for breaking repetition loops)

        Yields:
            Anthropic streaming events
        """
        import asyncio
        import queue
        import threading

        # Use a queue to pass events from async to sync
        event_queue = queue.Queue()
        done_event = threading.Event()
        error_holder = [None]

        def run_async():
            """Run the async generator in a new thread with its own event loop."""
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    async def collect_events():
                        async for event in self._generate_stream_async(request, temp_boost):
                            event_queue.put(event)
                    loop.run_until_complete(collect_events())
                finally:
                    loop.close()
            except Exception as e:
                error_holder[0] = e
            finally:
                done_event.set()

        # Start async collection in background thread
        thread = threading.Thread(target=run_async, daemon=True)
        thread.start()

        # Yield events as they arrive
        while not done_event.is_set() or not event_queue.empty():
            try:
                event = event_queue.get(timeout=0.1)
                yield event
            except queue.Empty:
                continue

        # Check for errors
        if error_holder[0]:
            raise error_holder[0]

    async def _generate_stream_async(
        self, request: MessagesRequest, temp_boost: float = 0.0
    ) -> AsyncGenerator[MessageStreamEvent, None]:
        """Generate streaming response (async implementation).

        Args:
            request: Anthropic Messages API request
            temp_boost: Additional temperature (for breaking repetition loops)

        Yields:
            Anthropic streaming events
        """
        message_id = f"msg_{uuid.uuid4().hex[:24]}"

        # Convert to OpenAI format
        messages = self._convert_system_to_messages(request.system, request.messages)
        tools = self._convert_tools_to_openai(request.tools)

        # Check context usage and warn if too high
        context_warning = None
        try:
            from extensions.auto_compact import check_context_warning
            from extensions.gguf_backend import load_gguf_config

            gguf_config = load_gguf_config()

            # Extract context size from default_args
            ctx_size = 32768
            args = gguf_config.get("default_args", [])
            for i, arg in enumerate(args):
                if arg in ("-c", "--ctx-size") and i + 1 < len(args):
                    ctx_size = int(args[i + 1])
                    break

            warning_config = {
                "context_limit": ctx_size,
                "threshold_percent": gguf_config.get("context_warning_threshold", 75),
            }

            context_warning = check_context_warning(
                messages, tools, request.max_tokens, warning_config
            )
        except Exception as e:
            logger.warning(f"Context warning check failed: {e}")

        # Get sampler settings
        try:
            from extensions.global_settings import get_global_settings

            settings = get_global_settings().settings
            temperature = (
                request.temperature
                if request.temperature is not None
                else settings.temperature
            )
            top_p = request.top_p if request.top_p is not None else settings.top_p
        except ImportError:
            temperature = request.temperature or 0.7
            top_p = request.top_p or 0.9

        # Apply temperature boost
        if temp_boost > 0:
            temperature = min(1.0, temperature + temp_boost)

        # Emit message start
        yield MessageStreamEvent(
            type=StreamEventType.MESSAGE_START,
            message=MessagesResponse(
                id=message_id,
                content=[],
                model=request.model,
                stop_reason=None,
                usage=Usage(input_tokens=0, output_tokens=0),
            ),
        )

        # Track state
        accumulated_text = ""
        current_block_index = 0
        text_block_started = False
        in_tool_call_xml = False
        finish_reason = "stop"
        prompt_tokens = 0
        completion_tokens = 0

        # Track streaming tool calls from llama-server
        streaming_tool_calls = {}  # index -> {id, name, arguments}

        # Emit context warning if needed (before model response)
        if context_warning and context_warning.should_warn:
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_START,
                index=current_block_index,
                content_block=TextBlock(text=""),
            )
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_DELTA,
                index=current_block_index,
                delta=StreamDelta(type="text_delta", text=context_warning.warning_message + "\n\n"),
            )
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_STOP,
                index=current_block_index,
            )
            current_block_index += 1
            text_block_started = False  # Reset for actual response

        # Stream from llama-server
        try:
            stream = self.backend.generate_stream(
                messages=messages,
                tools=tools,
                max_tokens=request.max_tokens or self._default_max_tokens,
                temperature=temperature,
                top_p=top_p,
            )
        except Exception as e:
            logger.error(f"Failed to start GGUF stream: {e}")
            # Emit error as text and end gracefully
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_START,
                index=0,
                content_block=TextBlock(text=""),
            )
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_DELTA,
                index=0,
                delta=StreamDelta(type="text_delta", text=f"[GGUF Error: {e}]"),
            )
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_STOP,
                index=0,
            )
            yield MessageStreamEvent(
                type=StreamEventType.MESSAGE_DELTA,
                delta=StreamDelta(stop_reason=StopReason.END_TURN),
                usage=Usage(input_tokens=0, output_tokens=0),
            )
            yield MessageStreamEvent(type=StreamEventType.MESSAGE_STOP)
            return

        chunk_count = 0
        try:
            async for chunk in stream:
                chunk_count += 1

                # Track usage from final chunk (may have empty choices)
                usage_data = chunk.get("usage", {})
                if usage_data:
                    prompt_tokens = usage_data.get("prompt_tokens", prompt_tokens)
                    completion_tokens = usage_data.get("completion_tokens", completion_tokens)

                # Extract delta content
                choices = chunk.get("choices", [])
                if not choices:
                    continue

                choice = choices[0]
                delta = choice.get("delta", {})

                # Get both content types
                # - content: regular response content (shown to user)
                # - reasoning_content: some models (gpt-oss) put main response here
                content_delta = delta.get("content", "")
                reasoning_delta = delta.get("reasoning_content", "")

                finish = choice.get("finish_reason")

                if finish:
                    finish_reason = finish

                # Handle streaming tool calls from llama-server
                delta_tool_calls = delta.get("tool_calls", [])
                for tc in delta_tool_calls:
                    idx = tc.get("index", 0)
                    if idx not in streaming_tool_calls:
                        streaming_tool_calls[idx] = {
                            "id": tc.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
                            "name": "",
                            "arguments": ""
                        }
                    if tc.get("id"):
                        streaming_tool_calls[idx]["id"] = tc["id"]
                    func = tc.get("function", {})
                    if func.get("name"):
                        streaming_tool_calls[idx]["name"] = func["name"]
                    if func.get("arguments"):
                        streaming_tool_calls[idx]["arguments"] += func["arguments"]

                # For gpt-oss and similar models, reasoning_content IS the main response
                # If we have reasoning but no content, treat reasoning as content
                effective_delta = content_delta or reasoning_delta

                # Skip if no text content (but we may have tool_calls)
                if not effective_delta:
                    continue

                # Accumulate for tool parsing
                accumulated_text += effective_delta

                # Check for tool call XML
                if "<function=" in accumulated_text or "<tool_call>" in accumulated_text:
                    in_tool_call_xml = True

                # If we're in tool call mode, don't stream the XML
                if in_tool_call_xml:
                    continue

                # Start text block if needed
                if not text_block_started:
                    yield MessageStreamEvent(
                        type=StreamEventType.CONTENT_BLOCK_START,
                        index=current_block_index,
                        content_block=TextBlock(text=""),
                    )
                    text_block_started = True

                # Stream text delta (use effective_delta which may come from content or reasoning_content)
                yield MessageStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_DELTA,
                    index=current_block_index,
                    delta=StreamDelta(type="text_delta", text=effective_delta),
                )
        except Exception as e:
            # Handle disconnection during streaming (e.g., llama-server restart)
            logger.warning(f"GGUF stream interrupted after {chunk_count} chunks: {e}")
            if not text_block_started:
                yield MessageStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_START,
                    index=current_block_index,
                    content_block=TextBlock(text=""),
                )
                text_block_started = True
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_DELTA,
                index=current_block_index,
                delta=StreamDelta(type="text_delta", text=f"\n[Stream interrupted: {e}]"),
            )

        # Log completion stats
        logger.info(f"GGUF stream completed: {chunk_count} chunks, {len(accumulated_text)} chars accumulated, text_block_started={text_block_started}, in_tool_call_xml={in_tool_call_xml}")
        if accumulated_text:
            # Show preview of accumulated text for debugging
            preview = accumulated_text[:200].replace('\n', '\\n')
            logger.info(f"GGUF accumulated preview: '{preview}...'")
            if '<function=' in accumulated_text or '<tool_call>' in accumulated_text:
                logger.info("GGUF detected tool call XML in response")

        # End text block if started
        if text_block_started:
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_STOP,
                index=current_block_index,
            )
            current_block_index += 1

        # Get tool calls - prefer structured tool_calls from llama-server over XML parsing
        tool_calls = []
        if streaming_tool_calls:
            # Use structured tool calls from llama-server
            for idx in sorted(streaming_tool_calls.keys()):
                tc = streaming_tool_calls[idx]
                if tc["name"] and tc["arguments"]:
                    try:
                        args = json.loads(tc["arguments"])
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse tool call arguments: {tc['arguments']}")
                        args = {}
                    tool_calls.append(type('ToolCall', (), {
                        'id': tc["id"],
                        'name': tc["name"],
                        'arguments': args
                    })())
            logger.info(f"GGUF received {len(tool_calls)} structured tool calls from llama-server")
        elif accumulated_text:
            # Fallback: parse tool calls from XML in text
            parsed = self._parse_tool_calls(accumulated_text)
            for tc in parsed:
                tool_calls.append(tc)
            if parsed:
                logger.info(f"GGUF parsed {len(tool_calls)} tool calls from XML in text")

        if not accumulated_text and not tool_calls:
            logger.warning("GGUF stream produced no content and no tool calls - potential empty response")

        # If we have tool calls but never started a text block, emit an empty one first
        # This ensures the response always has at least some content before tools
        if tool_calls and not text_block_started:
            logger.info("GGUF emitting empty text block before tool calls (model generated tools-only response)")
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_START,
                index=current_block_index,
                content_block=TextBlock(text=""),
            )
            yield MessageStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_STOP,
                index=current_block_index,
            )
            current_block_index += 1

        # Emit tool use blocks
        if tool_calls:
            for tc in tool_calls:
                # Start tool_use block
                yield MessageStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_START,
                    index=current_block_index,
                    content_block=ToolUseBlock(
                        id=tc.id,
                        name=tc.name,
                        input={},
                    ),
                )

                # Send input_json_delta
                input_json = json.dumps(tc.arguments)
                yield MessageStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_DELTA,
                    index=current_block_index,
                    delta=StreamDelta(
                        type="input_json_delta",
                        partial_json=input_json,
                    ),
                )

                # End tool_use block
                yield MessageStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_STOP,
                    index=current_block_index,
                )
                current_block_index += 1

        # Determine stop reason
        has_tool_calls = len(tool_calls) > 0
        if has_tool_calls:
            stop_reason = StopReason.TOOL_USE
        elif finish_reason == "length":
            stop_reason = StopReason.MAX_TOKENS
        else:
            stop_reason = StopReason.END_TURN

        # Emit message delta with stop reason and usage
        yield MessageStreamEvent(
            type=StreamEventType.MESSAGE_DELTA,
            delta=StreamDelta(stop_reason=stop_reason),
            usage=Usage(
                input_tokens=prompt_tokens,
                output_tokens=completion_tokens,
            ),
        )

        # Emit message stop
        yield MessageStreamEvent(type=StreamEventType.MESSAGE_STOP)
