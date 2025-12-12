# MLX Studio v2.0

**High-performance MLX inference server with dual API compatibility for Apple Silicon**

<p align="center">
  <img src="https://img.shields.io/badge/Apple%20Silicon-M1%2FM2%2FM3%2FM4-000000?style=flat-square&logo=apple" alt="Apple Silicon">
  <img src="https://img.shields.io/badge/MLX-Powered-FF6B6B?style=flat-square" alt="MLX">
  <img src="https://img.shields.io/badge/OpenAI-Compatible-412991?style=flat-square&logo=openai" alt="OpenAI Compatible">
  <img src="https://img.shields.io/badge/Anthropic-Compatible-D97757?style=flat-square" alt="Anthropic Compatible">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

Built on top of [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) with custom extensions.

## Features

### From mlx-omni-server
- ✅ **OpenAI-compatible API** (`/v1/chat/completions`)
- ✅ **Anthropic-compatible API** (`/anthropic/v1/messages`)
- ✅ **Tool/Function calling** with model-specific parsers (Qwen, Llama, Mistral)
- ✅ **Thinking/Reasoning mode**
- ✅ **Streaming responses**

### MLX Studio Extensions
- ✅ **Multi-slot KV cache** with disk persistence
- ✅ **Inference profiles** (speed, balanced, quality, creative, precise)
- 🚧 Web GUI (coming soon)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/mlx-studio.git
cd mlx-studio

# Install dependencies (requires Python 3.12 and optionally Rust)
make install

# Run server
make server
```

Server will be available at:
- **Local**: http://localhost:1234
- **OpenAI API**: http://localhost:1234/v1/chat/completions
- **Anthropic API**: http://localhost:1234/anthropic/v1/messages

## Requirements

- macOS with Apple Silicon (M1/M2/M3/M4)
- Python 3.12 (recommended)
- Rust (optional, for some dependencies)
- ~16GB+ RAM recommended for larger models

## API Usage

### Chat Completions (OpenAI)

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen3-8B-4bit",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Messages (Anthropic)

```bash
curl http://localhost:1234/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen3-8B-4bit",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Inference Profiles

```bash
# Get available profiles
curl http://localhost:1234/api/profiles

# Set profile
curl -X POST http://localhost:1234/api/profiles/speed
```

Available profiles:
| Profile | Temperature | Max Tokens | Use Case |
|---------|-------------|------------|----------|
| `speed` | 0.7 | 2048 | Fast responses |
| `balanced` | 0.7 | 8192 | Default |
| `quality` | 0.5 | 8192 | Best output |
| `creative` | 1.0 | 4096 | Creative tasks |
| `precise` | 0.2 | 4096 | Factual responses |

### KV Cache

```bash
# Get cache statistics
curl http://localhost:1234/api/cache/stats

# Clear cache
curl -X POST http://localhost:1234/api/cache/clear

# List persisted cache entries
curl http://localhost:1234/api/cache/persisted
```

## Project Structure

```
mlx-studio/
├── server.py           # Main entry point
├── patches.py          # Compatibility patches for mlx-omni-server
├── extensions/         # MLX Studio custom features
│   ├── kv_cache.py    # Multi-slot KV cache with persistence
│   └── profiles.py    # Inference profiles
├── vendor/
│   └── mlx-omni-server/  # Upstream (git clone, easy to update)
├── frontend/           # Web GUI
├── scripts/
│   └── update-vendor.sh  # Update mlx-omni-server
└── Makefile
```

## Updating mlx-omni-server

To get the latest version:

```bash
make update-vendor
```

Or manually:
```bash
cd vendor/mlx-omni-server
git fetch origin
git reset --hard origin/main
```

## Using with LLM Clients

### Qwen-Code CLI

Configure to use MLX Studio as backend:
```bash
# In ~/.qwen/settings.json or similar
{
  "base_url": "http://localhost:1234/v1"
}
```

### Continue.dev

Add to `~/.continue/config.json`:
```json
{
  "models": [{
    "title": "MLX Studio",
    "provider": "openai",
    "model": "mlx-community/Qwen3-8B-4bit",
    "apiBase": "http://localhost:1234/v1",
    "apiKey": "not-needed"
  }]
}
```

### Claude Code (via Anthropic API)

Configure to use MLX Studio:
```bash
export ANTHROPIC_BASE_URL=http://localhost:1234/anthropic
```

## KV Cache System

MLX Studio implements a multi-slot KV cache system:

1. **Multi-slot caching** - Up to 8 concurrent conversations (configurable)
2. **Disk persistence** - Resume sessions across server restarts
3. **LRU eviction** - Automatically removes least-recently-used entries
4. **Statistics tracking** - Monitor hit rate and memory usage

## Support the Project

If you find MLX Studio useful, consider supporting its development!

<a href="https://buymeacoffee.com/lucasventurasc" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
</a>

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) - Core inference server
- [MLX](https://github.com/ml-explore/mlx) - Apple's machine learning framework
- [mlx-lm](https://github.com/ml-explore/mlx-lm) - MLX language model utilities

---

<p align="center">
  Made with MLX for Apple Silicon
</p>
