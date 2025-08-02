# Hikma Engine

A sophisticated TypeScript-based code knowledge graph indexer that transforms Git repositories into multi-dimensional knowledge stores for AI agents. Hikma Engine creates interconnected representations of codebases through AST parsing, Git analysis, AI-powered summarization, and vector embeddings.

## Features

- **Multi-language support**: TypeScript, JavaScript, Python, Java, Go, C/C++
- **AST-based code structure extraction**: Deep understanding of code relationships
- **Git integration**: Commit history analysis and incremental updates
- **AI-enhanced summaries**: Intelligent file and directory summarization
- **Vector embeddings**: Semantic similarity search capabilities with multiple providers
- **Python ML integration**: Advanced embedding models via Python bridge (Node.js ↔ Python)
- **Multi-repository support**: Index and search across multiple repositories
- **Unified CLI**: Single `hikma` command for all operations
- **Polyglot persistence**: SQLite with sqlite-vec for unified storage
- **Incremental indexing**: Efficient updates based on Git changes
- **Directory-specific operations**: Work with different repositories without changing directories

## Installation

```bash
npm install
```

### Prerequisites

- Node.js >= 18.0.0
- SQLite with sqlite-vec extension  
- Git repository for indexing
- Python 3.7+ (optional, for Python embedding provider)

### Environment Setup

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

## 🐍 Python Embedding Integration

Hikma Engine now supports Python-based embedding generation, allowing you to leverage powerful Python ML models directly from your Node.js application without network dependencies.

### Available Embedding Providers

| Provider | Description | Use Case | Setup Required |
|----------|-------------|----------|----------------|
| `transformers` | JavaScript-based embeddings via @xenova/transformers | Production, simple setup | None (default) |
| `python` | Python-based embeddings with full ML ecosystem | Advanced models, better code understanding | Python + pip dependencies |
| `local` | LM Studio server for GUI-based model management | Development, experimentation | LM Studio running |

### Python Provider Setup

#### 1. Install Python Dependencies

```bash
cd src/python
pip3 install -r requirements.txt
```

#### 2. Configure Provider

The Python provider can be enabled by updating your configuration or using environment variables:

**Option A: Environment Variable**
```bash
export HIKMA_EMBEDDING_PROVIDER=python
```

**Option B: Configuration File**
Update `src/config/index.ts` to set `provider: 'python'` in the AI embedding configuration.

#### 3. Verify Setup

Test the Python integration:
```bash
echo '{"text": "function test() { return 42; }", "is_query": false}' | python3 src/python/embed.py
```

### Python Provider Benefits

✅ **Better Code Understanding**: Uses advanced models specifically trained for code  
✅ **Full Python Ecosystem**: Access to any Python-based embedding model  
✅ **No Network Calls**: All processing happens locally  
✅ **Same Model Consistency**: Uses `mixedbread-ai/mxbai-embed-large-v1` for optimal results  
✅ **Query Optimization**: Automatic prompt application for search queries vs documents  

### Performance Characteristics

- **First Run**: 3-10 seconds (model download + loading)
- **Subsequent Runs**: 1-2 seconds (model cached)
- **Per Embedding**: 100-300ms depending on text length
- **Memory Usage**: ~1-2GB RAM during operation
- **Model Size**: ~670MB (cached after first download)

### Usage Examples

Once configured, the Python provider works seamlessly with existing commands:

```bash
# Indexing with Python embeddings
npm run hikma index

# Searching with Python embeddings
npm run hikma search semantic "authentication functions"

# All existing functionality works the same
npm run hikma search hybrid "user validation" --type function
```

### Provider Switching

You can switch between providers at runtime:

```bash
# Use transformers.js (JavaScript)
export HIKMA_EMBEDDING_PROVIDER=transformers
npm run hikma search semantic "query"

# Use Python
export HIKMA_EMBEDDING_PROVIDER=python
npm run hikma search semantic "query"

# Use local LM Studio
export HIKMA_EMBEDDING_PROVIDER=local
npm run hikma search semantic "query"
```

