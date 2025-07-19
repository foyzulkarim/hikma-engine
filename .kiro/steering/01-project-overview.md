---
inclusion: always
---

# hikma-engine Project Overview

hikma-engine is a TypeScript-based code knowledge graph indexer that transforms Git repositories into multi-dimensional knowledge stores for AI agents. It creates interconnected representations of codebases through AST parsing, Git analysis, AI-powered summarization, and vector embeddings.

## Key Features

- Multi-language support (TypeScript, JavaScript, Python, Java, Go, C/C++)
- AST-based code structure extraction
- Git integration for commit history analysis
- AI-enhanced summaries for files and directories
- Vector embeddings for semantic similarity search
- Polyglot persistence using LanceDB, TinkerGraph, and SQLite
- Incremental indexing for efficient updates

## Project Structure

- `src/config/` - Configuration management
- `src/core/` - Core business logic including the main indexer
- `src/modules/` - Processing modules for different pipeline stages
- `src/persistence/` - Database clients and data access
- `src/types/` - Type definitions for the knowledge graph
- `src/utils/` - Utility functions for logging and error handling
- `src/cli/` - Command-line interface tools

## Development Guidelines

- Follow TypeScript best practices with strict typing
- Use async/await for asynchronous operations
- Implement comprehensive error handling and logging
- Write unit tests for all new functionality
- Document code with JSDoc comments
- Follow the modular architecture pattern
