# MLX Studio

**High-performance local LLM server for Apple Silicon with intelligent caching and multi-backend support**

MLX Studio wraps [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) with production-ready features: smart prompt caching (99%+ cache hit rates), on-demand model loading, Claude Code integration, and a web UI.

> [!WARNING]
> **Experimental Project** — This is a personal project that hasn't been extensively tested. Expect bugs, rough edges, and breaking changes. Use at your own risk. Contributions and bug reports are welcome!

> [!NOTE]
> **Why this project exists**
>
> MLX Studio started as a personal experiment to benchmark different AI coding assistants (Claude Code, Cursor, Qwen CLI, Crush) with various local models, and to push the limits of agentic coding on Apple Silicon through server-side optimizations.
>
> This project does **not** aim to replace mature tools like [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server), [llama.cpp](https://github.com/ggerganov/llama.cpp), or [vLLM](https://github.com/vllm-project/vllm). Instead, it's a playground for experimenting with caching strategies, model routing, and customizations that might better fit specific workflows.
>
> If you're looking for production-ready inference, use the upstream projects. If you want to tinker, benchmark, or adapt things to your own use case — this might be useful as a starting point.

## Key Features

- **Smart Prompt Caching**: 99%+ cache hit rates with automatic KV cache reuse
- **On-Demand Model Loading**: Load models when needed, keep only 1 in memory
- **Dual Backend**: MLX (fastest) and GGUF via llama.cpp
- **Claude Code Compatible**: Drop-in replacement for Anthropic API
- **OpenAI Compatible**: Works with any OpenAI client
- **Voice Mode**: Real-time voice conversations with STT/TTS
- **Web UI**: Model management, logs, and chat interface

## Quick Start

### Terminal (Recommended)

```bash
# Clone and install
git clone https://github.com/lucasventura/mlx-studio.git
cd mlx-studio
make install

# Start server (1 model in memory, loads on demand)
./venv-omni/bin/python server.py --port 8080 --model-cache-size 1

# Or use the helper script
./multi-llm.sh
```

### With Claude Code

```bash
# Start MLX Studio
./venv-omni/bin/python server.py --port 8080

# In another terminal, use Claude Code with local models
ANTHROPIC_BASE_URL=http://localhost:8080/anthropic ANTHROPIC_API_KEY=sk-local claude
```

### With Any OpenAI Client

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-30b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Web UI

Open http://localhost:8080 in your browser for:
- Chat interface
- Model browser and downloader
- Real-time server logs
- Settings management
- Voice mode

## Command Line Options

```bash
./venv-omni/bin/python server.py [OPTIONS]

Options:
  --port INT              Server port (default: 8080)
  --host STR              Server host (default: 0.0.0.0)
  --model-cache-size INT  Max models in memory (default: 1)
  --kv-bits INT           KV cache quantization (8 = faster, None = full precision)
```

## Environment Variables

```bash
# Prompt Cache
MLX_CACHE_BLOCK_SIZE=512     # Token block size for hashing
MLX_CACHE_MAX_SLOTS=8        # Concurrent cache slots
MLX_CACHE_MIN_REUSE=256      # Min tokens to reuse cache
MLX_CACHE_MAX_TOKENS=200000  # Max tokens per slot

# Model Cache
MLX_MODEL_CACHE_SIZE=1       # Models to keep loaded (1 = on-demand loading)
MLX_MODEL_CACHE_TTL=0        # Auto-unload after N seconds (0 = disabled)

# Generation
MLX_PREFILL_STEP_SIZE=8192   # Prefill batch size
MLX_KV_BITS=8                # KV cache quantization (faster large context)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MLX Studio                              │
├─────────────────────────────────────────────────────────────┤
│  Endpoints                                                   │
│  ├── /v1/chat/completions (OpenAI)                          │
│  ├── /anthropic/v1/messages (Anthropic)                     │
│  ├── /v1/audio/transcriptions (STT)                         │
│  └── /v1/audio/speech (TTS)                                 │
├─────────────────────────────────────────────────────────────┤
│  Features                                                    │
│  ├── Smart Prompt Cache (99%+ hit rate)                     │
│  ├── Model Aliases (qwen → full/model/path)                 │
│  ├── Claude Tier Routing (sonnet → local model)             │
│  └── On-Demand Model Loading                                │
├─────────────────────────────────────────────────────────────┤
│  Backends                                                    │
│  ├── MLX (fastest on Apple Silicon)                         │
│  └── GGUF via llama-server (llama.cpp)                      │
└─────────────────────────────────────────────────────────────┘
```

## Performance

### Benchmarks (M2 Ultra 64GB)

MLX is **14-32% faster** than GGUF on Apple Silicon:

| Model | MLX 4bit | GGUF Q4_K_M | Difference |
|-------|----------|-------------|------------|
| Qwen3-1.7B | 253 tok/s | 192 tok/s | +32% |
| Qwen3-4B | 145 tok/s | 116 tok/s | +25% |
| Qwen3-Coder-30B-A3B | 87 tok/s | 76 tok/s | +14% |

### Generation Speed vs Context Size

Generation speed decreases with larger context (this is expected due to attention):

| Context Size | Expected tok/s |
|--------------|----------------|
| 10K tokens | ~40-50 |
| 30K tokens | ~28-32 |
| 50K tokens | ~20-25 |
| 100K tokens | ~12-15 |

### Smart Cache Impact

With 99%+ cache hit rates, only new tokens need processing:

```
Request 1: 30K context → 2.5s prefill
Request 2: 30K context + 100 new tokens → 0.1s prefill (cached)
```

## Model Configuration

### Model Aliases (`model_aliases.json`)

```json
{
  "qwen3-coder-30b": "/path/to/Qwen3-Coder-30B-A3B-Instruct-MLX-6bit",
  "qwen2.5-coder-14b": "/path/to/Qwen2.5-Coder-14B-Instruct-MLX-4bit",
  "qwen3-4b": "/path/to/Qwen3-4b-Instruct-2507-MLX-8bit"
}
```

### Claude Routing (`claude_routing.json`)

Map Claude model tiers to local models:

```json
{
  "tiers": {
    "haiku": { "model": "qwen3-4b", "backend": "mlx" },
    "sonnet": { "model": "qwen3-coder-30b", "backend": "mlx" },
    "opus": { "model": "qwen3-coder-30b", "backend": "mlx" }
  }
}
```

## API Reference

### Load Model

```bash
POST /api/models/load?model_id=/path/to/model
```

### Unload Specific Model

```bash
POST /api/models/unload?model_id=/path/to/model
```

### Unload All Models

```bash
POST /api/models/unload
```

### Get Cache Stats

```bash
GET /api/cache/stats
```

### Model Cache Settings

```bash
# Get settings
GET /api/settings/model-cache

# Update settings
POST /api/settings/model-cache
Content-Type: application/json
{"max_size": 1}
```

## Limitations

### Model Size
- Models must fit in unified memory (RAM + VRAM shared on Apple Silicon)
- M2 Ultra 64GB: Up to ~40B parameters at 4-bit
- M2 Pro 32GB: Up to ~20B parameters at 4-bit

### Context Length
- Generation speed decreases linearly with context size
- Very long contexts (100K+) will be slow regardless of caching
- Prompt caching helps with prefill, not generation

### Tool Use with Small Models
- Models under 8B parameters struggle with complex tool use
- Recommended: 14B+ for reliable agentic coding tasks
- 4B models may hallucinate tool calls instead of executing them

### Thinking Mode
- `enable_thinking` is disabled by default for local models
- Qwen3's thinking mode adds 3-5K tokens of internal reasoning
- Enable via `extra_body: {"enable_thinking": true}` if needed

## Troubleshooting

### Model not loading
```bash
# Check if server is running
curl http://localhost:8080/health

# Load model manually
curl -X POST "http://localhost:8080/api/models/load?model_id=/path/to/model"
```

### Slow generation
1. Check context size - larger context = slower generation
2. Enable KV cache quantization: `--kv-bits 8`
3. Use a smaller model for simple tasks

### Out of memory
1. Set `--model-cache-size 1` to keep only 1 model loaded
2. Use smaller quantization (4-bit instead of 8-bit)
3. Reduce context length

### Claude Code not working
```bash
# Make sure to include /anthropic in the URL
ANTHROPIC_BASE_URL=http://localhost:8080/anthropic claude
```

## Requirements

- macOS with Apple Silicon (M1/M2/M3/M4/M5)
- Python 3.12+
- 16GB+ unified memory recommended
- 32GB+ for 30B+ parameter models

## Building from Source

```bash
git clone https://github.com/lucasventura/mlx-studio.git
cd mlx-studio
make install

# Optional: Build standalone package
make build-app
```

## Credits

- [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) - Core inference engine
- [MLX](https://github.com/ml-explore/mlx) - Apple's ML framework
- [mlx-lm](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm) - Language model utilities
- [llama.cpp](https://github.com/ggerganov/llama.cpp) - GGUF backend

## License

MIT
