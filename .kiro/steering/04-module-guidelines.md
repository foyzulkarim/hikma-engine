---
inclusion: always
---

# Module-Specific Guidelines

## Core Indexer

- The `Indexer` class in `src/core/indexer.ts` is the central orchestrator
- Follow the pipeline pattern for processing stages
- Implement proper error handling and recovery mechanisms
- Support both full and incremental indexing modes
- Provide detailed progress reporting

## File Scanner

- Efficiently discover and filter files based on patterns
- Handle large repositories with minimal memory footprint
- Extract file metadata including size, type, and content hash
- Skip binary files, node_modules, and other excluded directories
- Support incremental scanning based on Git changes

## AST Parser

- Use language-specific parsers for accurate AST extraction
- Extract code structure including functions, classes, and relationships
- Identify imports, exports, and dependencies
- Handle different programming languages consistently
- Create normalized representations of code elements

## Git Analyzer

- Extract commit history, authors, and timestamps
- Track file evolution over time
- Analyze code ownership and contribution patterns
- Link commits to pull requests when available
- Support incremental analysis from the last indexed commit

## Summary Generator

- Generate concise, informative summaries of code elements
- Use AI models efficiently with proper batching
- Handle rate limiting and fallbacks for AI services
- Cache summaries to avoid redundant generation
- Prioritize important files for summary generation

## Embedding Service

- Generate vector embeddings for semantic search
- Use efficient embedding models suitable for code
- Implement batching for performance optimization
- Handle embedding dimension consistency
- Support incremental updates to embeddings

## Data Persistence

- Implement polyglot persistence across multiple databases
- Use LanceDB for vector embeddings and similarity search
- Use SQLite for metadata and fast lookups
- Use TinkerGraph for graph relationships
- Ensure data consistency across storage systems
