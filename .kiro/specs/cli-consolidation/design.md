# Design Document

## Overview

This design consolidates all CLI functionality in the hikma-engine project into a single unified command structure using the `hikma` prefix. The current system has multiple entry points (`hikma`, `search`, `enhanced-search`, `graph-query`) that create confusion and maintenance overhead. The new design will provide a clean, hierarchical command structure that's easy to discover and use.

## Architecture

### Command Structure

The unified CLI will follow this hierarchical structure:

```
hikma
├── index [project-path]           # Indexing functionality
├── search                         # Search functionality
│   ├── semantic <query>          # Semantic search using embeddings
│   ├── text <query>              # Text-based search
│   ├── hybrid <query>            # Hybrid search with metadata filters
│   └── stats                     # Embedding statistics
└── --help                        # Global help
```

### Current State Analysis

**Existing Files:**
- `src/cli/main.ts` - Already implements unified CLI with `hikma` prefix
- `src/cli/search.ts` - DEPRECATED, marked for removal
- `src/cli/enhanced-search.ts` - DEPRECATED, marked for removal  
- `src/cli/graph-query.ts` - Standalone graph querying tool (will remain separate)
- `src/cli/commands/enhanced-search.ts` - Command definitions (unused)

**Package.json Scripts:**
- `hikma` - Points to unified CLI (✓ correct)
- `search` - DEPRECATED, shows deprecation message
- `enhanced-search` - DEPRECATED, shows deprecation message
- `graph-query` - Separate tool (will remain as-is per requirements)

## Components and Interfaces

### CLI Command Structure

The main CLI program uses Commander.js with the following structure:

```typescript
interface CLIProgram {
  name: string;           // 'hikma'
  description: string;    // Main program description
  version: string;        // Version from package.json
  commands: Command[];    // Array of subcommands
}

interface Command {
  name: string;           // Command name (e.g., 'index', 'search')
  description: string;    // Command description
  options: Option[];      // Command-specific options
  subcommands?: Command[]; // Nested subcommands
  action: Function;       // Command handler function
}
```

### Command Handlers

Each command will have dedicated handler functions:

```typescript
interface CommandHandler {
  execute(args: any, options: any): Promise<void>;
  validateInput(args: any, options: any): boolean;
  displayResults(results: any, format: string): void;
}
```

### Output Formatting

Consistent output formatting across all commands:

```typescript
interface OutputFormatter {
  displayTable(data: any[], headers: string[]): void;
  displayMarkdown(data: any[], title: string): void;
  displayJSON(data: any): void;
  displayError(error: Error): void;
  displaySuccess(message: string, metrics?: any): void;
}
```

## Data Models

### Command Options

```typescript
interface IndexOptions {
  forceFull?: boolean;
  skipAISummary?: boolean;
  skipEmbeddings?: boolean;
  dryRun?: boolean;
  phases?: number[];
  fromPhase?: number;
  forcePhases?: number[];
  inspectPhase?: number;
  showStatus?: boolean;
}

interface SearchOptions {
  limit?: number;
  similarity?: number;
  types?: string[];
  files?: string[];
  includeEmbedding?: boolean;
  json?: boolean;
  displayFormat?: 'table' | 'markdown';
}
```

### Result Models

```typescript
interface SearchResult {
  node: {
    nodeId: string;
    nodeType: string;
    filePath: string;
    sourceText: string;
  };
  similarity?: number;
  dataSource: string;
}

interface IndexResult {
  isIncremental: boolean;
  processedFiles: number;
  totalNodes: number;
  totalEdges: number;
  duration: number;
  errors: string[];
}
```

## Error Handling

### Error Categories

1. **Input Validation Errors**: Invalid arguments, missing required parameters
2. **Configuration Errors**: Missing config files, invalid settings
3. **Database Errors**: Connection failures, query errors
4. **Processing Errors**: Indexing failures, search service errors

### Error Display Strategy

```typescript
interface ErrorHandler {
  handleValidationError(error: ValidationError): void;
  handleConfigurationError(error: ConfigError): void;
  handleDatabaseError(error: DatabaseError): void;
  handleProcessingError(error: ProcessingError): void;
  displayErrorWithContext(error: Error, context: string): void;
}
```

All errors will be displayed with:
- Consistent formatting using chalk colors
- Helpful context and suggestions
- Exit codes (0 for success, 1 for errors)

## Testing Strategy

### Unit Tests

- Test each command handler in isolation
- Mock external dependencies (database, file system)
- Test input validation and error handling
- Test output formatting functions

### Integration Tests

- Test complete command execution flows
- Test with real database connections
- Test error scenarios and recovery
- Test output formatting with real data

### CLI Testing

```typescript
interface CLITestSuite {
  testCommandParsing(): void;
  testHelpOutput(): void;
  testErrorHandling(): void;
  testOutputFormats(): void;
  testDeprecationMessages(): void;
}
```

## Implementation Plan

### Phase 1: Code Cleanup
- Remove deprecated CLI files (`search.ts`, `enhanced-search.ts`)
- Clean up unused command files
- Update package.json scripts

### Phase 2: Enhanced Main CLI
- Ensure all functionality is properly integrated in `main.ts`
- Add any missing command options or features
- Improve error handling and output formatting

### Phase 3: Documentation and Testing
- Update help text and documentation
- Add comprehensive tests
- Validate all command flows

## Migration Strategy

### Backward Compatibility

The deprecated commands already show deprecation messages:
```bash
npm run search -> "DEPRECATED: Use npm run hikma search instead"
npm run enhanced-search -> "DEPRECATED: Use npm run hikma search instead"
```

### User Communication

1. Keep deprecation messages during transition period
2. Update any documentation to reference new commands
3. Provide clear migration examples in help text

### Cleanup Timeline

1. **Immediate**: Remove deprecated files and update scripts
2. **Next Release**: Remove deprecation messages and old script entries
3. **Future**: Monitor for any remaining references in documentation

## File Structure Changes

### Files to Remove
- `src/cli/search.ts` (already deprecated)
- `src/cli/enhanced-search.ts` (already deprecated)
- `src/cli/commands/enhanced-search.ts` (unused)

### Files to Modify
- `package.json` - Update scripts section
- `src/cli/main.ts` - Ensure complete functionality coverage

### Files to Keep
- `src/cli/graph-query.ts` - Remains separate as per requirements
- `src/cli/main.ts` - Main unified CLI entry point
