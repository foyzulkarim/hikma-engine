# hikma-mcp: Implementation Plan

> **Universal Code Intelligence MCP Server**
> One command. Any AI CLI. Deep codebase understanding.

---

## Executive Summary

This document outlines the implementation plan for `hikma-mcp`, an MCP (Model Context Protocol) server that exposes hikma-engine's code intelligence capabilities to AI CLIs like Claude Code, Cursor, Continue.dev, Windsurf, and others.

**Goals:**
1. Maximum reach through MCP standard adoption
2. Zero-config installation experience
3. High-quality, actionable code intelligence

**Timeline:** 3 Phases (Core → Relationships → Deep Understanding)

---

## Research Summary

### MCP Protocol Key Findings

| Aspect | Details |
|--------|---------|
| **Transport** | JSON-RPC 2.0 over stdio (recommended for CLI tools) |
| **SDK** | `@modelcontextprotocol/sdk` (official TypeScript SDK) |
| **Schema** | Zod for input validation, JSON Schema for tool definitions |
| **Output** | `content` (text) + `structuredContent` (machine-readable) |

### Existing Code Search MCP Servers

| Project | Approach | Gap hikma-mcp Fills |
|---------|----------|---------------------|
| **Code-Index-MCP (ViperJuice)** | Tree-sitter + BM25 + optional Voyage AI | No AST-level relationships, external embedding dependency |
| **Code-Index-MCP (trondhindenes)** | Zoekt trigram indexing | Keyword-only, no semantic search |
| **Seroost MCP** | TF-IDF ranking | No embeddings, no code structure awareness |
| **GitHub MCP** | GitHub API wrapper | Cloud-only, no local semantic search |

**hikma-engine's differentiators:**
- AST-based code graph (function calls, imports, class hierarchies)
- Local vector embeddings (no API keys required)
- Git-aware incremental indexing
- RAG pipeline for explanations

### MCP Best Practices Applied

1. **Tool naming**: snake_case, descriptive (`semantic_search`, not `search`)
2. **Input schemas**: Zod with constraints, defaults, and descriptions
3. **Output format**: Text summary + structured JSON
4. **Error handling**: Agent-friendly messages with recovery hints
5. **Security**: Path validation, no arbitrary code execution

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI CLI (Claude Code, Cursor, etc.)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP Protocol (stdio / JSON-RPC)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        hikma-mcp server                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     MCP Tool Layer                         │ │
│  │  Phase 1: semantic_search, get_file_summary, find_symbol  │ │
│  │  Phase 2: find_callers, find_dependencies, find_related   │ │
│  │  Phase 3: explain_module, get_architecture                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                │                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Core Service Layer                       │ │
│  │  IndexManager | SearchService | GraphService | RAGService │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                │                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                 hikma-engine bridge                        │ │
│  │  (imports existing modules from hikma-engine)             │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Storage Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ .hikma/index.db │  │ .hikma/vectors  │  │ .hikma/config   │ │
│  │   (SQLite)      │  │   (embeddings)  │  │   (settings)    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
hikma-mcp/                        # New package (can be separate repo or monorepo)
├── src/
│   ├── index.ts                  # Main entry point
│   ├── server.ts                 # MCP server setup
│   │
│   ├── tools/                    # MCP tool implementations
│   │   ├── index.ts              # Tool registry
│   │   │
│   │   ├── phase1/               # Core tools
│   │   │   ├── semantic-search.ts
│   │   │   ├── get-file-summary.ts
│   │   │   └── find-symbol.ts
│   │   │
│   │   ├── phase2/               # Relationship tools
│   │   │   ├── find-callers.ts
│   │   │   ├── find-dependencies.ts
│   │   │   └── find-related.ts
│   │   │
│   │   └── phase3/               # Deep understanding tools
│   │       ├── explain-module.ts
│   │       └── get-architecture.ts
│   │
│   ├── services/                 # Business logic
│   │   ├── index-manager.ts      # Manages index lifecycle
│   │   ├── search-service.ts     # Vector + keyword search
│   │   ├── graph-service.ts      # Code relationships
│   │   └── rag-service.ts        # LLM explanations (optional)
│   │
│   ├── bridge/                   # hikma-engine integration
│   │   ├── engine.ts             # Engine wrapper
│   │   ├── embeddings.ts         # Embedding service adapter
│   │   └── database.ts           # SQLite adapter
│   │
│   ├── cli/                      # CLI commands
│   │   ├── index.ts              # CLI entry
│   │   ├── init.ts               # Initialize project index
│   │   ├── serve.ts              # Start MCP server
│   │   ├── update.ts             # Update index
│   │   └── status.ts             # Check index status
│   │
│   ├── schemas/                  # Zod schemas
│   │   ├── tools.ts              # Tool input/output schemas
│   │   └── config.ts             # Configuration schema
│   │
│   └── utils/
│       ├── paths.ts              # Path validation & resolution
│       ├── errors.ts             # Error types & messages
│       └── logger.ts             # Logging utility
│
├── package.json
├── tsconfig.json
├── README.md                     # Getting started guide
└── CLAUDE.md                     # Claude Code specific instructions
```

---

## Phase 1: Core Value

**Goal:** Ship a working MCP server with 3 essential tools that provide immediate value.

### Tools

#### 1. `semantic_search`

**Purpose:** Find code by meaning, not just keywords.

```typescript
// Input Schema
{
  query: z.string()
    .min(1)
    .max(500)
    .describe("Natural language query or code pattern to search for"),

  language: z.string()
    .optional()
    .describe("Filter by programming language (e.g., 'typescript', 'python')"),

  file_pattern: z.string()
    .optional()
    .describe("Glob pattern to filter files (e.g., 'src/**/*.ts')"),

  limit: z.number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results to return"),

  min_similarity: z.number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe("Minimum similarity threshold (0-1)")
}

