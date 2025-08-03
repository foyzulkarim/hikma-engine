# Hikma Engine

A TypeScript-based code knowledge graph indexer that transforms Git repositories into searchable knowledge stores for AI agents. Creates interconnected representations of codebases through AST parsing and vector embeddings.

## Features

- **Multi-language support**: TypeScript, JavaScript, Python, Java, Go, C/C++
- **AST-based code structure extraction**: Deep understanding of code relationships
- **Vector embeddings**: Semantic similarity search with multiple providers
- **Python ML integration**: Advanced embedding models via Python bridge
- **Unified CLI**: Single `hikma-engine` command for all operations
- **SQLite storage**: Unified storage with sqlite-vec extension

## Installation

### Prerequisites

- Node.js >= 22.0.0
- Git repository for indexing
- Python 3.10+ (for enhanced features)

### Clone and run the project

```bash
# Clone repository
git clone https://github.com/foyzulkarim/hikma-engine
cd hikma-engine

# Install dependencies
npm install
```
For enhanced embedding and RAG features, set up Python dependencies:

```bash
# After installing hikma-engine
npm run setup-python
```

## Scripts

When working within the hikma-engine repository:

```bash
# Index using npm script
npm run index

# Search using npm script
npm run search "your query"

# RAG search using npm script
npm run rag "your query"
```

## Directory Path Usage

### Using npm Scripts

When working within the hikma-engine repository, you can use npm scripts with directory paths:

```bash
# Index a specific directory
npm run index /path/to/your/project

# Search in a specific directory
npm run search "your query" /path/to/your/project

# RAG search in a specific directory
npm run rag "your query" /path/to/your/project
```

## Embedding Providers

Hikma Engine supports three embedding providers:

| Provider | Description | Use Case | Setup Required |
|----------|-------------|----------|----------------|
| `transformers` | JavaScript-based embeddings via @xenova/transformers | Production, simple setup | None (default) |
| `python` | Python-based embeddings with full ML ecosystem | Advanced models, better code understanding | Python + pip dependencies |
| `local` | LM Studio server for GUI-based model management | Development, experimentation | LM Studio running |


## License

MIT License - see LICENSE file for details.