### Troubleshooting Python Provider

**Python not found:**
```bash
python3 --version
which python3
```

**Dependencies missing:**
```bash
cd src/python
pip3 install -r requirements.txt
```

**Model download issues:**
```bash
# Test model access
python3 -c "from transformers import AutoModel; AutoModel.from_pretrained('mixedbread-ai/mxbai-embed-large-v1')"
```

**Performance issues:**
- Increase timeout in `src/modules/embedding-py.ts` if needed
- Ensure sufficient RAM (2GB+ recommended)
- Check Python process isn't being killed by system

### Advanced Python Integration

For direct Python interface usage in custom applications:

```typescript
import { 
  getCodeEmbedding, 
  getPythonQueryEmbedding, 
  getPythonDocumentEmbedding 
} from './src/modules/embedding-py';

// Basic usage
const embedding = await getCodeEmbedding("const x = 42;", false);

// Query embedding (with search prompt)
const queryEmbedding = await getPythonQueryEmbedding("find variable declaration");

// Document embedding (without prompt)
const docEmbedding = await getPythonDocumentEmbedding("const x = 42;");
```

See `PYTHON-EMBEDDING-GUIDE.md` for detailed integration documentation.

## CLI Usage

Hikma Engine provides a unified CLI interface through the `hikma` command. All functionality is organized under this single entry point for consistency and ease of use.

**Multi-Repository Support**: All commands support an optional directory parameter, allowing you to work with multiple repositories without changing directories. Each repository maintains its own isolated database in a `data` subdirectory.

### Getting Help

```bash
# Show all available commands
npm run hikma --help

# Show help for specific commands
npm run hikma index --help
npm run hikma search --help
```

## Indexing

The `hikma index` command builds a knowledge graph from your codebase by analyzing files, extracting AST structures, processing Git history, and generating embeddings.

### Basic Indexing

```bash
# Index current directory
npm run hikma index

# Index specific project path
npm run hikma index /path/to/project

# Index multiple repositories
npm run hikma index /path/to/frontend
npm run hikma index /path/to/backend
npm run hikma index /path/to/shared-lib

# Force full re-indexing (ignore incremental updates)
npm run hikma index --force-full

# Force full re-indexing of specific repository
npm run hikma index /path/to/project --force-full
```

### Advanced Indexing Options

```bash
# Skip AI summary generation (faster indexing)
npm run hikma index --skip-ai-summary
npm run hikma index /path/to/project --skip-ai-summary

# Skip vector embedding generation
npm run hikma index --skip-embeddings
npm run hikma index /path/to/project --skip-embeddings

# Dry run (analyze without persisting data)
npm run hikma index --dry-run
npm run hikma index /path/to/project --dry-run

# Run specific phases only
npm run hikma index --phases 1,2,3
npm run hikma index /path/to/project --phases 1,2,3

# Start from a specific phase
npm run hikma index --from-phase 2
npm run hikma index /path/to/project --from-phase 2

# Force re-run specific phases
npm run hikma index --force-phases 1,3
npm run hikma index /path/to/project --force-phases 1,3

# Inspect phase data without continuing
npm run hikma index --inspect-phase 2
npm run hikma index /path/to/project --inspect-phase 2

# Show status of all phases
npm run hikma index --status
npm run hikma index /path/to/project --status
```

### Indexing Phases

The indexing process consists of several phases:

1. **File Discovery**: Scan and filter files based on patterns
2. **AST Extraction**: Parse code structure and relationships
3. **Git Analysis**: Process commit history and changes
4. **Summary Generation**: Create AI-powered summaries
5. **Embedding Generation**: Generate vector embeddings
6. **Data Persistence**: Store results in database

## Searching

The `hikma search` command provides multiple search methods to query your indexed codebase. All search commands support an optional directory parameter to search in specific repositories.

### Semantic Search

Search using natural language queries with vector embeddings:

