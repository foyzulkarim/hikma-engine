# Hikma Engine

A TypeScript-based code knowledge graph indexer that transforms Git repositories into searchable knowledge stores for AI agents. Creates interconnected representations of codebases through AST parsing and vector embeddings.

## Features

- **AST-based code structure extraction**: Deep understanding of code relationships
- **Vector embeddings**: Semantic similarity search with multiple providers
- **Configurable LLM providers**: Support for local Python models, OpenAI API, and local services (LM Studio, Ollama)
- **Python ML integration**: Advanced embedding models via Python bridge
- **Intelligent fallback system**: Automatic fallback between providers for reliability
- **Comprehensive monitoring**: Request tracking, performance metrics, and error analysis
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

## Configuration

Hikma Engine uses environment variables for configuration. Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

### Main Configuration

-   `HIKMA_LOG_LEVEL`: Logging level for CLI operations (debug, info, warn, error). Default: `info`.
-   `HIKMA_SQLITE_PATH`: Path to the SQLite database file. Default: `./data/metadata.db`.
-   `HIKMA_SQLITE_VEC_EXTENSION`: Path to the `sqlite-vec` extension. Default: `./extensions/vec0.dylib`.

### AI Model Configuration

#### Embedding Configuration
-   `HIKMA_EMBEDDING_PROVIDER`: The embedding provider to use. Options: `python`, `openai`. Default: `python`.
-   `HIKMA_EMBEDDING_MODEL`: The model to use for embeddings when `HIKMA_EMBEDDING_PROVIDER` is `python`. Default: `mixedbread-ai/mxbai-embed-large-v1`.

When using `HIKMA_EMBEDDING_PROVIDER=openai` (for services like Ollama):
-   `HIKMA_EMBEDDING_OPENAI_API_URL`: Base URL for the OpenAI-compatible API. The engine will call `/v1/embeddings`.
-   `HIKMA_EMBEDDING_OPENAI_API_KEY`: Optional API key.
-   `HIKMA_EMBEDDING_OPENAI_MODEL`: The model name to use with the API.

Example for Ollama:
```bash
HIKMA_EMBEDDING_PROVIDER=openai
HIKMA_EMBEDDING_OPENAI_API_URL=http://localhost:11434
HIKMA_EMBEDDING_OPENAI_MODEL=mxbai-embed-large:latest
```

#### RAG Configuration
-   `HIKMA_RAG_MODEL`: The RAG model for code explanation. Default: `Qwen/Qwen2.5-Coder-1.5B-Instruct`.

### LLM Provider Configuration

-   `HIKMA_ENGINE_LLM_PROVIDER`: The LLM provider for code explanations. Options: `python`, `openai`. Default: `python`.
-   `HIKMA_ENGINE_LLM_TIMEOUT`: Request timeout in milliseconds. Default: `300000`.
-   `HIKMA_ENGINE_LLM_RETRY_ATTEMPTS`: Number of retry attempts. Default: `3`.
-   `HIKMA_ENGINE_LLM_RETRY_DELAY`: Delay between retries in milliseconds. Default: `1000`.

#### Python Provider
When `HIKMA_ENGINE_LLM_PROVIDER=python`:
-   `HIKMA_ENGINE_LLM_PYTHON_MODEL`: The model to use. Default: `Qwen/Qwen2.5-Coder-1.5B-Instruct`.
-   `HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS`: Max results for the model. Default: `8`.

#### OpenAI Provider
When `HIKMA_ENGINE_LLM_PROVIDER=openai` (for OpenAI API or other compatible services like LM Studio/Ollama):
-   `HIKMA_ENGINE_LLM_OPENAI_API_URL`: The API endpoint.
-   `HIKMA_ENGINE_LLM_OPENAI_API_KEY`: Your API key.
-   `HIKMA_ENGINE_LLM_OPENAI_MODEL`: The model name.
-   `HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS`: (Optional) Max tokens for the response. Default: `400`.
-   `HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE`: (Optional) Sampling temperature. Default: `0.6`.

Example for OpenAI API:
```bash
HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=https://api.openai.com/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_API_KEY=sk-your-openai-api-key-here
HIKMA_ENGINE_LLM_OPENAI_MODEL=gpt-4
```

Example for local services (LM Studio, Ollama):
```bash
HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:1234/v1/chat/completions # For LM Studio
# HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:11434/v1/chat/completions # For Ollama
HIKMA_ENGINE_LLM_OPENAI_API_KEY=not-needed-for-local
HIKMA_ENGINE_LLM_OPENAI_MODEL=your-local-model
```

## Embedding Providers

*Note: 'python' is the default provider*

Hikma Engine supports three embedding providers:

| Provider | Description | Use Case | Setup Required | Status |
|----------|-------------|----------|----------------|--------|
| `transformers.js` | JavaScript-based embeddings via @xenova/transformers | Production, simple setup | None | Not supported yet |
| `python` | Python-based embeddings with full ML ecosystem | Advanced models, better code understanding | Python + pip dependencies | Supported (default) |
| `local` | LM Studio server for GUI-based model management | Development, experimentation | LM Studio running | Not supported yet |

## LLM Providers

Hikma Engine supports multiple LLM providers for generating code explanations:

| Provider | Description | Use Case | Setup Required | Status |
|----------|-------------|----------|----------------|--------|
| `python` | Local Python-based LLM using transformers | Privacy, offline usage, no API costs | Python + pip dependencies | Supported (default) |
| `openai` | OpenAI API or compatible services | High-quality responses, cloud-based | API key required | Supported |

### Local Services Integration

You can use local AI services for both embeddings and LLM:

#### Using LM Studio + Ollama
```bash
# Start LM Studio on http://localhost:1234
# Start Ollama on http://localhost:11434

# Embeddings: use the Embedding Provider Configuration above

HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:1234/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_API_KEY=lm-studio-local
HIKMA_ENGINE_LLM_OPENAI_MODEL=your-model-name
```

#### Using Only Ollama
```bash
# Embeddings: use the Embedding Provider Configuration above (Ollama base URL)

HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:11434/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_MODEL=qwen2.5-coder:7b
```

## Quick Start

1. **Install and setup:**
   ```bash
   npm install
   npm run setup-python  # For Python-based features
   ```

2. **Configure your providers** (copy `.env.example` to `.env` and modify)

3. **Index your codebase:**
   ```bash
   npm run index
   ```

4. **Search and get explanations:**
   ```bash
   npm run search "authentication logic"
   npm run rag "how does user authentication work?"
   ```

## License

MIT License - see LICENSE file for details.
