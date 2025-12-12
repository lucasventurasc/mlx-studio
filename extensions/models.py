"""
Model management extension for MLX Studio.

Provides:
- Discovery of downloaded MLX models from HuggingFace cache
- Download functionality using huggingface_hub
- Model metadata and size information
"""

import os
import json
import threading
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger(__name__)

# Model directories
HF_CACHE_DIR = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"
LMSTUDIO_MODELS_DIR = Path.home() / ".lmstudio" / "models"


@dataclass
class ModelInfo:
    id: str
    name: str
    size_bytes: int
    size_human: str
    path: str
    is_mlx: bool = False
    quantization: Optional[str] = None


class ModelManager:
    """Manages local MLX models and HuggingFace downloads."""

    def __init__(self):
        self.downloads: Dict[str, Dict[str, Any]] = {}
        self._download_lock = threading.Lock()

    def get_cache_dir(self) -> Path:
        """Get HuggingFace cache directory."""
        return HF_CACHE_DIR

    def list_local_models(self) -> List[ModelInfo]:
        """List all MLX models from LM Studio folder."""
        models = []
        seen_ids = set()

        # Scan LM Studio models only
        if LMSTUDIO_MODELS_DIR.exists():
            for author_dir in LMSTUDIO_MODELS_DIR.iterdir():
                if not author_dir.is_dir():
                    continue
                author = author_dir.name

                for model_dir in author_dir.iterdir():
                    if not model_dir.is_dir():
                        continue
                    model_name = model_dir.name
                    model_id = f"{author}/{model_name}"

                    if model_id in seen_ids:
                        continue

                    model_info = self._scan_model_dir(model_id, model_name, model_dir)
                    if model_info:
                        models.append(model_info)
                        seen_ids.add(model_id)

        # Sort by name
        models.sort(key=lambda m: m.name.lower())
        return models

    def _scan_model_dir(self, model_id: str, model_name: str, model_path: Path) -> Optional[ModelInfo]:
        """Scan a model directory and return ModelInfo if valid MLX model."""
        # Check if it's an MLX model (has .safetensors files)
        safetensor_files = list(model_path.glob("*.safetensors"))
        if not safetensor_files:
            # Check subdirectories
            safetensor_files = list(model_path.rglob("*.safetensors"))

        if not safetensor_files:
            return None

        # Skip GGUF models (not MLX)
        if "gguf" in model_name.lower():
            return None

        # Calculate size
        size_bytes = sum(
            f.stat().st_size
            for f in model_path.rglob("*")
            if f.is_file()
        )

        # Detect quantization from model name
        quantization = None
        name_lower = model_name.lower()
        for q in ["8bit", "6bit", "4bit", "3bit", "2bit", "fp16", "bf16"]:
            if q in name_lower or q.replace("bit", "-bit") in name_lower:
                quantization = q.upper()
                break

        return ModelInfo(
            id=model_id,
            name=model_name,
            size_bytes=size_bytes,
            size_human=self._format_size(size_bytes),
            path=str(model_path),
            is_mlx=True,
            quantization=quantization
        )

    def _format_size(self, size_bytes: int) -> str:
        """Format bytes to human readable string."""
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} PB"

    def start_download(self, repo_id: str) -> Dict[str, Any]:
        """Start downloading a model from HuggingFace."""
        with self._download_lock:
            if repo_id in self.downloads and self.downloads[repo_id].get("status") == "downloading":
                return {"status": "already_downloading", "repo_id": repo_id}

            self.downloads[repo_id] = {
                "status": "starting",
                "progress": 0,
                "message": "Starting download..."
            }

        # Start download in background thread
        thread = threading.Thread(
            target=self._download_model,
            args=(repo_id,),
            daemon=True
        )
        thread.start()

        return {"status": "started", "repo_id": repo_id}

    def _download_model(self, repo_id: str):
        """Download model in background thread."""
        try:
            from huggingface_hub import snapshot_download, HfApi

            self.downloads[repo_id] = {
                "status": "downloading",
                "progress": 0,
                "message": "Downloading model files..."
            }

            # Download the model
            snapshot_download(
                repo_id=repo_id,
                local_dir=None,  # Use default cache
                local_dir_use_symlinks=True,
            )

            self.downloads[repo_id] = {
                "status": "completed",
                "progress": 100,
                "message": "Download complete!"
            }

            logger.info(f"Successfully downloaded {repo_id}")

        except Exception as e:
            logger.error(f"Failed to download {repo_id}: {e}")
            self.downloads[repo_id] = {
                "status": "error",
                "progress": 0,
                "message": str(e)
            }

    def get_download_status(self, repo_id: Optional[str] = None) -> Dict[str, Any]:
        """Get download status for one or all downloads."""
        if repo_id:
            return self.downloads.get(repo_id, {"status": "not_found"})
        return dict(self.downloads)

    def search_hf_models(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search for MLX models on HuggingFace."""
        try:
            from huggingface_hub import HfApi

            api = HfApi()

            # Search for MLX models
            models = api.list_models(
                search=query,
                library="mlx",
                sort="downloads",
                direction=-1,
                limit=limit
            )

            results = []
            for model in models:
                # Extract quantization from model name
                quantization = None
                model_name = model.id.split("/")[-1].lower()
                for q in ["8bit", "6bit", "4bit", "3bit", "2bit", "fp16", "bf16"]:
                    if q in model_name or q.replace("bit", "-bit") in model_name:
                        quantization = q.upper()
                        break

                results.append({
                    "id": model.id,
                    "name": model.id.split("/")[-1],
                    "author": model.id.split("/")[0] if "/" in model.id else "unknown",
                    "downloads": model.downloads or 0,
                    "likes": model.likes or 0,
                    "quantization": quantization,
                    "tags": list(model.tags or [])[:5]
                })

            return results

        except Exception as e:
            logger.error(f"HF search failed: {e}")
            return []

    def get_model_info(self, repo_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed info about a model from HuggingFace."""
        try:
            from huggingface_hub import HfApi

            api = HfApi()
            model = api.model_info(repo_id)

            return {
                "id": model.id,
                "name": model.id.split("/")[-1],
                "author": model.author or model.id.split("/")[0],
                "downloads": model.downloads or 0,
                "likes": model.likes or 0,
                "tags": list(model.tags or []),
                "created_at": model.created_at.isoformat() if model.created_at else None,
                "last_modified": model.last_modified.isoformat() if model.last_modified else None,
            }

        except Exception as e:
            logger.error(f"Failed to get model info for {repo_id}: {e}")
            return None
