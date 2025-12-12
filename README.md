# MLX Studio

**Local LLM server for Apple Silicon with Claude Code integration**

Built on [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server).

## Quick Start

```bash
# Install
git clone https://github.com/lucasventura/mlx-studio.git
cd mlx-studio && make install

# Run
make server
```

Open http://localhost:1234 for the web UI.

## What MLX Studio Adds

| Feature | mlx-omni-server | MLX Studio |
|---------|-----------------|------------|
| OpenAI API | ✅ | ✅ |
| Anthropic API | ✅ | ✅ |
| Tool Calling | ✅ | ✅ |
| Streaming | ✅ | ✅ |
| **Smart Prompt Cache** | ❌ | ✅ |
| **Claude Model Routing** | ❌ | ✅ |
| **Model Aliases** | ❌ | ✅ |
| **Remote Instances** | ❌ | ✅ |
| **Web UI** | ❌ | ✅ |
| **Real-time Logs** | ❌ | ✅ |

### Smart Prompt Cache

Caches conversation prefixes to skip redundant processing. When your conversation shares the same system prompt and early messages, only new content is processed.

```
First request:  [system + history + new message] → full processing
Second request: [system + history] cached → only new message processed
```

### Claude Model Routing

Maps Claude model tiers to local models. Claude Code requests `claude-sonnet-4-20250514`, MLX Studio routes it to your local Qwen model.

```json
{
  "haiku": { "model": "mlx-community/Qwen3-4B-4bit" },
  "sonnet": { "model": "mlx-community/Qwen3-8B-4bit" },
  "opus": { "model": "mlx-community/Qwen3-30B-A3B-4bit" }
}
```

### Model Aliases

Create short names for models:

```
qwen → mlx-community/Qwen3-8B-4bit
codestral → mlx-community/Codestral-22B-v0.1-4bit
```

### Remote Instances

Route requests to other MLX Studio instances on your network. Run a bigger model on your Mac Studio, use it from your MacBook.

## Using with Claude Code

```bash
export ANTHROPIC_BASE_URL=http://localhost:1234/anthropic
claude
```

Claude Code will use your local models instead of the API.

## API Endpoints

**Chat (OpenAI)**
```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen", "messages": [{"role": "user", "content": "Hello"}]}'
```

**Messages (Anthropic)**
```bash
curl http://localhost:1234/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-20250514", "max_tokens": 1024, "messages": [{"role": "user", "content": "Hello"}]}'
```

## Requirements

- macOS with Apple Silicon (M1/M2/M3/M4)
- Python 3.12
- 16GB+ RAM recommended

## Building Standalone Package

To create a standalone package for distribution:

```bash
make build-app
```

This creates a ZIP file in the `build/` directory that includes all dependencies.

Users can then:
1. Download the ZIP file from GitHub Releases
2. Unzip it
3. Run: `./run.sh`

The server will be available at `http://localhost:1234`

## Credits

- [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) - Core inference engine
- [MLX](https://github.com/ml-explore/mlx) - Apple's ML framework
- [mlx-lm](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm) - Language model utilities

## Support

<a href="https://buymeacoffee.com/lucasventura" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
</a>

## License

MIT
