# Configuration Guide

## Overview

hikma-engine uses a centralized configuration system that supports both file-based configuration and environment variable overrides. This guide covers all available configuration options and how to customize them for your environment.

## Configuration Structure

The configuration is organized into four main sections:

1. **Database Configuration**: Settings for SQLite with vector extension support
2. **AI Configuration**: Settings for embedding and summary generation models
3. **Indexing Configuration**: File patterns, language support, and processing limits
4. **Logging Configuration**: Log levels, outputs, and file paths

## Default Configuration

The system comes with sensible defaults that work out of the box:

```typescript
const defaultConfig: AppConfig = {
  database: {
    sqlite: {
      path: './data/metadata.db',
      vectorExtension: './extensions/vec0.dylib'
    }
  },
  ai: {
    embedding: {
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 32
    },
    summary: {
      model: 'Xenova/distilbart-cnn-6-6',
      maxTokens: 512
    }
  },
  indexing: {
    filePatterns: [
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
      '**/*.py', '**/*.java', '**/*.go', '**/*.rs',
      '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
      '**/*.cs', '**/*.php', '**/*.rb', '**/*.swift',
      '**/*.kt', '**/*.scala', '**/*.clj', '**/*.sh'
    ],
    ignorePatterns: [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.min.js',
      '**/*.bundle.js'
    ],
    maxFileSize: 1024 * 1024, // 1MB
    supportedLanguages: [
      'typescript', 'javascript', 'python', 'java',
      'go', 'rust', 'c', 'cpp', 'csharp', 'php',
      'ruby', 'swift', 'kotlin', 'scala', 'clojure'
    ]
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false,
    logFilePath: './logs/hikma-engine.log'
  }
};
```

## Environment Variable Configuration

All configuration options can be overridden using environment variables. The system uses a hierarchical naming convention with `HIKMA_` prefix.

### Database Configuration

#### SQLite Database
```bash
# Path to SQLite database file
HIKMA_SQLITE_PATH=./data/custom-metadata.db
```

#### SQLite Vector Extension
```bash
# Path to sqlite-vec extension binary
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib  # macOS
# HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.so   # Linux
```

The sqlite-vec extension enables vector similarity search within SQLite, providing unified storage for both metadata and vector embeddings.

### AI Configuration

#### Embedding Model Settings
```bash
# Embedding model name (HuggingFace model identifier)
HIKMA_EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2

# Batch size for embedding generation (affects memory usage)
HIKMA_EMBEDDING_BATCH_SIZE=16
```

#### Summary Generation Settings
```bash
# Summary model name
HIKMA_SUMMARY_MODEL=facebook/bart-large-cnn

# Maximum tokens for generated summaries
HIKMA_SUMMARY_MAX_TOKENS=256
```

### Indexing Configuration

#### File Patterns
```bash
# Comma-separated list of file patterns to include
HIKMA_FILE_PATTERNS="**/*.ts,**/*.js,**/*.py,**/*.java"

# Comma-separated list of patterns to ignore
HIKMA_IGNORE_PATTERNS="node_modules/**,.git/**,dist/**"
```

#### Processing Limits
```bash
# Maximum file size to process (in bytes)
HIKMA_MAX_FILE_SIZE=2097152  # 2MB

# Comma-separated list of supported languages
HIKMA_SUPPORTED_LANGUAGES="typescript,javascript,python,java,go"
```

### Logging Configuration

```bash
# Log level: debug, info, warn, error
HIKMA_LOG_LEVEL=debug

# Enable console logging (true/false)
HIKMA_ENABLE_CONSOLE_LOG=true

# Enable file logging (true/false)
HIKMA_ENABLE_FILE_LOG=true

# Path to log file
HIKMA_LOG_FILE=./logs/debug.log
```

## Configuration Files

### Using .env Files

Create a `.env` file in your project root:

```env
# Database Configuration
HIKMA_SQLITE_PATH=./data/production.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.so

# AI Configuration
HIKMA_EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2
HIKMA_EMBEDDING_BATCH_SIZE=64
HIKMA_SUMMARY_MODEL=facebook/bart-large-cnn
HIKMA_SUMMARY_MAX_TOKENS=512

# Indexing Configuration
HIKMA_FILE_PATTERNS="**/*.ts,**/*.js,**/*.tsx,**/*.jsx"
HIKMA_IGNORE_PATTERNS="node_modules/**,.git/**,dist/**,coverage/**"
HIKMA_MAX_FILE_SIZE=5242880  # 5MB
HIKMA_SUPPORTED_LANGUAGES="typescript,javascript"

# Logging Configuration
HIKMA_LOG_LEVEL=info
HIKMA_ENABLE_CONSOLE_LOG=true
HIKMA_ENABLE_FILE_LOG=true
HIKMA_LOG_FILE=./logs/production.log
```