```bash
# Basic semantic search (current directory)
npm run hikma search semantic "authentication logic"

# Search in specific repository
npm run hikma search semantic "authentication logic" /path/to/backend

# Search across multiple repositories
npm run hikma search semantic "user validation" /path/to/frontend
npm run hikma search semantic "user validation" /path/to/backend

# Limit results
npm run hikma search semantic "database connection" --limit 5
npm run hikma search semantic "database connection" /path/to/backend --limit 5

# Set similarity threshold (0-1)
npm run hikma search semantic "error handling" --similarity 0.3
npm run hikma search semantic "error handling" /path/to/project --similarity 0.3

# Filter by node types
npm run hikma search semantic "API endpoints" --types "function,class"
npm run hikma search semantic "API endpoints" /path/to/backend --types "function,class"

# Filter by file paths
npm run hikma search semantic "middleware" --files "src/api,src/routes"
npm run hikma search semantic "middleware" /path/to/backend --files "src/api,src/routes"

# Include embedding vectors in results
npm run hikma search semantic "authentication" --include-embedding
npm run hikma search semantic "authentication" /path/to/project --include-embedding

# Output as JSON
npm run hikma search semantic "validation" --json
npm run hikma search semantic "validation" /path/to/project --json

# Display as markdown
npm run hikma search semantic "middleware" --displayFormat markdown
npm run hikma search semantic "middleware" /path/to/project --displayFormat markdown
```

### Text Search

Search for exact text matches in source code:

```bash
# Basic text search (current directory)
npm run hikma search text "function authenticate"

# Search in specific repository
npm run hikma search text "function authenticate" /path/to/backend

# Limit results
npm run hikma search text "class User" --limit 10
npm run hikma search text "class User" /path/to/project --limit 10

# Filter by node types
npm run hikma search text "export default" --types "function,class"
npm run hikma search text "export default" /path/to/project --types "function,class"

# Filter by file paths
npm run hikma search text "import React" --files "src/components"
npm run hikma search text "import React" /path/to/frontend --files "src/components"

# Output as JSON
npm run hikma search text "async function" --json
npm run hikma search text "async function" /path/to/project --json

# Display as markdown
npm run hikma search text "interface" --displayFormat markdown
npm run hikma search text "interface" /path/to/project --displayFormat markdown
```

### Hybrid Search

Combine semantic search with metadata filters:

```bash
# Search with node type filter (current directory)
npm run hikma search hybrid "user validation" --type function

# Search in specific repository with filters
npm run hikma search hybrid "user validation" /path/to/backend --type function

# Search with file path pattern
npm run hikma search hybrid "API routes" --file-path "src/api"
npm run hikma search hybrid "API routes" /path/to/backend --file-path "src/api"

# Search with file extension filter
npm run hikma search hybrid "React components" --extension .tsx
npm run hikma search hybrid "React components" /path/to/frontend --extension .tsx

# Combine multiple filters
npm run hikma search hybrid "authentication logic" --type function --extension .ts --similarity 0.4
npm run hikma search hybrid "authentication logic" /path/to/backend --type function --extension .ts --similarity 0.4

# Output as JSON
npm run hikma search hybrid "database queries" --type function --json
npm run hikma search hybrid "database queries" /path/to/backend --type function --json

# Display as markdown
npm run hikma search hybrid "error handling" --displayFormat markdown
npm run hikma search hybrid "error handling" /path/to/project --displayFormat markdown
```

### Search Statistics

View comprehensive statistics about your indexed codebase:

```bash
# Display embedding statistics (current directory)
npm run hikma search stats

# Display statistics for specific repository
npm run hikma search stats /path/to/backend

# Compare statistics across repositories
npm run hikma search stats /path/to/frontend
npm run hikma search stats /path/to/backend
npm run hikma search stats /path/to/shared-lib

# Output as JSON
npm run hikma search stats --json
npm run hikma search stats /path/to/project --json
```

