# Model Speed Reference

**Date:** 2025-12-13
**Hardware:** M2 Ultra Mac Studio 64GB
**Backend:** MLX (mlx-omni-server)

## Speed Tiers

| Tier | Speed | Use Case |
|------|-------|----------|
| Ultra Fast | >200 tok/s | Real-time chat, autocomplete |
| Fast | 100-200 tok/s | Interactive coding, Q&A |
| Standard | 50-100 tok/s | Complex reasoning, long-form |
| Slow | <50 tok/s | Large models, high quality |

## Tested Models (MLX 4-bit)

| Model | Size | tok/s | Tier | Tool Calling |
|-------|------|-------|------|--------------|
| Llama-3.2-3B-Instruct | 1.8GB | 263 | Ultra Fast | Yes |
| Qwen3-1.7B | 1.0GB | 253 | Ultra Fast | Yes |
| Qwen3-4B | 2.2GB | 145 | Fast | Yes |
| Qwen3-Coder-30B-A3B (MoE) | 9GB | 87 | Standard | Yes |

## Notes

### MoE Models
Mixture of Experts models like Qwen3-Coder-30B-A3B only activate a fraction of parameters per token (3B of 30B), making them much faster than their total parameter count suggests.

### Tool Calling Support
All Qwen3 models support tool calling via the Qwen3 chat template. Llama-3.2 also supports tools via its native format.

### Memory Requirements
- 4-bit quantization: ~0.5GB per billion parameters
- 8-bit quantization: ~1GB per billion parameters
- MoE models: Only active parameters affect memory bandwidth

## Recommendations

| Task | Recommended Model | Reason |
|------|------------------|--------|
| Quick chat | Qwen3-1.7B | 253 tok/s, good quality |
| Code assistance | Qwen3-Coder-30B-A3B | Best code quality at 87 tok/s |
| Tool use agents | Qwen3-4B | Good balance of speed (145 tok/s) and capability |
| Real-time voice | Llama-3.2-3B | Fastest at 263 tok/s |
