# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-07-20

### Added
- **Unified Database Architecture**: Complete database unification using SQLite with sqlite-vec extension
- **Vector Search Capabilities**: Semantic search using sqlite-vec for vector similarity operations
- **Single Database File Output**: All data (metadata, graph relationships, and vector embeddings) stored in a single SQLite database
- **Graceful Degradation**: System continues to operate when sqlite-vec extension is unavailable, falling back to text-based search
- **Enhanced Error Monitoring**: Comprehensive error tracking and monitoring service for API operations

### Changed
- **BREAKING**: Replaced LanceDB with SQLite-vec for vector storage and search operations
- **BREAKING**: Removed all LanceDB dependencies and configuration options
- **BREAKING**: Updated DataLoader constructor to only require SQLite path (removed LanceDB path parameter)
- **BREAKING**: Simplified database configuration to only include SQLite settings
- **Database Schema**: Extended SQLite schema with vector columns (BLOB) for all node types
- **Search Service**: Updated to use SQLite vector search instead of LanceDB operations
- **Health Checks**: Simplified to only monitor SQLite database connectivity and vector extension availability
- **Docker Configuration**: Removed LanceDB services and volumes, added sqlite-vec extension installation

### Removed
- **BREAKING**: Removed LanceDB client and all related code
- **BREAKING**: Removed `HIKMA_LANCEDB_PATH` environment variable
- **BREAKING**: Removed LanceDB health check endpoints
- **BREAKING**: Removed LanceDB-related Docker services and configuration
- **Dependencies**: Removed `@lancedb/lancedb` package dependency

### Fixed
- **Configuration Initialization**: Fixed API server configuration initialization issues
- **Vector Storage**: Improved vector embedding storage and retrieval in SQLite
- **Error Handling**: Enhanced error handling for database operations and vector search failures
- **Test Compatibility**: Updated test suites to work with unified SQLite architecture

### Technical Details
- **Database Unification**: Single SQLite database now handles:
  - Metadata storage (files, commits, repositories)
  - Graph relationships (nodes and edges)
  - Vector embeddings (using sqlite-vec BLOB columns)
- **Performance**: Maintained sub-2-second response times for search operations
- **Backup Simplification**: Single database file backup and restore procedures
- **Extension Support**: Automatic detection and loading of sqlite-vec extension with fallback support

### Migration Guide
For users upgrading from v1.x:

1. **Environment Variables**: 
   - Remove `HIKMA_LANCEDB_PATH` from your environment configuration
   - Add `HIKMA_SQLITE_VEC_EXTENSION` to specify the sqlite-vec extension path

2. **Database Files**:
   - Your existing SQLite database will be automatically extended with vector columns
   - LanceDB data will need to be re-indexed using the new unified architecture

3. **Docker Configuration**:
   - Update docker-compose.yml to remove LanceDB services
   - Ensure sqlite-vec extension is available in your container

4. **API Responses**:
   - Health check responses no longer include LanceDB status
   - Search responses maintain the same format but are powered by SQLite

### Requirements
- Node.js >= 18.0.0
- SQLite with sqlite-vec extension (optional, graceful degradation available)
- Updated Docker images with sqlite-vec extension for containerized deployments

---

## [1.0.0] - 2024-XX-XX

### Added
- Initial release with LanceDB + SQLite polyglot persistence
- Multi-language AST parsing support
- Git repository analysis and indexing
- Semantic search capabilities
- REST API with comprehensive search endpoints
- Docker containerization support
- Comprehensive test suite
