# Design Document

## Overview

This design adds a new `hikma graph` command group to the existing unified CLI that provides comprehensive graph data search functionality. The feature leverages the existing `InMemoryGraphService` to enable developers to explore function call relationships, analyze code dependencies, and understand the structure of their indexed codebase through an intuitive command-line interface.

## Architecture

### Command Structure Integration

The new graph commands will be integrated into the existing unified CLI structure:

```
hikma
├── index [project-path]           # Existing indexing functionality
├── search                         # Existing search functionality
│   ├── semantic <query>
│   ├── text <query>
│   ├── hybrid <query>
│   └── stats
└── graph                          # NEW: Graph data search functionality
    ├── calls <function-name>      # Show function call relationships
    ├── chain <from> <to>          # Find call chains between functions
    ├── stats                      # Display graph statistics
    ├── search <pattern>           # Search functions by pattern
    ├── functions <file-path>      # List functions in a file
    ├── deps <file-path>           # Show file dependencies
    └── imports <file-path>        # Show file imports
```

### Integration with Existing CLI

The graph commands will be added to the existing `src/cli/main.ts` file as a new command group, following the same patterns used for the search commands. This ensures consistency in:

- Error handling using the existing `CLIError` classes
- Output formatting using the existing display functions
- Configuration management using the existing `ConfigManager`
- Logging using the existing logger utilities

## Components and Interfaces

### Graph Command Handler

```typescript
interface GraphCommandHandler {
  initialize(projectPath: string): Promise<void>;
  cleanup(): Promise<void>;
  showFunctionCalls(functionName: string, options: GraphOptions): Promise<void>;
  findCallChain(fromFunction: string, toFunction: string, options: GraphOptions): Promise<void>;
  showGraphStats(options: GraphOptions): Promise<void>;
  searchFunctions(pattern: string, options: GraphOptions): Promise<void>;
  listFunctionsInFile(filePath: string, options: GraphOptions): Promise<void>;
  showFileDependencies(filePath: string, options: GraphOptions): Promise<void>;
  showFileImports(filePath: string, options: GraphOptions): Promise<void>;
}
```

### Graph Service Integration

```typescript
interface GraphServiceWrapper {
  sqliteClient: SQLiteClient;
  graphService: InMemoryGraphService;
  isInitialized: boolean;
  
  initialize(projectPath: string): Promise<void>;
  ensureInitialized(): void;
  disconnect(): Promise<void>;
}
```

### Command Options

```typescript
interface GraphOptions {
  json?: boolean;              // Output in JSON format
  displayFormat?: 'table' | 'list' | 'tree';  // Display format
  maxDepth?: number;           // Maximum depth for call chains
  includeLineNumbers?: boolean; // Include line numbers in output
  verbose?: boolean;           // Show additional details
}
```

### Function Resolution

```typescript
interface FunctionResolution {
  exact: GraphNode[];          // Exact name matches
  partial: GraphNode[];        // Partial matches (for disambiguation)
  
  resolveFunction(name: string): GraphNode | GraphNode[] | null;
  promptForDisambiguation(functions: GraphNode[]): Promise<GraphNode>;
}
```

## Data Models

### Enhanced Graph Node Display

```typescript
interface GraphNodeDisplay {
  id: string;
  name: string;
  type: string;
  filePath: string;
  line?: number;
  signature?: string;
  
  formatForDisplay(format: 'table' | 'list' | 'tree'): string;
  getDisplayName(): string;
  getLocationString(): string;
}
```

### Call Relationship Models

```typescript
interface FunctionCallRelationship {
  caller: GraphNodeDisplay;
  callee: GraphNodeDisplay;
  callSite?: {
    line: number;
    column: number;
  };
  isDynamic: boolean;
}

interface CallChain {
  functions: GraphNodeDisplay[];
  totalHops: number;
  isComplete: boolean;
  
  formatAsTree(): string;
  formatAsList(): string;
}
```

### File Dependency Models

```typescript
interface FileDependency {
  sourceFile: string;
  targetFile: string;
  dependencyType: 'IMPORTS' | 'REQUIRES' | 'INCLUDES';
  isExternal: boolean;
}

interface DependencyGraph {
  dependencies: FileDependency[];
  dependents: FileDependency[];
  
  formatForDisplay(format: string): string;
}
```

## Error Handling

### Graph-Specific Error Types