The stats command shows:
- Total number of indexed nodes
- Embedding coverage percentage
- Breakdown by node types (functions, classes, etc.)
- Top file paths by node count

## Output Formats

All search commands support multiple output formats:

### Table Format (Default)

Clean, formatted table with columns for Node ID, Type, File Path, Similarity, Data Source, and Source Text Preview.

### Markdown Format

Structured markdown output with detailed information for each result, including full source code blocks.

### JSON Format

Raw JSON output suitable for programmatic processing and integration with other tools.

## Common Usage Patterns

### Multi-Repository Development Workflow

```bash
# 1. Index multiple repositories
npm run hikma index /path/to/frontend
npm run hikma index /path/to/backend
npm run hikma index /path/to/shared-lib

# 2. Search across different repositories
npm run hikma search semantic "authentication" /path/to/frontend
npm run hikma search semantic "authentication" /path/to/backend

# 3. Compare implementations across repositories
npm run hikma search hybrid "user validation" /path/to/frontend --type function
npm run hikma search hybrid "user validation" /path/to/backend --type function

# 4. Check statistics for each repository
npm run hikma search stats /path/to/frontend
npm run hikma search stats /path/to/backend
npm run hikma search stats /path/to/shared-lib
```

### Single Repository Development Workflow

```bash
# 1. Initial full indexing of a new project
npm run hikma index /path/to/new/project --force-full

# 2. Regular incremental updates during development
npm run hikma index /path/to/project

# 3. Search for specific functionality
npm run hikma search semantic "authentication middleware" /path/to/project

# 4. Find exact code patterns
npm run hikma search text "async function" /path/to/project

# 5. Explore codebase statistics
npm run hikma search stats /path/to/project
```

### Code Analysis

```bash
# Find all error handling patterns
npm run hikma search hybrid "error handling" --type function
npm run hikma search hybrid "error handling" /path/to/backend --type function

# Locate API endpoints across repositories
npm run hikma search text "app.get\|app.post" --files "src/routes"
npm run hikma search text "app.get\|app.post" /path/to/backend --files "src/routes"

# Search for React components
npm run hikma search hybrid "React component" --extension .tsx
npm run hikma search hybrid "React component" /path/to/frontend --extension .tsx

# Find database-related code
npm run hikma search semantic "database query" --files "src/models,src/repositories"
npm run hikma search semantic "database query" /path/to/backend --files "src/models,src/repositories"

# Compare similar functionality across repositories
npm run hikma search semantic "user authentication" /path/to/frontend --limit 5
npm run hikma search semantic "user authentication" /path/to/backend --limit 5
```

### Performance Optimization

```bash
# Fast indexing without AI features
npm run hikma index --skip-ai-summary --skip-embeddings
npm run hikma index /path/to/project --skip-ai-summary --skip-embeddings

# Incremental updates only
npm run hikma index
npm run hikma index /path/to/project

# Dry run to estimate processing time
npm run hikma index --dry-run
npm run hikma index /path/to/project --dry-run
```

### Database Isolation

Each repository maintains its own isolated database:

```bash
# Each repository creates its own database file
/path/to/frontend/data/metadata.db
/path/to/backend/data/metadata.db
/path/to/shared-lib/data/metadata.db

# Verify database isolation
ls -la /path/to/frontend/data/
ls -la /path/to/backend/data/
ls -la /path/to/shared-lib/data/
```

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check database path and permissions
ls -la ./data/metadata.db

# Verify sqlite-vec extension
ls -la ./extensions/vec0.dylib
```

**Indexing Failures**
```bash
# Run with debug logging
HIKMA_LOG_LEVEL=debug npm run hikma index

# Check specific phase status
npm run hikma index --status

# Inspect failed phase
npm run hikma index --inspect-phase 3
```

**Search Not Returning Results**
```bash
# Check if indexing completed successfully
npm run hikma search stats
npm run hikma search stats /path/to/project

# Lower similarity threshold
npm run hikma search semantic "query" --similarity 0.1
npm run hikma search semantic "query" /path/to/project --similarity 0.1

