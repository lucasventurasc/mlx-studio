"""
GGUF Backend for MLX Studio

Provides integration with llama-server for running GGUF models.
Includes:
- GGUFServerManager: Auto-start/stop llama-server subprocess
- GGUFBackend: HTTP proxy to llama-server with streaming support
"""

import json
import logging
import signal
import subprocess
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx

logger = logging.getLogger("mlx-studio.gguf")

# Config file path
GGUF_CONFIG_FILE = Path(__file__).parent.parent / "gguf_config.json"


def load_gguf_config() -> dict:
    """Load GGUF configuration from file."""
    if GGUF_CONFIG_FILE.exists():
        try:
            with open(GGUF_CONFIG_FILE) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load GGUF config: {e}")
    return {
        "enabled": True,
        "server_url": "http://127.0.0.1:8080",
        "port": 8080,
        "auto_start": True,
        "llama_server_path": "llama-server",
        "default_args": ["--jinja", "-fa", "--ctx-size", "32768"],
        "current_model": None,
    }


def save_gguf_config(config: dict):
    """Save GGUF configuration to file."""
    with open(GGUF_CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


class GGUFServerManager:
    """Manages llama-server subprocess lifecycle."""

    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.current_model: Optional[str] = None
        self.port: int = 8080
        self._config = load_gguf_config()

    def reload_config(self):
        """Reload configuration from file."""
        self._config = load_gguf_config()

    @property
    def server_url(self) -> str:
        """Get the server URL."""
        return f"http://127.0.0.1:{self.port}"

    def is_running(self) -> bool:
        """Check if llama-server is running."""
        if self.process is None:
            return False
        return self.process.poll() is None

    def health_check(self) -> bool:
        """Check if llama-server is responding."""
        try:
            r = httpx.get(f"{self.server_url}/health", timeout=2)
            return r.status_code == 200
        except Exception:
            return False

    def start(
        self,
        model_path: str,
        port: Optional[int] = None,
        extra_args: Optional[List[str]] = None,
    ) -> dict:
        """Start llama-server with the specified model.

        Args:
            model_path: Path to GGUF model file
            port: Server port (default from config)
            extra_args: Additional command line arguments

        Returns:
            Status dict with 'status', 'model', 'port' keys
        """
        self.reload_config()

        if port is None:
            port = self._config.get("port", 8080)

        # Check if already running with same model
        if self.is_running():
            if self.current_model == model_path and self.port == port:
                logger.info(f"llama-server already running with {model_path}")
                return {
                    "status": "already_running",
                    "model": model_path,
                    "port": port,
                }
            # Different model - need to restart
            logger.info(f"Stopping llama-server to switch model")
            self.stop()

        # Validate model path
        model_path_obj = Path(model_path).expanduser()
        if not model_path_obj.exists():
            raise FileNotFoundError(f"GGUF model not found: {model_path}")

        self.port = port
        llama_server = self._config.get("llama_server_path", "llama-server")
        default_args = self._config.get("default_args", ["--jinja", "-fa"])

        args = [
            llama_server,
            "-m",
            str(model_path_obj),
            "--port",
            str(port),
            "--host",
            "127.0.0.1",
        ]
        args.extend(default_args)

        # Add speculative decoding args if configured
        draft_model = self._config.get("draft_model")
        if draft_model:
            draft_path = Path(draft_model).expanduser()
            if draft_path.exists():
                args.extend(["-md", str(draft_path)])
                draft_n = self._config.get("draft_n", 16)
                args.extend(["--draft", str(draft_n)])
                draft_p_min = self._config.get("draft_p_min", 0.8)
                args.extend(["--draft-p-min", str(draft_p_min)])
                # GPU layers for draft model
                args.extend(["-ngld", "99"])
                logger.info(f"Speculative decoding enabled with draft model: {draft_model}")
            else:
                logger.warning(f"Draft model not found: {draft_model}")

        if extra_args:
            args.extend(extra_args)

        logger.info(f"Starting llama-server: {' '.join(args)}")

        try:
            self.process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            self.current_model = model_path

            # Wait for server to be ready
            self._wait_for_ready(timeout=120)

            # Update config with current model
            self._config["current_model"] = model_path
            save_gguf_config(self._config)

            logger.info(f"llama-server started successfully on port {port}")
            return {"status": "started", "model": model_path, "port": port}

        except FileNotFoundError:
            raise RuntimeError(
                f"llama-server not found. Install with: brew install llama.cpp"
            )
        except Exception as e:
            self.process = None
            self.current_model = None
            raise RuntimeError(f"Failed to start llama-server: {e}")

    def stop(self) -> dict:
        """Stop llama-server gracefully."""
        if self.process is None:
            return {"status": "not_running"}

        try:
            logger.info("Stopping llama-server...")
            self.process.send_signal(signal.SIGTERM)
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            logger.warning("llama-server didn't stop gracefully, killing...")
            self.process.kill()
            self.process.wait(timeout=5)
        except Exception as e:
            logger.error(f"Error stopping llama-server: {e}")

        self.process = None
        model = self.current_model
        self.current_model = None

        # Update config
        self._config["current_model"] = None
        save_gguf_config(self._config)

        return {"status": "stopped", "model": model}

    def get_status(self) -> dict:
        """Get current server status."""
        running = self.is_running()
        healthy = self.health_check() if running else False

        return {
            "running": running,
            "healthy": healthy,
            "model": self.current_model,
            "port": self.port,
            "server_url": self.server_url,
        }

    def _wait_for_ready(self, timeout: int = 120):
        """Wait for llama-server to respond on /health endpoint."""
        start = time.time()
        last_log = ""

        while time.time() - start < timeout:
            # Check if process died
            if self.process.poll() is not None:
                # Read any output for error message
                output = self.process.stdout.read() if self.process.stdout else ""
                raise RuntimeError(f"llama-server exited unexpectedly: {output[-500:]}")

            # Try health check
            if self.health_check():
                return True

            # Log progress from stdout
            if self.process.stdout:
                try:
                    import select

                    if select.select([self.process.stdout], [], [], 0)[0]:
                        line = self.process.stdout.readline()
                        if line and line != last_log:
                            logger.debug(f"[llama-server] {line.strip()}")
                            last_log = line
                except Exception:
                    pass

            time.sleep(1)

        raise TimeoutError(
            f"llama-server failed to start within {timeout}s. "
            "Check if the model file is valid and you have enough memory."
        )


# Global singleton instance
gguf_server = GGUFServerManager()


class GGUFBackend:
    """HTTP proxy backend for llama-server.

    Provides streaming chat completions by proxying to llama-server's
    OpenAI-compatible API.
    """

    def __init__(self, server_url: str = "http://127.0.0.1:8080"):
        self.server_url = server_url
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=300.0)
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        top_p: float = 0.9,
        **kwargs,
    ) -> dict:
        """Generate a complete (non-streaming) response.

        Args:
            messages: Chat messages in OpenAI format
            tools: Tool definitions in OpenAI format
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Top-p sampling

        Returns:
            OpenAI-format completion response
        """
        client = await self._get_client()

        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stream": False,
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        response = await client.post(
            f"{self.server_url}/v1/chat/completions",
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def generate_stream(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        top_p: float = 0.9,
        **kwargs,
    ) -> AsyncGenerator[dict, None]:
        """Generate a streaming response.

        Args:
            messages: Chat messages in OpenAI format
            tools: Tool definitions in OpenAI format
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Top-p sampling

        Yields:
            OpenAI-format streaming chunks
        """
        client = await self._get_client()

        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stream": True,
            "stream_options": {"include_usage": True},  # Request usage stats in final chunk
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with client.stream(
            "POST",
            f"{self.server_url}/v1/chat/completions",
            json=payload,
        ) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                if not line:
                    continue
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        yield chunk
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse SSE chunk: {data}")
                        continue

    async def health_check(self) -> bool:
        """Check if llama-server is healthy."""
        try:
            client = await self._get_client()
            response = await client.get(f"{self.server_url}/health", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False
