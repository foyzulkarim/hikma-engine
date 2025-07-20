# Requirements Document

## Introduction

This feature replaces LanceDB with SQLite-vec for vector storage and search operations in the hikma-engine codebase. The goal is to achieve complete database unification by consolidating metadata, graph relationships, and vector embeddings into a single SQLite database with the sqlite-vec extension. This eliminates the need for a separate vector database while maintaining all semantic search capabilities.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to remove all LanceDB references from the codebase, so that the system uses only SQLite for all data storage needs.

#### Acceptance Criteria

1. WHEN LanceDB client code exists THEN the system SHALL remove the LanceDBClient class and all related methods
2. WHEN LanceDB imports are present THEN the system SHALL remove all @lancedb/lancedb import statements
3. WHEN LanceDB configuration exists THEN the system SHALL remove LanceDB configuration from the config system
4. WHEN LanceDB environment variables are referenced THEN the system SHALL remove HIKMA_LANCEDB_PATH and related environment variable handling

### Requirement 2

**User Story:** As a developer, I want SQLite to handle all vector storage and search operations, so that I can perform semantic search without requiring a separate vector database server.

#### Acceptance Criteria

1. WHEN vector embeddings need to be stored THEN the system SHALL use SQLite BLOB columns with sqlite-vec extension
2. WHEN vector similarity search is needed THEN the system SHALL use sqlite-vec functions for cosine similarity and distance calculations
3. WHEN vector indexes are required THEN the system SHALL create sqlite-vec indexes for performance optimization
4. WHEN vector operations fail THEN the system SHALL gracefully degrade to metadata-only search

### Requirement 3

**User Story:** As a developer, I want the data loader to work with only SQLite, so that the system has a unified single-database architecture.

#### Acceptance Criteria

1. WHEN the data loader initializes THEN the system SHALL only initialize SQLite client with vector extension
2. WHEN data loading occurs THEN the system SHALL persist vector embeddings to SQLite BLOB columns
3. WHEN database connections are established THEN the system SHALL only connect to SQLite database
4. WHEN database health checks run THEN the system SHALL only check SQLite connectivity

### Requirement 4

**User Story:** As a developer, I want the search service to use SQLite for all search operations, so that semantic and metadata search can be unified in single SQL queries.

#### Acceptance Criteria

1. WHEN semantic search is performed THEN the system SHALL use sqlite-vec functions for vector similarity
2. WHEN hybrid search is performed THEN the system SHALL combine vector and metadata filtering in single SQL queries
3. WHEN search results are ranked THEN the system SHALL use SQL ORDER BY with similarity scores
4. WHEN vector search is unavailable THEN the system SHALL fall back to text-based search methods

### Requirement 5

**User Story:** As a user, I want the same indexing and search experience, so that the database unification is transparent to my workflow.

#### Acceptance Criteria

1. WHEN I run the indexing command THEN the system SHALL create a single SQLite database file with all data
2. WHEN I perform searches THEN the system SHALL provide equivalent or better search quality compared to LanceDB
3. WHEN I backup my data THEN the system SHALL require only copying a single .db file
4. WHEN I inspect my data THEN the system SHALL allow using standard SQLite tools to view all information

### Requirement 6

**User Story:** As a developer, I want all documentation and configuration to reflect the unified database architecture, so that the system documentation is accurate and up-to-date.

#### Acceptance Criteria

1. WHEN configuration documentation exists THEN the system SHALL remove all LanceDB configuration references
2. WHEN API documentation mentions databases THEN the system SHALL only reference SQLite
3. WHEN health check endpoints are documented THEN the system SHALL only include SQLite health checks
4. WHEN environment variable documentation exists THEN the system SHALL remove LanceDB environment variable references

### Requirement 7

**User Story:** As a developer, I want the system to maintain all existing search functionality, so that replacing LanceDB does not reduce the system's search capabilities.

#### Acceptance Criteria

1. WHEN semantic search is performed THEN the system SHALL provide equivalent search quality using sqlite-vec
2. WHEN hybrid search operations are performed THEN the system SHALL use unified SQL queries for better performance
3. WHEN search performance is measured THEN the system SHALL maintain sub-2-second response times
4. WHEN concurrent searches are executed THEN the system SHALL handle multiple simultaneous queries efficiently

### Requirement 8

**User Story:** As a developer, I want the Docker configuration to reflect the simplified architecture, so that deployment requires fewer resources and dependencies.

#### Acceptance Criteria

1. WHEN Docker images are built THEN the system SHALL include sqlite-vec extension in the container
2. WHEN containers are started THEN the system SHALL not require separate vector database containers
3. WHEN environment variables are configured THEN the system SHALL only require SQLite-related configuration
4. WHEN health checks are performed THEN the system SHALL only monitor SQLite database connectivity
