# Contributing to MLX Studio

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/lucasventura/mlx-studio.git
cd mlx-studio
make install
```

## Development

```bash
# Run server
./venv-omni/bin/python server.py --port 8080

# Test with curl
curl http://localhost:8080/health
```

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally
5. Submit a PR

## Code Style

- Python: Follow existing patterns in the codebase
- Frontend: Vanilla JS, no build step required

## Reporting Issues

- Check existing issues first
- Include Mac model, macOS version, and RAM
- Include relevant logs from the server
