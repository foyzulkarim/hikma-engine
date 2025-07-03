# API Reference

## Core Classes and Interfaces

### Indexer Class

The main orchestrator for the hikma-engine indexing pipeline.

#### Constructor
```typescript
constructor(projectRoot: string, config: ConfigManager)
```

#### Methods

##### `run(options?: IndexingOptions): Promise<IndexingResult>`
Executes the complete indexing pipeline.

**Parameters:**
- `options` (optional): Configuration options for the indexing process

**Returns:** Promise resolving to IndexingResult with statistics and errors

**Example:**
```typescript
const indexer = new Indexer('/path/to/project', config);
const result = await indexer.run({
  forceFullIndex: true,
  skipAISummary: false
});
```

### ConfigManager Class

Centralized configuration management system.

#### Methods

##### `getDatabaseConfig(): DatabaseConfig`
Returns database configuration settings.

##### `getAIConfig(): AIConfig`
Returns AI model configuration settings.

##### `getIndexingConfig(): IndexingConfig`
Returns file indexing configuration.

##### `getLoggingConfig(): LoggingConfig`
Returns logging configuration settings.

## Processing Modules

### FileScanner

Discovers and filters files for processing.

#### Methods

##### `scanFiles(rootPath: string): Promise<string[]>`
Scans directory tree and returns list of files to process.

**Parameters:**
- `rootPath`: Root directory to scan

**Returns:** Array of file paths matching configured patterns

### AstParser

Parses Abstract Syntax Trees from source code files.

#### Methods

##### `parseFile(filePath: string): Promise<ParseResult>`
Parses a single file and extracts code structures.

**Parameters:**
- `filePath`: Path to the source code file

**Returns:** ParseResult containing functions, classes, and relationships

### GitAnalyzer

Analyzes Git repository history and metadata.

#### Methods

##### `analyzeRepository(repoPath: string): Promise<GitAnalysisResult>`
Analyzes Git repository for commit history and file changes.

**Parameters:**
- `repoPath`: Path to Git repository

**Returns:** GitAnalysisResult with commit data and file evolution

### SummaryGenerator

Generates AI-powered summaries for code files and directories.

#### Methods

##### `generateFileSummary(filePath: string, content: string): Promise<string>`
Generates summary for a single file.

**Parameters:**
- `filePath`: Path to the file
- `content`: File content to summarize

**Returns:** AI-generated summary text

##### `generateDirectorySummary(dirPath: string, files: FileNode[]): Promise<string>`
Generates summary for a directory based on its contents.

### EmbeddingService

Creates vector embeddings for semantic similarity search.

#### Methods

##### `generateEmbedding(text: string): Promise<number[]>`
Generates vector embedding for given text.

**Parameters:**
- `text`: Text content to embed

**Returns:** Vector embedding as number array

##### `generateBatchEmbeddings(texts: string[]): Promise<number[][]>`
Generates embeddings for multiple texts efficiently.

### DataLoader

Manages persistence across multiple database systems.

#### Methods

##### `loadNodes(nodes: NodeWithEmbedding[]): Promise<void>`
Persists nodes to configured databases.

##### `loadEdges(edges: Edge[]): Promise<void>`
Persists relationships to configured databases.

##### `initializeDatabases(): Promise<void>`
Sets up database schemas and connections.

## Type Definitions

### Core Types

#### `IndexingOptions`
```typescript
interface IndexingOptions {
  forceFullIndex?: boolean;     // Force complete re-indexing
  skipAISummary?: boolean;      // Skip AI summary generation
  skipEmbeddings?: boolean;     // Skip vector embedding generation
  dryRun?: boolean;            // Test run without persistence
}
```

#### `IndexingResult`
```typescript
interface IndexingResult {
  totalNodes: number;          // Total nodes created
  totalEdges: number;          // Total edges created
  processedFiles: number;      // Number of files processed
  isIncremental: boolean;      // Whether incremental indexing was used
  duration: number;           // Processing time in milliseconds
  errors: string[];           // Array of error messages
}
```

### Node Types

