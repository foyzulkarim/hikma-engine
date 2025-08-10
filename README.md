# Hikma Engine

A TypeScript-based code knowledge graph indexer that transforms Git repositories into searchable knowledge stores for AI agents. Creates interconnected representations of codebases through AST parsing and vector embeddings.

## Features

- **AST-based code structure extraction**: Deep understanding of code relationships
- **Vector embeddings**: Semantic similarity search with multiple providers
- **Configurable LLM providers**: Support for local Python models, OpenAI API, and local services (LM Studio, Ollama)
- **Python ML integration**: Advanced embedding models via Python bridge
- **Intelligent fallback system**: Automatic fallback between providers for reliability
- **Comprehensive monitoring**: Request tracking, performance metrics, and error analysis
- **Unified CLI**: Single `hikma-engine` command for all operations (embed, search, rag)
- **SQLite storage**: Unified storage with sqlite-vec extension

## Installation

### Prerequisites

- Node.js >= 20.0.0
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
For python provider, set up Python dependencies:

```bash
# After installing hikma-engine
npm run setup-python
```

## CLI Usage

Hikma Engine provides three main commands: `embed`, `search`, and `rag` with an **explicit CLI approach** that requires no configuration files.

### Key Features
- **No .env dependencies**: All configuration is explicit via CLI flags
- **Required provider**: `--provider` is mandatory for all commands
- **NPX-friendly**: Works perfectly with `npx` without local installation
- **Self-documenting**: All options are visible and explicit
- **Scriptable**: Perfect for CI/CD and automation

### Quick Examples

#### Using Python Provider (Local Models)
```bash
# Embed with Python provider
npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"

# Search with Python provider
npm run search -- "database configuration" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"

# RAG with Python provider
npm run rag -- "How does authentication work?" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct"
```

#### Using Server Provider (Ollama/LM Studio)
```bash
# Embed with Ollama
npm run embed -- --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest

# Search with Ollama
npm run search -- "database configuration" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest

# RAG with Ollama
npm run rag -- "How does authentication work?" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --llm-model qwen2.5-coder:7b --max-tokens 3000
```

#### Using NPX (No Local Installation)
```bash
# Works anywhere without installing hikma-engine locally
npx hikma-engine embed --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --dir /path/to/project
npx hikma-engine search "authentication" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --dir /path/to/project
npx hikma-engine rag "How does this work?" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --llm-model qwen2.5-coder:7b --dir /path/to/project
```

### Required and Optional Flags

#### Required for All Commands
- `--provider <python|server|local|transformers>`: **REQUIRED** - Specifies the AI provider to use

#### Required for Server Provider
- `--server-url <url>`: **REQUIRED when using `--provider server`** - Base URL for OpenAI-compatible server

#### Common Optional Flags
- `--dir <path>`: Project directory (defaults to current directory)
- `--embedding-model <model>`: Override default embedding model
- `--llm-model <model>`: Override default LLM model (for `rag` command)
- `--install-python-deps`: Auto-install Python dependencies when using Python provider

#### Command-Specific Flags
- **embed**: `--force-full`, `--skip-embeddings`
- **search**: `--limit <n>`, `--min-similarity <0..1>`
- **rag**: `--top-k <n>`, `--max-tokens <n>`

### Intelligent Defaults

When you specify a provider, Hikma Engine automatically selects appropriate default models:

- **Python provider**: `mixedbread-ai/mxbai-embed-large-v1` (embedding), `Qwen/Qwen2.5-Coder-1.5B-Instruct` (LLM)
- **Server provider**: `text-embedding-ada-002` (embedding), `gpt-3.5-turbo` (LLM)
- **Local provider**: `Xenova/all-MiniLM-L6-v2` (embedding), `Xenova/gpt2` (LLM)
- **Transformers provider**: `Xenova/all-MiniLM-L6-v2` (embedding)

### Directory Handling

Each project gets its own SQLite database stored in the project directory. You can work with multiple projects simultaneously:

```bash
# Index project A
npm run embed -- --provider python --dir /path/to/project-a

# Index project B
npm run embed -- --provider python --dir /path/to/project-b

# Search in specific project
npm run search -- "authentication" --provider python --dir /path/to/project-a
```

## Configuration

### Explicit CLI Approach (Recommended)

Hikma Engine now uses an **explicit CLI approach** that requires no configuration files. All settings are specified directly via command-line flags:

```bash
# Everything is explicit - no hidden configuration
npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
npm run search -- "query" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
npm run rag -- "question" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --llm-model qwen2.5-coder:7b
```

**Benefits:**
- ✅ **No .env files needed** - Everything is explicit
- ✅ **NPX-friendly** - Works without local installation
- ✅ **Self-documenting** - All options are visible
- ✅ **Scriptable** - Perfect for CI/CD pipelines
- ✅ **No hidden state** - What you see is what you get

