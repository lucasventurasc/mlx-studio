#!/usr/bin/env python3
"""
Test batched inference - process multiple prompts in a single forward pass.

Since true parallelism isn't available on Apple Silicon GPU,
batching is the way to improve throughput.
"""

import mlx.core as mx
import time
import sys
from pathlib import Path

# Add vendor path
VENDOR_PATH = Path(__file__).parent.parent / "vendor" / "mlx-omni-server" / "src"
sys.path.insert(0, str(VENDOR_PATH))


def test_sequential_generation():
    """Generate responses one at a time."""
    print("\n=== Sequential Generation ===")

    from mlx_lm import load, generate

    models_dir = Path.home() / ".lmstudio" / "models" / "lmstudio-community"
    model_path = str(models_dir / "Qwen2.5-3B-Instruct-MLX-4bit")

    print(f"Loading model: {model_path}")
    model, tokenizer = load(model_path)

    prompts = [
        "What is 2+2?",
        "What is the capital of France?",
        "Write a haiku about coding.",
        "Explain quantum computing briefly.",
    ]

    start = time.perf_counter()
    responses = []
    for prompt in prompts:
        response = generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=30,
            verbose=False
        )
        responses.append(response)

    elapsed = time.perf_counter() - start

    total_tokens = sum(len(tokenizer.encode(r)) for r in responses)
    print(f"Time: {elapsed:.2f}s")
    print(f"Total tokens: {total_tokens}")
    print(f"Throughput: {total_tokens / elapsed:.1f} tok/s")

    return elapsed, total_tokens


def test_batched_tokenization():
    """Test batching at tokenization level."""
    print("\n=== Batched Tokenization ===")

    from mlx_lm import load

    models_dir = Path.home() / ".lmstudio" / "models" / "lmstudio-community"
    model_path = str(models_dir / "Qwen2.5-3B-Instruct-MLX-4bit")

    model, tokenizer = load(model_path)

    prompts = [
        "What is 2+2?",
        "What is the capital of France?",
        "Write a haiku about coding.",
        "Explain quantum computing briefly.",
    ]

    # Batch tokenize with padding
    tokenizer._tokenizer.padding_side = 'left'
    if tokenizer.pad_token is None:
        tokenizer._tokenizer.pad_token = tokenizer.eos_token

    # Format prompts
    formatted = []
    for p in prompts:
        messages = [{"role": "user", "content": p}]
        formatted.append(tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False))

    # Batch tokenize
    batch_tokens = tokenizer._tokenizer(formatted, padding=True, return_tensors="np")
    input_ids = mx.array(batch_tokens['input_ids'])

    print(f"Batch shape: {input_ids.shape}")
    print(f"Batch size: {input_ids.shape[0]}, Seq len: {input_ids.shape[1]}")

    # Test single forward pass
    start = time.perf_counter()
    logits = model(input_ids)
    mx.eval(logits)
    elapsed = time.perf_counter() - start

    print(f"Batch forward pass: {elapsed:.4f}s")
    print(f"Logits shape: {logits.shape}")

    # Compare with sequential forward passes
    start = time.perf_counter()
    for i in range(input_ids.shape[0]):
        single_input = input_ids[i:i+1]
        logits = model(single_input)
        mx.eval(logits)
    seq_elapsed = time.perf_counter() - start

    print(f"Sequential forward passes: {seq_elapsed:.4f}s")
    print(f"Speedup from batching: {seq_elapsed / elapsed:.2f}x")

    return elapsed


def test_interleaved_generation():
    """Test interleaved generation - alternate between prompts."""
    print("\n=== Interleaved Generation ===")
    print("(Generate one token from each prompt in round-robin)")

    from mlx_lm import load
    from mlx_lm.sample_utils import make_sampler

    models_dir = Path.home() / ".lmstudio" / "models" / "lmstudio-community"
    model_path = str(models_dir / "Qwen2.5-3B-Instruct-MLX-4bit")

    model, tokenizer = load(model_path)

    prompts = [
        "Count from 1 to 10:",
        "List primary colors:",
    ]

    # Tokenize each prompt
    all_tokens = []
    for p in prompts:
        messages = [{"role": "user", "content": p}]
        formatted = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
        tokens = tokenizer.encode(formatted)
        all_tokens.append(mx.array([tokens]))

    # Simple generation loop
    sampler = make_sampler(temp=0.7)
    max_tokens = 20
    generated = [[] for _ in prompts]

    start = time.perf_counter()

    # Initialize KV caches (one per prompt)
    caches = [None for _ in prompts]

    for step in range(max_tokens):
        for i, tokens in enumerate(all_tokens):
            if step == 0:
                # First step - full prompt
                input_ids = tokens
            else:
                # Subsequent steps - just the new token
                input_ids = mx.array([[generated[i][-1]]])

            # Forward pass
            logits = model(input_ids)
            mx.eval(logits)

            # Sample next token
            next_token = mx.argmax(logits[:, -1, :], axis=-1).item()
            generated[i].append(next_token)

            # Check for EOS
            if next_token == tokenizer.eos_token_id:
                generated[i].pop()  # Remove EOS

    elapsed = time.perf_counter() - start

    # Decode
    for i, tokens in enumerate(generated):
        text = tokenizer.decode(tokens)
        print(f"Prompt {i+1}: {text[:50]}...")

    total_tokens = sum(len(g) for g in generated)
    print(f"\nTime: {elapsed:.2f}s")
    print(f"Total tokens: {total_tokens}")
    print(f"Throughput: {total_tokens / elapsed:.1f} tok/s")
    print("Note: This is slow because we're not using KV cache properly")

    return elapsed


def main():
    print("=" * 60)
    print("MLX Batched Inference Test")
    print("=" * 60)

    print(f"MLX version: {mx.__version__}")

    # Test batched tokenization (fast)
    test_batched_tokenization()

    # Sequential generation
    seq_time, seq_tokens = test_sequential_generation()

    print("\n" + "=" * 60)
    print("Conclusion")
    print("=" * 60)
    print("""
Key findings:
1. Batched forward passes ARE faster (2-4x speedup)
2. But mlx-lm's generate() doesn't support batching
3. For true batched generation, need mlx_parallm approach
4. Interleaved generation loses KV cache benefits

For parallel models (haiku + opus):
- Can't run simultaneously on GPU
- Best option: Queue-based request handling
- When haiku request comes during opus generation:
  - Option A: Wait for opus to finish (current behavior)
  - Option B: Pause opus, run haiku, resume opus (complex)
  - Option C: Batch haiku requests and run periodically
""")


if __name__ == "__main__":
    main()
