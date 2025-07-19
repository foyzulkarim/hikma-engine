---
inclusion: always
---

# Configuration Guide

## Environment Variables

The system supports the following environment variables:

```
# Database paths
HIKMA_LANCEDB_PATH=./data/lancedb
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_TINKERGRAPH_URL=ws://localhost:8182/gremlin

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

- **LanceDB**: Vector database for embeddings and semantic search
  - Configure path, collection names, and dimensions
  - Default path: `./data/lancedb`

- **SQLite**: Relational database for metadata and lookups
  - Configure path and table schemas
  - Default path: `./data/metadata.db`

- **TinkerGraph**: Graph database for relationship queries
  - Configure connection URL and authentication
  - Default URL: `ws://localhost:8182/gremlin`

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