### Environment-Specific Configuration

#### Development Environment
```env
# .env.development
HIKMA_LOG_LEVEL=debug
HIKMA_ENABLE_CONSOLE_LOG=true
HIKMA_ENABLE_FILE_LOG=true
HIKMA_EMBEDDING_BATCH_SIZE=16  # Smaller batches for development
HIKMA_MAX_FILE_SIZE=1048576    # 1MB limit for faster processing
```

#### Production Environment
```env
# .env.production
HIKMA_LOG_LEVEL=warn
HIKMA_ENABLE_CONSOLE_LOG=false
HIKMA_ENABLE_FILE_LOG=true
HIKMA_LOG_FILE=/var/log/hikma-engine/production.log
HIKMA_EMBEDDING_BATCH_SIZE=128  # Larger batches for efficiency
HIKMA_MAX_FILE_SIZE=10485760    # 10MB limit
```

#### Testing Environment
```env
# .env.test
HIKMA_LOG_LEVEL=error
HIKMA_ENABLE_CONSOLE_LOG=false
HIKMA_ENABLE_FILE_LOG=false
HIKMA_SQLITE_PATH=:memory:      # In-memory database for tests
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib
```

## SQLite-vec Extension Setup

### Installation Instructions

The sqlite-vec extension is required for vector similarity search functionality. Follow these platform-specific instructions:

#### Automated Installation Script

Create an installation script for easy setup:

```bash
#!/bin/bash
# install-sqlite-vec.sh

set -e

EXTENSION_DIR="./extensions"
PLATFORM=$(uname -s)
ARCH=$(uname -m)

# Create extensions directory
mkdir -p "$EXTENSION_DIR"

# Determine the correct binary URL
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
                echo "Unsupported macOS architecture: $ARCH"
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
                echo "Unsupported Linux architecture: $ARCH"
                exit 1
                ;;
        esac
        ;;
    *)
        echo "Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

echo "Downloading sqlite-vec extension for $PLATFORM ($ARCH)..."
curl -L -o "$EXTENSION_DIR/$FILENAME" "$URL"

echo "Setting executable permissions..."
chmod +x "$EXTENSION_DIR/$FILENAME"

echo "sqlite-vec extension installed successfully at $EXTENSION_DIR/$FILENAME"
echo "Set environment variable: HIKMA_SQLITE_VEC_EXTENSION=$PWD/$EXTENSION_DIR/$FILENAME"
```

Run the installation script:
```bash
chmod +x install-sqlite-vec.sh
./install-sqlite-vec.sh
```

#### macOS (Apple Silicon)
```bash
# Download the extension binary
curl -L -o extensions/vec0.dylib https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-darwin-aarch64.dylib

# Set environment variable
export HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib
```

#### macOS (Intel)
```bash
# Download the extension binary
curl -L -o extensions/vec0.dylib https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-darwin-x86_64.dylib

# Set environment variable
export HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib
```

#### Linux (x86_64)
```bash
# Download the extension binary
curl -L -o extensions/vec0.so https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.0-deno-linux-x86_64.so

# Set environment variable
export HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.so
```

#### Docker Deployment
```dockerfile
# Add to your Dockerfile
RUN mkdir -p /app/extensions
COPY extensions/vec0.so /app/extensions/
ENV HIKMA_SQLITE_VEC_EXTENSION=/app/extensions/vec0.so
```

### Verification
```bash
# Test that the extension loads correctly
npm run test:integration
```

## Advanced Configuration

### Custom AI Models

#### Using Local Models
```bash
# For local ONNX models
HIKMA_EMBEDDING_MODEL=./models/custom-embedding-model
HIKMA_SUMMARY_MODEL=./models/custom-summary-model
```

#### Using Different Model Providers
```bash
# OpenAI-compatible models (requires additional setup)
HIKMA_EMBEDDING_MODEL=openai:text-embedding-ada-002
HIKMA_SUMMARY_MODEL=openai:gpt-3.5-turbo

# Anthropic models (requires additional setup)
HIKMA_SUMMARY_MODEL=anthropic:claude-3-haiku
```

### Database Clustering

