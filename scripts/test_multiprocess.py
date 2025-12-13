#!/usr/bin/env python3
"""
Test multiprocessing for parallel model execution.

Since MLX streams on the same process crash with Metal command buffer
conflicts, let's test if separate processes can share the GPU.
"""

import multiprocessing as mp
import time
import sys
from pathlib import Path

# Must be at top level for multiprocessing to work
def matrix_worker(worker_id, size, iterations, result_queue):
    """Worker that runs matrix multiplications."""
    import mlx.core as mx

    try:
        # Each process creates its own arrays
        a = mx.random.normal((size, size))
        b = mx.random.normal((size, size))
        mx.eval(a)
        mx.eval(b)

        start = time.perf_counter()
        for i in range(iterations):
            c = mx.matmul(a, b)
            mx.eval(c)

        elapsed = time.perf_counter() - start
        result_queue.put({
            'worker_id': worker_id,
            'elapsed': elapsed,
            'iterations': iterations,
            'status': 'success'
        })
    except Exception as e:
        result_queue.put({
            'worker_id': worker_id,
            'error': str(e),
            'status': 'error'
        })


def model_worker(worker_id, model_path, prompt, result_queue):
    """Worker that runs model inference."""
    try:
        # Add vendor path
        VENDOR_PATH = Path(__file__).parent.parent / "vendor" / "mlx-omni-server" / "src"
        sys.path.insert(0, str(VENDOR_PATH))

        from mlx_lm import load, generate

        start = time.perf_counter()
        model, tokenizer = load(model_path)
        load_time = time.perf_counter() - start

        start = time.perf_counter()
        response = generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=50,
            verbose=False
        )
        gen_time = time.perf_counter() - start

        result_queue.put({
            'worker_id': worker_id,
            'load_time': load_time,
            'gen_time': gen_time,
            'response_len': len(response),
            'status': 'success'
        })
    except Exception as e:
        result_queue.put({
            'worker_id': worker_id,
            'error': str(e),
            'status': 'error'
        })


def test_sequential_matmul():
    """Run matmul sequentially."""
    import mlx.core as mx

    print("\n=== Sequential Matrix Multiply ===")
    size = 4096
    iterations = 10

    a = mx.random.normal((size, size))
    b = mx.random.normal((size, size))
    mx.eval(a, b)

    start = time.perf_counter()
    for _ in range(iterations * 2):  # Double iterations for fair comparison
        c = mx.matmul(a, b)
        mx.eval(c)
    elapsed = time.perf_counter() - start

    print(f"Total time: {elapsed:.3f}s for {iterations * 2} iterations")
    return elapsed


def test_parallel_matmul():
    """Run matmul in parallel processes."""
    print("\n=== Parallel Matrix Multiply (2 processes) ===")

    size = 4096
    iterations = 10

    result_queue = mp.Queue()

    # Create two workers
    p1 = mp.Process(target=matrix_worker, args=(1, size, iterations, result_queue))
    p2 = mp.Process(target=matrix_worker, args=(2, size, iterations, result_queue))

    start = time.perf_counter()
    p1.start()
    p2.start()
    p1.join()
    p2.join()
    total_elapsed = time.perf_counter() - start

    # Collect results
    results = []
    while not result_queue.empty():
        results.append(result_queue.get())

    for r in results:
        if r['status'] == 'success':
            print(f"Worker {r['worker_id']}: {r['elapsed']:.3f}s for {r['iterations']} iterations")
        else:
            print(f"Worker {r['worker_id']}: ERROR - {r['error']}")

    print(f"Total wall time: {total_elapsed:.3f}s")
    return total_elapsed, results


def test_parallel_models():
    """Test running two different models in parallel."""
    print("\n=== Parallel Model Inference (2 processes) ===")

    models_dir = Path.home() / ".lmstudio" / "models" / "lmstudio-community"
    available = sorted([d.name for d in models_dir.iterdir() if d.is_dir() and 'MLX' in d.name])

    if len(available) < 2:
        print("Need at least 2 models for this test")
        return None, []

    # Pick a small and a larger model
    small_models = [m for m in available if '3B' in m or '1.5B' in m or '4bit' in m]
    if len(small_models) < 2:
        small_models = available[:2]

    model1 = str(models_dir / small_models[0])
    model2 = str(models_dir / small_models[1]) if len(small_models) > 1 else model1

    print(f"Model 1: {small_models[0]}")
    print(f"Model 2: {small_models[1] if len(small_models) > 1 else small_models[0]}")

    result_queue = mp.Queue()
    prompt = "Hello, how are you?"

    p1 = mp.Process(target=model_worker, args=(1, model1, prompt, result_queue))
    p2 = mp.Process(target=model_worker, args=(2, model2, prompt, result_queue))

    start = time.perf_counter()
    p1.start()
    p2.start()
    p1.join(timeout=120)  # 2 minute timeout
    p2.join(timeout=120)
    total_elapsed = time.perf_counter() - start

    # Kill if still running
    if p1.is_alive():
        p1.terminate()
    if p2.is_alive():
        p2.terminate()

    results = []
    while not result_queue.empty():
        results.append(result_queue.get())

    for r in results:
        if r['status'] == 'success':
            print(f"Worker {r['worker_id']}: load={r['load_time']:.2f}s, gen={r['gen_time']:.2f}s")
        else:
            print(f"Worker {r['worker_id']}: ERROR - {r['error']}")

    print(f"Total wall time: {total_elapsed:.3f}s")
    return total_elapsed, results


def main():
    # Required for macOS multiprocessing
    mp.set_start_method('spawn', force=True)

    print("=" * 60)
    print("MLX Multiprocessing Parallel Test")
    print("=" * 60)

    import mlx.core as mx
    print(f"MLX version: {mx.__version__}")
    print(f"Device: {mx.default_device()}")

    # Test 1: Sequential matmul
    seq_time = test_sequential_matmul()

    # Test 2: Parallel matmul
    par_time, par_results = test_parallel_matmul()

    if par_results and all(r['status'] == 'success' for r in par_results):
        print("\n" + "=" * 60)
        print("Matrix Multiply Results")
        print("=" * 60)
        print(f"Sequential (20 iter): {seq_time:.3f}s")
        print(f"Parallel (2x10 iter): {par_time:.3f}s")
        speedup = seq_time / par_time
        print(f"Speedup: {speedup:.2f}x")

        if speedup > 1.3:
            print("✓ Significant parallelism achieved!")
        else:
            print("⚠ Limited parallelism (GPU likely serializing)")

    # Test 3: Parallel models (optional, slow)
    print("\nSkipping parallel model test (slow). Enable manually if needed.")
    # test_parallel_models()


if __name__ == "__main__":
    main()
