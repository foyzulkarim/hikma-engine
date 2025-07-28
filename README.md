# Hikma Engine

A sophisticated TypeScript-based code knowledge graph indexer that transforms Git repositories into multi-dimensional knowledge stores for AI agents. Hikma Engine creates interconnected representations of codebases through AST parsing, Git analysis, AI-powered summarization, and vector embeddings.

## Features

- **Multi-language support**: TypeScript, JavaScript, Python, Java, Go, C/C++
- **AST-based code structure extraction**: Deep understanding of code relationships
- **Git integration**: Commit history analysis and incremental updates
- **AI-enhanced summaries**: Intelligent file and directory summarization
- **Vector embeddings**: Semantic similarity search capabilities
- **Unified CLI**: Single `hikma` command for all operations
- **Polyglot persistence**: SQLite with sqlite-vec for unified storage
- **Incremental indexing**: Efficient updates based on Git changes

## Installation

```bash
npm install
```

### Prerequisites

- Node.js >= 18.0.0
- SQLite with sqlite-vec extension
- Git repository for indexing

### Environment Setup

Create a `.env` file in your project root:

```bash
# Database configuration
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging
HIKMA_LOG_LEVEL=info
```

## CLI Usage

Hikma Engine provides a unified CLI interface through the `hikma` command. All functionality is organized under this single entry point for consistency and ease of use.

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

# Force full re-indexing (ignore incremental updates)
npm run hikma index --force-full
```

### Advanced Indexing Options

```bash
# Skip AI summary generation (faster indexing)
npm run hikma index --skip-ai-summary

# Skip vector embedding generation
npm run hikma index --skip-embeddings

# Dry run (analyze without persisting data)
npm run hikma index --dry-run

# Run specific phases only
npm run hikma index --phases 1,2,3

# Start from a specific phase
npm run hikma index --from-phase 2

# Force re-run specific phases
npm run hikma index --force-phases 1,3

# Inspect phase data without continuing
npm run hikma index --inspect-phase 2

# Show status of all phases
npm run hikma index --status
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

The `hikma search` command provides multiple search methods to query your indexed codebase.

### Semantic Search

Search using natural language queries with vector embeddings:

```bash
# Basic semantic search
npm run hikma search semantic "authentication logic"

# Limit results
npm run hikma search semantic "user validation" --limit 5

# Set similarity threshold (0-1)
npm run hikma search semantic "database connection" --similarity 0.3

# Filter by node types
npm run hikma search semantic "error handling" --types "function,class"

# Filter by file paths
npm run hikma search semantic "API endpoints" --files "src/api,src/routes"

# Include embedding vectors in results
npm run hikma search semantic "middleware" --include-embedding

# Output as JSON
npm run hikma search semantic "authentication" --json

# Display as markdown
npm run hikma search semantic "validation" --displayFormat markdown
```

### Text Search

Search for exact text matches in source code:

```bash
# Basic text search
npm run hikma search text "function authenticate"

# Limit results
npm run hikma search text "class User" --limit 10

# Filter by node types
npm run hikma search text "export default" --types "function,class"

# Filter by file paths
npm run hikma search text "import React" --files "src/components"

# Output as JSON
npm run hikma search text "async function" --json

# Display as markdown
npm run hikma search text "interface" --displayFormat markdown
```

### Hybrid Search

Combine semantic search with metadata filters:

```bash
# Search with node type filter
npm run hikma search hybrid "user validation" --type function

# Search with file path pattern
npm run hikma search hybrid "API routes" --file-path "src/api"

# Search with file extension filter
npm run hikma search hybrid "React components" --extension .tsx

# Combine multiple filters
npm run hikma search hybrid "authentication logic" --type function --extension .ts --similarity 0.4

# Output as JSON
npm run hikma search hybrid "database queries" --type function --json

# Display as markdown
npm run hikma search hybrid "error handling" --displayFormat markdown
```

### Search Statistics

View comprehensive statistics about your indexed codebase:

```bash
# Display embedding statistics
npm run hikma search stats

# Output as JSON
npm run hikma search stats --json
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

### Development Workflow

```bash
# 1. Initial full indexing of a new project
npm run hikma index /path/to/new/project --force-full

# 2. Regular incremental updates during development
npm run hikma index

# 3. Search for specific functionality
npm run hikma search semantic "authentication middleware"

# 4. Find exact code patterns
npm run hikma search text "async function"

# 5. Explore codebase statistics
npm run hikma search stats
```

### Code Analysis

```bash
# Find all error handling patterns
npm run hikma search hybrid "error handling" --type function

# Locate API endpoints
npm run hikma search text "app.get\|app.post" --files "src/routes"

# Search for React components
npm run hikma search hybrid "React component" --extension .tsx

# Find database-related code
npm run hikma search semantic "database query" --files "src/models,src/repositories"
```

### Performance Optimization

```bash
# Fast indexing without AI features
npm run hikma index --skip-ai-summary --skip-embeddings

# Incremental updates only
npm run hikma index

# Dry run to estimate processing time
npm run hikma index --dry-run
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

# Lower similarity threshold
npm run hikma search semantic "query" --similarity 0.1

# Try text search instead
npm run hikma search text "exact text"
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
