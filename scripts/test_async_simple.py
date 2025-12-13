#!/usr/bin/env python3
"""
Simple test of MLX async evaluation - no multiple streams.
"""

import mlx.core as mx
import time


def test_sequential():
    """Sequential evaluation."""
    print("\n=== Sequential Evaluation ===")

    size = 4096
    iterations = 10

    a = mx.random.normal((size, size))
    b = mx.random.normal((size, size))
    mx.eval(a)
    mx.eval(b)

    start = time.perf_counter()
    for _ in range(iterations):
        c = mx.matmul(a, b)
        mx.eval(c)  # Block
    elapsed = time.perf_counter() - start
    print(f"Time: {elapsed:.3f}s ({iterations / elapsed:.1f} iter/s)")
    return elapsed


def test_async_pipeline():
    """Async pipelining - compute next while current evaluates."""
    print("\n=== Async Pipelining ===")

    size = 4096
    iterations = 10

    a = mx.random.normal((size, size))
    b = mx.random.normal((size, size))
    mx.eval(a)
    mx.eval(b)

    start = time.perf_counter()

    # Start first computation
    prev = mx.matmul(a, b)
    mx.async_eval(prev)

    for _ in range(iterations - 1):
        # Start next computation
        curr = mx.matmul(a, b)
        mx.async_eval(curr)

        # Wait for previous
        mx.eval(prev)
        prev = curr

    # Wait for last
    mx.eval(prev)

    elapsed = time.perf_counter() - start
    print(f"Time: {elapsed:.3f}s ({iterations / elapsed:.1f} iter/s)")
    return elapsed


def test_single_stream_multiple_ops():
    """Test multiple operations on single stream with async."""
    print("\n=== Single Stream Multiple Ops ===")

    size = 4096
    iterations = 5

    a1 = mx.random.normal((size, size))
    b1 = mx.random.normal((size, size))
    a2 = mx.random.normal((size, size))
    b2 = mx.random.normal((size, size))
    mx.eval(a1, b1, a2, b2)

    start = time.perf_counter()
    for _ in range(iterations):
        # Queue both operations
        c1 = mx.matmul(a1, b1)
        c2 = mx.matmul(a2, b2)
        mx.async_eval(c1, c2)

        # Wait for both
        mx.eval(c1, c2)

    elapsed = time.perf_counter() - start
    print(f"Time: {elapsed:.3f}s")
    return elapsed


def test_dependency_chain():
    """Test chained operations."""
    print("\n=== Dependency Chain ===")

    size = 2048
    iterations = 10

    a = mx.random.normal((size, size))
    mx.eval(a)

    start = time.perf_counter()
    result = a
    for _ in range(iterations):
        result = mx.matmul(result, a)
        # Don't eval each time - let MLX batch

    mx.eval(result)  # Eval at the end
    elapsed = time.perf_counter() - start
    print(f"Time: {elapsed:.3f}s (lazy evaluation)")

    # Compare with eager
    start = time.perf_counter()
    result = a
    for _ in range(iterations):
        result = mx.matmul(result, a)
        mx.eval(result)  # Eval each iteration

    elapsed_eager = time.perf_counter() - start
    print(f"Time: {elapsed_eager:.3f}s (eager evaluation)")

    print(f"Lazy is {elapsed_eager / elapsed:.2f}x faster")
    return elapsed


def main():
    print("=" * 60)
    print("MLX Async Evaluation Test (Single Stream)")
    print("=" * 60)
    print(f"MLX version: {mx.__version__}")
    print(f"Device: {mx.default_device()}")

    seq_time = test_sequential()
    async_time = test_async_pipeline()
    test_single_stream_multiple_ops()
    test_dependency_chain()

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Sequential: {seq_time:.3f}s")
    print(f"Async pipeline: {async_time:.3f}s")
    print(f"Speedup: {seq_time / async_time:.2f}x")


if __name__ == "__main__":
    main()
