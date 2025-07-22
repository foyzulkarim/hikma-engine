# In-Memory Graph Usage Guide

This guide explains how to use the in-memory graph functionality for efficient local repository analysis and querying.

## Overview

The in-memory graph service loads your entire AST-derived graph dataset into memory for fast querying and analysis. This is perfect for local, personal use where you want to perform complex graph operations without the overhead of database queries.

## Quick Start

### 1. Ensure Your Repository is Indexed

First, make sure you've run the indexing process to populate the graph database:

```bash
npm run dev
```

This will create the `data/metadata.db` file with your graph data.

### 2. Use the CLI Tool

The easiest way to query your graph is using the CLI tool:

```bash
# Show graph statistics
npm run graph-query stats

# List functions in a specific file
npm run graph-query functions src/utils/logger.ts

# Show function call relationships
npm run graph-query calls getLogger

# Find call chain between two functions
npm run graph-query chain main processFile

# Search functions by name pattern
npm run graph-query search "test"

# Show file dependencies
npm run graph-query deps src/utils/logger.ts

# Show help
npm run graph-query help
```

### 3. Run Advanced Analysis

For more complex analysis, use the example script:

```bash
ts-node examples/graph-analysis.ts
```

This will perform:
- Function complexity analysis
- Refactoring candidate identification
- Dead code detection
- File interconnectedness analysis
- Circular dependency detection
- Test coverage analysis

## Programmatic Usage

### Basic Setup

```typescript
import { SQLiteClient } from './src/persistence/db/connection';
import { InMemoryGraphService } from './src/utils/in-memory-graph';
import path from 'path';

// Initialize
const dbPath = path.join(process.cwd(), 'data', 'metadata.db');
const sqliteClient = new SQLiteClient(dbPath);
const graphService = new InMemoryGraphService(sqliteClient);

// Load graph
await sqliteClient.connect();
await graphService.loadGraph();

// Use the graph...

// Cleanup
await sqliteClient.disconnect();
```

### Common Queries

#### Get All Functions in a File

```typescript
const functions = graphService.getFunctionsInFile('src/utils/logger.ts');
console.log(`Found ${functions.length} functions`);
```

#### Find Function Call Relationships

```typescript
// Find what a function calls
const functionNode = graphService.getNodesByType('FunctionNode')
  .find(f => f.properties.name === 'getLogger');

if (functionNode) {
  const calls = graphService.getFunctionCalls(functionNode.id);
  const callers = graphService.getFunctionCallers(functionNode.id);
  
  console.log(`${functionNode.properties.name} calls ${calls.length} functions`);
  console.log(`${functionNode.properties.name} is called by ${callers.length} functions`);
}
```

#### Find Call Chain Between Functions

```typescript
const fromFunc = graphService.getNodesByType('FunctionNode')
  .find(f => f.properties.name === 'main');
const toFunc = graphService.getNodesByType('FunctionNode')
  .find(f => f.properties.name === 'processFile');

if (fromFunc && toFunc) {
  const chain = graphService.findCallChain(fromFunc.id, toFunc.id);
  if (chain) {
    console.log('Call chain found:', chain.map(f => f.properties.name));
  }
}
```

#### Search Functions by Pattern

```typescript
const testFunctions = graphService.searchNodes(node => 
  node.nodeType === 'FunctionNode' && 
  node.properties.name?.includes('test')
);

console.log(`Found ${testFunctions.length} test functions`);
```

#### Analyze Function Complexity

```typescript
const functions = graphService.getNodesByType('FunctionNode');
const complexity = functions.map(func => {
  const outgoing = graphService.getOutgoingEdges(func.id).length;
  const incoming = graphService.getIncomingEdges(func.id).length;
  
  return {
    name: func.properties.name,
    file: func.filePath,
    complexity: outgoing + incoming
  };
});

// Sort by complexity
complexity.sort((a, b) => b.complexity - a.complexity);
console.log('Most complex functions:', complexity.slice(0, 10));
```