#### Multiple SQLite Databases
```bash
# Shard databases by project or date
HIKMA_SQLITE_PATH=./data/metadata-{project}-{date}.db
```



### Performance Tuning

#### Memory Optimization
```bash
# Reduce memory usage for large repositories
HIKMA_EMBEDDING_BATCH_SIZE=8
HIKMA_MAX_FILE_SIZE=524288      # 512KB
HIKMA_PROCESSING_CONCURRENCY=2  # Limit parallel processing
```

#### Speed Optimization
```bash
# Increase throughput for powerful machines
HIKMA_EMBEDDING_BATCH_SIZE=256
HIKMA_MAX_FILE_SIZE=20971520    # 20MB
HIKMA_PROCESSING_CONCURRENCY=8  # More parallel processing
```

## Configuration Validation

The system validates configuration on startup and provides helpful error messages:

```typescript
// Example validation errors
ConfigurationError: Invalid log level 'verbose'. Must be one of: debug, info, warn, error
ConfigurationError: HIKMA_MAX_FILE_SIZE must be a positive number
ConfigurationError: HIKMA_SQLITE_PATH directory does not exist: /invalid/path
```

## Configuration Best Practices

### Security
- Never commit sensitive configuration to version control
- Use environment variables for production secrets
- Restrict file permissions on configuration files
- Use secure connections for remote databases

### Performance
- Adjust batch sizes based on available memory
- Set appropriate file size limits for your use case
- Configure logging levels appropriately for each environment
- Use local databases for development, remote for production

### Maintainability
- Document custom configuration changes
- Use consistent naming conventions
- Group related configuration options
- Validate configuration in CI/CD pipelines

## Troubleshooting Configuration

### Common Issues

#### Database Connection Failures
```bash
# Check database paths exist
ls -la ./data/

# Verify permissions
chmod 755 ./data/
chmod 644 ./data/*.db
```

#### AI Model Loading Issues
```bash
# Check model cache
ls -la ~/.cache/huggingface/

# Clear model cache if corrupted
rm -rf ~/.cache/huggingface/transformers/
```

#### File Pattern Issues
```bash
# Test file patterns
node -e "console.log(require('glob').sync('**/*.ts', {ignore: 'node_modules/**'}))"
```

### Debug Configuration
Enable debug logging to troubleshoot configuration issues:

```bash
HIKMA_LOG_LEVEL=debug npm start
```

### Configuration Validation Tool
Create a simple validation script:

```typescript
// validate-config.ts
import { initializeConfig } from './src/config';

try {
  const config = initializeConfig(process.cwd());
  console.log('Configuration is valid');
  console.log(JSON.stringify(config.getAll(), null, 2));
} catch (error) {
  console.error('Configuration error:', error.message);
  process.exit(1);
}
```

## Migration Guide

### Upgrading Configuration

When upgrading hikma-engine versions, configuration may need updates:

#### Version 1.0 to 1.1
```bash
# New configuration options added
HIKMA_ENABLE_INCREMENTAL_INDEXING=true
HIKMA_CACHE_EMBEDDINGS=true
```

#### Version 1.1 to 1.2
```bash
# Configuration option renamed
# OLD: HIKMA_EMBEDDING_MODEL_NAME
# NEW: HIKMA_EMBEDDING_MODEL
```

### Backup Configuration
Always backup your configuration before upgrades:

```bash
# Backup environment variables
env | grep HIKMA_ > hikma-config-backup.env

# Backup configuration files
cp .env .env.backup
```

## Examples

### Minimal Configuration
For simple projects with basic requirements:

```env
HIKMA_LOG_LEVEL=info
HIKMA_FILE_PATTERNS="**/*.js,**/*.ts"
HIKMA_IGNORE_PATTERNS="node_modules/**"
```

### High-Performance Configuration
For large codebases with powerful hardware:

```env
HIKMA_EMBEDDING_BATCH_SIZE=512
HIKMA_MAX_FILE_SIZE=52428800  # 50MB
HIKMA_PROCESSING_CONCURRENCY=16
HIKMA_LOG_LEVEL=warn
```

### Development Configuration
For local development with detailed debugging:

```env
HIKMA_LOG_LEVEL=debug
HIKMA_ENABLE_CONSOLE_LOG=true
HIKMA_ENABLE_FILE_LOG=true
HIKMA_LOG_FILE=./debug.log
HIKMA_EMBEDDING_BATCH_SIZE=8  # Small batches for quick iteration
```

This configuration guide provides comprehensive coverage of all available options and should help users customize hikma-engine for their specific needs and environments.