# Try text search instead
npm run hikma search text "exact text"
npm run hikma search text "exact text" /path/to/project

# Verify you're searching the right repository
npm run hikma search stats /path/to/correct/repository
```

**Memory Issues with Large Repositories**
```bash
# Skip embeddings for initial analysis
npm run hikma index --skip-embeddings

# Process specific phases separately
npm run hikma index --phases 1,2
npm run hikma index --phases 3,4
```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Set debug log level
export HIKMA_LOG_LEVEL=debug

# Run with verbose output
npm run hikma index --dry-run
```

### Performance Tips

1. **Use incremental indexing**: Regular `npm run hikma index` runs are much faster than full re-indexing
2. **Skip AI features for speed**: Use `--skip-ai-summary --skip-embeddings` for faster indexing
3. **Filter search results**: Use type and file filters to narrow search scope
4. **Adjust similarity thresholds**: Lower thresholds return more results but may be less relevant
5. **Use directory parameters**: Specify exact repository paths to avoid confusion
6. **Verify database isolation**: Each repository maintains its own database in `{repo}/data/metadata.db`

## Multi-Repository Features

### Repository Isolation

Each indexed repository maintains its own isolated database and configuration:

- **Database Location**: `{repository-path}/data/metadata.db`
- **Vector Extension**: `{repository-path}/extensions/vec0.dylib`
- **Independent Indexing**: Each repository can be indexed and updated independently
- **Isolated Search**: Search results are specific to the target repository

### Cross-Repository Workflows

```bash
# Index multiple related repositories
npm run hikma index /workspace/microservice-auth
npm run hikma index /workspace/microservice-users
npm run hikma index /workspace/microservice-orders
npm run hikma index /workspace/shared-libraries

# Search for similar patterns across services
npm run hikma search semantic "JWT validation" /workspace/microservice-auth
npm run hikma search semantic "JWT validation" /workspace/microservice-users
npm run hikma search semantic "JWT validation" /workspace/microservice-orders

# Compare API implementations
npm run hikma search hybrid "user endpoint" /workspace/microservice-auth --type function
npm run hikma search hybrid "user endpoint" /workspace/microservice-users --type function

# Find shared utilities
npm run hikma search text "validateEmail" /workspace/shared-libraries
npm run hikma search text "validateEmail" /workspace/microservice-auth
npm run hikma search text "validateEmail" /workspace/microservice-users

# Analyze codebase statistics across repositories
npm run hikma search stats /workspace/microservice-auth --json > auth-stats.json
npm run hikma search stats /workspace/microservice-users --json > users-stats.json
npm run hikma search stats /workspace/microservice-orders --json > orders-stats.json
```

### Directory Parameter Benefits

1. **No Directory Changes**: Search any repository from anywhere
2. **Batch Operations**: Script multiple repository operations easily
3. **CI/CD Integration**: Automated indexing and searching in pipelines
4. **Development Efficiency**: Quick cross-repository code exploration
5. **Team Collaboration**: Consistent repository references across team members

## Configuration

### Environment Variables

```bash
# Database configuration
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging configuration
HIKMA_LOG_LEVEL=info  # debug, info, warn, error
```

### File Patterns

Default file inclusion patterns:
- `**/*.ts` - TypeScript files
- `**/*.js` - JavaScript files  
- `**/*.py` - Python files

Default exclusion patterns:
- `**/node_modules/**`
- `**/dist/**`
- `**/.git/**`

## API Server

Hikma Engine also provides a REST API server:

```bash
# Start API server
npm run api

# Development mode with auto-reload
npm run api:dev
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test:coverage

# Run integration tests
npm test:integration

# Run performance tests
npm test:performance
```

### Building

```bash
# Compile TypeScript
npm run build

# Clean build artifacts
npm run clean
```

### Docker Support

```bash
# Build Docker image
npm run docker:build

# Run with Docker Compose
npm run docker:run

# Development environment
npm run docker:dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