### Legacy Environment Variables (Optional)

For backward compatibility, you can still use environment variables by copying `.env.example` to `.env`. However, **CLI flags take precedence** over environment variables.

```bash
cp .env.example .env
```

#### Main Configuration
- `HIKMA_LOG_LEVEL`: Logging level (debug, info, warn, error). Default: `info`
- `HIKMA_SQLITE_PATH`: SQLite database path. Default: `./data/metadata.db`
- `HIKMA_SQLITE_VEC_EXTENSION`: sqlite-vec extension path. Default: `./extensions/vec0.dylib`

#### Legacy AI Configuration
These are only used when CLI flags are not provided:

**Embedding Configuration:**
- `HIKMA_EMBEDDING_PROVIDER`: Provider (`python`, `openai`). Default: `python`
- `HIKMA_EMBEDDING_MODEL`: Model for Python provider
- `HIKMA_EMBEDDING_OPENAI_API_URL`: Server URL for OpenAI-compatible APIs
- `HIKMA_EMBEDDING_OPENAI_API_KEY`: API key (optional for local services)
- `HIKMA_EMBEDDING_OPENAI_MODEL`: Model name for server provider

**LLM Configuration:**
- `HIKMA_ENGINE_LLM_PROVIDER`: Provider (`python`, `openai`). Default: `python`
- `HIKMA_ENGINE_LLM_PYTHON_MODEL`: Python model name
- `HIKMA_ENGINE_LLM_OPENAI_API_URL`: Server URL
- `HIKMA_ENGINE_LLM_OPENAI_API_KEY`: API key
- `HIKMA_ENGINE_LLM_OPENAI_MODEL`: Model name
- `HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS`: Max response tokens. Default: `400`
- `HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE`: Sampling temperature. Default: `0.6`

Example for Ollama:
```bash
HIKMA_EMBEDDING_PROVIDER=openai
HIKMA_EMBEDDING_OPENAI_API_URL=http://localhost:11434
HIKMA_EMBEDDING_OPENAI_MODEL=mxbai-embed-large:latest
```

Example for LM Studio embeddings:
```bash
HIKMA_EMBEDDING_PROVIDER=openai
HIKMA_EMBEDDING_OPENAI_API_URL=http://localhost:1234
HIKMA_EMBEDDING_OPENAI_MODEL=text-embedding-mxbai-embed-large-v1
```

#### RAG Configuration
- `HIKMA_RAG_MODEL`: The RAG model for code explanation. Default: `Qwen/Qwen2.5-Coder-1.5B-Instruct`.

### LLM Provider Configuration

- `HIKMA_ENGINE_LLM_PROVIDER`: The LLM provider for code explanations. Options: `python`, `openai`. Default: `python`.
- `HIKMA_ENGINE_LLM_TIMEOUT`: Request timeout in milliseconds. Default: `300000`.
- `HIKMA_ENGINE_LLM_RETRY_ATTEMPTS`: Number of retry attempts. Default: `3`.
- `HIKMA_ENGINE_LLM_RETRY_DELAY`: Delay between retries in milliseconds. Default: `1000`.

#### Python Provider
When `HIKMA_ENGINE_LLM_PROVIDER=python`:
- `HIKMA_ENGINE_LLM_PYTHON_MODEL`: The model to use. Default: `Qwen/Qwen2.5-Coder-1.5B-Instruct`.
- `HIKMA_ENGINE_LLM_PYTHON_MAX_RESULTS`: Max results for the model. Default: `8`.

#### OpenAI Provider
When `HIKMA_ENGINE_LLM_PROVIDER=openai` (for OpenAI API or other compatible services like LM Studio/Ollama; `server` in CLI):
- `HIKMA_ENGINE_LLM_OPENAI_API_URL`: The API endpoint.
- `HIKMA_ENGINE_LLM_OPENAI_API_KEY`: Your API key.
- `HIKMA_ENGINE_LLM_OPENAI_MODEL`: The model name.
- `HIKMA_ENGINE_LLM_OPENAI_MAX_TOKENS`: (Optional) Max tokens for the response. Default: `400`.
- `HIKMA_ENGINE_LLM_OPENAI_TEMPERATURE`: (Optional) Sampling temperature. Default: `0.6`.

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
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:1234 # For LM Studio (base URL; endpoint inferred)
# HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:11434 # For Ollama (base URL; endpoint inferred)
HIKMA_ENGINE_LLM_OPENAI_API_KEY=not-needed-for-local
HIKMA_ENGINE_LLM_OPENAI_MODEL=your-local-model
```

## Embedding Providers

Hikma Engine supports multiple embedding providers. The default is `python`, but server-based (OpenAI-compatible) is fully supported and recommended for npx/global usage.

| Provider | Description | Examples | Setup Required | Status |
|----------|-------------|----------|----------------|--------|
| `openai` (server) | OpenAI-compatible HTTP API for embeddings | Ollama (`http://localhost:11434`), LM Studio (`http://localhost:1234`) | Run server; optional API key | Supported |
| `python` | Python-based embeddings using local models | Hugging Face transformers via Python | Python 3.8+ and pip deps | Supported (default) |
| `transformers` | In-process JS embeddings via `@xenova/transformers` | Browser/Node, no server | None | Supported |

