#!/bin/bash
# SQLite-vec Extension Installation Script
# Automatically downloads and installs the sqlite-vec extension for the current platform

set -e

EXTENSION_DIR="./extensions"
PLATFORM=$(uname -s)
ARCH=$(uname -m)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create extensions directory
mkdir -p "$EXTENSION_DIR"

log_info "Detected platform: $PLATFORM ($ARCH)"

# Determine the correct binary URL and filename
case "$PLATFORM" in
    "Darwin")
        case "$ARCH" in
            "arm64")
                URL="https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-darwin-aarch64.dylib"
                FILENAME="vec0.dylib"
                ;;
            "x86_64")
                URL="https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-darwin-x86_64.dylib"
                FILENAME="vec0.dylib"
                ;;
            *)
                log_error "Unsupported macOS architecture: $ARCH"
                exit 1
                ;;
        esac
        ;;
    "Linux")
        case "$ARCH" in
            "x86_64")
                URL="https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-linux-x86_64.so"
                FILENAME="vec0.so"
                ;;
            "aarch64")
                URL="https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-linux-aarch64.so"
                FILENAME="vec0.so"
                ;;
            *)
                log_error "Unsupported Linux architecture: $ARCH"
                exit 1
                ;;
        esac
        ;;
    *)
        log_error "Unsupported platform: $PLATFORM"
        log_info "Supported platforms: macOS (Darwin), Linux"
        exit 1
        ;;
esac

EXTENSION_PATH="$EXTENSION_DIR/$FILENAME"

# Check if extension already exists
if [[ -f "$EXTENSION_PATH" ]]; then
    log_warning "Extension already exists at $EXTENSION_PATH"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
fi

log_info "Downloading sqlite-vec extension..."
log_info "URL: $URL"

# Download the extension
if command -v curl &> /dev/null; then
    curl -L -o "$EXTENSION_PATH" "$URL"
elif command -v wget &> /dev/null; then
    wget -O "$EXTENSION_PATH" "$URL"
else
    log_error "Neither curl nor wget is available. Please install one of them."
    exit 1
fi

# Verify download
if [[ ! -f "$EXTENSION_PATH" ]]; then
    log_error "Download failed. Extension file not found."
    exit 1
fi

# Check file size (should be > 0)
if [[ ! -s "$EXTENSION_PATH" ]]; then
    log_error "Downloaded file is empty. Download may have failed."
    rm -f "$EXTENSION_PATH"
    exit 1
fi

# Set executable permissions
chmod +x "$EXTENSION_PATH"

log_success "sqlite-vec extension installed successfully!"
log_info "Extension location: $PWD/$EXTENSION_PATH"

# Set environment variable suggestion
echo ""
log_info "To use the extension, set the environment variable:"
echo "export HIKMA_SQLITE_VEC_EXTENSION=$PWD/$EXTENSION_PATH"
echo ""
log_info "Or add it to your .env file:"
echo "HIKMA_SQLITE_VEC_EXTENSION=$PWD/$EXTENSION_PATH"

# Test the extension if sqlite3 is available
if command -v sqlite3 &> /dev/null; then
    log_info "Testing extension..."
    
    # Create a temporary database to test the extension
    TEMP_DB=$(mktemp)
    
    if sqlite3 "$TEMP_DB" ".load $PWD/$EXTENSION_PATH" ".quit" 2>/dev/null; then
        log_success "Extension loads successfully!"
        
        # Test vec_version function
        VERSION=$(sqlite3 "$TEMP_DB" ".load $PWD/$EXTENSION_PATH" "SELECT vec_version();" 2>/dev/null || echo "unknown")
        if [[ "$VERSION" != "unknown" ]]; then
            log_success "sqlite-vec version: $VERSION"
        fi
    else
        log_warning "Extension test failed. The extension may not be compatible with your system."
        log_info "This might still work with the Node.js better-sqlite3 driver."
    fi
    
    # Clean up
    rm -f "$TEMP_DB"
else
    log_info "sqlite3 command not found. Skipping extension test."
    log_info "The extension should work with the Node.js better-sqlite3 driver."
fi

echo ""
log_success "Installation complete!"