#### `BaseNode`
```typescript
interface BaseNode {
  id: string;
  type: NodeType;
  name: string;
  path: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `FileNode`
```typescript
interface FileNode extends BaseNode {
  type: 'file';
  language: string;
  size: number;
  hash: string;
  summary?: string;
}
```

#### `FunctionNode`
```typescript
interface FunctionNode extends BaseNode {
  type: 'function';
  signature: string;
  parameters: Parameter[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  complexity?: number;
}
```

#### `ClassNode`
```typescript
interface ClassNode extends BaseNode {
  type: 'class';
  isAbstract: boolean;
  isExported: boolean;
  methods: string[];
  properties: string[];
  extends?: string;
  implements?: string[];
}
```

### Edge Types

#### `Edge`
```typescript
interface Edge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  metadata: Record<string, any>;
  weight?: number;
  createdAt: Date;
}
```

### Configuration Types

#### `DatabaseConfig`
```typescript
interface DatabaseConfig {
  lancedb: {
    path: string;
  };
  sqlite: {
    path: string;
  };
  tinkergraph: {
    url: string;
  };
}
```

#### `AIConfig`
```typescript
interface AIConfig {
  embedding: {
    model: string;
    batchSize: number;
  };
  summary: {
    model: string;
    maxTokens: number;
  };
}
```

#### `IndexingConfig`
```typescript
interface IndexingConfig {
  filePatterns: string[];        // Glob patterns for files to include
  ignorePatterns: string[];      // Glob patterns for files to exclude
  maxFileSize: number;          // Maximum file size in bytes
  supportedLanguages: string[]; // Programming languages to process
}
```

## Database Clients

### SQLiteClient

Manages SQLite database operations for relational data.

#### Methods

##### `initialize(): Promise<void>`
Sets up SQLite database schema and tables.

##### `insertNodes(nodes: BaseNode[]): Promise<void>`
Inserts nodes into SQLite database.

##### `insertEdges(edges: Edge[]): Promise<void>`
Inserts edges into SQLite database.

##### `getNodesByType(type: NodeType): Promise<BaseNode[]>`
Retrieves nodes by type from database.

### LanceDBClient

Manages LanceDB operations for vector storage and similarity search.

#### Methods

##### `initialize(): Promise<void>`
Sets up LanceDB tables and indexes.

##### `insertEmbeddings(embeddings: NodeWithEmbedding[]): Promise<void>`
Stores vector embeddings in LanceDB.

##### `searchSimilar(embedding: number[], limit: number): Promise<SimilarityResult[]>`
Performs similarity search using vector embeddings.

### TinkerGraphClient

Manages TinkerGraph operations for graph traversals and analysis.

#### Methods

##### `initialize(): Promise<void>`
Sets up TinkerGraph connection and schema.

##### `addVertex(node: BaseNode): Promise<void>`
Adds a vertex to the graph database.

##### `addEdge(edge: Edge): Promise<void>`
Adds an edge to the graph database.

##### `traverse(query: string): Promise<any[]>`
Executes Gremlin traversal queries.

## Logging System

### Logger Interface

Structured logging with operation tracking and performance metrics.

#### Methods

##### `info(message: string, metadata?: object): void`
Logs informational messages.

##### `warn(message: string, metadata?: object): void`
Logs warning messages.

##### `error(message: string, metadata?: object): void`
Logs error messages.

##### `debug(message: string, metadata?: object): void`
Logs debug messages.

##### `startOperation(operationName: string): OperationTracker`
Starts tracking a long-running operation.

### OperationTracker

Tracks performance metrics for operations.

#### Methods

##### `end(metadata?: object): void`
Ends operation tracking and logs performance metrics.

## Error Handling

### Error Types

The system defines several custom error types for better error handling:

- `ConfigurationError`: Configuration-related errors
- `DatabaseError`: Database operation errors
- `ParsingError`: Code parsing errors
- `AIServiceError`: AI model integration errors

### Error Recovery

The system implements graceful error recovery:

- Individual file processing errors don't stop the entire pipeline
- Database connection errors are retried with exponential backoff
- AI service errors fall back to basic text processing
- All errors are logged with full context for debugging

## Environment Variables

The system supports configuration through environment variables:

### Database Configuration
- `HIKMA_SQLITE_PATH`: Path to SQLite database file
- `HIKMA_LANCEDB_PATH`: Path to LanceDB directory
- `HIKMA_TINKERGRAPH_URL`: TinkerGraph server URL

### AI Configuration
- `HIKMA_EMBEDDING_MODEL`: Embedding model name
- `HIKMA_EMBEDDING_BATCH_SIZE`: Batch size for embeddings
- `HIKMA_SUMMARY_MODEL`: Summary generation model
- `HIKMA_SUMMARY_MAX_TOKENS`: Maximum tokens for summaries

### Logging Configuration
- `HIKMA_LOG_LEVEL`: Logging level (debug, info, warn, error)
- `HIKMA_LOG_FILE`: Path to log file
- `HIKMA_ENABLE_CONSOLE_LOG`: Enable console logging (true/false)

## Performance Considerations

### Memory Management
- Streaming processing for large files
- Batch operations for database writes
- Configurable batch sizes for AI operations

### Caching
- File hash-based change detection
- Incremental processing to avoid redundant work
- Database connection pooling

### Scalability
- Parallel processing where possible
- Configurable concurrency limits
- Memory usage monitoring and optimization
