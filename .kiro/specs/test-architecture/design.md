# Test Architecture Design

## Overview

This design establishes a comprehensive test architecture for the hikma-engine codebase that ensures code quality, prevents regressions, and maintains confidence during development and refactoring. The architecture follows industry best practices with Jest as the primary testing framework, implementing a multi-layered testing strategy that covers unit tests, integration tests, end-to-end tests, and performance tests.

The test architecture is designed to work seamlessly with the existing TypeScript codebase, SQLite database with vector extensions, and the phase-based indexing pipeline. It provides robust mocking capabilities, test utilities, and fixtures to support efficient test development and maintenance.

## Architecture

### Test Layer Structure

The test architecture follows a pyramid structure with four distinct layers:

```
    /\
   /  \    E2E Tests (Few, High-Value)
  /____\
 /      \   Integration Tests (Some, Component Interactions)
/________\
/        \  Unit Tests (Many, Fast, Isolated)
/__________\
Performance & Load Tests (Specialized, Continuous)
```

#### 1. Unit Test Layer
- **Purpose**: Test individual functions, classes, and modules in isolation
- **Location**: Co-located with source files (`*.test.ts`) and dedicated test directories
- **Coverage**: 80%+ code coverage requirement
- **Characteristics**: Fast execution (<1s per test), isolated, deterministic

#### 2. Integration Test Layer
- **Purpose**: Test component interactions and data flow between modules
- **Location**: `tests/integration/` directory
- **Coverage**: Critical component interactions and database operations
- **Characteristics**: Medium execution time, uses test databases, validates workflows

#### 3. End-to-End Test Layer
- **Purpose**: Test complete user workflows from input to output
- **Location**: `tests/e2e/` directory
- **Coverage**: CLI commands, API endpoints, complete indexing workflows
- **Characteristics**: Slower execution, uses temporary repositories, full system validation

#### 4. Performance Test Layer
- **Purpose**: Validate system performance under load and stress conditions
- **Location**: `tests/performance/` directory
- **Coverage**: Indexing performance, API response times, memory usage
- **Characteristics**: Long-running, resource monitoring, benchmark validation

### Component Testing Strategy

#### Core Indexer Testing
- **Unit Tests**: Individual phase execution, configuration handling, error recovery
- **Integration Tests**: Phase transitions, database persistence, file processing pipeline
- **E2E Tests**: Complete repository indexing workflows
- **Performance Tests**: Large repository indexing, memory usage patterns

#### Database Layer Testing
- **Unit Tests**: Connection management, query building, transaction handling
- **Integration Tests**: Data persistence, vector operations, schema migrations
- **E2E Tests**: Complete data lifecycle from indexing to search
- **Performance Tests**: Batch operations, concurrent access, vector search performance

#### API Layer Testing
- **Unit Tests**: Route handlers, middleware, validation logic
- **Integration Tests**: Request/response cycles, authentication, error handling
- **E2E Tests**: Complete API workflows with real database interactions
- **Performance Tests**: Load testing, concurrent request handling, response times

#### CLI Testing
- **Unit Tests**: Command parsing, option validation, output formatting
- **Integration Tests**: Command execution with database operations
- **E2E Tests**: Complete CLI workflows with temporary repositories
- **Performance Tests**: Command execution time, resource usage

## Components and Interfaces

### Test Configuration System

#### Jest Configuration Structure
```typescript
interface TestConfig {
  unit: JestConfig;
  integration: JestConfig;
  e2e: JestConfig;
  performance: JestConfig;
}

interface JestConfig {
  preset: string;
  testEnvironment: string;
  testMatch: string[];
  setupFilesAfterEnv: string[];
  coverageThreshold: CoverageThreshold;
  timeout: number;
}
```

#### Test Environment Management
```typescript
interface TestEnvironment {
  type: 'unit' | 'integration' | 'e2e' | 'performance';
  database: DatabaseConfig;
  filesystem: FilesystemConfig;
  external: ExternalServiceConfig;
}

interface DatabaseConfig {
  sqlite: {
    path: string;
    vectorExtension: string;
    cleanup: boolean;
  };
}
```

### Mock System Architecture

#### Database Mocking
```typescript
interface MockDatabase {
  sqlite: MockSQLiteClient;
  vector: MockVectorOperations;
  transaction: MockTransactionManager;
}

interface MockSQLiteClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}
```

#### File System Mocking
```typescript
interface MockFileSystem {
  createTempDirectory(): string;
  createTestFiles(structure: FileStructure): void;
  cleanup(): void;
  mockGitRepository(config: GitRepoConfig): void;
}

interface FileStructure {
  [path: string]: string | FileStructure;
}
```

