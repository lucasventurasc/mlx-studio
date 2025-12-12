# MLX Studio - Issues & Future Work

## Issue #1: Enable Thinking Mode for Qwen3-Coder

### Problem

Currently, thinking mode is **forcefully disabled** for local models because:

1. When Claude Code requests `thinking: {type: "enabled", budget_tokens: X}`, the Qwen3-Coder model generates ALL content inside `<think>...</think>` tags
2. This results in `thinking_delta` being sent but `text_delta` being EMPTY
3. Claude Code shows nothing because it expects visible text content

### Current Workaround

In `anthropic_messages_adapter.py:201-205`:
```python
# ALWAYS disable thinking for local models - they don't support it properly
template_kwargs["enable_thinking"] = False
```

### Required Fix

The Qwen3 model with thinking enabled generates:
```
<think>
[reasoning here]
</think>
[actual response here]
```

But currently, while inside `<think>` block, ALL tokens go to `reasoning_delta` and nothing to `text_delta`. When the model finishes thinking, it should generate the actual response as `text_delta`.

**Steps to fix:**

1. **Modify `ThinkingDecoder` in `chat/mlx/tools/thinking_decoder.py`:**
   - After `</think>` is detected, all subsequent content should go to `text_delta`
   - Currently line 47-49 handles this but something is wrong with the streaming logic

2. **Verify `stream_parse_chat_result` in `chat/mlx/tools/chat_template.py:175-188`:**
   - Ensure `delta_content` is populated AFTER thinking block ends
   - The `ThinkingDecoder.stream_decode()` should return proper content after `</think>`

3. **Test the flow:**
   ```python
   # Input stream: "<think>reasoning</think>actual response"
   # Expected output:
   #   chunk 1: reasoning_delta="reasoning"
   #   chunk 2: text_delta="actual response"
   ```

4. **Re-enable thinking in adapter:**
   ```python
   if request.thinking and isinstance(request.thinking, ThinkingConfigEnabled):
       template_kwargs["enable_thinking"] = True
   else:
       template_kwargs["enable_thinking"] = False
   ```

### Files to Modify

- `vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/tools/thinking_decoder.py`
- `vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/tools/chat_template.py`
- `vendor/mlx-omni-server/src/mlx_omni_server/chat/anthropic/anthropic_messages_adapter.py`

### Testing

```bash
# Test with curl
curl -s 'http://localhost:1234/anthropic/v1/messages' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk-1234' \
  -d '{
    "model": "qwen3-coder-30b",
    "max_tokens": 500,
    "stream": true,
    "thinking": {"type": "enabled", "budget_tokens": 1024},
    "messages": [{"role": "user", "content": "What is 2+2? Think step by step."}]
  }'
```

Expected: See both `thinking_delta` AND `text_delta` events in the stream.

---

## Issue #2: Replace claude-code-router with Native Model Routing

### Problem

The `claude-code-router` has a bug where it doesn't forward `content_block_delta` SSE events to Claude Code, causing responses to not display.

### Current Workaround

Bypass the router entirely:
```bash
ANTHROPIC_BASE_URL=http://localhost:1234/anthropic ANTHROPIC_API_KEY=sk-1234 claude
```

### Proposed Solution

Instead of using `claude-code-router`, implement native routing directly in Claude Code using **agents**:

1. **Create specialized agents** for different tasks:
   - `fast` agent - Use smaller/faster model (e.g., Qwen3-0.6B) for simple tasks
   - `background` agent - Use for long-running background tasks
   - `think` agent - Use model with thinking enabled for complex reasoning
   - `default` agent - Standard Qwen3-Coder-30B for normal tasks

2. **Configure in Claude settings** (`.claude/settings.json` or similar):
   ```json
   {
     "agents": {
       "fast": {
         "model": "qwen3-0.6b",
         "api_base": "http://localhost:1234/anthropic"
       },
       "background": {
         "model": "qwen3-coder-30b",
         "api_base": "http://localhost:1234/anthropic"
       },
       "default": {
         "model": "qwen3-coder-30b",
         "api_base": "http://localhost:1234/anthropic"
       }
     }
   }
   ```

3. **Benefits over claude-code-router:**
   - No middleware bugs
   - Native Claude Code support
   - Simpler configuration
   - No extra process to manage

### Implementation Steps

1. Research how Claude Code handles agent configuration
2. Add multiple model aliases in `model_aliases.json`:
   ```json
   {
     "qwen3-fast": "/path/to/Qwen3-0.6B",
     "qwen3-coder": "/path/to/Qwen3-Coder-30B"
   }
   ```
3. Configure Claude Code to use different models for different agent types
4. Remove dependency on `claude-code-router`

### Files to Modify

- `model_aliases.json` - Add model variants
- Claude Code configuration (research needed)

---

## Issue #3: Improve Prompt Caching for Claude Code

### Status: ✅ IMPLEMENTED - Needs Testing

**Implementation:** Created `SmartPromptCache` in `vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/smart_prompt_cache.py`

