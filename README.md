# Hikma Engine

A sophisticated TypeScript-based code knowledge graph indexer that transforms Git repositories into multi-dimensional knowledge stores for AI agents. Hikma Engine creates interconnected representations of codebases through AST parsing, Git analysis, AI-powered summarization, and vector embeddings.

## Features

- **Multi-language support**: TypeScript, JavaScript, Python, Java, Go, C/C++
- **AST-based code structure extraction**: Deep understanding of code relationships
- **Git integration**: Commit history analysis and incremental updates [*NOT DONE YET*]
- **Vector embeddings**: Semantic similarity search capabilities with multiple providers
- **Python ML integration**: Advanced embedding models via Python bridge
- **Unified CLI**: Single `hikma-engine` command for all operations
- **Polyglot persistence**: SQLite with sqlite-vec for unified storage
- **Incremental indexing**: Efficient updates based on Git changes

## Installation

```bash
npm install -g hikma-engine
```

### Prerequisites

- Node.js >= 22.0.0
- SQLite with sqlite-vec extension  
- Git repository for indexing
- Python 3.10+ (optional, for Python embedding provider)

### Environment Setup [Optional]

Create a `.env` file in your project root:

```bash
# Database configuration
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging
HIKMA_LOG_LEVEL=info

# Embedding provider (optional)
# HIKMA_EMBEDDING_PROVIDER=python  # Options: transformers, python, local
```

## Quick Start

```bash
# 1. Index your codebase
hikma-engine embed

# 2. Search for code patterns
hikma-engine search semantic "authentication logic"

# 3. Ask questions about your code
hikma-engine rag "How does error handling work?"
```

## CLI Commands

### Index Command

Index your codebase to create embeddings and knowledge graph:

```bash
# Basic indexing
hikma-engine embed
```

### Search Command

Search your indexed codebase:

```bash
# Semantic search
hikma-engine search semantic "database connection"

# Text search
hikma-engine search text "async function"
```

### Answer Command

Get AI-powered answers about your codebase:

```bash
# Ask questions
hikma-engine rag "How is authentication implemented?"
```

## Embedding Providers

Hikma Engine supports three embedding providers:

| Provider | Description | Use Case | Setup Required |
|----------|-------------|----------|----------------|
| `transformers` | JavaScript-based embeddings via @xenova/transformers | Production, simple setup | None (default) |
| `python` | Python-based embeddings with full ML ecosystem | Advanced models, better code understanding | Python + pip dependencies |
| `local` | LM Studio server for GUI-based model management | Development, experimentation | LM Studio running |

### Python Provider Setup

For better code understanding and RAG features, use the Python provider:

#### Automatic Setup (Recommended)

```bash
# Option 1: Use npm script (after installing hikma-engine)
npm run setup-python

# Option 2: Use CLI command
hikma --install-python-deps

# Option 3: Check dependencies and get setup instructions
hikma --check-python-deps
hikma --python-setup-help
```

#### Manual Setup

```bash
# Install Python dependencies manually
pip3 install transformers torch accelerate

# Configure provider (Optional)
export HIKMA_EMBEDDING_PROVIDER=python

# Verify setup
python3 -c "import transformers, torch; print('Dependencies OK')"
```

#### Using with CLI Commands

```bash
# Auto-install dependencies when using Python features
hikma search semantic "authentication logic" --rag --install-python-deps

# Check if Python environment is ready
hikma --check-python-deps
```

### Provider Switching

```bash
# Use transformers.js (default)
export HIKMA_EMBEDDING_PROVIDER=transformers
hikma-engine search semantic "query"

# Use Python
export HIKMA_EMBEDDING_PROVIDER=python
hikma-engine search semantic "query"
```


## Configuration

### Environment Variables

```bash
# Database configuration
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging
HIKMA_LOG_LEVEL=info  # debug, info, warn, error

# Embedding provider
HIKMA_EMBEDDING_PROVIDER=transformers  # transformers, python, local
```

### File Patterns

Default inclusion patterns:
- `**/*.ts`, `**/*.js`, `**/*.py`, `**/*.java`, `**/*.go`, `**/*.c`, `**/*.cpp`

Default exclusion patterns:
- `**/node_modules/**`, `**/dist/**`, `**/.git/**`

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check database path and permissions
ls -la ./data/metadata.db
```

**No Search Results**
```bash
# Check if indexing completed
hikma-engine search stats

# Lower similarity threshold
hikma-engine search semantic "query" --similarity 0.1
```

**Python Provider Issues**
```bash
# Check Python environment status
hikma --check-python-deps

# Get detailed setup instructions
hikma --python-setup-help

# Auto-install missing dependencies
hikma --install-python-deps

# Manual verification
python3 --version
python3 -c "import transformers, torch, accelerate; print('All dependencies OK')"

# Alternative setup using npm
npm run setup-python
```

### Debug Mode

```bash
export HIKMA_LOG_LEVEL=debug
hikma-engine index --dry-run
```

## Development

```bash
# Clone repository
git clone https://github.com/your-org/hikma-engine
cd hikma-engine

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## License

MIT License - see LICENSE file for details.