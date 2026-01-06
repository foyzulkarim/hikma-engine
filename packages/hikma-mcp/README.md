# hikma-mcp

> MCP server for code intelligence - semantic search for your codebase

hikma-mcp exposes [hikma-engine](https://github.com/foyzulkarim/hikma-engine)'s code intelligence capabilities to AI CLIs via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Features

- **Semantic Search** - Find code by meaning, not just keywords
- **File Summaries** - Quick understanding of what a file does
- **Symbol Lookup** - Find where functions and classes are defined and used
- **Local Embeddings** - Uses `@xenova/transformers` for zero-config local embeddings
- **Works Offline** - No API keys required for core functionality

## Supported AI CLIs

- Claude Code
- Cursor
- Continue.dev
- Windsurf
- Any MCP-compatible AI assistant

## Quick Start

### 1. Install

```bash
npm install -g hikma-mcp
```

### 2. Initialize your project

```bash
cd your-project
hikma-mcp init
```

This creates a `.hikma/` directory with the code index.

### 3. Add to your AI CLI

**Claude Code** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "hikma": {
      "command": "hikma-mcp",
      "args": ["serve", "--project", "/path/to/your-project"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "hikma": {
      "command": "hikma-mcp",
      "args": ["serve"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### 4. Restart your AI CLI and start asking questions

```
User: "Where is user authentication handled?"
AI: [Uses semantic_search tool]
    Found in src/auth/session.ts:42-78...
```

## CLI Commands

### `hikma-mcp init`

Initialize the code index for a project.

```bash
hikma-mcp init [options]

Options:
  -d, --dir <path>     Project directory (default: current)
  -f, --force          Force re-index even if index exists
  --exclude <patterns> Additional glob patterns to exclude
  -v, --verbose        Show detailed output
```

### `hikma-mcp serve`

Start the MCP server.

```bash
hikma-mcp serve [options]

Options:
  -p, --project <path>  Project directory (default: current)
  -v, --verbose         Enable debug logging
```

### `hikma-mcp status`

Show index status.

```bash
hikma-mcp status [options]

Options:
  -d, --dir <path>  Project directory (default: current)
  --detailed        Show detailed information
```

## MCP Tools

### `semantic_search`

Search the codebase using natural language.

**Input:**
- `query` (required): Natural language query or code pattern
- `language`: Filter by programming language
- `file_pattern`: Glob pattern to filter files
- `limit`: Maximum results (default: 10)
- `min_similarity`: Similarity threshold 0-1 (default: 0.3)

**Example:**
```
"Where is the database connection configured?"
"Functions that handle HTTP requests"
"Error handling in the payment module"
```

### `get_file_summary`

Get a summary of what a file does.

**Input:**
- `file_path` (required): Path to the file
- `include_symbols`: Include functions/classes (default: true)
- `include_imports`: Include import info (default: true)

### `find_symbol`

Find where a symbol is defined and used.

**Input:**
- `symbol_name` (required): Name of the function/class/variable
- `symbol_type`: Filter by type (function, class, interface, variable, any)
- `include_usages`: Include usage locations (default: true)

## How It Works

1. **Indexing**: `hikma-mcp init` runs hikma-engine to:
   - Parse your codebase using AST analysis
   - Extract functions, classes, and their relationships
   - Generate vector embeddings for semantic search
   - Store everything in a local SQLite database

2. **Serving**: `hikma-mcp serve` starts an MCP server that:
   - Listens for tool calls from AI CLIs
   - Queries the local index
   - Returns structured results

3. **Searching**: When you ask a question:
   - Your query is converted to a vector embedding
   - Similar code is found using cosine similarity
   - Results are formatted and returned to your AI

## Supported Languages

- TypeScript / JavaScript
- Python
- Java
- Go
- Rust
- C / C++
- And more (via tree-sitter)

## Requirements

- Node.js 18+
- ~200MB disk space for embedding model (downloaded on first use)

## Privacy

- All processing happens locally
- No data is sent to external servers
- Your code never leaves your machine

## Troubleshooting

### "No index found"

Run `hikma-mcp init` in your project directory first.

### "Vector search disabled"

The sqlite-vec extension couldn't be loaded. Search will fall back to text matching.
This doesn't affect functionality, just search quality.

### Slow first search

The embedding model is loaded on first search. Subsequent searches are fast.

## Development

```bash
# Clone the repo
git clone https://github.com/foyzulkarim/hikma-engine.git
cd hikma-engine/packages/hikma-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/cli/index.js --help
```

## License

MIT

## Related

- [hikma-engine](https://github.com/foyzulkarim/hikma-engine) - The underlying code intelligence engine
- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [MCP Servers](https://github.com/modelcontextprotocol/servers) - Official MCP server examples
