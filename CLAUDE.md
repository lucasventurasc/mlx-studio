# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MLX Studio is a local LLM server for Apple Silicon that wraps [mlx-omni-server](https://github.com/madroidmaq/mlx-omni-server) with additional features: smart prompt caching, Claude model routing, model aliases, remote instance support, GGUF backend via llama.cpp, and a web UI with voice mode.

## Commands

```bash
# Install dependencies (creates venv-omni)
make install

# Run server (MLX Studio on port 1234 + LiteLLM on port 4000)
make server

# Run MLX Studio only (no LiteLLM)
make backend

# Stop all services
make stop

# Build macOS standalone package
make build-app

# Update vendor/mlx-omni-server from upstream
make update-vendor
```

## Architecture

### Core Files
- `server.py` - Main FastAPI server combining mlx-omni-server routers with custom endpoints
- `patches.py` - Monkey patches for mlx-lm compatibility, model alias resolution, and Claude routing
- `extensions/` - Custom modules: KV cache, inference profiles, model manager, global settings, GGUF backend

### Key Architectural Patterns

**Model Resolution Chain** (`patches.py:resolve_alias_with_backend`):
1. Direct alias match from `model_aliases.json`
2. Wildcard pattern matching (e.g., `claude-*`)
3. Claude tier routing from `claude_routing.json` (haiku/sonnet/opus)
4. Default model fallback
5. Returns `(model_id, backend)` where backend is `"mlx"` or `"gguf"`

**Backend Dispatch**:
- MLX backend: Uses mlx-omni-server's ChatGenerator for MLX models
- GGUF backend: Proxies to llama-server (llama.cpp) for GGUF models
- Auto-detection: `.gguf` extension or `"backend": "gguf"` in tier config

**Server Composition**:
- Mounts mlx-omni-server's OpenAI router at `/v1/`
- Mounts mlx-omni-server's Anthropic router at `/anthropic/`
- Mounts STT/TTS routers for voice mode
- Adds custom `/api/` endpoints for cache, routing, aliases, models

**Thread Safety**: `_mlx_lock` (threading.Lock) in server.py guards MLX GPU operations to prevent Metal command buffer conflicts during concurrent requests.

### Configuration Files
- `model_aliases.json` - Short names to full model paths
- `claude_routing.json` - Maps Claude tiers to local models (with optional `"backend": "gguf"`)
- `gguf_config.json` - GGUF backend settings (port, auto_start, default_args)
- `remotes.json` - Remote MLX Studio instances
- `inference_settings.json` - Global temperature, top_p, etc.

### Frontend
Vanilla JS SPA in `frontend/` with React-like component pattern. Key components:
- `VoiceMode.js` - Real-time voice conversations
- `SettingsPanel.js` - Model routing, aliases, cache config
- `ModelBrowser.js` - HuggingFace model search and download

### Vendor
`vendor/mlx-omni-server/` is a git submodule. The `src/` directory is added to Python path at runtime.

## API Endpoints

Primary endpoints for Claude Code integration:
- `POST /anthropic/v1/messages` - Anthropic Messages API (used when ANTHROPIC_BASE_URL points here)
- `POST /v1/chat/completions` - OpenAI Chat API

## GGUF Backend

For large models that don't fit in MLX, use GGUF via llama.cpp:

```bash
# Install llama.cpp
brew install llama.cpp

# Configure tier to use GGUF (in claude_routing.json)
{
  "tiers": {
    "opus": {
      "model": "~/.cache/huggingface/gguf/Qwen2.5-72B-Q4_K_M.gguf",
      "backend": "gguf"
    }
  }
}
```

The GGUF backend auto-starts llama-server when a request arrives for a GGUF model.

## Benchmarks (M2 Ultra Mac Studio 64GB)

All tok/s values are reported by the server, not calculated by the client.

### MLX Backend
| Model | Quantization | Size | tok/s |
|-------|-------------|------|-------|
| Llama-3.2-3B-Instruct | 4-bit | 1.8GB | 263 |
| Qwen3-4B | 4-bit | 2.2GB | 151 |
| Qwen3-Coder-30B-A3B (MoE) | 4-bit | 9GB | 87 |

### GGUF Backend (llama-server)
| Model | Quantization | Size | tok/s |
|-------|-------------|------|-------|
| Qwen3-4B-Instruct-2507 | Q4_K_M | 2.3GB | 94 |
| gpt-oss-20b | Q4_K_M | 11.6GB | 115 |

### Speculative Decoding
MLX supports speculative decoding via `draft_model` in `claude_routing.json`:
```json
{
  "tiers": {
    "sonnet": {
      "model": "lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "draft_model": "mlx-community/Qwen3-0.6B-4bit",
      "backend": "mlx"
    }
  }
}
```

## Environment Variables

Cache tuning (set before server start):
- `MLX_CACHE_BLOCK_SIZE` - Token block size for hashing (default: 256)
- `MLX_CACHE_MAX_SLOTS` - Maximum cache slots (default: 4)
- `MLX_CACHE_MIN_REUSE` - Minimum tokens to reuse cache (default: 512)
- `MLX_CACHE_MAX_TOKENS` - Maximum tokens per slot (default: 65536)
