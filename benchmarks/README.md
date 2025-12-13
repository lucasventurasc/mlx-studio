# Benchmarks

Performance benchmarks for MLX Studio on Apple Silicon.

## Hardware

All benchmarks run on:
- **Mac Studio M2 Ultra** (24-core CPU, 76-core GPU, 64GB unified memory)
- **Memory Bandwidth:** 800 GB/s theoretical

## Available Benchmarks

| Benchmark | Description |
|-----------|-------------|
| [mlx-vs-gguf.md](./mlx-vs-gguf.md) | Comparison of MLX and GGUF backends |
| [speculative-decoding.md](./speculative-decoding.md) | Testing speculative decoding performance |
| [model-speeds.md](./model-speeds.md) | Reference speeds for various models |

## Quick Summary

### MLX vs GGUF

**MLX is 14-32% faster** than GGUF on Apple Silicon:

| Model | MLX | GGUF | Difference |
|-------|-----|------|------------|
| Qwen3-1.7B | 253 tok/s | 192 tok/s | +32% |
| Qwen3-4B | 145 tok/s | 116 tok/s | +25% |
| Qwen3-Coder-30B | 87 tok/s | 76 tok/s | +14% |

### Fastest Models

| Model | tok/s | Notes |
|-------|-------|-------|
| Llama-3.2-3B | 263 | Fastest overall |
| Qwen3-1.7B | 253 | Best small model |
| Qwen3-4B | 145 | Good balance |
| Qwen3-Coder-30B | 87 | Best for code |

## Contributing

To add a benchmark:

1. Create a new `.md` file in this folder
2. Include: date, hardware, methodology, raw data
3. Update this README with a summary
4. Submit a PR

## Methodology

- All tests use non-streaming mode for accurate tok/s measurement
- 3 runs per configuration, averaged
- Models loaded fresh before each test suite
- Standard prompt: "Escreva um Palindromo em Kotlin" (code generation task)
