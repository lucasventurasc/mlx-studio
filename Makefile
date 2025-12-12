.PHONY: server server-prod install update-vendor clean help dev litellm

# Python interpreter (using venv-omni for mlx-omni-server compatibility)
PYTHON = ./venv-omni/bin/python
PIP = ./venv-omni/bin/pip

# Default target
all: server

# Install dependencies
install:
	python3.12 -m venv venv-omni || python3 -m venv venv-omni
	$(PIP) install --upgrade pip
	PATH="$(HOME)/.cargo/bin:$(PATH)" $(PIP) install mlx-omni-server || $(PIP) install mlx-omni-server --no-deps
	$(PIP) install 'litellm[proxy]'
	$(PIP) install --upgrade 'fastapi>=0.116.1,<0.117' 'uvicorn>=0.34.0,<0.35' 'python-multipart>=0.0.20,<0.0.21' 'rich>=13.9.4' 'soundfile>=0.13.1'
	@echo "✅ Installation complete"

# Run server (backend + frontend + LiteLLM)
server:
	@./scripts/dev.sh

# Run server on custom port
server-port:
	$(PYTHON) server.py --port $(PORT)

# Run LiteLLM proxy only
litellm:
	./venv-omni/bin/litellm --config litellm_config.yaml --port 4000

# Alias for server
dev: server

# Run backend only (without LiteLLM)
backend:
	$(PYTHON) server.py --port 1234

# Stop all services (kill by port)
stop:
	@lsof -ti:1234 | xargs kill -9 2>/dev/null || true
	@lsof -ti:4000 | xargs kill -9 2>/dev/null || true
	@echo "Services stopped"

# Update vendor/mlx-omni-server
update-vendor:
	./scripts/update-vendor.sh

# Build frontend
frontend-build:
	cd frontend && npm install && npm run build

# Clean cache files
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name htmlcov -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true

# Help
help:
	@echo "MLX Studio - Makefile commands"
	@echo ""
	@echo "  make install       - Create venv and install dependencies"
	@echo "  make server        - Run MLX Studio + LiteLLM (ports 1234 + 4000)"
	@echo "  make backend       - Run MLX Studio only (port 1234, no LiteLLM)"
	@echo "  make litellm       - Run LiteLLM proxy only (port 4000)"
	@echo "  make stop          - Stop all services"
	@echo "  make update-vendor - Update mlx-omni-server from upstream"
	@echo "  make clean         - Clean cache files"
