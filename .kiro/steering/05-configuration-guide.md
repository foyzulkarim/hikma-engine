---
inclusion: always
---

# Configuration Guide

## Environment Variables

The system supports the following environment variables:

```
# Database configuration
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging
HIKMA_LOG_LEVEL=info  # debug, info, warn, error
```

## Configuration System

The configuration system is managed through `src/config/index.ts` and supports:

- Environment variable overrides
- Default configurations
- Project-specific configurations
- Runtime configuration updates

## Database Configuration

- **SQLite with sqlite-vec**: Unified database for metadata, graph relationships, and vector embeddings
  - Configure database path and sqlite-vec extension path
  - Default database path: `./data/metadata.db`
  - Default extension path: `./extensions/vec0.dylib` (macOS) or `./extensions/vec0.so` (Linux)
  - Handles enhanced graph storage with nodes, edges, and vector embeddings in a single database

## Indexing Configuration

- **File Patterns**: Configure which files to include/exclude
  - Default: `['**/*.ts', '**/*.js', '**/*.py']`
  - Exclude patterns: `['**/node_modules/**', '**/dist/**']`

- **Size Limits**: Configure maximum file size for processing
  - Default: `1MB`

- **Incremental Settings**: Configure incremental indexing behavior
  - Track last indexed commit
  - Process only changed files

## AI Configuration

- **Embedding Models**: Configure vector embedding generation
  - Model: `'Xenova/all-MiniLM-L6-v2'`
  - Batch size: `32`
  - Vector dimensions: `384`

- **Summary Models**: Configure AI summary generation
  - Model: `'Xenova/distilbart-cnn-6-6'`
  - Max tokens: `150`
  - Temperature: `0.7`

## Logging Configuration

- **Log Levels**: `debug`, `info`, `warn`, `error`
- **Console Logging**: Enable/disable console output
- **File Logging**: Configure log file path and rotation
- **Format**: Configure log format and included metadata
