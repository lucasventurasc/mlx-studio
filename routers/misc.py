"""
Miscellaneous API endpoints - logs, proxy, TTS, profiles, inference settings.
"""
import os
import json
import logging
import asyncio
import tempfile
import subprocess
from queue import Queue, Empty
from collections import deque
from typing import Dict, Optional, AsyncGenerator
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import httpx

from extensions import InferenceProfiles
from extensions.global_settings import get_global_settings

logger = logging.getLogger("mlx-studio.misc")
router = APIRouter(tags=["Misc"])

# Initialize profiles
profiles = InferenceProfiles(default_profile='balanced')

# Log streaming
_log_buffer: deque = deque(maxlen=100)
_log_clients: set = set()


# =============================================================================
# Log Handler
# =============================================================================

class WebLogHandler(logging.Handler):
    """Custom log handler that broadcasts logs to SSE clients."""

    def emit(self, record):
        try:
            log_entry = {
                "timestamp": self.formatTime(record),
                "level": record.levelname.lower(),
                "logger": record.name,
                "message": record.getMessage()
            }
            _log_buffer.append(log_entry)

            for queue in list(_log_clients):
                try:
                    queue.put_nowait(log_entry)
                except:
                    pass
        except Exception:
            pass

    def formatTime(self, record):
        import time
        ct = time.localtime(record.created)
        return time.strftime("%H:%M:%S", ct)


def setup_log_handler():
    """Setup the web log handler."""
    handler = WebLogHandler()
    handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(handler)

    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "mlx_omni_server", "mlx-studio"]:
        log = logging.getLogger(logger_name)
        log.addHandler(handler)


# =============================================================================
# Pydantic Models
# =============================================================================

class ProxyRequest(BaseModel):
    url: str
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None


class EdgeTTSRequest(BaseModel):
    input: str
    voice: str = "pt-BR-FranciscaNeural"
    rate: str = "+0%"


class InferenceSettings(BaseModel):
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    repetition_penalty: Optional[float] = None
    repetition_context_size: Optional[int] = None


# =============================================================================
# Edge TTS
# =============================================================================

EDGE_TTS_VOICES = {
    "pt-BR-FranciscaNeural": "Francisca (Brazil, Female)",
    "pt-BR-AntonioNeural": "Antonio (Brazil, Male)",
    "pt-BR-ThalitaMultilingualNeural": "Thalita (Brazil, Female, Multilingual)",
    "pt-PT-RaquelNeural": "Raquel (Portugal, Female)",
    "pt-PT-DuarteNeural": "Duarte (Portugal, Male)",
    "en-US-JennyNeural": "Jenny (US, Female)",
    "en-US-GuyNeural": "Guy (US, Male)",
    "en-US-AriaNeural": "Aria (US, Female)",
    "en-US-DavisNeural": "Davis (US, Male)",
    "en-GB-SoniaNeural": "Sonia (UK, Female)",
    "en-GB-RyanNeural": "Ryan (UK, Male)",
    "es-ES-ElviraNeural": "Elvira (Spain, Female)",
    "es-MX-DaliaNeural": "Dalia (Mexico, Female)",
    "fr-FR-DeniseNeural": "Denise (France, Female)",
    "de-DE-KatjaNeural": "Katja (Germany, Female)",
    "it-IT-ElsaNeural": "Elsa (Italy, Female)",
    "ja-JP-NanamiNeural": "Nanami (Japan, Female)",
    "zh-CN-XiaoxiaoNeural": "Xiaoxiao (China, Female)",
}


@router.get("/api/tts/edge/voices")

@router.get("/api/network")

