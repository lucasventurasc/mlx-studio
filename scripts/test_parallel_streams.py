#!/usr/bin/env python3
"""
Test MLX Streams for parallel model execution.

This script tests whether we can run two models on separate MLX streams
to achieve true parallelism on Apple Silicon.
"""

import mlx.core as mx
import mlx.nn as nn
import time
import threading
from pathlib import Path
import sys

# Add vendor path
VENDOR_PATH = Path(__file__).parent.parent / "vendor" / "mlx-omni-server" / "src"
sys.path.insert(0, str(VENDOR_PATH))


def test_basic_streams():
    """Test basic MLX stream functionality."""
    print("\n=== Test 1: Basic Stream Operations ===")

    # Create two streams using new_stream()
    stream1 = mx.new_stream(mx.gpu)
    stream2 = mx.new_stream(mx.gpu)

    print(f"Stream 1: {stream1}")
    print(f"Stream 2: {stream2}")
    print(f"Default stream: {mx.default_stream(mx.gpu)}")

    # Test simple operations on different streams
    a = mx.ones((1000, 1000))
    b = mx.ones((1000, 1000))

    # Run on stream1
    with mx.stream(stream1):
        c = mx.matmul(a, b)
        mx.async_eval(c)

    # Run on stream2 (potentially in parallel)
    with mx.stream(stream2):
        d = mx.matmul(a, b)
        mx.async_eval(d)

    # Wait for both
    mx.eval(c)
    mx.eval(d)

    print("✓ Basic stream operations work")
    return True


def test_concurrent_matmul():
    """Test if two large matmuls can run concurrently."""
    print("\n=== Test 2: Concurrent Matrix Multiplications ===")

    size = 4096  # Large matrices
    iterations = 5

    a1 = mx.random.normal((size, size))
    b1 = mx.random.normal((size, size))
    a2 = mx.random.normal((size, size))
    b2 = mx.random.normal((size, size))

    # Warmup
    mx.eval(mx.matmul(a1, b1))
    mx.eval(mx.matmul(a2, b2))

    # Sequential execution
    start = time.perf_counter()
    for _ in range(iterations):
        c1 = mx.matmul(a1, b1)
        mx.eval(c1)
        c2 = mx.matmul(a2, b2)
        mx.eval(c2)
    sequential_time = time.perf_counter() - start
    print(f"Sequential: {sequential_time:.3f}s")

    # Parallel with streams
    stream1 = mx.new_stream(mx.gpu)
    stream2 = mx.new_stream(mx.gpu)

    start = time.perf_counter()
    for _ in range(iterations):
        with mx.stream(stream1):
            c1 = mx.matmul(a1, b1)
            mx.async_eval(c1)

        with mx.stream(stream2):
            c2 = mx.matmul(a2, b2)
            mx.async_eval(c2)

        # Synchronize both
        mx.eval(c1)
        mx.eval(c2)
    parallel_time = time.perf_counter() - start
    print(f"Parallel streams: {parallel_time:.3f}s")

    speedup = sequential_time / parallel_time
    print(f"Speedup: {speedup:.2f}x")

    if speedup > 1.2:
        print("✓ Significant parallelism detected!")
        return True
    else:
        print("⚠ No significant parallelism (streams may be serialized)")
        return False


def test_async_eval_pipeline():
    """Test async evaluation for pipelining."""
    print("\n=== Test 3: Async Evaluation Pipeline ===")

    size = 2048
    iterations = 10

    a = mx.random.normal((size, size))
    b = mx.random.normal((size, size))

    # Warmup
    mx.eval(mx.matmul(a, b))

    # Without async (blocking)
    start = time.perf_counter()
    for _ in range(iterations):
        c = mx.matmul(a, b)
        mx.eval(c)  # Block and wait
    blocking_time = time.perf_counter() - start
    print(f"Blocking eval: {blocking_time:.3f}s")

    # With async (pipelined)
    start = time.perf_counter()
    results = []
    for i in range(iterations):
        c = mx.matmul(a, b)
        mx.async_eval(c)  # Start evaluation
        results.append(c)
    # Wait for all
    for r in results:
        mx.eval(r)
    async_time = time.perf_counter() - start
    print(f"Async eval: {async_time:.3f}s")

    speedup = blocking_time / async_time
    print(f"Speedup: {speedup:.2f}x")

    return True


def test_model_loading_parallel():
    """Test if we can load two models and run them."""
    print("\n=== Test 4: Model Loading Check ===")

    try:
        from mlx_lm import load

        # Check available models
        models_dir = Path.home() / ".lmstudio" / "models" / "lmstudio-community"
        if not models_dir.exists():
            print("⚠ No models directory found")
            return False

        available = list(models_dir.iterdir())[:5]
        print(f"Available models: {[m.name for m in available]}")

        # We won't actually load models here - too slow for a test
        print("✓ Model loading infrastructure available")
        return True

    except ImportError as e:
        print(f"⚠ mlx_lm not available: {e}")
        return False


def test_threading_with_streams():
    """Test if Python threads + MLX streams work together."""
    print("\n=== Test 5: Threading + Streams ===")

    size = 2048
    results = {}
    errors = []

    def worker(name, stream, matrix_a, matrix_b):
        try:
            with mx.stream(stream):
                for i in range(5):
                    c = mx.matmul(matrix_a, matrix_b)
                    mx.eval(c)
                results[name] = c.shape
        except Exception as e:
            errors.append((name, str(e)))

    stream1 = mx.new_stream(mx.gpu)
    stream2 = mx.new_stream(mx.gpu)

    a1 = mx.random.normal((size, size))
    b1 = mx.random.normal((size, size))
    a2 = mx.random.normal((size, size))
    b2 = mx.random.normal((size, size))

    # Warmup
    mx.eval(a1)
    mx.eval(b1)
    mx.eval(a2)
    mx.eval(b2)

    t1 = threading.Thread(target=worker, args=("thread1", stream1, a1, b1))
    t2 = threading.Thread(target=worker, args=("thread2", stream2, a2, b2))

    start = time.perf_counter()
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    elapsed = time.perf_counter() - start

    if errors:
        print(f"✗ Errors occurred: {errors}")
        return False

    print(f"Both threads completed in {elapsed:.3f}s")
    print(f"Results: {results}")
    print("✓ Threading with streams works")
    return True


def main():
    print("=" * 60)
    print("MLX Parallel Streams Test")
    print("=" * 60)
    print(f"MLX version: {mx.__version__}")
    print(f"Default device: {mx.default_device()}")

    results = []

    results.append(("Basic Streams", test_basic_streams()))
    results.append(("Concurrent Matmul", test_concurrent_matmul()))
    results.append(("Async Pipeline", test_async_eval_pipeline()))
    results.append(("Model Loading", test_model_loading_parallel()))
    results.append(("Threading + Streams", test_threading_with_streams()))

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")

    all_passed = all(r[1] for r in results)
    print("\n" + ("All tests passed!" if all_passed else "Some tests failed."))

    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