// Output Schema
{
  results: z.array(z.object({
    file_path: z.string(),
    line_start: z.number(),
    line_end: z.number(),
    node_type: z.enum(["function", "class", "method", "file", "variable"]),
    name: z.string(),
    preview: z.string().describe("Code snippet"),
    similarity: z.number(),
    summary: z.string().optional().describe("AI-generated summary if available")
  })),

  total_matches: z.number(),
  search_time_ms: z.number()
}
```

**Example Usage:**
```
User: "Where is user authentication handled?"
Claude: [calls semantic_search with query="user authentication"]

Result:
Found 5 matches in 234ms:

1. src/auth/session.ts:42-78 (function: validateSession)
   Similarity: 0.89
   "Validates user session token and returns user object..."

2. src/middleware/auth.ts:15-45 (function: authMiddleware)
   Similarity: 0.84
   "Express middleware that checks authentication header..."
```

---

#### 2. `get_file_summary`

**Purpose:** Get a quick understanding of what a file does.

```typescript
// Input Schema
{
  file_path: z.string()
    .describe("Path to the file (relative to project root)"),

  include_symbols: z.boolean()
    .default(true)
    .describe("Include list of functions, classes, exports"),

  include_imports: z.boolean()
    .default(true)
    .describe("Include import/dependency information")
}

// Output Schema
{
  file_path: z.string(),
  language: z.string(),
  summary: z.string().describe("AI-generated description of file purpose"),

  symbols: z.array(z.object({
    name: z.string(),
    type: z.enum(["function", "class", "interface", "variable", "type"]),
    line: z.number(),
    exported: z.boolean()
  })).optional(),

  imports: z.array(z.object({
    module: z.string(),
    symbols: z.array(z.string())
  })).optional(),

  exports: z.array(z.string()).optional(),

  metrics: z.object({
    lines: z.number(),
    functions: z.number(),
    classes: z.number()
  })
}
```

**Example Usage:**
```
User: "What does src/core/PhaseManager.ts do?"
Claude: [calls get_file_summary with file_path="src/core/PhaseManager.ts"]

Result:
## src/core/PhaseManager.ts (TypeScript)

**Summary:** Orchestrates the 4-phase indexing pipeline for code analysis.
Manages phase execution, caching, and progress reporting.

**Symbols (8):**
- class PhaseManager (exported) - line 25
- function executePhase - line 89
- function checkCache - line 142
...

**Imports:**
- ./indexing/FileDiscovery: FileDiscovery
- ./indexing/AstExtractor: AstExtractor
...

