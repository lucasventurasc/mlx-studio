# MLX Studio v0.4.0-alpha

## Mistral/Devstral Tool Calling Support

This release adds native tool calling support for Mistral and Devstral models, enabling them to work seamlessly with [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) and other OpenAI-compatible clients.

### Features

- **Native Tool Call Parsing**: Automatically parses Devstral's `[TOOL_CALLS]function[ARGS]{json}` format and converts to OpenAI-compatible `tool_calls`
- **Stream-First Architecture**: True streaming UX - tokens stream immediately until tool marker detected
- **Automatic Model Detection**: Automatically applies to Mistral/Devstral/Ministral models
- **8-bit KV Cache Support**: Use `MLX_KV_BITS=8` for faster generation (matches llama.cpp `-ctk q8_0`)

### Performance

| Backend | Model | Speed | Tool Calling |
|---------|-------|-------|--------------|
| **MLX Studio** | Devstral 4-bit | **31-43 tok/s** | ✅ Working |
| llama.cpp + speculative | Devstral Q4 + Ministral Q8 | 15-20 tok/s | ✅ Working |
| llama.cpp plain | Devstral Q4 | 8-12 tok/s | ✅ Working |

**MLX is ~2x faster than llama.cpp with speculative decoding!**

### Performance Optimizations (v0.4.0)

- **Stream-first approach**: Tokens stream immediately, only buffers after `[TOOL_CALLS]` detected
- **O(n) string handling**: Uses list + join instead of O(n²) concatenation
- **Module-level imports**: Schema classes imported once, not per request
- **Rolling window detection**: 50-char window for marker detection across chunk boundaries

### Supported Models

- `mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit` (recommended)
- `mlx-community/Devstral-Small-2-24B-Instruct-2512-6bit`

### How to Use with Mistral Vibe CLI

1. **Start MLX Studio:**
   ```bash
   cd mlx-studio
   MLX_KV_BITS=8 ./venv-omni/bin/python server.py --port 8080
   ```

2. **Configure Vibe** (`~/.vibe/config.toml`):
   ```toml
   active_model = "mlx"

   [[providers]]
   name = "mlx"
   api_base = "http://127.0.0.1:8080/v1"
   api_key_env_var = ""
   api_style = "openai"
   backend = "generic"

   [[models]]
   name = "devstral-24b"
   provider = "mlx"
   alias = "mlx"
   temperature = 0.2
   ```

3. **Add model alias** in `mlx-studio/model_aliases.json`:
   ```json
   {
     "devstral-24b": "~/.lmstudio/models/mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit"
   }
   ```

4. **Run Vibe:**
   ```bash
   vibe
   ```

### Monitoring

Use the included monitor script to track performance:
```bash
./monitor-mlx.sh
```

Shows: TOK/S, TTFT (time to first token), tokens generated, cache hits.

### Chat Template Note

The default Devstral chat template has strict message alternation checks that may cause errors with some clients. MLX Studio includes a relaxed template that removes these checks while maintaining full compatibility.

If you encounter "conversation roles must alternate" errors, replace the model's `chat_template.jinja` with the relaxed version.

### Requirements

- Apple Silicon Mac (M1/M2/M3)
- Python 3.10+
- mlx-lm 0.30.0+
- 16GB+ RAM (64GB recommended for 24B models)

### Environment Variables

- `MLX_KV_BITS=8` - Enable 8-bit KV cache quantization (recommended)
- `MLX_PREFILL_STEP_SIZE=8192` - Prefill batch size (default)
- `MLX_CACHE_MAX_SLOTS=4` - Max prompt cache slots

---

*This release was developed with assistance from Claude Code.*