```typescript
class GraphNotLoadedError extends CLIError {
  constructor() {
    super('Graph data not available. Please run indexing first.', 1, 'graph command');
  }
}

class FunctionNotFoundError extends CLIError {
  constructor(functionName: string) {
    super(`Function '${functionName}' not found in the indexed codebase.`, 1, 'function search');
  }
}

class AmbiguousFunctionError extends CLIError {
  constructor(functionName: string, count: number) {
    super(`Multiple functions named '${functionName}' found (${count}). Please specify file path.`, 1, 'function resolution');
  }
}

class FileNotFoundError extends CLIError {
  constructor(filePath: string) {
    super(`File '${filePath}' not found in the indexed codebase.`, 1, 'file search');
  }
}
```

### Error Recovery Strategies

1. **Missing Graph Data**: Provide clear instructions to run indexing
2. **Ambiguous Function Names**: Show disambiguation options with file paths
3. **No Results Found**: Suggest alternative search patterns or verify indexing
4. **Database Connection Issues**: Provide troubleshooting steps

## Testing Strategy

### Unit Tests

```typescript
describe('GraphCommandHandler', () => {
  describe('showFunctionCalls', () => {
    it('should display function calls and callers');
    it('should handle functions with no calls');
    it('should handle ambiguous function names');
    it('should format output correctly');
  });
  
  describe('findCallChain', () => {
    it('should find direct call chains');
    it('should find multi-hop call chains');
    it('should handle no path found');
    it('should respect max depth limits');
  });
  
  describe('error handling', () => {
    it('should handle graph not loaded');
    it('should handle function not found');
    it('should handle database errors');
  });
});
```

### Integration Tests

```typescript
describe('Graph CLI Integration', () => {
  it('should execute graph commands end-to-end');
  it('should integrate with existing CLI structure');
  it('should handle real database connections');
  it('should format output consistently');
});
```

### CLI Testing

```typescript
describe('Graph CLI Commands', () => {
  it('should parse graph command arguments correctly');
  it('should display help text properly');
  it('should handle invalid arguments gracefully');
  it('should maintain consistent output formatting');
});
```

## Implementation Details

### Database Integration

The graph commands will reuse the existing database configuration and connection patterns:

```typescript
// Leverage existing ConfigManager for database path
const config = new ConfigManager(resolvedPath);
const dbPath = config.getDatabaseConfig().sqlitePath;
const sqliteClient = new SQLiteClient(dbPath);
```

### Output Formatting

Consistent with existing CLI commands, the graph commands will support multiple output formats:

1. **Table Format**: For structured data like function lists
2. **Tree Format**: For hierarchical data like call chains
3. **List Format**: For simple enumerations
4. **JSON Format**: For programmatic consumption

### Performance Considerations

1. **Lazy Loading**: Initialize graph service only when needed
2. **Caching**: Keep graph service loaded for multiple commands in same session
3. **Memory Management**: Provide cleanup mechanisms for large graphs
4. **Query Optimization**: Use efficient graph traversal algorithms

### User Experience Enhancements

1. **Smart Function Resolution**: Handle partial matches and suggest alternatives
2. **Interactive Disambiguation**: Prompt user when multiple matches found
3. **Progress Indicators**: Show loading progress for large graphs
4. **Helpful Error Messages**: Provide actionable guidance for common issues

## Migration from Existing graph-query.ts

The existing `src/cli/graph-query.ts` file provides similar functionality but as a standalone tool. The new implementation will:

1. **Preserve Functionality**: All existing features will be available through the new commands
2. **Improve Integration**: Better integration with the unified CLI structure
3. **Enhanced UX**: Consistent error handling and output formatting
4. **Maintain Compatibility**: The standalone tool can remain for backward compatibility

### Feature Mapping

| Existing graph-query.ts | New hikma graph command |
|------------------------|-------------------------|
| `stats` | `hikma graph stats` |
| `functions <file>` | `hikma graph functions <file>` |
| `calls <function>` | `hikma graph calls <function>` |
| `chain <from> <to>` | `hikma graph chain <from> <to>` |
| `search <pattern>` | `hikma graph search <pattern>` |
| `deps <file>` | `hikma graph deps <file>` |

## Security Considerations

1. **Path Validation**: Validate file paths to prevent directory traversal
2. **Input Sanitization**: Sanitize function names and patterns to prevent injection
3. **Resource Limits**: Implement limits on graph traversal depth and result sizes
4. **Error Information**: Avoid exposing sensitive system information in error messages

## Future Enhancements

1. **Visual Graph Output**: Generate graph visualizations (DOT format, etc.)
2. **Advanced Filtering**: Filter results by file patterns, function types, etc.
3. **Metrics and Analytics**: Provide code complexity metrics based on graph data
4. **Export Capabilities**: Export graph data in various formats (GraphML, JSON, etc.)
5. **Interactive Mode**: Provide an interactive graph exploration mode