**Metrics:** 312 lines, 6 functions, 1 class
```

---

#### 3. `find_symbol`

**Purpose:** Find where a symbol is defined and used.

```typescript
// Input Schema
{
  symbol_name: z.string()
    .min(1)
    .describe("Name of the function, class, or variable to find"),

  symbol_type: z.enum(["function", "class", "interface", "variable", "any"])
    .default("any")
    .describe("Type of symbol to search for"),

  include_usages: z.boolean()
    .default(true)
    .describe("Include locations where symbol is used")
}

// Output Schema
{
  definitions: z.array(z.object({
    file_path: z.string(),
    line: z.number(),
    column: z.number(),
    type: z.string(),
    signature: z.string().optional(),
    docstring: z.string().optional()
  })),

  usages: z.array(z.object({
    file_path: z.string(),
    line: z.number(),
    context: z.string().describe("Line of code containing usage")
  })).optional(),

  total_usages: z.number()
}
```

---

### CLI Commands (Phase 1)

#### `hikma-mcp init`

```bash
hikma-mcp init [options]

Options:
  --dir <path>          Project directory (default: current)
  --watch               Enable file watching for auto-updates
  --exclude <patterns>  Additional patterns to exclude
  --verbose             Show detailed progress

Example:
  cd my-project
  hikma-mcp init
  # Creates .hikma/ folder with index
```

**Behavior:**
1. Detect project root (look for .git, package.json, etc.)
2. Scan for source files
3. Run hikma-engine indexing pipeline:
   - Phase 1: File discovery
   - Phase 2: AST extraction
   - Phase 3: Summary generation (optional, can be skipped)
   - Phase 4: Vector embeddings
4. Store index in `.hikma/` folder
5. Add `.hikma/` to `.gitignore` if not present

---

#### `hikma-mcp serve`

```bash
hikma-mcp serve [options]

Options:
  --project <path>      Project directory (default: current)
  --port <number>       Port for HTTP transport (optional)
  --verbose             Enable debug logging

Example:
  hikma-mcp serve --project /path/to/my-project
```

**Behavior:**
1. Load index from `.hikma/` folder
2. Initialize MCP server with stdio transport
3. Register tools
4. Wait for client connections

---

### Integration Configuration

**Claude Code (`~/.claude.json` or project's `.claude/settings.json`):**

```json
{
  "mcpServers": {
    "hikma": {
      "command": "hikma-mcp",
      "args": ["serve", "--project", "."],
      "env": {}
    }
  }
}
```

**Cursor (`.cursor/mcp.json`):**

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

**Continue.dev (`~/.continue/config.json`):**

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "hikma-mcp",
          "args": ["serve", "--project", "${workspaceFolder}"]
        }
      }
    ]
  }
}
```

---

### Technical Decisions (Phase 1)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Embedding Provider** | `@xenova/transformers` (default) | Zero external dependencies, works offline |
| **Embedding Model** | `all-MiniLM-L6-v2` | Good quality, small size (~23MB), fast |
| **Transport** | stdio (primary) | No port conflicts, works everywhere |
| **Index Location** | `.hikma/` in project root | Clear ownership, portable, git-ignorable |
| **Database** | SQLite (from hikma-engine) | Already implemented, ACID, portable |

---

## Phase 2: Relationship Intelligence

**Goal:** Expose code relationships from the AST graph.

### Tools

#### 4. `find_callers`

**Purpose:** Find what calls a given function.

```typescript
// Input Schema
{
  function_name: z.string()
    .describe("Name of the function to find callers for"),

  file_path: z.string()
    .optional()
    .describe("Narrow search to specific file"),

  depth: z.number()
    .min(1)
    .max(5)
    .default(1)
    .describe("How many levels up the call chain to traverse")
}

// Output Schema
{
  function: z.object({
    name: z.string(),
    file_path: z.string(),
    line: z.number()
  }),

  callers: z.array(z.object({
    name: z.string(),
    file_path: z.string(),
    line: z.number(),
    call_site_line: z.number(),
    depth: z.number()
  })),

  total_callers: z.number()
}
```

