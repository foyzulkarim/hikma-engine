# Enhanced Search Documentation

The Enhanced Search functionality provides a complete rewrite of the search system specifically designed to work with the `embedding_nodes` table, offering powerful semantic search capabilities with vector embeddings.

## Overview

The enhanced search system consists of two main components:

1. **EnhancedSearchService** (`src/modules/enhanced-search-service.ts`) - Core search logic
2. **Enhanced Search CLI** (`src/cli/enhanced-search.ts`) - Command-line interface

## Features

- **Semantic Search**: Vector-based similarity search using cosine distance
- **Text-based Search**: Traditional text matching as fallback
- **Metadata Search**: Filter by node type, file path, and other metadata
- **Hybrid Search**: Combines semantic and metadata filtering
- **Similar Node Search**: Find nodes similar to a specific node
- **Statistics**: View embedding table statistics

## Usage

### Command Line Interface

Run the enhanced search CLI using:

```bash
npm run enhanced-search
```

### Available Commands

#### 1. Semantic Search
Perform vector-based semantic search:

```bash
npm run enhanced-search semantic "your search query" [options]
```

Options:
- `--limit <number>`: Maximum number of results (default: 10)
- `--threshold <number>`: Similarity threshold (0-1, default: 0.7)
- `--node-type <type>`: Filter by node type
- `--files <paths>`: Filter by file paths (comma-separated)

Example:
```bash
npm run enhanced-search semantic "authentication function" --limit 5 --threshold 0.8
```

#### 2. Text Search
Perform traditional text-based search:

```bash
npm run enhanced-search text "search term" [options]
```

Options:
- `--limit <number>`: Maximum number of results
- `--node-type <type>`: Filter by node type
- `--files <paths>`: Filter by file paths

#### 3. Metadata Search
Search based on metadata only:

```bash
npm run enhanced-search metadata [options]
```

Options:
- `--node-type <type>`: Filter by node type
- `--files <paths>`: Filter by file paths
- `--limit <number>`: Maximum number of results

#### 4. Hybrid Search
Combine semantic search with metadata filtering:

```bash
npm run enhanced-search hybrid "query" [options]
```

Options:
- `--semantic-weight <number>`: Weight for semantic results (0-1, default: 0.7)
- `--limit <number>`: Maximum number of results
- `--threshold <number>`: Similarity threshold
- `--node-type <type>`: Filter by node type
- `--files <paths>`: Filter by file paths

#### 5. Similar Node Search
Find nodes similar to a specific node:

```bash
npm run enhanced-search similar <node-id> [options]
```

Options:
- `--limit <number>`: Maximum number of results
- `--threshold <number>`: Similarity threshold

#### 6. Statistics
View embedding table statistics:

```bash
npm run enhanced-search stats
```

## Programming Interface

### EnhancedSearchService

You can also use the `EnhancedSearchService` directly in your code:

```typescript
import { EnhancedSearchService } from '../modules/enhanced-search-service';
import { ConfigManager } from '../config';

const config = new ConfigManager(process.cwd());
const searchService = new EnhancedSearchService(config);

// Initialize the service
await searchService.initialize();

// Perform semantic search
const results = await searchService.semanticSearch('your query', {
  limit: 10,
  threshold: 0.7,
  nodeType: 'function'
});

// Perform hybrid search
const hybridResults = await searchService.hybridSearch('your query', {
  semanticWeight: 0.7,
  limit: 10,
  filePaths: ['src/auth.ts']
});
```

### Search Options

```typescript
interface SearchOptions {
  limit?: number;           // Maximum results to return
  threshold?: number;       // Similarity threshold (0-1)
  nodeType?: string;        // Filter by node type
  filePaths?: string[];     // Filter by file paths
}

interface HybridSearchOptions extends SearchOptions {
  semanticWeight?: number;  // Weight for semantic vs metadata (0-1)
}
```

### Search Results

```typescript
interface SearchResult {
  id: string;
  nodeId: string;
  sourceText: string;
  nodeType: string;
  filePath: string;
  similarity?: number;      // Cosine similarity score (0-1)
  rank?: number;           // Result ranking
}
```

## Database Schema

The enhanced search works with the `embedding_nodes` table:

```sql
CREATE TABLE embedding_nodes (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  source_text TEXT NOT NULL,
  node_type TEXT NOT NULL,
  file_path TEXT NOT NULL
);

CREATE INDEX idx_embedding_nodes_node_id ON embedding_nodes(node_id);
```

## Performance Considerations

- Vector searches use SQLite's `vec_distance_cosine` function for efficient similarity calculations
- Indexes on `node_id` improve query performance
- Consider using appropriate similarity thresholds to balance relevance and performance
- Hybrid search combines multiple query types for comprehensive results

## Error Handling

The service includes comprehensive error handling:
- Database connection errors
- Invalid embedding data
- Missing configuration
- Query execution failures

All errors are logged with appropriate context for debugging.

## Configuration

The service uses the existing `ConfigManager` for database configuration. Ensure your configuration includes:

```yaml
database:
  sqlite:
    path: "path/to/your/database.db"
```

## Migration from Legacy Search

The enhanced search system is designed to work alongside the existing search functionality. Key differences:

1. **Focused on embedding_nodes**: Specifically designed for the embedding table
2. **Vector-first approach**: Prioritizes semantic similarity over text matching
3. **Unified interface**: Single service for all search types
4. **Better performance**: Optimized queries and result processing

To migrate existing search functionality:

1. Replace `SearchService` imports with `EnhancedSearchService`
2. Update method calls to use the new API
3. Adjust search parameters as needed
4. Test thoroughly with your specific use cases