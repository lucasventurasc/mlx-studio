#!/bin/bash
# Start MLX Studio + LiteLLM together
# Ctrl+C stops both services

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

PYTHON="./venv-omni/bin/python"
LITELLM="./venv-omni/bin/litellm"

# Disable DATABASE_URL to prevent Prisma errors when not using database
unset DATABASE_URL

cleanup() {
    echo ""
    echo "Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $LITELLM_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    wait $LITELLM_PID 2>/dev/null
    echo "Done"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting MLX Studio + LiteLLM..."
echo ""

# Start MLX Studio server
$PYTHON server.py --port 1234 &
SERVER_PID=$!

sleep 2

# Start LiteLLM proxy
$LITELLM --config litellm_config.yaml --port 4000 &
LITELLM_PID=$!

echo ""
echo "===================="
echo "MLX Studio: http://localhost:1234"
echo "LiteLLM:    http://localhost:4000"
echo "===================="
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait $SERVER_PID $LITELLM_PID