#### External Service Mocking
```typescript
interface MockExternalServices {
  embedding: MockEmbeddingService;
  ai: MockAIService;
  git: MockGitService;
}

interface MockEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  batchGenerate(texts: string[]): Promise<number[][]>;
}
```

### Test Utilities and Fixtures

#### Test Data Factory
```typescript
interface TestDataFactory {
  createRepository(options?: RepositoryOptions): RepositoryNode;
  createFile(options?: FileOptions): FileNode;
  createCodeNode(options?: CodeOptions): CodeNode;
  createCommit(options?: CommitOptions): CommitNode;
  createEmbedding(dimensions?: number): number[];
  createTestProject(structure: ProjectStructure): string;
}
```

#### Test Database Manager
```typescript
interface TestDatabaseManager {
  createTestDatabase(): Promise<string>;
  seedDatabase(data: TestData): Promise<void>;
  cleanupDatabase(path: string): Promise<void>;
  createSnapshot(): Promise<string>;
  restoreSnapshot(snapshotId: string): Promise<void>;
}
```

#### Assertion Helpers
```typescript
interface TestAssertions {
  expectDatabaseState(expected: DatabaseState): void;
  expectFileStructure(path: string, expected: FileStructure): void;
  expectPerformanceMetrics(metrics: PerformanceMetrics): void;
  expectVectorSimilarity(vector1: number[], vector2: number[], threshold: number): void;
}
```

## Data Models

### Test Configuration Models

#### Test Suite Configuration
```typescript
interface TestSuiteConfig {
  name: string;
  type: TestType;
  timeout: number;
  retries: number;
  parallel: boolean;
  setup: SetupConfig;
  teardown: TeardownConfig;
}

interface SetupConfig {
  database: boolean;
  filesystem: boolean;
  mocks: string[];
  fixtures: string[];
}
```

#### Test Execution Context
```typescript
interface TestContext {
  testId: string;
  suiteName: string;
  testName: string;
  startTime: Date;
  resources: TestResources;
  cleanup: CleanupFunction[];
}

interface TestResources {
  databases: string[];
  tempDirectories: string[];
  mockServices: MockService[];
}
```

### Test Data Models

#### Repository Test Data
```typescript
interface TestRepository {
  id: string;
  path: string;
  name: string;
  files: TestFile[];
  commits: TestCommit[];
  branches: string[];
}

interface TestFile {
  path: string;
  content: string;
  language: string;
  size: number;
  hash: string;
}
```

#### Performance Test Models
```typescript
interface PerformanceTestResult {
  testName: string;
  duration: number;
  memoryUsage: MemoryMetrics;
  cpuUsage: number;
  databaseOperations: DatabaseMetrics;
  passed: boolean;
  threshold: PerformanceThreshold;
}

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}
```

## Error Handling

### Test Error Classification

#### Test Failure Types
```typescript
enum TestFailureType {
  ASSERTION_FAILURE = 'assertion_failure',
  TIMEOUT = 'timeout',
  SETUP_FAILURE = 'setup_failure',
  TEARDOWN_FAILURE = 'teardown_failure',
  RESOURCE_UNAVAILABLE = 'resource_unavailable',
  PERFORMANCE_DEGRADATION = 'performance_degradation'
}
```

#### Error Recovery Strategies
```typescript
interface ErrorRecoveryStrategy {
  retryCount: number;
  backoffStrategy: BackoffStrategy;
  fallbackAction: FallbackAction;
  cleanupRequired: boolean;
}

interface TestErrorHandler {
  handleSetupFailure(error: Error, context: TestContext): Promise<void>;
  handleTestFailure(error: Error, context: TestContext): Promise<void>;
  handleTeardownFailure(error: Error, context: TestContext): Promise<void>;
  reportError(error: TestError): void;
}
```

### Resource Management

#### Test Resource Cleanup
```typescript
interface ResourceCleanup {
  databases: DatabaseCleanup[];
  files: FileCleanup[];
  processes: ProcessCleanup[];
  mocks: MockCleanup[];
}

interface DatabaseCleanup {
  path: string;
  removeFile: boolean;
  closeConnections: boolean;
}
```

## Testing Strategy

### Unit Testing Strategy

#### Test Organization
- **File Structure**: Mirror source code structure in test directories
- **Naming Convention**: `*.test.ts` for unit tests, `*.spec.ts` for specification tests
- **Test Grouping**: Use `describe` blocks for logical grouping by functionality
- **Test Isolation**: Each test should be independent and not rely on other tests

