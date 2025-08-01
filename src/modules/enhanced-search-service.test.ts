/**
 * @file Unit tests for EnhancedSearchService
 * Tests vector similarity search, metadata filtering, search result ranking, and pagination
 */

import { jest } from '@jest/globals';
import { EnhancedSearchService, EmbeddingSearchOptions, EmbeddingMetadataFilters } from './enhanced-search-service';
import { ConfigManager } from '../config';

// Mock dependencies
jest.mock('./embedding-service');
jest.mock('../persistence/db-clients');
jest.mock('../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    operation: jest.fn(() => jest.fn())
  }))
}));
jest.mock('../utils/error-handling', () => ({
  getErrorMessage: jest.fn((error: any) => error?.message || 'Unknown error')
}));

describe('EnhancedSearchService', () => {
  let enhancedSearchService: EnhancedSearchService;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockEmbeddingService: any;
  let mockSQLiteClient: any;

  // Test data
  const mockEmbeddingNodes = [
    {
      id: '1',
      node_id: 'node-1',
      node_type: 'CodeNode',
      file_path: 'src/utils.ts',
      source_text: 'function calculateSum(a: number, b: number): number { return a + b; }',
      embedding: Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer)
    },
    {
      id: '2',
      node_id: 'node-2',
      node_type: 'FileNode',
      file_path: 'src/math.ts',
      source_text: 'Math utilities for calculations',
      embedding: Buffer.from(new Float32Array([0.2, 0.3, 0.4, 0.5]).buffer)
    }
  ];

  const mockQueryEmbedding = [0.15, 0.25, 0.35, 0.45];

  beforeEach(() => {
    // Create mock config
    mockConfig = {
      getDatabaseConfig: jest.fn().mockReturnValue({
        sqlite: {
          path: ':memory:',
          vectorExtension: './extensions/vec0.dylib'
        }
      }),
      getAIConfig: jest.fn().mockReturnValue({
        embedding: {
          model: 'test-model',
          batchSize: 32,
          provider: 'transformers'
        }
      }),
      getConfig: jest.fn(),
      getIndexingConfig: jest.fn(),
      getLoggingConfig: jest.fn(),
      updateConfig: jest.fn()
    } as any;

    // Create mock embedding service
    mockEmbeddingService = {
      loadModel: jest.fn(),
      embedQuery: jest.fn(),
      embedNodes: jest.fn(),
      calculateSimilarity: jest.fn(),
      findSimilarNodes: jest.fn(),
      getStats: jest.fn()
    };

    // Create mock SQLite client
    mockSQLiteClient = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(),
      isVectorSearchAvailable: jest.fn(),
      transaction: jest.fn()
    };

    // Mock the constructors
    const MockedEmbeddingService = require('./embedding-service').EmbeddingService as jest.MockedClass<any>;
    const MockedSQLiteClient = require('../persistence/db-clients').SQLiteClient as jest.MockedClass<any>;

    MockedEmbeddingService.mockImplementation(() => mockEmbeddingService);
    MockedSQLiteClient.mockImplementation(() => mockSQLiteClient);

    // Create service instance
    enhancedSearchService = new EnhancedSearchService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Setup mocks
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);

      await enhancedSearchService.initialize();

      expect(mockEmbeddingService.loadModel).toHaveBeenCalledTimes(1);
      expect(mockSQLiteClient.connect).toHaveBeenCalledTimes(1);
      expect(mockSQLiteClient.all).toHaveBeenCalledWith("PRAGMA table_info(embedding_nodes)");
    });

    it('should throw error if embedding_nodes table does not exist', async () => {
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([]); // Empty table info

      await expect(enhancedSearchService.initialize()).rejects.toThrow('embedding_nodes table does not exist');
    });

    it('should handle embedding service initialization failure', async () => {
      mockEmbeddingService.loadModel.mockRejectedValue(new Error('Model loading failed'));

      await expect(enhancedSearchService.initialize()).rejects.toThrow('Model loading failed');
    });
  });

  describe('semanticSearch', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should perform semantic search with vector similarity', async () => {
      const query = 'calculate sum function';
      const expectedResults = [
        {
          id: '1',
          node_id: 'node-1',
          node_type: 'CodeNode',
          file_path: 'src/utils.ts',
          source_text: 'function calculateSum(a: number, b: number): number { return a + b; }',
          distance: 0.1
        }
      ];

      // Setup mocks
      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      mockSQLiteClient.all.mockReturnValue(expectedResults);

      const results = await enhancedSearchService.semanticSearch(query);

      expect(mockEmbeddingService.embedQuery).toHaveBeenCalledWith(query);
      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('vec_distance_cosine'),
        expect.arrayContaining([expect.any(Buffer)])
      );
      expect(results).toHaveLength(1);
      expect(results[0].node.nodeId).toBe('node-1');
      expect(results[0].similarity).toBe(0.9); // 1 - 0.1 distance
      expect(results[0].rank).toBe(1);
    });

    it('should apply node type filters', async () => {
      const query = 'test query';
      const options: EmbeddingSearchOptions = {
        nodeTypes: ['CodeNode', 'FileNode'],
        limit: 5
      };

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      mockSQLiteClient.all.mockReturnValue([]);

      await enhancedSearchService.semanticSearch(query, options);

      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('node_type IN (?,?)'),
        expect.arrayContaining(['CodeNode', 'FileNode'])
      );
    });

    it('should fall back to text-based search when vector search is unavailable', async () => {
      const query = 'calculate sum';

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(false);
      mockSQLiteClient.all.mockReturnValue([
        {
          id: '1',
          node_id: 'node-1',
          node_type: 'CodeNode',
          file_path: 'src/utils.ts',
          source_text: 'function calculateSum(a: number, b: number): number { return a + b; }'
        }
      ]);

      const results = await enhancedSearchService.semanticSearch(query);

      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('source_text LIKE ?'),
        expect.arrayContaining([`%${query}%`])
      );
      expect(results[0].similarity).toBe(0.8); // Default text search similarity
    });

    it('should handle embedding service errors', async () => {
      const query = 'test query';

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockRejectedValue(new Error('Embedding failed'));

      await expect(enhancedSearchService.semanticSearch(query)).rejects.toThrow('Embedding failed');
    });

    it('should respect limit parameter', async () => {
      const query = 'test query';
      const options: EmbeddingSearchOptions = { limit: 2 };

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      mockSQLiteClient.all.mockReturnValue([]);

      await enhancedSearchService.semanticSearch(query, options);

      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([2])
      );
    });
  });

  describe('metadataSearch', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should search by node type', async () => {
      const filters: EmbeddingMetadataFilters = {
        nodeType: 'CodeNode'
      };

      mockSQLiteClient.all.mockReturnValue([
        {
          id: '1',
          node_id: 'node-1',
          node_type: 'CodeNode',
          file_path: 'src/utils.ts',
          source_text: 'function test() {}'
        }
      ]);

      const results = await enhancedSearchService.metadataSearch(filters);

      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('node_type = ?'),
        expect.arrayContaining(['CodeNode'])
      );
      expect(results).toHaveLength(1);
      expect(results[0].node.nodeType).toBe('CodeNode');
      expect(results[0].similarity).toBe(0.9); // High similarity for metadata matches
    });

    it('should search by file path', async () => {
      const filters: EmbeddingMetadataFilters = {
        filePath: 'src/utils'
      };

      mockSQLiteClient.all.mockReturnValue([]);

      await enhancedSearchService.metadataSearch(filters);

      expect(mockSQLiteClient.all).toHaveBeenCalledWith(
        expect.stringContaining('file_path LIKE ?'),
        expect.arrayContaining(['%src/utils%'])
      );
    });

    it('should combine multiple filters', async () => {
      const filters: EmbeddingMetadataFilters = {
        nodeType: 'CodeNode',
        filePath: 'src/utils',
        fileExtension: 'ts',
        sourceTextContains: 'function'
      };

      mockSQLiteClient.all.mockReturnValue([]);

      await enhancedSearchService.metadataSearch(filters);

      // Get the last call (not the first one which is the table info check)
      const lastCallIndex = mockSQLiteClient.all.mock.calls.length - 1;
      const [sql, params] = mockSQLiteClient.all.mock.calls[lastCallIndex];
      expect(sql).toContain('node_type = ?');
      expect(sql).toContain('file_path LIKE ?');
      expect(sql).toContain('source_text LIKE ?');
      expect(params).toEqual(['CodeNode', '%src/utils%', '%.ts', '%function%', 100]);
    });

    it('should handle database errors', async () => {
      const filters: EmbeddingMetadataFilters = { nodeType: 'CodeNode' };

      mockSQLiteClient.all.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(enhancedSearchService.metadataSearch(filters)).rejects.toThrow('Database error');
    });
  });

  describe('hybridSearch', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should combine semantic and metadata search results', async () => {
      const query = 'calculate function';
      const filters: EmbeddingMetadataFilters = { nodeType: 'CodeNode' };
      const options: EmbeddingSearchOptions = { limit: 10 };

      // Mock semantic search results
      const semanticResults = [
        {
          id: '1',
          node_id: 'node-1',
          node_type: 'CodeNode',
          file_path: 'src/utils.ts',
          source_text: 'function calculate() {}',
          distance: 0.1
        }
      ];

      // Mock metadata search results
      const metadataResults = [
        {
          id: '2',
          node_id: 'node-2',
          node_type: 'CodeNode',
          file_path: 'src/math.ts',
          source_text: 'function add() {}'
        }
      ];

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      
      // First call for semantic search, second for metadata search
      mockSQLiteClient.all
        .mockReturnValueOnce(semanticResults)
        .mockReturnValueOnce(metadataResults);

      const results = await enhancedSearchService.hybridSearch(query, filters, options);

      expect(results).toHaveLength(2);
      // The semantic result should have higher similarity (0.9) than metadata result (0.9)
      // Since they're equal, let's just check they're sorted properly
      expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity); // Sorted by similarity
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
    });

    it('should deduplicate results with same node ID', async () => {
      const query = 'test function';
      const filters: EmbeddingMetadataFilters = { nodeType: 'CodeNode' };

      // Same node returned by both searches with different similarities
      const duplicateNode = {
        id: '1',
        node_id: 'node-1',
        node_type: 'CodeNode',
        file_path: 'src/utils.ts',
        source_text: 'function test() {}'
      };

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      
      // Return same node from both searches
      mockSQLiteClient.all
        .mockReturnValueOnce([{ ...duplicateNode, distance: 0.1 }]) // Semantic search
        .mockReturnValueOnce([duplicateNode]); // Metadata search

      const results = await enhancedSearchService.hybridSearch(query, filters);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.9); // Should keep higher similarity (semantic)
    });
  });

  describe('getEmbeddingStats', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should return comprehensive embedding statistics', async () => {
      // Mock database responses
      mockSQLiteClient.get
        .mockReturnValueOnce({ count: 100 }) // Total nodes
        .mockReturnValueOnce({ count: 80 }); // Embedded nodes

      mockSQLiteClient.all
        .mockReturnValueOnce([ // Node type breakdown
          { node_type: 'CodeNode', count: 60 },
          { node_type: 'FileNode', count: 30 },
          { node_type: 'TestNode', count: 10 }
        ])
        .mockReturnValueOnce([ // File path breakdown
          { file_path: 'src/utils.ts', count: 25 },
          { file_path: 'src/helpers.ts', count: 20 },
          { file_path: 'tests/unit.test.ts', count: 15 }
        ]);

      const stats = await enhancedSearchService.getEmbeddingStats();

      expect(stats.totalNodes).toBe(100);
      expect(stats.embeddingCoverage).toBe(0.8); // 80/100
      expect(stats.nodeTypeBreakdown).toEqual({
        'CodeNode': 60,
        'FileNode': 30,
        'TestNode': 10
      });
      expect(stats.filePathBreakdown).toEqual({
        'src/utils.ts': 25,
        'src/helpers.ts': 20,
        'tests/unit.test.ts': 15
      });
    });

    it('should handle empty database', async () => {
      mockSQLiteClient.get.mockReturnValue({ count: 0 });
      mockSQLiteClient.all.mockReturnValue([]);

      const stats = await enhancedSearchService.getEmbeddingStats();

      expect(stats.totalNodes).toBe(0);
      expect(stats.embeddingCoverage).toBe(0);
      expect(stats.nodeTypeBreakdown).toEqual({});
      expect(stats.filePathBreakdown).toEqual({});
    });
  });

  describe('findSimilarNodes', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should find similar nodes using source node embedding', async () => {
      const sourceNodeId = 'node-1';
      const sourceEmbedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer);

      // Mock source node lookup
      mockSQLiteClient.get.mockReturnValue({
        embedding: sourceEmbedding,
        node_type: 'CodeNode',
        file_path: 'src/utils.ts'
      });

      // Mock similar nodes search
      mockSQLiteClient.all.mockReturnValue([
        {
          id: '2',
          node_id: 'node-2',
          node_type: 'CodeNode',
          file_path: 'src/helpers.ts',
          source_text: 'similar function',
          distance: 0.2
        }
      ]);

      const results = await enhancedSearchService.findSimilarNodes(sourceNodeId);

      expect(mockSQLiteClient.get).toHaveBeenCalledWith(
        'SELECT embedding, node_type, file_path FROM embedding_nodes WHERE node_id = ?',
        [sourceNodeId]
      );
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.8); // 1 - 0.2 distance
    });

    it('should throw error if source node not found', async () => {
      const sourceNodeId = 'nonexistent-node';

      mockSQLiteClient.get.mockReturnValue(null);

      await expect(enhancedSearchService.findSimilarNodes(sourceNodeId)).rejects.toThrow(
        'Node nonexistent-node not found or has no embedding'
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from database successfully', async () => {
      mockSQLiteClient.disconnect.mockReturnValue(undefined);

      await enhancedSearchService.disconnect();

      expect(mockSQLiteClient.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      // Initialize service
      mockEmbeddingService.loadModel.mockResolvedValue(undefined);
      mockSQLiteClient.connect.mockResolvedValue(undefined);
      mockSQLiteClient.all.mockReturnValue([
        { name: 'id' },
        { name: 'node_id' },
        { name: 'embedding' },
        { name: 'source_text' },
        { name: 'node_type' },
        { name: 'file_path' }
      ]);
      await enhancedSearchService.initialize();
    });

    it('should handle empty search results', async () => {
      const query = 'nonexistent query';

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      mockSQLiteClient.all.mockReturnValue([]);

      const results = await enhancedSearchService.semanticSearch(query);

      expect(results).toEqual([]);
    });

    it('should handle concurrent search requests', async () => {
      const query1 = 'first query';
      const query2 = 'second query';

      mockSQLiteClient.isVectorSearchAvailable.mockResolvedValue(true);
      mockEmbeddingService.embedQuery.mockResolvedValue(mockQueryEmbedding);
      mockSQLiteClient.all.mockReturnValue([]);

      // Execute concurrent searches
      const [results1, results2] = await Promise.all([
        enhancedSearchService.semanticSearch(query1),
        enhancedSearchService.semanticSearch(query2)
      ]);

      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
      expect(mockEmbeddingService.embedQuery).toHaveBeenCalledTimes(2);
    });
  });
});