**Example Usage:**
```
User: "What calls the validateToken function?"
Claude: [calls find_callers with function_name="validateToken"]

Result:
validateToken (src/auth/token.ts:25) is called by:

Direct callers (depth 1):
  1. authMiddleware (src/middleware/auth.ts:32)
  2. refreshSession (src/auth/session.ts:78)
  3. verifyUser (src/auth/verify.ts:15)

Indirect callers (depth 2):
  4. handleRequest (src/api/handler.ts:45) → authMiddleware
  5. loginUser (src/auth/login.ts:23) → refreshSession
```

---

#### 5. `find_dependencies`

**Purpose:** Show what a file/module depends on.

```typescript
// Input Schema
{
  file_path: z.string()
    .describe("Path to the file to analyze"),

  direction: z.enum(["imports", "imported_by", "both"])
    .default("both")
    .describe("Direction of dependencies to find"),

  depth: z.number()
    .min(1)
    .max(3)
    .default(1)
    .describe("Levels of transitive dependencies")
}

// Output Schema
{
  file_path: z.string(),

  imports: z.array(z.object({
    module: z.string(),
    file_path: z.string().optional(),
    symbols: z.array(z.string()),
    is_external: z.boolean()
  })).optional(),

  imported_by: z.array(z.object({
    file_path: z.string(),
    symbols: z.array(z.string())
  })).optional(),

  dependency_graph: z.object({
    nodes: z.number(),
    edges: z.number()
  })
}
```

---

#### 6. `find_related`

**Purpose:** Find code that's related to a given location.

```typescript
// Input Schema
{
  file_path: z.string()
    .describe("Starting file"),

  line: z.number()
    .optional()
    .describe("Specific line number (finds related to symbol at line)"),

  relationship_types: z.array(z.enum([
    "calls", "called_by", "imports", "imported_by",
    "same_module", "similar_code", "tests"
  ]))
    .default(["calls", "called_by", "similar_code"])
    .describe("Types of relationships to find"),

  limit: z.number()
    .default(10)
}

// Output Schema
{
  source: z.object({
    file_path: z.string(),
    symbol: z.string().optional(),
    line: z.number().optional()
  }),

  related: z.array(z.object({
    file_path: z.string(),
    line: z.number(),
    symbol: z.string().optional(),
    relationship: z.string(),
    relevance: z.number()
  }))
}
```

---

### CLI Commands (Phase 2)

#### `hikma-mcp update`

```bash
hikma-mcp update [options]

Options:
  --dir <path>          Project directory
  --full                Force full re-index (ignore incremental)
  --files <patterns>    Only update specific files

Example:
  hikma-mcp update
  hikma-mcp update --files "src/auth/**/*.ts"
```

---

#### `hikma-mcp status`

```bash
hikma-mcp status [options]

Options:
  --dir <path>          Project directory
  --detailed            Show per-file information

Example:
  hikma-mcp status

Output:
  Index Status: Ready
  Last Updated: 2025-01-06 10:30:00
  Files Indexed: 234
  Symbols: 1,892
  Embeddings: 1,892
  Database Size: 45.2 MB
```

---

## Phase 3: Deep Understanding

**Goal:** RAG-powered explanations and architecture overview.

### Tools

#### 7. `explain_module`

**Purpose:** Get an AI-generated explanation of how code works.

```typescript
// Input Schema
{
  query: z.string()
    .describe("Question about the codebase (e.g., 'How does authentication work?')"),

  scope: z.string()
    .optional()
    .describe("Limit to specific path or module (e.g., 'src/auth')"),

  detail_level: z.enum(["brief", "detailed", "comprehensive"])
    .default("detailed")
    .describe("How much detail to include"),

  max_context_files: z.number()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum files to use as context")
}

// Output Schema
{
  explanation: z.string()
    .describe("AI-generated explanation"),

  sources: z.array(z.object({
    file_path: z.string(),
    line_start: z.number(),
    line_end: z.number(),
    relevance: z.string()
  })),

  related_topics: z.array(z.string())
    .describe("Other topics you might want to explore"),

  confidence: z.enum(["high", "medium", "low"])
}
```

**Note:** This tool requires LLM configuration. If no LLM is configured, it will return an error with setup instructions.

---

#### 8. `get_architecture`

**Purpose:** Get a high-level overview of the codebase structure.

