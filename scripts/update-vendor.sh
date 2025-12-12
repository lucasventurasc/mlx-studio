#!/bin/bash
# Update vendor/mlx-omni-server from upstream

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$PROJECT_DIR/vendor/mlx-omni-server"

echo "Updating mlx-omni-server..."

if [ -d "$VENDOR_DIR" ]; then
    cd "$VENDOR_DIR"
    git fetch origin
    git reset --hard origin/main
    echo "✅ Updated to latest version"
else
    echo "Vendor directory not found. Cloning..."
    mkdir -p "$PROJECT_DIR/vendor"
    cd "$PROJECT_DIR/vendor"
    git clone --depth 1 https://github.com/madroidmaq/mlx-omni-server.git
    echo "✅ Cloned mlx-omni-server"
fi

echo ""
echo "Don't forget to apply patches if needed!"
echo "Run: ./venv-omni/bin/python -c 'from patches import apply_patches; apply_patches()'"
