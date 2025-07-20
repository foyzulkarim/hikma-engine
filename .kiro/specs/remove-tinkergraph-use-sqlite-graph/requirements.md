# Requirements Document

## Introduction

This feature removes all TinkerGraph references and dependencies from the hikma-engine codebase and ensures that SQLite is used as the primary graph database for storing and querying graph relationships. The goal is to simplify the database architecture by eliminating the TinkerGraph dependency while maintaining all graph functionality through SQLite's enhanced graph storage capabilities.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to remove all TinkerGraph references from the codebase, so that the system has a simpler database architecture without external graph database dependencies.

#### Acceptance Criteria

1. WHEN TinkerGraph client code exists THEN the system SHALL remove the TinkerGraphClient class and all related methods
2. WHEN TinkerGraph imports are present THEN the system SHALL remove all Gremlin and TinkerGraph import statements
3. WHEN TinkerGraph configuration exists THEN the system SHALL remove TinkerGraph configuration from the config system
4. WHEN TinkerGraph environment variables are referenced THEN the system SHALL remove HIKMA_TINKERGRAPH_URL and related environment variable handling

### Requirement 2

**User Story:** As a developer, I want SQLite to handle all graph data storage and queries, so that I can perform graph operations without requiring a separate graph database server.

#### Acceptance Criteria

1. WHEN graph nodes need to be stored THEN the system SHALL use SQLite enhanced graph tables for node storage
2. WHEN graph edges need to be stored THEN the system SHALL use SQLite enhanced graph tables for edge storage
3. WHEN graph traversal queries are needed THEN the system SHALL use SQLite recursive CTEs and joins for graph traversal
4. WHEN graph statistics are requested THEN the system SHALL query SQLite tables to provide vertex and edge counts

### Requirement 3

**User Story:** As a developer, I want the data loader to work with only LanceDB and SQLite, so that the system has a simplified two-database architecture.

#### Acceptance Criteria

1. WHEN the data loader initializes THEN the system SHALL only initialize LanceDB and SQLite clients
2. WHEN data loading occurs THEN the system SHALL persist graph data to SQLite enhanced graph tables
3. WHEN database connections are established THEN the system SHALL only connect to LanceDB and SQLite databases
4. WHEN database health checks run THEN the system SHALL only check LanceDB and SQLite connectivity

### Requirement 4

**User Story:** As a developer, I want all documentation and configuration to reflect the simplified database architecture, so that the system documentation is accurate and up-to-date.

#### Acceptance Criteria

1. WHEN configuration documentation exists THEN the system SHALL remove all TinkerGraph configuration references
2. WHEN API documentation mentions databases THEN the system SHALL only reference LanceDB and SQLite
3. WHEN health check endpoints are documented THEN the system SHALL only include LanceDB and SQLite health checks
4. WHEN environment variable documentation exists THEN the system SHALL remove TinkerGraph environment variable references

### Requirement 5

**User Story:** As a developer, I want the system to maintain all existing graph functionality, so that removing TinkerGraph does not reduce the system's graph query capabilities.

#### Acceptance Criteria

1. WHEN graph relationships are queried THEN the system SHALL provide equivalent functionality using SQLite
2. WHEN graph traversal operations are performed THEN the system SHALL use SQLite recursive queries to maintain performance
3. WHEN graph statistics are needed THEN the system SHALL provide accurate counts from SQLite tables
4. WHEN complex graph queries are executed THEN the system SHALL use SQLite's advanced query capabilities to maintain functionality
