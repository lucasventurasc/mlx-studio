"""
Claude Code Proxy Integration for MLX Studio

This module integrates the claude-code-proxy as a local Anthropic API endpoint
that converts Claude API requests to OpenAI format and calls the local MLX backend.
"""

import os
import sys
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Add claude-code-proxy to path
# The proxy uses `from src.xxx` imports, so we need to add the root directory
PROXY_ROOT = Path(__file__).parent.parent / "vendor" / "claude-code-proxy"
if str(PROXY_ROOT) not in sys.path:
    sys.path.insert(0, str(PROXY_ROOT))


def configure_proxy_for_local(port: int = 8080):
    """Configure the claude-code-proxy to use the local MLX Studio OpenAI endpoint.

    This sets environment variables before the proxy's config module is imported.
    Must be called before importing any proxy modules.

    Args:
        port: The port MLX Studio is running on (for self-referential calls)
    """
    # Set required env vars for the proxy
    # API key is required by the proxy but not actually used for local calls
    if "OPENAI_API_KEY" not in os.environ:
        os.environ["OPENAI_API_KEY"] = "sk-local-mlx-studio-dummy-key"

    # Point to our local OpenAI endpoint
    os.environ["OPENAI_BASE_URL"] = f"http://127.0.0.1:{port}/v1"

    # Disable client API key validation (we're local)
    # Don't set ANTHROPIC_API_KEY so validation is skipped
    if "ANTHROPIC_API_KEY" in os.environ:
        del os.environ["ANTHROPIC_API_KEY"]

    # Use our model routing - the proxy will pass through the model name
    # and MLX Studio's OpenAI endpoint will resolve aliases
    os.environ["BIG_MODEL"] = "claude-opus"  # Will be resolved by MLX Studio
    os.environ["MIDDLE_MODEL"] = "claude-sonnet"
    os.environ["SMALL_MODEL"] = "claude-haiku"

    # Increase timeout for local inference (can be slow for large models)
    os.environ["REQUEST_TIMEOUT"] = "300"

    # Set reasonable token limits
    os.environ["MAX_TOKENS_LIMIT"] = "16384"
    os.environ["MIN_TOKENS_LIMIT"] = "1"

    logger.info(f"Claude proxy configured for local MLX Studio at port {port}")


def get_proxy_router():
    """Get the claude-code-proxy FastAPI router.

    Returns:
        FastAPI APIRouter with Claude API endpoints
    """
    try:
        # Import from the proxy (uses `from src.xxx` import pattern)
        from src.api.endpoints import router
        return router
    except ImportError as e:
        logger.error(f"Failed to import claude-code-proxy router: {e}")
        raise


def create_proxy_app():
    """Create a standalone proxy FastAPI app (for testing).

    Returns:
        FastAPI app instance
    """
    from src.main import app
    return app
