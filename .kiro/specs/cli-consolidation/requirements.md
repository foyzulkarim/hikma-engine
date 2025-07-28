# Requirements Document

## Introduction

The hikma-engine project currently has multiple entry points for indexing and searching the codebase, making it difficult to track and use consistently. The project needs to consolidate all CLI commands into a single unified interface using the `hikma` command prefix to improve developer experience and maintainability.

## Requirements

### Requirement 1

**User Story:** As a developer using hikma-engine, I want a single unified CLI command structure, so that I can easily discover and use all available functionality without confusion.

#### Acceptance Criteria

1. WHEN a user runs `hikma --help` THEN the system SHALL display all available commands and subcommands in a clear hierarchy
2. WHEN a user runs any hikma command THEN the system SHALL use consistent argument patterns and output formats
3. WHEN a user runs `hikma` without arguments THEN the system SHALL display helpful usage information

### Requirement 2

**User Story:** As a developer, I want all indexing functionality consolidated under `hikma index`, so that I can access all indexing options through a single command.

#### Acceptance Criteria

1. WHEN a user runs `hikma index` THEN the system SHALL provide all current indexing functionality from the existing indexer
2. WHEN a user runs `hikma index --help` THEN the system SHALL display all indexing options and flags
3. WHEN a user runs `hikma index [path]` THEN the system SHALL index the specified path or current directory

### Requirement 3

**User Story:** As a developer, I want all search functionality consolidated under `hikma search`, so that I can access semantic, text, hybrid, and metadata search through consistent subcommands.

#### Acceptance Criteria

1. WHEN a user runs `hikma search semantic <query>` THEN the system SHALL perform semantic search using vector embeddings
2. WHEN a user runs `hikma search text <query>` THEN the system SHALL perform text-based search
3. WHEN a user runs `hikma search hybrid <query>` THEN the system SHALL perform hybrid search with metadata filters
4. WHEN a user runs `hikma search stats` THEN the system SHALL display embedding statistics

### Requirement 4

**User Story:** As a developer, I want deprecated CLI files and npm scripts removed, so that the codebase is clean and maintainable.

#### Acceptance Criteria

1. WHEN the consolidation is complete THEN the system SHALL remove deprecated CLI files (search.ts, enhanced-search.ts)
2. WHEN the consolidation is complete THEN the system SHALL update package.json scripts to use only the unified hikma command
3. WHEN the consolidation is complete THEN the system SHALL remove or update any references to old commands in documentation

### Requirement 5

**User Story:** As a developer, I want consistent error handling and output formatting across all CLI commands, so that the user experience is predictable and professional.

#### Acceptance Criteria

1. WHEN any hikma command encounters an error THEN the system SHALL display consistent error messages with helpful context
2. WHEN any hikma command produces output THEN the system SHALL use consistent formatting (tables, JSON, markdown options where applicable)
3. WHEN any hikma command completes successfully THEN the system SHALL provide clear success feedback with relevant metrics
