# MLX vs GGUF Benchmark

**Date:** 2025-12-13
**Hardware:** M2 Ultra Mac Studio 64GB
**Prompt:** "Escreva um Palindromo em Kotlin"
**Max Tokens:** 512
**Runs:** 3 per model (averaged)

## Results

| Model | MLX 4bit | GGUF Q4_K_M | GGUF Q6_K | Winner |
|-------|----------|-------------|-----------|--------|
| Qwen3-1.7B | **252.7 tok/s** | 191.9 tok/s | - | MLX (+32%) |
| Qwen3-4B | **144.6 tok/s** | 116.0 tok/s | - | MLX (+25%) |
| Qwen3-Coder-30B-A3B | **86.8 tok/s** | 76.0 tok/s | 75.3 tok/s | MLX (+14%) |

## Raw Data

### Qwen3-1.7B

**MLX (mlx-community/Qwen3-1.7B-4bit):**
- Run 1: 252.8 tok/s
- Run 2: 252.7 tok/s
- Run 3: 252.7 tok/s
- **Average: 252.7 tok/s**

**GGUF Q4_K_M (bartowski/Qwen3-1.7B-GGUF):**
- Run 1: 189.6 tok/s
- Run 2: 191.8 tok/s
- Run 3: 194.5 tok/s
- **Average: 191.9 tok/s**

### Qwen3-4B

**MLX (mlx-community/Qwen3-4B-4bit):**
- Run 1: 144.7 tok/s
- Run 2: 144.6 tok/s
- Run 3: 144.5 tok/s
- **Average: 144.6 tok/s**

**GGUF Q4_K_M (bartowski/Qwen3-4B-Instruct-2507-GGUF):**
- Run 1: 115.1 tok/s
- Run 2: 116.5 tok/s
- Run 3: 116.4 tok/s
- **Average: 116.0 tok/s**

### Qwen3-Coder-30B-A3B (MoE)

**MLX (lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit):**
- Run 1: 87.1 tok/s
- Run 2: 87.3 tok/s
- Run 3: 85.9 tok/s
- **Average: 86.8 tok/s**

**GGUF Q4_K_M (lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-GGUF):**
- Run 1: 75.3 tok/s
- Run 2: 76.3 tok/s
- Run 3: 76.3 tok/s
- **Average: 76.0 tok/s**

**GGUF Q6_K (lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-GGUF):**
- Run 1: 74.4 tok/s
- Run 2: 75.8 tok/s
- Run 3: 75.6 tok/s
- **Average: 75.3 tok/s**

## Key Findings

1. **MLX is consistently faster** - 14-32% better performance across all tested models
2. **Smaller models show bigger MLX advantage** - The performance gap narrows as model size increases
3. **Q6_K offers no speed benefit over Q4_K_M** - Higher quantization quality doesn't improve speed
4. **MoE models perform well on both** - The 30B-A3B model only activates 3B parameters per token

## Methodology

- MLX backend: mlx-omni-server via MLX Studio
- GGUF backend: llama-server (llama.cpp) with flags: `--jinja -ngl 99 -fa auto -c 32768`
- Both backends use full GPU offloading
- Tests run sequentially with model loaded before benchmarking
