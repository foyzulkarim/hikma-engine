# CLI Examples - Explicit Configuration

This document shows examples of using the Hikma Engine CLI commands with explicit configuration (no .env dependencies).

## Search Command

### Using Python Provider
```bash
npm run search -- "database configuration" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --limit 5
```

### Using Server Provider (LM Studio)
```bash
npm run search -- "database configuration" --provider server --server-url "http://localhost:1234" --embedding-model "text-embedding-mxbai-embed-large-v1" --limit 5
```

## RAG Command

### Using Python Provider
```bash
npm run rag -- "How is database configuration handled?" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --llm-model "Qwen/Qwen2.5-Coder-1.5B-Instruct" --top-k 3
```

### Using Server Provider (LM Studio)
```bash
npm run rag -- "How is database configuration handled?" --provider server --server-url "http://localhost:1234" --embedding-model "text-embedding-mxbai-embed-large-v1" --llm-model "openai/gpt-oss-20b" --top-k 3
```

## Embed Command

### Using Python Provider
```bash
npm run embed -- --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1" --force-full
```

### Using Server Provider (LM Studio)
```bash
npm run embed -- --provider server --server-url "http://localhost:1234" --embedding-model "text-embedding-mxbai-embed-large-v1" --force-full
```

## NPX Usage

With the explicit CLI approach, NPX commands are now clear and self-documenting:

```bash
# Search with Python provider
npx hikma-engine search "your query" --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"

# RAG with LM Studio
npx hikma-engine rag "your question" --provider server --server-url "http://localhost:1234" --embedding-model "text-embedding-mxbai-embed-large-v1" --llm-model "openai/gpt-oss-20b"

# Embed with Python provider
npx hikma-engine embed --provider python --embedding-model "mixedbread-ai/mxbai-embed-large-v1"
```

## Key Benefits

1. **Explicit**: All configuration is visible in the command
2. **No hidden state**: No dependency on .env files for CLI usage
3. **Scriptable**: Easy to use in scripts and CI/CD
4. **Self-documenting**: Commands show exactly what they're doing
5. **Flexible**: Easy to switch between different providers and models

## Required Options

- `--provider`: Always required (python|server|local|transformers)
- `--server-url`: Required when using `--provider server`
- Model options are optional (defaults will be used based on provider)