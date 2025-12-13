#!/usr/bin/env python3
"""Benchmark MLX vs GGUF models"""

import requests
import json
import time
import sys

BASE_URL = "http://127.0.0.1:1234"
GGUF_URL = "http://127.0.0.1:8080"
PROMPT = "Escreva um Palindromo em Kotlin"

def load_model(model_id):
    """Load a model via MLX Studio API"""
    resp = requests.post(f"{BASE_URL}/api/models/load", params={"model_id": model_id})
    return resp.json()

def benchmark_mlx(model_id, runs=3):
    """Benchmark MLX model"""
    results = []

    # Load model first
    load_result = load_model(model_id)
    if load_result.get("status") != "loaded":
        print(f"  Failed to load: {load_result}")
        return None

    print(f"  Model loaded in {load_result.get('time', 0):.2f}s")
    time.sleep(1)  # Let model settle

    for i in range(runs):
        resp = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "model": model_id,
                "messages": [{"role": "user", "content": PROMPT}],
                "max_tokens": 512,
                "stream": False
            },
            timeout=120
        )

        data = resp.json()
        if "error" in data:
            print(f"  Run {i+1} error: {data['error']}")
            continue

        usage = data.get("usage", {})
        tps = usage.get("tokens_per_second", 0)
        tokens = usage.get("completion_tokens", 0)
        results.append({"tps": tps, "tokens": tokens})
        print(f"  Run {i+1}: {tps:.1f} tok/s ({tokens} tokens)")

    if results:
        avg_tps = sum(r["tps"] for r in results) / len(results)
        return avg_tps
    return None

def benchmark_gguf(model_path, runs=3):
    """Benchmark GGUF model via llama-server"""
    results = []

    for i in range(runs):
        resp = requests.post(
            f"{GGUF_URL}/v1/chat/completions",
            json={
                "model": model_path,
                "messages": [{"role": "user", "content": PROMPT}],
                "max_tokens": 512,
                "stream": False
            },
            timeout=120
        )

        data = resp.json()
        if "error" in data:
            print(f"  Run {i+1} error: {data['error']}")
            continue

        # GGUF returns timings.predicted_per_second
        timings = data.get("timings", {})
        tps = timings.get("predicted_per_second", 0)
        usage = data.get("usage", {})
        tokens = usage.get("completion_tokens", 0)
        results.append({"tps": tps, "tokens": tokens})
        print(f"  Run {i+1}: {tps:.1f} tok/s ({tokens} tokens)")

    if results:
        avg_tps = sum(r["tps"] for r in results) / len(results)
        return avg_tps
    return None

def main():
    # Model pairs to test
    models = [
        {
            "name": "Qwen3-1.7B",
            "mlx": "mlx-community/Qwen3-1.7B-4bit",
            "gguf": None  # Need to find GGUF path
        },
        {
            "name": "Qwen3-4B",
            "mlx": "mlx-community/Qwen3-4B-4bit",
            "gguf": None  # Need to find GGUF path
        },
        {
            "name": "Qwen3-Coder-30B",
            "mlx": "lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
            "gguf": None  # Need to find GGUF path
        }
    ]

    results = []

    print("=" * 60)
    print("MLX vs GGUF Benchmark")
    print("=" * 60)
    print(f"Prompt: {PROMPT}")
    print()

    for model in models:
        print(f"\n--- {model['name']} ---")

        # Test MLX
        if model["mlx"]:
            print(f"\nMLX ({model['mlx']}):")
            mlx_tps = benchmark_mlx(model["mlx"])
            model["mlx_tps"] = mlx_tps

        # Test GGUF (if available)
        if model["gguf"]:
            print(f"\nGGUF ({model['gguf']}):")
            gguf_tps = benchmark_gguf(model["gguf"])
            model["gguf_tps"] = gguf_tps

        results.append(model)

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Model':<25} {'MLX tok/s':<15} {'GGUF tok/s':<15} {'Winner'}")
    print("-" * 60)

    for r in results:
        mlx = r.get("mlx_tps")
        gguf = r.get("gguf_tps")
        mlx_str = f"{mlx:.1f}" if mlx else "N/A"
        gguf_str = f"{gguf:.1f}" if gguf else "N/A"

        if mlx and gguf:
            winner = "MLX" if mlx > gguf else "GGUF"
            diff = abs(mlx - gguf) / max(mlx, gguf) * 100
            winner = f"{winner} (+{diff:.0f}%)"
        else:
            winner = "-"

        print(f"{r['name']:<25} {mlx_str:<15} {gguf_str:<15} {winner}")

if __name__ == "__main__":
    main()