#### Mocking Strategy
- **External Dependencies**: Mock all external services and APIs
- **Database Operations**: Use in-memory SQLite for fast unit tests
- **File System**: Mock file system operations to avoid disk I/O
- **Time-Dependent Code**: Mock Date and setTimeout for deterministic tests

#### Coverage Requirements
- **Line Coverage**: Minimum 80% line coverage
- **Branch Coverage**: Minimum 75% branch coverage
- **Function Coverage**: Minimum 85% function coverage
- **Statement Coverage**: Minimum 80% statement coverage

### Integration Testing Strategy

#### Component Integration
- **Database Integration**: Test actual database operations with test databases
- **Module Integration**: Test interactions between core modules
- **API Integration**: Test request/response cycles with middleware
- **Pipeline Integration**: Test data flow through indexing pipeline

#### Test Data Management
- **Test Databases**: Isolated test databases for each test suite
- **Data Seeding**: Consistent test data setup and teardown
- **Transaction Rollback**: Use database transactions for test isolation
- **Schema Validation**: Verify database schema consistency

### End-to-End Testing Strategy

#### Workflow Testing
- **CLI Workflows**: Test complete command execution with real repositories
- **API Workflows**: Test complete request processing with authentication
- **Indexing Workflows**: Test full repository indexing and search
- **Error Scenarios**: Test error handling in complete workflows

#### Environment Management
- **Temporary Repositories**: Create and cleanup test repositories
- **Isolated Environments**: Each E2E test runs in isolated environment
- **Resource Cleanup**: Automatic cleanup of test resources
- **State Verification**: Verify final system state after workflows

### Performance Testing Strategy

#### Performance Metrics
- **Execution Time**: Measure and validate execution times
- **Memory Usage**: Monitor memory consumption and detect leaks
- **Database Performance**: Measure query execution times
- **Throughput**: Test system throughput under load

#### Load Testing
- **Concurrent Operations**: Test system under concurrent load
- **Large Datasets**: Test with large repositories and datasets
- **Stress Testing**: Test system limits and failure modes
- **Regression Testing**: Detect performance regressions

## Files and File Groups to be Tested

### Core System Files (Priority: Critical)

#### 1. Core Indexing Engine
- **src/core/indexer.ts** - Main indexer orchestrator
- **src/core/PhaseManager.ts** - Phase-based indexing management
- **src/core/indexing/IndexingStrategy.ts** - Indexing strategy implementation
- **src/core/indexing/FileDiscovery.ts** - File discovery and filtering
- **src/core/indexing/AstExtractor.ts** - AST parsing and extraction
- **src/core/indexing/GitExtractor.ts** - Git history analysis
- **src/core/indexing/EmbeddingExtractor.ts** - Vector embedding generation
- **src/core/indexing/SummaryExtractor.ts** - AI-powered summary generation
- **src/core/indexing/NodeCreator.ts** - Knowledge graph node creation
- **src/core/indexing/DataPersister.ts** - Data persistence coordination

#### 2. Configuration Management
- **src/config/index.ts** - Configuration management system

#### 3. Utility Functions
- **src/utils/logger.ts** - Logging infrastructure
- **src/utils/error-handling.ts** - Error handling and recovery
- **src/utils/in-memory-graph.ts** - In-memory graph operations

### Data Layer Files (Priority: Critical)

#### 4. Database Connection and Management
- **src/persistence/db/connection.ts** - SQLite database connection management
- **src/persistence/db/schema.ts** - Database schema definitions
- **src/persistence/db/vector.ts** - Vector operations and search
- **src/persistence/db/stats.ts** - Database statistics and monitoring
- **src/persistence/db-clients.ts** - Database client implementations

#### 5. Data Models (Priority: High)
- **src/persistence/models/base.model.ts** - Base model functionality
- **src/persistence/models/base.dto.ts** - Base DTO functionality
- **src/persistence/models/RepositoryModel.ts** - Repository data model
- **src/persistence/models/FileModel.ts** - File data model
- **src/persistence/models/GraphNodeModel.ts** - Graph node model
- **src/persistence/models/GraphEdgeModel.ts** - Graph edge model
- **src/persistence/models/EmbeddingNodeModel.ts** - Embedding node model
- **src/persistence/models/IndexingStateModel.ts** - Indexing state tracking
- **src/persistence/models/PhaseStatusModel.ts** - Phase status tracking