```typescript
// Input Schema
{
  focus: z.enum(["full", "modules", "data_flow", "dependencies"])
    .default("full")
    .describe("What aspect of architecture to focus on"),

  path: z.string()
    .optional()
    .describe("Limit to specific directory")
}

// Output Schema
{
  overview: z.string()
    .describe("High-level description of the codebase"),

  modules: z.array(z.object({
    name: z.string(),
    path: z.string(),
    purpose: z.string(),
    key_files: z.array(z.string())
  })),

  entry_points: z.array(z.object({
    file_path: z.string(),
    type: z.enum(["cli", "api", "library", "worker"])
  })),

  key_patterns: z.array(z.string())
    .describe("Architectural patterns detected (e.g., 'MVC', 'Event-driven')"),

  statistics: z.object({
    total_files: z.number(),
    languages: z.record(z.number()),
    largest_modules: z.array(z.object({
      path: z.string(),
      files: z.number()
    }))
  })
}
```

---

### LLM Configuration (Phase 3)

For RAG features, users can optionally configure an LLM:

```bash
# Option 1: Local LLM via Ollama
hikma-mcp config set llm.provider ollama
hikma-mcp config set llm.model qwen2.5-coder:7b
hikma-mcp config set llm.url http://localhost:11434

# Option 2: OpenAI-compatible API
hikma-mcp config set llm.provider openai
hikma-mcp config set llm.model gpt-4o-mini
hikma-mcp config set llm.api_key sk-...

# Option 3: Use the AI CLI's own model (passthrough)
# (No configuration needed - tool returns context for the AI to synthesize)
```

**Graceful Degradation:**
- If no LLM configured, `explain_module` returns relevant code snippets without synthesis
- `get_architecture` works without LLM (uses pre-computed summaries from indexing)

---

## Implementation Roadmap

### Phase 1 Milestones

| Milestone | Description | Deliverable |
|-----------|-------------|-------------|
| **1.1** | Project setup | Package structure, TypeScript config, dependencies |
| **1.2** | hikma-engine bridge | Import and wrap existing modules |
| **1.3** | MCP server core | Server setup, stdio transport, tool registration |
| **1.4** | `semantic_search` tool | Full implementation with tests |
| **1.5** | `get_file_summary` tool | Full implementation with tests |
| **1.6** | `find_symbol` tool | Full implementation with tests |
| **1.7** | CLI: `init` command | Index initialization |
| **1.8** | CLI: `serve` command | Server startup |
| **1.9** | Integration testing | Test with Claude Code |
| **1.10** | Documentation | README, setup guide |

### Phase 2 Milestones

| Milestone | Description | Deliverable |
|-----------|-------------|-------------|
| **2.1** | Graph query service | Query code relationships from SQLite |
| **2.2** | `find_callers` tool | Implementation with depth traversal |
| **2.3** | `find_dependencies` tool | Import graph analysis |
| **2.4** | `find_related` tool | Multi-relationship queries |
| **2.5** | CLI: `update` command | Incremental index updates |
| **2.6** | CLI: `status` command | Index health reporting |
| **2.7** | File watcher | Optional auto-update on file changes |
| **2.8** | Performance optimization | Query caching, lazy loading |

### Phase 3 Milestones

| Milestone | Description | Deliverable |
|-----------|-------------|-------------|
| **3.1** | RAG service | Connect to hikma-engine RAG pipeline |
| **3.2** | LLM configuration | Multi-provider support |
| **3.3** | `explain_module` tool | RAG-powered explanations |
| **3.4** | `get_architecture` tool | Codebase overview generation |
| **3.5** | Context passthrough mode | Return context without LLM synthesis |
| **3.6** | Polish & optimization | Response quality, latency |
| **3.7** | Advanced documentation | Best practices, troubleshooting |

---

