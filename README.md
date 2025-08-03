# Hikma Engine

A TypeScript-based code knowledge graph indexer that transforms Git repositories into searchable knowledge stores for AI agents. Creates interconnected representations of codebases through AST parsing and vector embeddings.

## Features

- **AST-based code structure extraction**: Deep understanding of code relationships
- **Vector embeddings**: Semantic similarity search with multiple providers
- **Python ML integration**: Advanced embedding models via Python bridge
- **Unified CLI**: Single `hikma-engine` command for all operations (Work in progress)
- **SQLite storage**: Unified storage with sqlite-vec extension

## Installation

### Prerequisites

- Node.js >= 22.0.0
- Git repository for indexing
- Python 3.10+

### Clone and run the project

```bash
# Clone repository
git clone https://github.com/foyzulkarim/hikma-engine
cd hikma-engine

# Install dependencies
npm install
```
For embedding and RAG features, set up Python dependencies:

```bash
# After installing hikma-engine
npm run setup-python
```

## Scripts

The easiest way to use Hikma Engine is through the npm scripts provided in the `package.json` file. When working within the hikma-engine repository:

```bash
# Index using npm script
npm run index

# Search using npm script
npm run search "your query"

# RAG search using npm script
npm run rag "your query"
```

### Directory Path Usage

We can index and perform RAG search on other Git repositories on the same machine by passing the directory path as an argument to the npm scripts.
The script will use the database generated in that directory, not the one in the hikma-engine repository. This ensures we don't mix data from different repositories into the same database.

```bash
# Index a specific directory
npm run index /path/to/your/project

# Search in a specific directory
npm run search "your query" /path/to/your/project

# RAG search in a specific directory
npm run rag "your query" /path/to/your/project
```

## Embedding Providers

*Note: 'python' is the default provider*

Hikma Engine supports three embedding providers:

| Provider | Description | Use Case | Setup Required | Status |
|----------|-------------|----------|----------------|--------|
| `transformers.js` | JavaScript-based embeddings via @xenova/transformers | Production, simple setup | None | Not supported yet |
| `python` | Python-based embeddings with full ML ecosystem | Advanced models, better code understanding | Python + pip dependencies | Supported (default) |
| `local` | LM Studio server for GUI-based model management | Development, experimentation | LM Studio running | Not supported yet |


## License

MIT License - see LICENSE file for details.