Key features:
- **Hash-based lookup** (inspired by vLLM's Automatic Prefix Caching)
- **Multiple cache slots** (4 by default) with LRU eviction
- **Block-level hashing** (256 tokens per block) for efficient prefix matching
- Minimum reuse threshold (512 tokens) to avoid cache thrashing

### Problem (Original)

The current prompt cache uses **prefix matching** - it compares tokens from the start of the current prompt with the previous prompt. If the first N tokens match, it reuses the KV cache for those N tokens.

**Current behavior (from logs):**
```
DEBUG    *** Common prefix (15) shorter than cache (16461). Attempting trim. ***
DEBUG        Trimming 16446 tokens from cache.
```

This means only **15 tokens** out of **16,461** are being reused! The cache is almost useless because:

1. Claude Code adds dynamic messages at the START (caveats, changing system prompts)
2. The conversation history changes with each turn
3. Even small changes at the beginning invalidate the entire cache

### Impact

- Claude Code prompts are **~16,000+ tokens** (system prompt + tools + history)
- Without effective caching, EVERY request requires full prefill (~24 seconds!)
- With good caching, only new tokens need processing (~0.3 seconds)

### Current Implementation

`vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/prompt_cache.py`:
- Uses `common_prefix_len()` to find matching tokens from the start
- Trims cache if prefix is shorter than cached tokens
- Resets cache entirely if no common prefix

### Proposed Solutions

#### Solution A: Hash-based Caching for Static Components

Instead of prefix matching, cache static components separately:

```python
class SegmentedPromptCache:
    """Cache different parts of the prompt separately."""

    def __init__(self):
        self.system_cache = {}  # hash -> KV cache for system prompt
        self.tools_cache = {}   # hash -> KV cache for tools definition
        self.history_cache = {} # hash -> KV cache for conversation turns

    def get_cache(self, system_prompt, tools, messages):
        system_hash = hash(system_prompt)
        tools_hash = hash(json.dumps(tools))

        # Reuse cached components
        cached_system = self.system_cache.get(system_hash)
        cached_tools = self.tools_cache.get(tools_hash)

        # Only process what's new
        ...
```

#### Solution B: Cache the System Prompt + Tools Separately

The system prompt and tools are **almost always identical** in Claude Code:

1. **First request:** Cache system prompt + tools (~15,000 tokens)
2. **Subsequent requests:** Only process conversation history (~1,000 tokens)

```python
class SmartPromptCache:
    def __init__(self):
        self.static_cache = None      # KV cache for system + tools
        self.static_tokens = []       # Tokens for system + tools
        self.static_hash = None       # Hash to detect changes

    def get_prompt_cache(self, model, full_prompt, system_tokens, tools_tokens):
        static_part = system_tokens + tools_tokens
        static_hash = hash(tuple(static_part))

        if static_hash == self.static_hash:
            # Static part unchanged - reuse cache, only process dynamic part
            return full_prompt[len(static_part):], len(static_part)
        else:
            # Static part changed - rebuild cache
            self.rebuild_static_cache(model, static_part)
            return full_prompt[len(static_part):], len(static_part)
```

#### Solution C: Suffix Caching (Most Compatible)

Instead of prefix matching, look for common SUFFIX (the most recent messages):

```python
def common_suffix_len(list1, list2):
    """Find common suffix instead of prefix."""
    min_len = min(len(list1), len(list2))
    for i in range(1, min_len + 1):
        if list1[-i] != list2[-i]:
            return i - 1
    return min_len
```

This works because the END of the prompt (recent messages) is more stable than the START.

### Recommended Approach

**Solution B** is the most practical:

1. Detect when system prompt + tools are the same as last request
2. Cache that "static prefix" separately
3. Only re-process the conversation history (which is much smaller)

### Files to Modify

- `vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/prompt_cache.py` - Main caching logic
- `vendor/mlx-omni-server/src/mlx_omni_server/chat/mlx/chat_generator.py` - Pass system/tools info to cache
- `vendor/mlx-omni-server/src/mlx_omni_server/chat/anthropic/anthropic_messages_adapter.py` - Extract static components

### Testing

```bash
# Make two requests with same system prompt but different user message
# First request - should cache system prompt
curl ... -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# Second request - should reuse cache, only process new message
curl ... -d '{"messages": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}, {"role": "user", "content": "How are you?"}]}'

# Expected: Second request should show high cache hit rate
# DEBUG    Cache hit: 15000/15100 tokens (instead of 15/16000)
```

### Priority

**HIGH** - This is critical for Claude Code usability. Without caching:
- Every request takes ~24 seconds for prefill
- With caching: ~0.3 seconds

### Testing the New Cache

Run unit tests:
```bash
cd vendor/mlx-omni-server
python -m pytest tests/test_smart_prompt_cache.py -v
```

Test with Claude Code - look for these log messages:
```
INFO     Cache HIT: reusing X/Y tokens (Z% cached)
```
or
```
INFO     Cache MISS: creating new slot for X tokens (best match was Y tokens, active slots: Z/4)
```

Expected behavior:
1. First request: Cache MISS (creates new slot)
2. Second request with similar prefix: Cache HIT with high reuse (>90%)
3. Different conversation: May create new slot, but won't evict useful slots

---

## Completed Fixes (Reference)

### Fixed: Claude Code Integration with Local Qwen Model

**Problem:** Claude Code couldn't display responses from local Qwen model.

**Root Causes & Fixes:**

1. **Model aliases** (`patches.py`):
   - Any `claude-*` model name is redirected to local Qwen

2. **Thinking auto-detection** (`chat_template.py`):
   - Reset `enable_thinking_parse` on each request to prevent caching issues

3. **Content field required** (`anthropic_messages_adapter.py`):
   - Ensure all messages have `content` field for Jinja template

4. **Schema updates** (`anthropic_schema.py`):
   - Added `RequestThinkingBlock` and `RequestRedactedThinkingBlock`
   - Added `SYSTEM` role to `MessageRole` enum

5. **Count tokens endpoint** (`router.py`):
   - Added stub `/messages/count_tokens` endpoint

6. **SSE format** (`router.py`):
   - Use `mode='json'` for proper enum serialization
   - Ensure `stop_reason` and `stop_sequence` in correct events
