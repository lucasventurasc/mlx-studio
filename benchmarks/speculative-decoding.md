# Speculative Decoding Benchmark

**Date:** 2025-12-13
**Hardware:** M2 Ultra Mac Studio 64GB
**Prompt:** "Escreva um Palindromo em Kotlin"
**Max Tokens:** 512
**Draft Model:** Qwen3-0.6B

## Results

### MLX Backend

| Model | Without Draft | With Draft | Difference |
|-------|--------------|------------|------------|
| Qwen3-4B | 144.3 tok/s | 144.1 tok/s | -0.1% |
| Qwen3-Coder-30B-A3B | 86.8 tok/s | 87.5 tok/s | +0.8% |

### GGUF Backend (llama-server)

| Model | Without Draft | With Draft (n=8) | With Draft (n=4) |
|-------|--------------|------------------|------------------|
| Qwen3-Coder-30B-A3B | **75.5 tok/s** | 59.0 tok/s (-22%) | 63.2 tok/s (-16%) |

## Conclusion

**Speculative decoding does NOT improve performance** on M2 Ultra for these models.

### Why It Doesn't Help on M2 Ultra

1. **High Memory Bandwidth** - M2 Ultra has 800 GB/s bandwidth, so models are often compute-bound rather than memory-bound
2. **MoE Architecture** - Qwen3-Coder-30B-A3B only activates 3B parameters per token, already very efficient
3. **Verification Overhead** - The cost of running the large model to verify draft tokens exceeds any savings
4. **Model Already Fast** - At 87-144 tok/s, there's not much room for improvement

### When Speculative Decoding Might Help

Speculative decoding typically helps when:
- The main model is **slow** (<30 tok/s, memory-bound)
- Running on hardware with **lower bandwidth** (e.g., M1, older Macs)
- Using **large dense models** (70B+) that are memory-bound
- The draft model has >70% acceptance rate
- The task is highly predictable (code completion, structured output)

## Raw Data

### MLX Backend

**Qwen3-4B (no draft):**
- Run 1: 144.3 tok/s
- Run 2: 144.4 tok/s
- Run 3: 144.3 tok/s
- **Average: 144.3 tok/s**

**Qwen3-4B (with draft Qwen3-0.6B):**
- Run 1: 144.1 tok/s
- Run 2: 144.2 tok/s
- Run 3: 144.1 tok/s
- **Average: 144.1 tok/s**

**Qwen3-Coder-30B-A3B (no draft):**
- Run 1: 87.1 tok/s
- Run 2: 87.3 tok/s
- Run 3: 85.9 tok/s
- **Average: 86.8 tok/s**

**Qwen3-Coder-30B-A3B (with draft Qwen3-0.6B):**
- Run 1: 87.5 tok/s
- Run 2: 87.4 tok/s
- Run 3: 87.6 tok/s
- **Average: 87.5 tok/s**

### GGUF Backend (llama-server)

**Qwen3-Coder-30B-A3B (no draft):**
```
llama-server --jinja -ngl 99 -fa auto -c 32768 \
  -m Qwen3-Coder-30B-A3B-Instruct-Q6_K.gguf
```
- Run 1: 75.5 tok/s

**Qwen3-Coder-30B-A3B (draft_n=8):**
```
llama-server --jinja -ngl 99 -fa auto -c 32768 \
  -m Qwen3-Coder-30B-A3B-Instruct-Q6_K.gguf \
  -md Qwen3-0.6B-Q8_0.gguf \
  --draft-max 8 --draft-p-min 0.8
```
- Run 1: 59.0 tok/s

**Qwen3-Coder-30B-A3B (draft_n=4):**
```
llama-server --jinja -ngl 99 -fa auto -c 32768 \
  -m Qwen3-Coder-30B-A3B-Instruct-Q6_K.gguf \
  -md Qwen3-0.6B-Q8_0.gguf \
  --draft-max 4 --draft-p-min 0.8
```
- Run 1: 63.2 tok/s

## Methodology

- **MLX Backend:** mlx-omni-server via MLX Studio, draft_model parameter
- **GGUF Backend:** llama-server with `--draft-max N --draft-p-min 0.8`
- **Draft Model:** Qwen3-0.6B (same Qwen3 family for best acceptance rate)
- **Main Models:** Qwen3-4B (dense, 4B params) and Qwen3-Coder-30B-A3B (MoE, 3B active)