def get_network():
    """Return network addresses for frontend."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = None
    if ip:
        return {"addresses": [{"ip": ip}]}
    else:
        return {"addresses": []}

def get_edge_tts_voices():
    """Get available Edge TTS voices."""
    return {"voices": EDGE_TTS_VOICES}


@router.post("/api/tts/edge")
async def edge_tts(request: EdgeTTSRequest):
    """Generate speech using Microsoft Edge TTS."""
    try:
        import edge_tts

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            output_path = f.name

        communicate = edge_tts.Communicate(request.input, request.voice, rate=request.rate)
        await communicate.save(output_path)

        return FileResponse(
            output_path,
            media_type="audio/mpeg",
            filename="speech.mp3"
        )
    except ImportError:
        return {"error": "edge-tts not installed. Run: pip install edge-tts"}
    except Exception as e:
        logger.error(f"Edge TTS error: {e}")
        return {"error": str(e)}


# =============================================================================
# Profiles & Inference Settings
# =============================================================================

@router.get("/api/profiles")
def get_profiles():
    """Get available inference profiles."""
    return profiles.get_all()


@router.post("/api/profiles/{profile_name}")
def set_profile(profile_name: str):
    """Set the current inference profile."""
    result = profiles.set_current(profile_name)
    profile = profiles.get(profile_name)
    if profile:
        get_global_settings().update(
            temperature=profile.temperature,
            top_p=profile.top_p,
            repetition_penalty=profile.repetition_penalty,
            repetition_context_size=profile.repetition_context_size
        )
    return result


@router.get("/api/inference/settings")
def get_inference_settings():
    """Get current inference settings."""
    settings = get_global_settings()
    return {
        "temperature": settings.temperature,
        "top_p": settings.top_p,
        "max_tokens": settings.max_tokens,
        "repetition_penalty": settings.repetition_penalty,
        "repetition_context_size": settings.repetition_context_size,
    }


@router.post("/api/inference/settings")
def update_inference_settings(settings: InferenceSettings):
    """Update inference settings."""
    gs = get_global_settings()
    update_dict = {k: v for k, v in settings.dict().items() if v is not None}
    gs.update(**update_dict)
    return {"status": "updated", "settings": get_inference_settings()}


# =============================================================================
# Web Proxy
# =============================================================================

@router.post("/api/proxy")
async def web_proxy(request: ProxyRequest):
    """Proxy web requests to avoid CORS issues."""
    try:
        headers = request.headers or {}
        if "User-Agent" not in headers:
            headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.request(
                method=request.method,
                url=request.url,
                headers=headers
            )
            return {
                "status": response.status_code,
                "content": response.text,
                "headers": dict(response.headers)
            }
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        return {"error": str(e), "status": 500}


# =============================================================================
# Anthropic Telemetry Capture
# =============================================================================

@router.post("/anthropic/api/event_logging/batch")
async def anthropic_telemetry_capture(request: Request):
    """Capture and log Claude Code CLI telemetry events."""
    try:
        body = await request.json()
        events = body if isinstance(body, list) else body.get("events", [body])

        for event in events:
            event_type = event.get("type", event.get("event_type", "unknown"))
            if event_type == "unknown":
                logger.info(f"[Telemetry] Keys: {list(event.keys())}")
            else:
                details = {k: v for k, v in event.items()
                          if k in ["model", "tokens", "duration", "error", "tool", "status", "message"]}
                if details:
                    logger.info(f"[Telemetry] {event_type}: {details}")
                else:
                    logger.info(f"[Telemetry] {event_type}")
    except Exception as e:
        logger.debug(f"[Telemetry] Failed to parse: {e}")

    return {"status": "ok"}


# =============================================================================
# Log Streaming
# =============================================================================

async def log_stream_generator() -> AsyncGenerator[str, None]:
    """Generate SSE events for log streaming."""
    queue = Queue(maxsize=100)
    _log_clients.add(queue)

    try:
        for log in list(_log_buffer):
            yield f"data: {json.dumps(log)}\n\n"

        while True:
            try:
                log = queue.get_nowait()
                yield f"data: {json.dumps(log)}\n\n"
            except Empty:
                await asyncio.sleep(0.1)
                yield ": keepalive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        _log_clients.discard(queue)


@router.get("/api/logs/stream")
async def stream_logs():
    """Stream server logs via SSE."""
    return StreamingResponse(
        log_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/api/logs/recent")
def get_recent_logs():
    """Get recent server logs (last 100)."""
    return {"logs": list(_log_buffer)}


# =============================================================================
# Health Check
# =============================================================================

@router.get("/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "mlx-studio",
        "version": "2.0.0"
    }


# =============================================================================
# Model Cache Settings
# =============================================================================

class ModelCacheSettings(BaseModel):
    max_size: Optional[int] = None

@router.get("/api/settings/model-cache")
def get_model_cache_settings():
    """Get current model cache settings."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache
    cache_info = wrapper_cache.get_cache_info()
    return {
        "max_size": cache_info.get("max_size", 1),
        "current_size": cache_info.get("cache_size", 0),
        "cached_models": cache_info.get("cached_keys", []),
        "kv_bits": os.environ.get("MLX_KV_BITS"),
    }

@router.post("/api/settings/model-cache")
def update_model_cache_settings(settings: ModelCacheSettings):
    """Update model cache settings (applies immediately)."""
    from mlx_omni_server.chat.mlx.wrapper_cache import wrapper_cache

    if settings.max_size is not None:
        wrapper_cache.set_max_size(settings.max_size)
        os.environ["MLX_MODEL_CACHE_SIZE"] = str(settings.max_size)
        logger.info(f"Updated model cache max_size to {settings.max_size}")

    return get_model_cache_settings()
