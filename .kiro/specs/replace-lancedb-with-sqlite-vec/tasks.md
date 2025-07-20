# Implementation Plan

- [x] 1. Add sqlite-vec dependency and remove LanceDB dependency
  - Add sqlite-vec package to package.json dependencies
  - Remove @lancedb/lancedb from package.json dependencies
  - Download sqlite-vec extension binary for the target platform
  - Update package-lock.json by running npm install after dependency changes
  - _Requirements: 1.1, 1.2_

- [x] 2. Extend SQLite schema with vector columns
  - Add embedding BLOB column to files table
  - Add embedding BLOB column to code_nodes table
  - Add embedding BLOB column to commits table
  - Add embedding BLOB column to directories table
  - Add embedding BLOB column to test_nodes table
  - Add embedding BLOB column to pull_requests table
  - Create vector_metadata table for tracking vector dimensions and metrics
  - _Requirements: 2.1_

- [x] 3. Update SQLiteClient to support vector operations
  - Add vectorEnabled flag to track sqlite-vec extension availability
  - Implement sqlite-vec extension loading in connect() method
  - Add storeVector() method for storing embeddings in BLOB columns
  - Add vectorSearch() method for similarity search using vec_distance_cosine()
  - Add vector index creation for performance optimization
  - Implement graceful degradation when vector extension is unavailable
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Update existing SQLite batch insert methods to include vectors
  - Modify batchInsertFileNodes() to include embedding parameter
  - Modify batchInsertCodeNodes() to include embedding parameter
  - Modify batchInsertCommitNodes() to include embedding parameter
  - Modify batchInsertDirectoryNodes() to include embedding parameter
  - Modify batchInsertTestNodes() to include embedding parameter
  - Modify batchInsertPullRequestNodes() to include embedding parameter
  - _Requirements: 2.1_

- [x] 5. Remove LanceDBClient class and all related code
  - Delete entire LanceDBClient class from src/persistence/db-clients.ts
  - Remove all LanceDB import statements
  - Remove LanceDB-related interfaces and type definitions
  - Clean up any remaining LanceDB-related comments and documentation
  - _Requirements: 1.1, 1.2_

- [x] 6. Update DataLoader to remove LanceDB and use unified SQLite storage
  - Remove LanceDBClient initialization from DataLoader constructor
  - Remove lancedbClient property from DataLoader class
  - Remove batchLoadToVectorDB() method entirely
  - Update connectToDatabases() to only connect to SQLite
  - Update disconnectFromDatabases() to only disconnect from SQLite
  - Implement batchLoadToSQLiteWithVectors() method for unified storage
  - Update load() method to use only SQLite for all data types
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 7. Update SearchService to use SQLite vector search instead of LanceDB
  - Remove LanceDBClient initialization from SearchService constructor
  - Remove lancedbClient property from SearchService class
  - Update initialize() method to only connect to SQLite
  - Replace semanticSearch() implementation to use SQLite vector search
  - Update hybridSearch() to use unified SQL queries with vector and metadata filtering
  - Implement fallback to text-based search when vector search is unavailable
  - Update disconnect() method to only disconnect from SQLite
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Remove LanceDB configuration from config system
  - Remove lancedb configuration from DatabaseConfig interface in src/config/index.ts
  - Remove lancedb default configuration values
  - Remove HIKMA_LANCEDB_PATH environment variable handling
  - Add HIKMA_SQLITE_VEC_EXTENSION environment variable for extension path
  - Update getDatabaseConfig() method to only return SQLite configuration
  - _Requirements: 1.3, 1.4_

- [x] 9. Update health check service to remove LanceDB monitoring
  - Remove checkLanceDB() method from src/api/services/health-check.ts
  - Remove LanceDB health check from getSystemHealth() method
  - Update health check response format to exclude lancedb status
  - Add vector extension availability check to SQLite health check
  - Update health check documentation to reflect single database architecture
  - _Requirements: 3.4, 6.2_

- [x] 10. Update Docker configuration for unified architecture
  - Add sqlite-vec extension installation to Dockerfile.api
  - Remove LanceDB-related services from docker-compose.yml
  - Remove LanceDB volume mounts and environment variables
  - Add HIKMA_SQLITE_VEC_EXTENSION environment variable to Docker configuration
  - Update health check commands to only check SQLite connectivity
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 11. Update unit tests to remove LanceDB tests and add SQLite vector tests
  - Remove all LanceDBClient unit tests
  - Remove LanceDB connection and search operation tests
  - Add SQLiteClient vector operation tests (storeVector, vectorSearch)
  - Add tests for vector extension loading and graceful degradation
  - Add tests for unified SQL queries with vector and metadata filtering
  - Update DataLoader tests to only test SQLite connections
  - Update SearchService tests to use SQLite vector search
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 12. Update integration tests for unified database architecture
  - Remove LanceDB-related integration tests
  - Update DataLoader integration tests to only test SQLite loading
  - Add integration tests for vector storage and retrieval in SQLite
  - Update SearchService integration tests to use SQLite vector search
  - Add tests for hybrid search with unified SQL queries
  - Test complete indexing pipeline with single database
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 13. Update API documentation and configuration guides
  - Remove all LanceDB references from API documentation
  - Update database configuration documentation to only mention SQLite
  - Update health check endpoint documentation to exclude LanceDB
  - Add sqlite-vec extension setup instructions to deployment guide
  - Update environment variable documentation to remove LanceDB variables
  - Update architecture diagrams to show unified database design
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 14. Validate complete system functionality with unified architecture
  - Run full indexing pipeline to ensure it works with only SQLite
  - Verify all vector operations work correctly using sqlite-vec extension
  - Test semantic search functionality and result quality
  - Test hybrid search with metadata filtering
  - Validate that single SQLite database contains all data types (metadata + graph + vectors)
  - Test backup and restore procedures with single database file
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 15. Update environment configuration and deployment documentation
  - Remove HIKMA_LANCEDB_PATH from .env.example file
  - Add HIKMA_SQLITE_VEC_EXTENSION to .env.example file
  - Update deployment scripts to reflect single database architecture
  - Update configuration guide to remove LanceDB setup instructions
  - Add sqlite-vec extension installation instructions for different platforms
  - Update backup and restore documentation for single database file
  - _Requirements: 1.4, 6.1, 6.3, 6.4_

- [x] 16. Final validation and cleanup
  - Verify no LanceDB references remain in the codebase
  - Ensure all tests pass with the unified SQLite architecture
  - Validate that users can index repositories and get single .db file output
  - Test that semantic and hybrid search work correctly
  - Confirm that the system gracefully handles sqlite-vec extension unavailability
  - Update version numbers and changelog for the unified architecture release
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4_