## Technical Specifications

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.25.0",
    "commander": "^11.0.0",
    "chalk": "^5.0.0",
    "better-sqlite3": "^9.0.0",
    "@xenova/transformers": "^2.17.0"
  },
  "peerDependencies": {
    "hikma-engine": "^3.0.0"
  }
}
```

### Monorepo vs Separate Package

**Recommendation: Start as subfolder in hikma-engine monorepo**

```
hikma-engine/
├── src/                    # Existing hikma-engine source
├── packages/
│   └── hikma-mcp/          # New MCP server package
│       ├── src/
│       ├── package.json
│       └── README.md
├── package.json            # Workspace root
└── ...
```

**Rationale:**
- Share code without publishing hikma-engine as separate package
- Unified versioning and releases
- Easier development and testing
- Can extract to separate repo later if needed

---

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Index time (medium project, ~500 files) | < 2 minutes | End-to-end `init` |
| Semantic search latency | < 500ms | Query to results |
| Symbol lookup latency | < 100ms | Query to results |
| Relationship queries | < 200ms | Query to results |
| Index size | < 10% of source | Database + embeddings |
| Memory usage (server) | < 200MB | Idle server |

---

### Security Considerations

1. **Path validation**: All file paths validated to be within project root
2. **No arbitrary code execution**: Tools only read/query data
3. **Gitignore respect**: Honor .gitignore for sensitive files
4. **No secrets in index**: Skip files matching patterns like `.env`, `credentials.*`
5. **Local-only by default**: No network calls except optional LLM

---

## Testing Strategy

### Unit Tests

- Tool input validation
- Schema generation
- Service methods
- Error handling

### Integration Tests

- Full indexing pipeline
- Search accuracy
- MCP protocol compliance

### End-to-End Tests

- Claude Code integration
- Cursor integration
- Real project indexing

### Test Projects

1. **Small**: 10-50 files (fast iteration)
2. **Medium**: 200-500 files (realistic)
3. **Large**: 1000+ files (performance testing)

---

## Success Criteria

### Phase 1 Complete When:

- [ ] `npm install -g hikma-mcp` works
- [ ] `hikma-mcp init` indexes a TypeScript project in < 2 minutes
- [ ] `hikma-mcp serve` starts MCP server
- [ ] Claude Code can call all 3 tools
- [ ] Search returns relevant results (manual quality check)
- [ ] README covers installation to first query

### Phase 2 Complete When:

- [ ] Relationship tools work with indexed graph
- [ ] `find_callers` traces call chains correctly
- [ ] Incremental updates work (`hikma-mcp update`)
- [ ] Performance targets met

### Phase 3 Complete When:

- [ ] RAG explanations are accurate and helpful
- [ ] Works with local LLM (Ollama)
- [ ] Works without LLM (graceful degradation)
- [ ] Architecture overview matches manual inspection

---

## Open Questions

1. **Naming**: `hikma-mcp` or something more descriptive like `codebase-mcp`?

2. **Scope**: Support multiple projects in one server, or one server per project?

3. **Auto-index**: Should `serve` auto-run `init` if no index exists?

4. **Watch mode**: Ship in Phase 1 or defer to Phase 2?

5. **Python support**: Continue supporting Python embedding provider or focus on JS-only?

---

## References

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [hikma-engine Documentation](./unified-database-architecture.md)

---

## Appendix: Example Session

```
$ cd my-react-app
$ hikma-mcp init
Discovering files... 342 files found
Parsing AST... ████████████████████ 100%
Generating embeddings... ████████████████████ 100%
Index created: .hikma/index.db (32.4 MB)

$ # Add to Claude Code config and restart

User: "Where is the shopping cart state managed?"

Claude: Let me search the codebase for shopping cart state management.

[Tool call: semantic_search]
Query: "shopping cart state management"

Found 4 relevant matches:

1. **src/store/cartSlice.ts:12-89** (0.92 similarity)
   Redux slice managing cart state with actions: addItem, removeItem, updateQuantity, clearCart

2. **src/hooks/useCart.ts:5-45** (0.87 similarity)
   Custom hook providing cart operations and selectors

3. **src/components/CartProvider.tsx:8-34** (0.81 similarity)
   Context provider wrapping the app with cart state

4. **src/api/cart.ts:15-67** (0.74 similarity)
   API functions for syncing cart with backend

The shopping cart state is managed using Redux Toolkit in `src/store/cartSlice.ts`,
with a custom hook `useCart` for component access.

User: "What components use the useCart hook?"

Claude: [Tool call: find_callers]
Function: "useCart"

useCart is used in 8 components:
1. CartDrawer.tsx:23
2. ProductCard.tsx:15
3. CheckoutPage.tsx:31
4. CartBadge.tsx:8
5. AddToCartButton.tsx:12
...
```

---

*Document Version: 1.0*
*Last Updated: 2025-01-06*