## Available Methods

### Graph Loading
- `loadGraph()`: Load entire graph into memory
- `isLoaded()`: Check if graph is loaded
- `getGraph()`: Get the loaded graph structure

### Node Queries
- `getNodesByType(type)`: Get all nodes of a specific type
- `searchNodes(predicate)`: Search nodes with custom predicate
- `getFunctionsInFile(filePath)`: Get functions in a specific file

### Edge Queries
- `getEdgesByType(type)`: Get all edges of a specific type
- `searchEdges(predicate)`: Search edges with custom predicate
- `getOutgoingEdges(nodeId)`: Get edges from a node
- `getIncomingEdges(nodeId)`: Get edges to a node

### Function Analysis
- `getFunctionCalls(functionId)`: Get functions called by a function
- `getFunctionCallers(functionId)`: Get functions that call a function
- `findCallChain(fromId, toId, maxDepth)`: Find call path between functions

### File Analysis
- `getFileDependents(filePath)`: Get files that depend on a file

### Statistics
- `getStats()`: Get comprehensive graph statistics

## Data Structure

### GraphNode
```typescript
interface GraphNode {
  id: string;
  businessKey: string;
  nodeType: string;           // 'FunctionNode', 'CodeNode', 'TestNode', etc.
  properties: Record<string, any>;
  repoId?: string;
  filePath?: string;
  line?: number;
  col?: number;
  signatureHash?: string;
}
```

### GraphEdge
```typescript
interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceBusinessKey: string;
  targetBusinessKey: string;
  edgeType: string;           // 'CALLS', 'IMPORTS', 'DEFINES', etc.
  properties?: Record<string, any>;
  line?: number;
  col?: number;
  dynamic?: boolean;
}
```

## Performance Considerations

### Memory Usage
- The entire graph is loaded into memory
- For large repositories, this may use significant RAM
- Monitor memory usage with `process.memoryUsage()`

### Loading Time
- Initial load time depends on graph size
- Subsequent queries are very fast (in-memory)
- Consider loading once and reusing the service

### Data Freshness
- Graph data reflects the last indexing run
- Re-run indexing after code changes
- Reload graph after re-indexing

## Use Cases

### Code Analysis
- Find complex functions that need refactoring
- Identify dead code (isolated functions)
- Analyze function call patterns
- Detect circular dependencies

### Architecture Review
- Understand module dependencies
- Find highly coupled components
- Identify architectural hotspots
- Analyze code organization

### Test Coverage
- Find untested functions
- Analyze test-to-code relationships
- Identify test gaps

### Refactoring Support
- Find functions with many callers (extract to utility)
- Identify functions with many calls (split responsibility)
- Understand impact of changes

## Tips for Local Use

1. **Start Small**: Test with a subset of your codebase first
2. **Monitor Memory**: Use `htop` or Activity Monitor to watch RAM usage
3. **Batch Analysis**: Run analysis scripts periodically, not continuously
4. **Custom Scripts**: Create your own analysis scripts for specific needs
5. **Export Results**: Save analysis results to files for later review

## Troubleshooting

### Graph Not Loading
- Ensure `data/metadata.db` exists
- Check that indexing completed successfully
- Verify database has `graph_nodes` and `graph_edges` tables

### Memory Issues
- Reduce analysis scope (fewer files/functions)
- Use streaming approaches for very large datasets
- Consider pagination for large result sets

### Performance Issues
- Limit search depth for recursive operations
- Use specific queries instead of broad searches
- Cache results for repeated operations

## Examples

See `examples/graph-analysis.ts` for comprehensive examples of:
- Function complexity analysis
- Refactoring candidate identification
- Dead code detection
- Test coverage analysis
- Circular dependency detection

The CLI tool (`src/cli/graph-query.ts`) provides ready-to-use commands for common queries.