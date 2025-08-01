/**
 * @file Unit tests for EmbeddingService
 * Tests vector embedding generation, model loading, batch processing, and similarity calculations
 */

import { jest } from '@jest/globals';
import { EmbeddingService } from './embedding-service';
import { ConfigManager } from '../config';
import { BaseNode, NodeWithEmbedding, CodeNode, FileNode } from '../types';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';

// Mock dependencies
jest.mock('../config');
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
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  env: {
    allowRemoteModels: true,
    allowLocalModels: true
  }
}));

// Mock fetch for LM Studio tests
(global as any).fetch = jest.fn();

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockPipeline: jest.MockedFunction<any>;

  const mockAIConfig = {
    embedding: {
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 32,
      provider: 'transformers' as const,
      localEndpoint: 'http://localhost:1234'
    },
    summary: {
      model: 'Xenova/distilbart-cnn-6-6',
      maxTokens: 150,
      temperature: 0.7,
      provider: 'transformers' as const,
      localEndpoint: 'http://localhost:1234'
    }
  };

  beforeEach(() => {
    // Reset test data factory
    TestDataFactory.resetCounter();

    // Create mock config
    mockConfig = {
      getAIConfig: jest.fn().mockReturnValue(mockAIConfig)
    } as any;

    // Mock transformers pipeline
    const { pipeline } = require('@xenova/transformers');
    mockPipeline = pipeline as jest.MockedFunction<any>;

    // Create service instance
    embeddingService = new EmbeddingService(mockConfig);

    // Reset fetch mock
    (global.fetch as jest.MockedFunction<typeof fetch>).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization and Model Loading', () => {
    it('should initialize with valid configuration', () => {
      expect(embeddingService).toBeDefined();
      expect(mockConfig.getAIConfig).toHaveBeenCalled();
    });

    it('should load transformers.js model successfully', async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    });

    it('should load LM Studio model successfully', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'local' }
      });

      // Mock successful LM Studio connection
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] })
      } as any);

      const localService = new EmbeddingService(mockConfig);
      await localService.loadModel();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle model loading failure', async () => {
      mockPipeline.mockRejectedValue(new Error('Model loading failed'));

      await expect(embeddingService.loadModel()).rejects.toThrow('Model loading failed');
    });

    it('should handle unsupported embedding provider', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'unsupported' as any }
      });

      const unsupportedService = new EmbeddingService(mockConfig);
      await expect(unsupportedService.loadModel()).rejects.toThrow(
        'Unsupported embedding provider: unsupported'
      );
    });

    it('should skip loading if model already loaded', async () => {
      const mockModel = jest.fn();
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();
      await embeddingService.loadModel(); // Second call

      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('Text Extraction from Nodes', () => {
    it('should extract text from CodeNode', async () => {
      const codeNode = TestDataFactory.createCodeNode({
        properties: {
          name: 'testFunction',
          signature: 'function testFunction(): string',
          docstring: 'A test function',
          language: 'typescript',
          filePath: 'test.ts'
        }
      });

      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();
      const result = await embeddingService.embedNodes([codeNode]);

      expect(result).toHaveLength(1);
      expect(result[0].sourceText).toContain('testFunction');
      expect(result[0].sourceText).toContain('function testFunction(): string');
      expect(result[0].sourceText).toContain('A test function');
    });

    it('should extract text from FileNode', async () => {
      const fileNode = TestDataFactory.createFile({
        name: 'utils.ts',
        properties: {
          fileName: 'utils.ts',
          aiSummary: 'Utility functions',
          imports: ['fs', 'path'],
          exports: ['helper', 'formatter']
        }
      });

      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();
      const result = await embeddingService.embedNodes([fileNode]);

      expect(result[0].sourceText).toContain('utils.ts');
      expect(result[0].sourceText).toContain('Utility functions');
      expect(result[0].sourceText).toContain('fs path');
      expect(result[0].sourceText).toContain('helper formatter');
    });

    it('should handle nodes with missing properties', async () => {
      const nodeWithMissingProps: CodeNode = {
        id: 'test-node',
        type: 'CodeNode',
        properties: {
          name: 'testFunction',
          language: 'typescript',
          filePath: 'test.ts'
          // Missing signature and docstring
        }
      };

      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();
      const result = await embeddingService.embedNodes([nodeWithMissingProps]);

      expect(result[0].sourceText).toBe('testFunction');
    });

    it('should handle unknown node types', async () => {
      const unknownNode: any = {
        id: 'unknown-node',
        type: 'UnknownNode',
        properties: {}
      };

      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      await embeddingService.loadModel();
      const result = await embeddingService.embedNodes([unknownNode]);

      expect(result[0].sourceText).toBe('UnknownNode unknown-node');
    });
  });

  describe('Embedding Generation', () => {
    beforeEach(async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();
    });

    it('should generate embeddings using transformers.js', async () => {
      const nodes = [TestDataFactory.createCodeNode()];
      const result = await embeddingService.embedNodes(nodes);

      expect(result).toHaveLength(1);
      expect(result[0].embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(result[0].sourceText).toBeDefined();
    });

    it('should generate embeddings using LM Studio', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'local' }
      });

      // Mock LM Studio responses
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({ // Model check
          ok: true,
          json: async () => ({ data: [{ id: 'test-model' }] })
        } as any)
        .mockResolvedValueOnce({ // Embedding generation
          ok: true,
          json: async () => ({
            data: [{ embedding: [0.5, 0.6, 0.7, 0.8] }]
          })
        } as any);

      const localService = new EmbeddingService(mockConfig);
      await localService.loadModel();

      const nodes = [TestDataFactory.createCodeNode()];
      const result = await localService.embedNodes(nodes);

      expect(result[0].embedding).toEqual([0.5, 0.6, 0.7, 0.8]);
    });

    it('should handle embedding generation failure', async () => {
      const mockModel = jest.fn().mockRejectedValue(new Error('Embedding failed'));
      mockPipeline.mockResolvedValue(mockModel);

      const failingService = new EmbeddingService(mockConfig);
      await failingService.loadModel();

      const nodes = [TestDataFactory.createCodeNode()];
      await expect(failingService.embedNodes(nodes)).rejects.toThrow();
    });

    it('should use fallback embedding when model fails', async () => {
      // Create service without loading model to trigger fallback
      const nodes = [TestDataFactory.createCodeNode({ properties: { name: 'test' } })];
      const result = await embeddingService.embedNodes(nodes);

      expect(result[0].embedding).toHaveLength(384); // Default fallback dimensions
      expect(result[0].embedding.every(val => val >= -1 && val <= 1)).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    beforeEach(async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();
    });

    it('should process nodes in batches', async () => {
      // Create more nodes than batch size
      const nodes: BaseNode[] = [];
      for (let i = 0; i < 50; i++) {
        nodes.push(TestDataFactory.createCodeNode({ properties: { name: `func${i}` } }));
      }

      // Set small batch size for testing
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, batchSize: 10 }
      });

      const batchService = new EmbeddingService(mockConfig);
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await batchService.loadModel();

      const result = await batchService.embedNodes(nodes);

      expect(result).toHaveLength(50);
      expect(result.every(node => node.embedding.length === 4)).toBe(true);
    });

    it('should handle empty node array', async () => {
      const result = await embeddingService.embedNodes([]);
      expect(result).toEqual([]);
    });

    it('should filter out failed embeddings', async () => {
      const mockModel = jest.fn()
        .mockResolvedValueOnce({ data: new Float32Array([0.1, 0.2, 0.3, 0.4]) })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ data: new Float32Array([0.5, 0.6, 0.7, 0.8]) });

      mockPipeline.mockResolvedValue(mockModel);

      const failingService = new EmbeddingService(mockConfig);
      await failingService.loadModel();

      const nodes = [
        TestDataFactory.createCodeNode({ properties: { name: 'func1' } }),
        TestDataFactory.createCodeNode({ properties: { name: 'func2' } }),
        TestDataFactory.createCodeNode({ properties: { name: 'func3' } })
      ];

      // This should not throw, but should handle the failure gracefully
      const result = await failingService.embedNodes(nodes);
      
      // Should still return results for successful embeddings
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Query Embedding', () => {
    beforeEach(async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();
    });

    it('should generate embedding for query text', async () => {
      const query = 'search for functions';
      const result = await embeddingService.embedQuery(query);

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should load model if not already loaded', async () => {
      const freshService = new EmbeddingService(mockConfig);
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);

      const query = 'test query';
      const result = await freshService.embedQuery(query);

      expect(mockPipeline).toHaveBeenCalled();
      expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
    });
  });

  describe('Similarity Calculations', () => {
    it('should calculate cosine similarity correctly', () => {
      const embedding1 = [1, 0, 0];
      const embedding2 = [0, 1, 0];
      const embedding3 = [1, 0, 0];

      const similarity1 = embeddingService.calculateSimilarity(embedding1, embedding2);
      const similarity2 = embeddingService.calculateSimilarity(embedding1, embedding3);

      expect(similarity1).toBe(0); // Orthogonal vectors
      expect(similarity2).toBe(1); // Identical vectors
    });

    it('should handle zero magnitude vectors', () => {
      const embedding1 = [0, 0, 0];
      const embedding2 = [1, 0, 0];

      const similarity = embeddingService.calculateSimilarity(embedding1, embedding2);
      expect(similarity).toBe(0);
    });

    it('should throw error for mismatched dimensions', () => {
      const embedding1 = [1, 0, 0];
      const embedding2 = [1, 0];

      expect(() => {
        embeddingService.calculateSimilarity(embedding1, embedding2);
      }).toThrow('Embedding vectors must have the same dimensions');
    });

    it('should find similar nodes correctly', () => {
      const queryEmbedding = [1, 0, 0];
      const nodes: NodeWithEmbedding[] = [
        { ...TestDataFactory.createCodeNode({ properties: { name: 'func1' } }), embedding: [0.9, 0.1, 0], sourceText: 'func1' },
        { ...TestDataFactory.createCodeNode({ properties: { name: 'func2' } }), embedding: [0, 1, 0], sourceText: 'func2' },
        { ...TestDataFactory.createCodeNode({ properties: { name: 'func3' } }), embedding: [0.8, 0.2, 0], sourceText: 'func3' }
      ];

      const results = embeddingService.findSimilarNodes(queryEmbedding, nodes, 2);

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
      expect(results[0].node.properties.name).toBe('func1');
    });
  });

  describe('LM Studio Integration', () => {
    beforeEach(() => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'local' }
      });
    });

    it('should test LM Studio connection successfully', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] })
      } as any);

      const localService = new EmbeddingService(mockConfig);
      await expect(localService.loadModel()).resolves.not.toThrow();
    });

    it('should handle LM Studio connection failure', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error('Connection refused')
      );

      const localService = new EmbeddingService(mockConfig);
      await expect(localService.loadModel()).rejects.toThrow('Connection refused');
    });

    it('should handle LM Studio API errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({ // Model check
          ok: true,
          json: async () => ({ data: [{ id: 'test-model' }] })
        } as any)
        .mockResolvedValueOnce({ // Embedding generation
          ok: false,
          status: 404,
          text: async () => 'No models loaded'
        } as any);

      const localService = new EmbeddingService(mockConfig);
      await localService.loadModel();

      const nodes = [TestDataFactory.createCodeNode()];
      await expect(localService.embedNodes(nodes)).rejects.toThrow('No embedding model loaded');
    });

    it('should handle missing endpoint configuration', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'local', localEndpoint: undefined }
      });

      const localService = new EmbeddingService(mockConfig);
      await expect(localService.loadModel()).rejects.toThrow('LM Studio endpoint not configured');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should return embedding service statistics', async () => {
      const stats = await embeddingService.getStats();

      expect(stats).toEqual({
        modelLoaded: false, // Not loaded yet
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384
      });
    });

    it('should return correct dimensions for different models', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, model: 'Xenova/all-mpnet-base-v2' }
      });

      const mpnetService = new EmbeddingService(mockConfig);
      const stats = await mpnetService.getStats();

      expect(stats.dimensions).toBe(768);
    });

    it('should track node type statistics during embedding', async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();

      const nodes = [
        TestDataFactory.createCodeNode(),
        TestDataFactory.createFile(),
        TestDataFactory.createCodeNode()
      ];

      const result = await embeddingService.embedNodes(nodes);

      expect(result).toHaveLength(3);
      // Verify that different node types are processed
      const nodeTypes = result.map(n => n.type);
      expect(nodeTypes).toContain('CodeNode');
      expect(nodeTypes).toContain('FileNode');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed embedding responses', async () => {
      const mockModel = jest.fn().mockResolvedValue({
        // Missing data property
        result: [0.1, 0.2, 0.3, 0.4]
      });
      mockPipeline.mockResolvedValue(mockModel);

      const malformedService = new EmbeddingService(mockConfig);
      await malformedService.loadModel();

      const nodes = [TestDataFactory.createCodeNode()];
      await expect(malformedService.embedNodes(nodes)).rejects.toThrow();
    });

    it('should handle very long text inputs', async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();

      const longTextNode = TestDataFactory.createCodeNode({
        properties: {
          name: 'veryLongFunctionName'.repeat(100),
          signature: 'function signature'.repeat(50),
          docstring: 'documentation'.repeat(200),
          language: 'typescript',
          filePath: 'test.ts'
        }
      });

      const result = await embeddingService.embedNodes([longTextNode]);
      expect(result).toHaveLength(1);
      expect(result[0].embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should handle concurrent embedding requests', async () => {
      const mockModel = jest.fn().mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3, 0.4])
      });
      mockPipeline.mockResolvedValue(mockModel);
      await embeddingService.loadModel();

      const nodes1 = [TestDataFactory.createCodeNode({ properties: { name: 'func1' } })];
      const nodes2 = [TestDataFactory.createCodeNode({ properties: { name: 'func2' } })];

      const [result1, result2] = await Promise.all([
        embeddingService.embedNodes(nodes1),
        embeddingService.embedNodes(nodes2)
      ]);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result1[0].sourceText).toContain('func1');
      expect(result2[0].sourceText).toContain('func2');
    });

    it('should handle network timeouts for LM Studio', async () => {
      mockConfig.getAIConfig.mockReturnValue({
        ...mockAIConfig,
        embedding: { ...mockAIConfig.embedding, provider: 'local' }
      });

      // Mock timeout
      (global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        })
      );

      const localService = new EmbeddingService(mockConfig);
      await expect(localService.loadModel()).rejects.toThrow();
    });
  });
});
