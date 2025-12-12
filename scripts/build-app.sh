#!/bin/bash
# Build MLX Studio as standalone package with all dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building MLX Studio standalone package...${NC}"

# Get version from git tag or use 'dev'
VERSION=$(git describe --tags 2>/dev/null | sed 's/^v//' || echo "dev")
ARCH=$(uname -m)
BUILD_NAME="mlx-studio-${VERSION}-${ARCH}"
BUILD_DIR="build/$BUILD_NAME"

# Create build directory
rm -rf "build/$BUILD_NAME"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Create venv with all dependencies
echo "Creating virtual environment..."
python3.12 -m venv . || python3 -m venv .

echo "Installing dependencies (this may take a few minutes)..."
./bin/pip install --upgrade pip > /dev/null 2>&1
./bin/pip install mlx-omni-server > /dev/null 2>&1
./bin/pip install 'litellm[proxy]' > /dev/null 2>&1
./bin/pip install --upgrade 'fastapi>=0.116.1,<0.117' 'uvicorn>=0.34.0,<0.35' 'python-multipart>=0.0.20,<0.0.21' 'rich>=13.9.4' 'soundfile>=0.13.1' > /dev/null 2>&1

echo "Copying source files..."
mkdir -p app
cp "$SCRIPT_DIR/server.py" app/
cp "$SCRIPT_DIR/patches.py" app/ 2>/dev/null || true
cp "$SCRIPT_DIR/litellm_config.yaml" app/
cp "$SCRIPT_DIR/model_aliases.json" app/ 2>/dev/null || true
cp "$SCRIPT_DIR/claude_routing.json" app/ 2>/dev/null || true
cp -r "$SCRIPT_DIR/extensions" app/ 2>/dev/null || true
cp -r "$SCRIPT_DIR/frontend" app/ 2>/dev/null || true
cp -r "$SCRIPT_DIR/vendor" app/ 2>/dev/null || true

# Create launcher script that starts both MLX Studio and LiteLLM
echo "Creating launcher script..."
cat > run.sh << 'LAUNCHER'
#!/bin/bash
# Start MLX Studio + LiteLLM together
# Ctrl+C stops both services

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON="./bin/python"
LITELLM="./bin/litellm"

# Disable DATABASE_URL to prevent Prisma errors
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

echo "Starting MLX Studio..."
echo ""

# Start MLX Studio server
cd app
$SCRIPT_DIR/$PYTHON server.py --port 1234 &
SERVER_PID=$!
cd "$SCRIPT_DIR"

sleep 2

# Start LiteLLM proxy if config exists
if [ -f "app/litellm_config.yaml" ]; then
    echo "Starting LiteLLM proxy..."
    $LITELLM --config app/litellm_config.yaml --port 4000 &
    LITELLM_PID=$!
fi

echo ""
echo "===================="
echo "MLX Studio: http://localhost:1234"
if [ -n "$LITELLM_PID" ]; then
    echo "LiteLLM:    http://localhost:4000"
fi
echo "===================="
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for processes
if [ -n "$LITELLM_PID" ]; then
    wait $SERVER_PID $LITELLM_PID
else
    wait $SERVER_PID
fi
LAUNCHER
chmod +x run.sh

# Create README for the package
cat > README.txt << 'README'
MLX Studio Standalone Package

To run MLX Studio:
  ./run.sh

The server will be available at:
  http://localhost:1234

To change the port:
  ./run.sh --port 8000

To stop the server:
  Press Ctrl+C

This package includes all dependencies needed to run MLX Studio.
README

# Optimize package size by removing unnecessary files
echo "Optimizing package size..."
cd "$BUILD_DIR"
# Remove test files, cache, docs, examples
find lib -type d -name "tests" -o -name "__pycache__" -o -name "*.dist-info" | xargs rm -rf 2>/dev/null || true
find lib -type f -name "*.pyc" -o -name "*.pyo" | xargs rm -f 2>/dev/null || true
# Remove large documentation and examples
rm -rf lib/python*/site-packages/*/docs 2>/dev/null || true
rm -rf lib/python*/site-packages/*/examples 2>/dev/null || true
# Remove pip cache
rm -rf lib/python*/site-packages/pip/_*internal 2>/dev/null || true
cd "$SCRIPT_DIR"

# Create archive
echo "Creating archive..."
ZIP_NAME="${BUILD_NAME}.zip"
cd build
zip -r -q "$ZIP_NAME" "$BUILD_NAME"
cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo -e "📦 Package: ${BLUE}build/$ZIP_NAME${NC}"
echo -e "📊 Size: $(du -h "build/$ZIP_NAME" | cut -f1)"
echo ""
echo "To use:"
echo "  1. Download the ZIP file"
echo "  2. Unzip it: unzip $ZIP_NAME"
echo "  3. Enter directory: cd $BUILD_NAME"
echo "  4. Run: ./run.sh"
echo ""
echo "To distribute:"
echo "  Upload build/$ZIP_NAME to GitHub Releases"