## LLM Providers

Hikma Engine supports multiple LLM providers for generating code explanations:

| Provider | Description | Use Case | Setup Required | Status |
|----------|-------------|----------|----------------|--------|
| `python` | Local Python-based LLM using transformers | Privacy, offline usage, no API costs | Python + pip dependencies | Supported (default) |
| `openai` | OpenAI API or compatible services | High-quality responses, cloud-based | API key required | Supported |

### Local Services Integration

You can use local AI services for both embeddings and LLM. Here are tested working configurations:

#### Explicit CLI Approach (Recommended)

**Using Ollama:**
```bash
# Start Ollama and pull models
ollama serve
ollama pull mxbai-embed-large:latest
ollama pull qwen2.5-coder:7b

# Use with explicit CLI flags
npm run embed -- --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
npm run search -- "query" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
npm run rag -- "question" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --llm-model qwen2.5-coder:7b
```

**Using LM Studio:**
```bash
# Start LM Studio on http://localhost:1234 and load models

# Use with explicit CLI flags
npm run embed -- --provider server --server-url http://localhost:1234 --embedding-model text-embedding-mxbai-embed-large-v1
npm run search -- "query" --provider server --server-url http://localhost:1234 --embedding-model text-embedding-mxbai-embed-large-v1
npm run rag -- "question" --provider server --server-url http://localhost:1234 --embedding-model text-embedding-mxbai-embed-large-v1 --llm-model openai/gpt-oss-20b
```

#### Legacy Environment Variables (Optional)

**Using LM Studio + Ollama:**
```bash
# .env configuration
HIKMA_EMBEDDING_PROVIDER=openai
HIKMA_EMBEDDING_OPENAI_API_URL=http://localhost:11434
HIKMA_EMBEDDING_OPENAI_MODEL=mxbai-embed-large:latest

HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:1234/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_API_KEY=not-needed-for-local
HIKMA_ENGINE_LLM_OPENAI_MODEL=openai/gpt-oss-20b
```

**Using Only Ollama:**
```bash
# .env configuration
HIKMA_EMBEDDING_PROVIDER=openai
HIKMA_EMBEDDING_OPENAI_API_URL=http://localhost:11434
HIKMA_EMBEDDING_OPENAI_MODEL=mxbai-embed-large:latest

HIKMA_ENGINE_LLM_PROVIDER=openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:11434/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_API_KEY=not-needed-for-local
HIKMA_ENGINE_LLM_OPENAI_MODEL=gpt-oss:20b
```

#### Model Requirements

**For Ollama:**
- Embedding models: `mxbai-embed-large:latest`
- LLM models: `gpt-oss:20b`, `qwen2.5-coder:7b`, or similar
- Install models: `ollama pull mxbai-embed-large:latest && ollama pull gpt-oss:20b`

**For LM Studio:**
- Embedding models: `text-embedding-mxbai-embed-large-v1`, `text-embedding-nomic-embed-text-v1.5`
- LLM models: `openai/gpt-oss-20b`, `qwen/qwen3-coder-30b`, or similar
- Load models through LM Studio interface

## Quick Start

### Option 1: NPX (No Installation Required)
```bash
# Index your codebase with Python provider
npx hikma-engine embed --provider python --dir /path/to/your/project

# Search for code
npx hikma-engine search "authentication logic" --provider python --dir /path/to/your/project

# Get AI explanations
npx hikma-engine rag "how does authentication work?" --provider python --dir /path/to/your/project
```

### Option 2: Local Installation
1. **Install and setup:**
   ```bash
   npm install
   npm run build          # Build the TypeScript code
   npm rebuild            # Rebuild native dependencies if needed
   npm run setup-python   # For Python-based features (optional)
   ```

2. **Index your codebase (explicit CLI - no .env needed):**
   ```bash
   # Using Python provider (local models)
   npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
   
   # OR using server provider (Ollama/LM Studio)
   npm run embed -- --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
   ```