#### 6. Repository Pattern Implementation (Priority: High)
- **src/persistence/repository/IRepository.ts** - Repository interface
- **src/persistence/repository/GenericRepository.ts** - Generic repository implementation
- **src/persistence/repositories/RepositoryRepository.ts** - Repository-specific operations
- **src/persistence/repositories/FileRepository.ts** - File-specific operations
- **src/persistence/repositories/GraphNodeRepository.ts** - Graph node operations
- **src/persistence/repositories/GraphEdgeRepository.ts** - Graph edge operations
- **src/persistence/repositories/CodeNodeRepository.ts** - Code node operations
- **src/persistence/repositories/IndexingStateRepository.ts** - Indexing state operations

#### 7. Unit of Work Pattern (Priority: Medium)
- **src/persistence/unit-of-work/IUnitOfWork.ts** - Unit of work interface
- **src/persistence/unit-of-work/UnitOfWork.ts** - Unit of work implementation
- **src/persistence/PhaseRepository.ts** - Phase-specific repository

### Business Logic Files (Priority: High)

#### 8. Module Services
- **src/modules/data-loader.ts** - Data loading and persistence
- **src/modules/enhanced-search-service.ts** - Enhanced search functionality
- **src/modules/search-service.ts** - Legacy search service (deprecated)
- **src/modules/embedding-service.ts** - Embedding generation service
- **src/modules/ast-parser.ts** - AST parsing functionality
- **src/modules/enhanced-ast-parser.ts** - Enhanced AST parsing
- **src/modules/file-scanner.ts** - File system scanning
- **src/modules/git-analyzer.ts** - Git repository analysis
- **src/modules/summary-generator.ts** - AI summary generation
- **src/modules/answer-synthesizer.ts** - Answer synthesis for queries

#### 9. Indexing Modules
- **src/modules/indexing/Indexer.ts** - Module-level indexer
- **src/modules/indexing/index.ts** - Indexing module exports

### API Layer Files (Priority: High)

#### 10. API Configuration and Setup
- **src/api/index.ts** - API entry point
- **src/api/server.ts** - Express server setup
- **src/api/config/api-config.ts** - API configuration management

#### 11. API Controllers (Priority: High)
- **src/api/controllers/search-controller.ts** - Search endpoint controller
- **src/api/controllers/index.ts** - Controller exports

#### 12. API Middleware (Priority: High)
- **src/api/middleware/auth.ts** - Authentication middleware
- **src/api/middleware/validation.ts** - Request validation middleware
- **src/api/middleware/error-handling.ts** - Error handling middleware
- **src/api/middleware/rate-limiting.ts** - Rate limiting middleware
- **src/api/middleware/security.ts** - Security middleware
- **src/api/middleware/correlation.ts** - Request correlation middleware

#### 13. API Routes (Priority: Medium)
- **src/api/routes/search.ts** - Search routes
- **src/api/routes/health.ts** - Health check routes
- **src/api/routes/monitoring.ts** - Monitoring routes
- **src/api/routes/index.ts** - Route exports

#### 14. API Services (Priority: Medium)
- **src/api/services/cache-service.ts** - Caching service
- **src/api/services/health-check.ts** - Health check service
- **src/api/services/performance-optimizer.ts** - Performance optimization
- **src/api/services/result-enhancer.ts** - Result enhancement
- **src/api/services/error-monitoring.ts** - Error monitoring

#### 15. API Utilities (Priority: Medium)
- **src/api/utils/pagination.ts** - Pagination utilities
- **src/api/utils/response-formatter.ts** - Response formatting
- **src/api/utils/timing.ts** - Timing utilities

### CLI Layer Files (Priority: Medium)

#### 16. Command Line Interface
- **src/cli/main.ts** - Main CLI entry point
- **src/cli/graph-query.ts** - Graph query CLI commands

### Type Definitions (Priority: Medium)

#### 17. Type System
- **src/types/index.ts** - Core type definitions
- **src/types/enhanced-graph.ts** - Enhanced graph types
- **src/api/types/responses.ts** - API response types

### Supporting Files (Priority: Low)

#### 18. Documentation and Configuration
- **src/api/docs/swagger.ts** - API documentation setup
- **src/persistence/utils/schema-generator.ts** - Schema generation utilities

### Test File Groups by Testing Strategy

#### Unit Test Priority Groups

**Group A (Critical - Implement First)**
- Core indexing engine (files 1-3)
- Database connection and management (file 4)
- Configuration management (file 2)
- Utility functions (file 3)

