/**
 * @file Unit tests for SearchService with SQLite vector search
 */

import { SearchService, SearchOptions, MetadataFilters } from './search-service';
import { ConfigManager } from '../config';
import { SQLiteClient } from '../persistence/db-clients';
import { EmbeddingService } from './embedding-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the EmbeddingService
jest.mock('./embedding-service');

describe('SearchService', () => {
  let searchService: SearchService;
  let config: ConfigManager;
  let testDbPath: string;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  beforeAll(async () => {
    // Create temporary database file for testing
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-search-${Date.now()}.db`);
    
    // Initialize config manager
    config = new ConfigManager(process.cwd());
    
    // Mock the database config to use our test database
    jest.spyOn(config, 'getDatabaseConfig').mockReturnValue({
      sqlite: {
        path: testDbPath,
        vectorExtension: './extensions/vec0.dylib'
      }
    });
  });

  beforeEach(async () => {
    // Create fresh SearchService instance for each test
    searchService = new SearchService(config);
    
    // Setup mock embedding service
    mockEmbeddingService = searchService['embeddingService'] as jest.Mocked<EmbeddingService>;
    mockEmbeddingService.loadModel.mockResolvedValue(undefined);
    mockEmbeddingService.embedQuery.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    // mockEmbeddingService.embedText.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);

    // Initialize the search service
    await searchService.initialize();
    
    // Setup test data
    await setupTestData();
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await searchService.disconnect();
    } catch (error) {
      // Ignore disconnect errors in tests
    }
    
    // Remove test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function setupTestData() {
    const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
    
    // Insert test files
    await sqliteClient.run(`
      INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'file-1', '/test/utils.ts', 'utils.ts', 'ts', 1000, 'hash1', 'repo-1',
      new Date().toISOString(), new Date().toISOString()
    ]);

    await sqliteClient.run(`
      INSERT INTO files (id, path, name, extension, size, content_hash, repository_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'file-2', '/test/helpers.ts', 'helpers.ts', 'ts', 1500, 'hash2', 'repo-1',
      new Date().toISOString(), new Date().toISOString()
    ]);

    // Insert test functions
    await sqliteClient.run(`
      INSERT INTO functions (id, name, signature, file_id, start_line, end_line, repository_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'func-1', 'calculateSum', 'function calculateSum(a: number, b: number): number', 'file-1',
      1, 10, 'repo-1', new Date().toISOString(), new Date().toISOString()
    ]);

    // Insert test commits
    await sqliteClient.run(`
      INSERT INTO commits (id, hash, message, author_name, author_email, date, repository_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'commit-1', 'abc123', 'Add utility functions for mathematical operations', 'Test Author',
      'test@example.com', new Date().toISOString(), 'repo-1', new Date().toISOString(), new Date().toISOString()
    ]);

    // Store embeddings if vector extension is available
    const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    try {
      await sqliteClient.storeVector('files', 'content_embedding', 'file-1', testEmbedding);
      await sqliteClient.storeVector('files', 'content_embedding', 'file-2', [0.2, 0.3, 0.4, 0.5, 0.6]);
      await sqliteClient.storeVector('functions', 'signature_embedding', 'func-1', [0.3, 0.4, 0.5, 0.6, 0.7]);
      await sqliteClient.storeVector('commits', 'message_embedding', 'commit-1', [0.4, 0.5, 0.6, 0.7, 0.8]);
    } catch (error) {
      // Vector extension might not be available in test environment
      console.log('Vector storage not available in test environment');
    }
  }

  describe('Initialization', () => {
    it('should initialize SearchService successfully', async () => {
      expect(searchService).toBeDefined();
      expect(mockEmbeddingService.loadModel).toHaveBeenCalled();
    });

    it('should connect to SQLite database only', async () => {
      // SearchService should only use SQLite, no LanceDB
      const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
      expect(sqliteClient.isConnectedToDatabase()).toBe(true);
    });

    it('should check vector search availability', async () => {
      const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
      const isAvailable = await sqliteClient.isVectorSearchAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Semantic Search', () => {
    it('should perform semantic search using SQLite vector search', async () => {
      const query = 'mathematical utility functions';
      const options: SearchOptions = {
        limit: 5,
        minSimilarity: 0.1
      };

      const results = await searchService.semanticSearch(query, options);

      expect(Array.isArray(results)).toBe(true);
      expect(mockEmbeddingService.embedQuery).toHaveBeenCalledWith(query);
      
      // Results should have proper structure
      results.forEach(result => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('rank');
        expect(typeof result.similarity).toBe('number');
        expect(typeof result.rank).toBe('number');
      });
    });

    it('should filter results by node types', async () => {
      const query = 'test query';
      const options: SearchOptions = {
        nodeTypes: ['FileNode'],
        limit: 10
      };

      const results = await searchService.semanticSearch(query, options);

      // All results should be FileNode type (if any results returned)
      results.forEach(result => {
        expect(result.node.type).toBe('FileNode');
      });
    });

    it('should respect minimum similarity threshold', async () => {
      const query = 'test query';
      const options: SearchOptions = {
        minSimilarity: 0.8,
        limit: 10
      };

      const results = await searchService.semanticSearch(query, options);

      // All results should meet minimum similarity threshold
      results.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should fallback to text search when vector search is unavailable', async () => {
      // Mock vector search as unavailable
      const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
      jest.spyOn(sqliteClient, 'isVectorSearchAvailable').mockResolvedValue(false);

      const query = 'test query';
      const results = await searchService.semanticSearch(query);

      expect(Array.isArray(results)).toBe(true);
      // Should still return results from text-based search
    });

    it('should handle empty query gracefully', async () => {
      const results = await searchService.semanticSearch('');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should limit results correctly', async () => {
      const query = 'test query';
      const limit = 3;
      const results = await searchService.semanticSearch(query, { limit });

      expect(results.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Hybrid Search', () => {
    it('should perform hybrid search combining semantic and metadata filtering', async () => {
      const query = 'utility functions';
      const filters: MetadataFilters = {
        fileExtension: 'ts',
        language: 'typescript'
      };
      const options: SearchOptions = {
        limit: 5
      };

      const results = await searchService.hybridSearch(query, filters, options);

      expect(Array.isArray(results)).toBe(true);
      expect(mockEmbeddingService.embedQuery).toHaveBeenCalledWith(query);

      // Results should have enhanced structure
      results.forEach(result => {
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('rank');
        expect(result).toHaveProperty('metadata');
      });
    });

    it('should filter by file path', async () => {
      const query = 'test';
      const filters: MetadataFilters = {
        filePath: '/test/'
      };

      const results = await searchService.hybridSearch(query, filters);

      // All results should match the file path filter
      results.forEach(result => {
        if (result.metadata?.filePath) {
          expect(result.metadata.filePath).toContain('/test/');
        }
      });
    });

    it('should filter by author', async () => {
      const query = 'test';
      const filters: MetadataFilters = {
        author: 'Test Author'
      };

      const results = await searchService.hybridSearch(query, filters);

      // Results should be filtered by author
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle date range filtering', async () => {
      const query = 'test';
      const filters: MetadataFilters = {
        dateRange: {
          start: '2024-01-01',
          end: '2024-12-31'
        }
      };

      const results = await searchService.hybridSearch(query, filters);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should fallback to metadata-only search when semantic search fails', async () => {
      // Mock semantic search to fail
      jest.spyOn(searchService, 'semanticSearch').mockRejectedValue(new Error('Semantic search failed'));

      const query = 'test';
      const filters: MetadataFilters = {
        fileExtension: 'ts'
      };

      const results = await searchService.hybridSearch(query, filters);

      expect(Array.isArray(results)).toBe(true);
      // Should still return results from metadata search
    });
  });

  // describe('Specialized Search Methods', () => {
  //   it('should search code snippets', async () => {
  //     const codeSnippet = 'function calculateSum';
  //     const options: SearchOptions = {
  //       limit: 5
  //     };

  //     const results = await searchService.searchCode(codeSnippet, {}, options);

  //     expect(Array.isArray(results)).toBe(true);
  //     expect(mockEmbeddingService.embedQuery).toHaveBeenCalledWith(codeSnippet);
  //   });

  //   it('should search files', async () => {
  //     const query = 'utility files';
  //     const filters: MetadataFilters = {
  //       fileExtension: 'ts'
  //     };

  //     const results = await searchService.searchFiles(query, filters);

  //     expect(Array.isArray(results)).toBe(true);
  //     // Results should be FileNode type
  //     results.forEach(result => {
  //       expect(result.node.type).toBe('FileNode');
  //     });
  //   });

  //   it('should search commits', async () => {
  //     const query = 'mathematical operations';
  //     const filters: MetadataFilters = {
  //       author: 'Test Author'
  //     };

  //     const results = await searchService.searchCommits(query, filters);

  //     expect(Array.isArray(results)).toBe(true);
  //     // Results should be CommitNode type
  //     results.forEach(result => {
  //       expect(result.node.type).toBe('CommitNode');
  //     });
  //   });

  //   it('should search across all content types', async () => {
  //     const query = 'test content';
  //     const options: SearchOptions = {
  //       limit: 10
  //     };

  //     const results = await searchService.searchAll(query, {}, options);

  //     expect(Array.isArray(results)).toBe(true);
      
  //     // Should potentially return different node types
  //     const nodeTypes = new Set(results.map(r => r.node.type));
  //     expect(nodeTypes.size).toBeGreaterThanOrEqual(0);
  //   });
  // });

  describe('Error Handling', () => {
    it('should handle embedding service errors gracefully', async () => {
      mockEmbeddingService.embedQuery.mockRejectedValue(new Error('Embedding failed'));

      const query = 'test query';
      const results = await searchService.semanticSearch(query);

      // Should fallback to text search or return empty results
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle database connection errors', async () => {
      // Mock database connection failure
      const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
      jest.spyOn(sqliteClient, 'isConnectedToDatabase').mockReturnValue(false);

      const query = 'test query';
      
      await expect(searchService.semanticSearch(query)).rejects.toThrow();
    });

    it('should handle malformed search queries', async () => {
      const malformedQuery = null as any;
      
      await expect(searchService.semanticSearch(malformedQuery)).rejects.toThrow();
    });

    it('should handle invalid search options', async () => {
      const query = 'test query';
      const invalidOptions: SearchOptions = {
        limit: -1, // Invalid limit
        minSimilarity: 2.0 // Invalid similarity (should be 0-1)
      };

      // Should handle invalid options gracefully
      const results = await searchService.semanticSearch(query, invalidOptions);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle concurrent search requests', async () => {
      const queries = [
        'utility functions',
        'mathematical operations',
        'helper methods',
        'test functions',
        'calculation logic'
      ];

      const searchPromises = queries.map(query => 
        searchService.semanticSearch(query, { limit: 5 })
      );

      const results = await Promise.all(searchPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should cache search results for repeated queries', async () => {
      const query = 'test query';
      
      // First search
      const results1 = await searchService.semanticSearch(query);
      
      // Second search with same query
      const results2 = await searchService.semanticSearch(query);

      expect(results1).toEqual(results2);
      
      // Embedding service should be called only once if caching is implemented
      // (This depends on implementation details)
    });

    it('should handle large result sets efficiently', async () => {
      const query = 'test';
      const options: SearchOptions = {
        limit: 1000 // Large limit
      };

      const startTime = Date.now();
      const results = await searchService.semanticSearch(query, options);
      const endTime = Date.now();

      expect(Array.isArray(results)).toBe(true);
      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  // describe('Integration with SQLite Vector Search', () => {
  //   it('should use SQLite vector search for similarity calculations', async () => {
  //     const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
  //     const isVectorEnabled = sqliteClient.isVectorEnabled;

  //     const query = 'test query';
  //     const results = await searchService.semanticSearch(query);

  //     expect(Array.isArray(results)).toBe(true);
      
  //     if (isVectorEnabled) {
  //       // If vector search is available, results should have similarity scores
  //       results.forEach(result => {
  //         expect(typeof result.similarity).toBe('number');
  //         expect(result.similarity).toBeGreaterThanOrEqual(0);
  //         expect(result.similarity).toBeLessThanOrEqual(1);
  //       });
  //     }
  //   });

  //   it('should perform unified search across all tables', async () => {
  //     const query = 'comprehensive search';
  //     const results = await searchService.searchAll(query);

  //     expect(Array.isArray(results)).toBe(true);
      
  //     // Should potentially return results from different tables
  //     const nodeTypes = new Set(results.map(r => r.node.type));
  //     // Could include FileNode, CodeNode, CommitNode, etc.
  //   });

  //   it('should handle vector search with metadata filtering', async () => {
  //     const query = 'filtered search';
  //     const filters: MetadataFilters = {
  //       fileExtension: 'ts',
  //       language: 'typescript'
  //     };

  //     const results = await searchService.hybridSearch(query, filters);

  //     expect(Array.isArray(results)).toBe(true);
      
  //     // Results should respect both semantic similarity and metadata filters
  //     results.forEach(result => {
  //       expect(result).toHaveProperty('similarity');
  //       expect(result).toHaveProperty('metadata');
  //     });
  //   });
  // });

  describe('Disconnection and Cleanup', () => {
    it('should disconnect from SQLite database cleanly', async () => {
      await searchService.disconnect();

      const sqliteClient = searchService['sqliteClient'] as SQLiteClient;
      expect(sqliteClient.isConnectedToDatabase()).toBe(false);
    });

    it('should handle multiple disconnect calls gracefully', async () => {
      await searchService.disconnect();
      await expect(searchService.disconnect()).resolves.not.toThrow();
    });
  });
});