3. **Search and get explanations:**
   ```bash
   # Search with explicit provider
   npm run search -- "authentication logic" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
   
   # RAG with explicit provider
   npm run rag -- "how does user authentication work?" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct"
   ```

### Important Notes

- **Build Required**: You must run `npm run build` after installation to compile TypeScript code
- **Native Dependencies**: If you encounter SQLite errors, run `npm rebuild` to recompile native modules
- **Provider Fallback**: The system automatically falls back between providers if one fails
- **Database Location**: The SQLite database is created in the `data/` directory (configurable with `--db-path`)
- **Explicit CLI**: The `--provider` flag is now required for all commands - no more hidden `.env` dependencies
- **Server Provider**: When using `--provider server`, you must also specify `--server-url`

### Testing Your Setup

To verify everything is working correctly with the explicit CLI approach:

```bash
# 1. Test embedding (indexing) with Python provider
npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
# Should show: "✅ Embedding completed successfully!"

# 2. Test search functionality
npm run search -- "CLI commands" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --limit 5
# Should return relevant code snippets with similarity scores

# 3. Test RAG (AI explanation)
npm run rag -- "How do the CLI commands work?" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct"
# Should provide an AI-generated explanation based on your code

# 4. Test with npx (global usage)
npx hikma-engine search "database" --provider python --dir . --limit 3
# Should work without local installation

# 5. Test server provider (if you have Ollama running)
npm run embed -- --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
npm run search -- "authentication" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest
```

**Expected Results:**
- Embedding: Creates database file in `data/` directory with indexed code
- Search: Returns table with Node ID, Type, File Path, Similarity %, and Source Text Preview
- RAG: Provides detailed AI explanation with code context
- All commands should complete without errors and show cleanup logs

## Troubleshooting

### Common Issues

**SQLite Module Version Error:**
```bash
# Error: The module was compiled against a different Node.js version
npm rebuild
```

**OpenAI API Key Error:**
```bash
# Error: Incorrect API key provided
# Solution 1: Use explicit CLI flags (recommended)
npm run rag -- "question" --provider openai --openai-api-key sk-your-actual-api-key --embedding-model text-embedding-3-small --llm-model gpt-4o-mini

# Solution 2: Update your .env file (legacy approach)
HIKMA_EMBEDDING_OPENAI_API_KEY=sk-your-actual-api-key
HIKMA_ENGINE_LLM_OPENAI_API_KEY=sk-your-actual-api-key
```

**Local Service Connection Error:**
```bash
# Check if Ollama is running and accessible
curl -s http://localhost:11434/api/tags
ollama list  # List available models

# If Ollama is not running:
ollama serve

# Test with explicit CLI flags:
npm run search -- "test" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest

# Check if LM Studio is running and accessible
curl -s http://localhost:1234/v1/models

# Test with explicit CLI flags:
npm run search -- "test" --provider server --server-url http://localhost:1234 --embedding-model text-embedding-mxbai-embed-large-v1

# Ensure LM Studio is running on port 1234 with a model loaded
```

**"No healthy providers available" Error:**
```bash
# This usually means the LLM service is not accessible or the model is not available

# Solution 1: Use explicit CLI flags to test (recommended)
# Test different providers:
npm run rag -- "test" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct"
npm run rag -- "test" --provider server --server-url http://localhost:11434 --embedding-model mxbai-embed-large:latest --llm-model qwen2.5-coder:7b

# Solution 2: Check your .env configuration (legacy approach):
# 1. Verify the API URL is correct
# 2. Ensure the model name matches exactly what's available
# 3. Test the service manually:
curl -s http://localhost:1234/v1/models  # For LM Studio
ollama list  # For Ollama

# 4. Try switching between services if one fails
```

**Model Runner Stopped Error (Ollama):**
```bash
# If you get "model runner has unexpectedly stopped"
# This usually indicates resource limitations or model issues

# Solution 1: Try explicit CLI with smaller model or different provider (recommended)
npm run rag -- "question" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct"
# Or switch to LM Studio:
npm run rag -- "question" --provider server --server-url http://localhost:1234 --embedding-model text-embedding-mxbai-embed-large-v1 --llm-model openai/gpt-oss-20b

# Solution 2: Update .env file (legacy approach)
HIKMA_ENGINE_LLM_OPENAI_API_URL=http://localhost:1234/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_MODEL=openai/gpt-oss-20b
```

**Python Dependencies Missing:**
```bash
# Install Python dependencies for local LLM/embedding
npm run setup-python
```

**CLI Command Not Found:**
```bash
# Build the project first
npm run build

# Then use with explicit provider flags
npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"

# Or use npx for global access (no installation required)
npx hikma-engine embed --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
npx hikma-engine search "query" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
```

## License

MIT License - see LICENSE file for details.