**Group B (High Priority)**
- Data models (file 5)
- Repository implementations (file 6)
- Business logic modules (files 8-9)
- API controllers and middleware (files 11-12)

**Group C (Medium Priority)**
- Unit of work pattern (file 7)
- API routes and services (files 13-14)
- CLI functionality (file 16)
- API utilities (file 15)

**Group D (Lower Priority)**
- Type definitions (file 17)
- Supporting utilities (file 18)

#### Integration Test Priority Groups

**Integration Group 1 (Critical)**
- Core indexing pipeline (files 1 + 8 + 4)
- Database operations (files 4 + 5 + 6)
- Search functionality (files 8 + 4 + 5)

**Integration Group 2 (High)**
- API request/response cycle (files 10 + 11 + 12 + 13)
- Data loading and persistence (files 8 + 4 + 6)
- CLI command execution (files 16 + 1 + 4)

**Integration Group 3 (Medium)**
- Error handling across layers (files 3 + 12 + 14)
- Performance monitoring (files 14 + 15)
- Authentication and security (files 12 + 13)

#### End-to-End Test Priority Groups

**E2E Group 1 (Critical Workflows)**
- Complete repository indexing workflow
- Search query execution workflow
- CLI indexing and querying workflow

**E2E Group 2 (API Workflows)**
- API authentication and search workflow
- API error handling workflow
- API performance monitoring workflow

**E2E Group 3 (Error Scenarios)**
- Database failure recovery
- File system error handling
- Network connectivity issues

## Implementation Plan

### Phase 1: Foundation and Critical Components (Week 1-2)
**Focus: Core system stability and database operations**

1. **Test Infrastructure Setup**
   - Configure Jest for multi-environment testing
   - Create test utilities and helper functions
   - Implement basic mocking infrastructure
   - Set up test database management

2. **Group A Unit Tests (Critical)**
   - src/core/indexer.ts - Main indexer functionality
   - src/core/PhaseManager.ts - Phase management
   - src/persistence/db/connection.ts - Database connectivity
   - src/config/index.ts - Configuration management
   - src/utils/logger.ts - Logging system
   - src/utils/error-handling.ts - Error handling

3. **Integration Group 1 (Critical)**
   - Core indexing pipeline integration
   - Database connection and operations
   - Basic search functionality

### Phase 2: Data Layer and Business Logic (Week 3-4)
**Focus: Data persistence and core business logic**

1. **Group B Unit Tests (High Priority)**
   - All data models (src/persistence/models/*)
   - Repository implementations (src/persistence/repositories/*)
   - Core modules (src/modules/data-loader.ts, enhanced-search-service.ts)
   - API controllers (src/api/controllers/*)

2. **Integration Group 2 (High Priority)**
   - API request/response integration
   - Data loading and persistence workflows
   - Repository pattern integration

3. **E2E Group 1 (Critical Workflows)**
   - Complete repository indexing
   - Search query execution
   - CLI basic operations

### Phase 3: API Layer and Advanced Features (Week 5-6)
**Focus: API functionality and advanced features**

1. **Group C Unit Tests (Medium Priority)**
   - API middleware (src/api/middleware/*)
   - API routes (src/api/routes/*)
   - API services (src/api/services/*)
   - CLI functionality (src/cli/*)

2. **Integration Group 3 (Medium Priority)**
   - Error handling across layers
   - Performance monitoring integration
   - Authentication and security

3. **E2E Group 2 (API Workflows)**
   - Complete API workflows
   - Authentication flows
   - Error handling scenarios

### Phase 4: Performance and Reliability (Week 7-8)
**Focus: Performance testing and system reliability**

1. **Performance Test Framework**
   - Create performance testing infrastructure
   - Implement benchmark tests for core operations
   - Set up load testing for API endpoints
   - Memory usage and leak detection

2. **Group D Unit Tests (Lower Priority)**
   - Type definitions and utilities
   - Supporting functionality
   - Documentation generators

3. **E2E Group 3 (Error Scenarios)**
   - Database failure recovery
   - File system error handling
   - Network connectivity issues

### Phase 5: Test Automation and CI/CD (Week 9-10)
**Focus: Automation and continuous integration**

1. **Test Automation Setup**
   - Configure automated test execution
   - Set up test result reporting
   - Implement test coverage tracking
   - Create test failure notifications

2. **Performance Regression Testing**
   - Set up performance benchmarks
   - Create regression detection
   - Integrate performance tests into CI/CD

3. **Test Optimization**
   - Optimize test execution performance
   - Implement parallel test execution
   - Create test result caching
   - Fine-tune coverage thresholds
