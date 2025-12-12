"""
Multi-slot KV Cache Manager with disk persistence.

Unique feature of MLX Studio - allows caching multiple conversations
simultaneously with LRU eviction and optional persistence to disk.
"""

import time
import threading
import logging
import hashlib
import json
import pickle
from pathlib import Path
from collections import OrderedDict
from typing import Dict, Any, Optional, List

# Default cache directory
DEFAULT_CACHE_DIR = Path.home() / ".mlx-studio" / "cache" / "kv"


class KVCacheManager:
    """
    Multi-slot KV cache manager for efficient conversation caching.
    Supports multiple concurrent conversations with LRU eviction.
    Includes persistence to disk for session resume.
    """

    def __init__(self, max_slots: int = 8, cache_dir: Optional[Path] = None):
        self.max_slots = max_slots
        self.slots: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.lock = threading.Lock()
        self.logger = logging.getLogger("mlx-studio.cache")
        self.stats = {'hits': 0, 'misses': 0, 'disk_hits': 0, 'disk_saves': 0}
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.persisted_keys: set = set()

        # Load persisted cache index
        self._load_index()

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get file path for a cached KV state."""
        return self.cache_dir / f"{cache_key}.cache"

    def _get_meta_path(self, cache_key: str) -> Path:
        """Get file path for cache metadata."""
        return self.cache_dir / f"{cache_key}.meta"

    def _load_index(self):
        """Load cache index from disk on startup."""
        index_path = self.cache_dir / "index.json"
        if index_path.exists():
            try:
                with open(index_path) as f:
                    self.persisted_keys = set(json.load(f))
                self.logger.info(f"Loaded {len(self.persisted_keys)} persisted cache entries")
            except Exception as e:
                self.logger.warning(f"Failed to load cache index: {e}")
                self.persisted_keys = set()
        else:
            self.persisted_keys = set()

    def _save_index(self):
        """Save cache index to disk."""
        index_path = self.cache_dir / "index.json"
        try:
            with open(index_path, 'w') as f:
                json.dump(list(self.persisted_keys), f)
        except Exception as e:
            self.logger.warning(f"Failed to save cache index: {e}")

    def _compute_cache_key(self, messages: List[Dict], model_id: str) -> str:
        """Compute a unique key for a conversation state."""
        content = f"{model_id}:" + "|".join(
            f"{m['role']}:{m['content']}" for m in messages[:-1]
        )
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def get_cache(self, messages: List[Dict], model_id: str) -> Optional[Any]:
        """Get cached KV state for a conversation prefix."""
        if len(messages) < 2:
            return None

        cache_key = self._compute_cache_key(messages, model_id)

        with self.lock:
            # Check memory cache first
            if cache_key in self.slots:
                self.slots.move_to_end(cache_key)
                cache_data = self.slots[cache_key]
                self.stats['hits'] += 1
                self.logger.info(f"Cache HIT (memory): {cache_key}")
                return cache_data.get('cache')

            # Check disk cache
            if cache_key in self.persisted_keys:
                cache = self._load_from_disk(cache_key, model_id)
                if cache is not None:
                    self.stats['disk_hits'] += 1
                    self.logger.info(f"Cache HIT (disk): {cache_key}")
                    return cache

        self.stats['misses'] += 1
        self.logger.debug(f"Cache MISS: {cache_key}")
        return None

    def _load_from_disk(self, cache_key: str, model_id: str) -> Optional[Any]:
        """Load KV cache from disk."""
        meta_path = self._get_meta_path(cache_key)
        cache_path = self._get_cache_path(cache_key)

        if not meta_path.exists() or not cache_path.exists():
            return None

        try:
            with open(meta_path) as f:
                meta = json.load(f)

            # Verify model compatibility
            if meta.get('model_id') != model_id:
                self.logger.warning(f"Cache model mismatch: {meta.get('model_id')} vs {model_id}")
                return None

            # Load actual cache data
            with open(cache_path, 'rb') as f:
                cache_data = pickle.load(f)

            # Store in memory for faster access
            self.slots[cache_key] = {
                'cache': cache_data,
                'token_count': meta.get('token_count', 0),
                'model_id': model_id,
                'timestamp': time.time()
            }

            return cache_data
        except Exception as e:
            self.logger.warning(f"Failed to load cache from disk: {e}")
            return None

    def store_cache(self, messages: List[Dict], model_id: str, cache: Any, token_count: int, persist: bool = False):
        """Store KV cache for a conversation state."""
        cache_key = self._compute_cache_key(messages, model_id)

        with self.lock:
            # Evict oldest if at capacity
            while len(self.slots) >= self.max_slots:
                evicted_key, _ = self.slots.popitem(last=False)
                self.logger.info(f"Cache EVICT: {evicted_key}")

            self.slots[cache_key] = {
                'cache': cache,
                'token_count': token_count,
                'model_id': model_id,
                'timestamp': time.time(),
                'messages_hash': hashlib.sha256(
                    json.dumps(messages, sort_keys=True).encode()
                ).hexdigest()[:16]
            }
            self.logger.info(f"Cache STORE: {cache_key} (tokens: {token_count}, slots: {len(self.slots)}/{self.max_slots})")

            # Persist to disk if requested
            if persist:
                self._save_to_disk(cache_key, cache, model_id, token_count, messages)

    def _save_to_disk(self, cache_key: str, cache: Any, model_id: str, token_count: int, messages: List[Dict]):
        """Save KV cache to disk for persistence."""
        try:
            meta_path = self._get_meta_path(cache_key)
            cache_path = self._get_cache_path(cache_key)

            # Save metadata
            meta = {
                'cache_key': cache_key,
                'model_id': model_id,
                'token_count': token_count,
                'timestamp': time.time(),
                'messages_preview': [
                    {'role': m['role'], 'content': m['content'][:100] + '...' if len(m['content']) > 100 else m['content']}
                    for m in messages[:3]
                ]
            }
            with open(meta_path, 'w') as f:
                json.dump(meta, f, indent=2)

            # Save cache data
            with open(cache_path, 'wb') as f:
                pickle.dump(cache, f)

            self.persisted_keys.add(cache_key)
            self._save_index()
            self.stats['disk_saves'] += 1
            self.logger.info(f"Cache PERSISTED: {cache_key}")
        except Exception as e:
            self.logger.warning(f"Failed to persist cache: {e}")

    def persist_slot(self, slot_id: str) -> bool:
        """Persist a specific cache slot to disk."""
        with self.lock:
            if slot_id not in self.slots:
                # Try to find by partial key
                matching = [k for k in self.slots.keys() if k.startswith(slot_id)]
                if matching:
                    slot_id = matching[0]
                else:
                    return False

            slot_data = self.slots[slot_id]
            self._save_to_disk(
                slot_id,
                slot_data['cache'],
                slot_data['model_id'],
                slot_data['token_count'],
                []  # Messages not stored in slot
            )
            return True

    def list_persisted(self) -> List[Dict[str, Any]]:
        """List all persisted cache entries."""
        entries = []
        for cache_key in self.persisted_keys:
            meta_path = self._get_meta_path(cache_key)
            if meta_path.exists():
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    entries.append(meta)
                except:
                    pass
        return entries

    def delete_persisted(self, cache_key: str) -> bool:
        """Delete a persisted cache entry."""
        try:
            meta_path = self._get_meta_path(cache_key)
            cache_path = self._get_cache_path(cache_key)

            if meta_path.exists():
                meta_path.unlink()
            if cache_path.exists():
                cache_path.unlink()

            self.persisted_keys.discard(cache_key)
            self._save_index()

            # Also remove from memory
            with self.lock:
                if cache_key in self.slots:
                    del self.slots[cache_key]

            return True
        except Exception as e:
            self.logger.warning(f"Failed to delete cache: {e}")
            return False

    def clear(self, include_persisted: bool = False):
        """Clear all cached KV states."""
        with self.lock:
            self.slots.clear()
            self.stats = {'hits': 0, 'misses': 0, 'disk_hits': 0, 'disk_saves': 0}
            self.logger.info("Cache CLEARED (memory)")

            if include_persisted:
                # Clear disk cache
                for cache_key in list(self.persisted_keys):
                    self.delete_persisted(cache_key)
                self.logger.info("Cache CLEARED (disk)")

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self.lock:
            total_requests = self.stats['hits'] + self.stats['misses']
            hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0

            return {
                'slots_used': len(self.slots),
                'max_slots': self.max_slots,
                'hits': self.stats['hits'],
                'misses': self.stats['misses'],
                'disk_hits': self.stats['disk_hits'],
                'disk_saves': self.stats['disk_saves'],
                'hit_rate': f"{hit_rate:.1f}%",
                'persisted_count': len(self.persisted_keys),
                'entries': [
                    {
                        'key': k,
                        'tokens': v.get('token_count', 0),
                        'model': v.get('model_id', 'unknown'),
                        'age_seconds': int(time.time() - v.get('timestamp', 0))
                    }
                    for k, v in self.slots.items()
                ]
            }
