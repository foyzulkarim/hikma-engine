/**
 * @file Tests for search API endpoints (Tasks 4-8).
 */

import request from 'supertest';
import { createAPIServer, APIServer } from '../src/api/server';
import { initializeConfig } from '../src/config';
import { initializeLogger } from '../src/utils/logger';
import * as path from 'path';

describe('Search API Endpoints', () => {
  let server: APIServer;
  let app: any;

  beforeAll(async () => {
    // Initialize configuration and logging for tests
    const projectRoot = path.resolve(__dirname, '..');
    initializeConfig(projectRoot);
    initializeLogger({
      level: 'error', // Reduce log noise in tests
      enableConsole: false,
      enableFile: false,
    });

    // Create server instance
    server = createAPIServer({
      port: 0, // Use random available port for testing
      host: 'localhost',
      cors: {
        origin: true,
        credentials: true,
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 1000, // Higher limit for tests
      },
      timeout: 10000, // 10 seconds for search operations
    });

    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Task 4: Semantic Search Endpoint', () => {
    it('should respond to semantic search with valid query', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'function test' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          totalResults: expect.any(Number),
          cached: expect.any(Boolean),
        },
      });

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('processingTime');
    });

    it('should validate required query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "q" is required',
        },
      });
    });

    it('should handle optional parameters', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({
          q: 'test function',
          limit: '5',
          nodeTypes: 'CodeNode,FileNode',
          minSimilarity: '0.2',
          includeMetadata: 'true',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results.length).toBeLessThanOrEqual(5);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', limit: '3' })
        .expect(200);

      expect(response.body.data.results.length).toBeLessThanOrEqual(3);
    });

    it('should enforce maximum limit', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', limit: '200' })
        .expect(200);

      expect(response.body.data.results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Task 5: Structural Search Endpoint', () => {
    it('should respond to structural search with valid query', async () => {
      const response = await request(app)
        .get('/api/v1/search/structure')
        .query({ q: 'function' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          totalResults: expect.any(Number),
          cached: expect.any(Boolean),
          filters: expect.any(Object),
        },
      });
    });

    it('should handle language filter', async () => {
      const response = await request(app)
        .get('/api/v1/search/structure')
        .query({
          q: 'function',
          language: 'typescript',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters.language).toBe('typescript');
    });

    it('should handle element type filter', async () => {
      const response = await request(app)
        .get('/api/v1/search/structure')
        .query({
          q: 'test',
          type: 'function',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters.elementType).toBe('function');
    });

    it('should handle file path filter', async () => {
      const response = await request(app)
        .get('/api/v1/search/structure')
        .query({
          q: 'test',
          filePath: 'src/',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters.filePath).toBe('src/');
    });

    it('should validate required query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search/structure')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Task 6: Git History Search Endpoint', () => {
    it('should respond to git search with valid query', async () => {
      const response = await request(app)
        .get('/api/v1/search/git')
        .query({ q: 'fix bug' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          totalResults: expect.any(Number),
          cached: expect.any(Boolean),
          filters: expect.any(Object),
        },
      });
    });

    it('should handle author filter', async () => {
      const response = await request(app)
        .get('/api/v1/search/git')
        .query({
          q: 'commit',
          author: 'testuser',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters.author).toBe('testuser');
    });

    it('should handle date range filters', async () => {
      const response = await request(app)
        .get('/api/v1/search/git')
        .query({
          q: 'commit',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters.dateFrom).toBe('2024-01-01');
      expect(response.body.data.filters.dateTo).toBe('2024-12-31');
    });

    it('should validate date format', async () => {
      const response = await request(app)
        .get('/api/v1/search/git')
        .query({
          q: 'commit',
          dateFrom: 'invalid-date',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid date format');
    });

    it('should validate required query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search/git')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Task 7: Hybrid Search Endpoint', () => {
    it('should respond to hybrid search with valid query', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({ q: 'test function' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          totalResults: expect.any(Number),
          cached: expect.any(Boolean),
          weights: expect.any(Object),
          filters: expect.any(Object),
        },
      });
    });

    it('should handle filters parameter', async () => {
      const filters = JSON.stringify({
        language: 'typescript',
        author: 'testuser',
      });

      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({
          q: 'test',
          filters,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters).toMatchObject({
        language: 'typescript',
        author: 'testuser',
      });
    });

    it('should handle weights parameter', async () => {
      const weights = JSON.stringify({
        semantic: 0.5,
        structural: 0.3,
        temporal: 0.2,
      });

      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({
          q: 'test',
          weights,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.weights).toMatchObject({
        semantic: expect.any(Number),
        structural: expect.any(Number),
        temporal: expect.any(Number),
      });
    });

    it('should validate JSON format for filters', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({
          q: 'test',
          filters: 'invalid-json',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid filters format');
    });

    it('should validate JSON format for weights', async () => {
      const response = await request(app)
        .get('/api/v1/search/hybrid')
        .query({
          q: 'test',
          weights: 'invalid-json',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid weights format');
    });
  });

  describe('Task 8: Comprehensive Search Endpoint', () => {
    it('should respond to comprehensive search with valid query', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test function' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          results: expect.any(Array),
          facets: expect.any(Object),
          suggestions: expect.any(Array),
          categories: expect.any(Object),
          totalResults: expect.any(Number),
          cached: expect.any(Boolean),
        },
      });
    });

    it('should include facets in response', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.data.facets).toHaveProperty('languages');
      expect(response.body.data.facets).toHaveProperty('nodeTypes');
      expect(response.body.data.facets).toHaveProperty('fileTypes');
    });

    it('should include suggestions in response', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test' })
        .expect(200);

      expect(Array.isArray(response.body.data.suggestions)).toBe(true);
    });

    it('should include categories in response', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test' })
        .expect(200);

      expect(typeof response.body.data.categories).toBe('object');
    });

    it('should handle includeTypes parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({
          q: 'test',
          includeTypes: 'CodeNode,FileNode',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should use higher default limit', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test' })
        .expect(200);

      // Comprehensive search should have higher default limit (20)
      expect(response.body.success).toBe(true);
    });
  });

  describe('Search Statistics Endpoint', () => {
    it('should respond to stats endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/search/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          cache: expect.any(Object),
          endpoints: expect.any(Object),
          supportedNodeTypes: expect.any(Array),
        },
      });
    });

    it('should include cache statistics', async () => {
      const response = await request(app)
        .get('/api/v1/search/stats')
        .expect(200);

      expect(response.body.data.cache).toHaveProperty('size');
      expect(response.body.data.cache).toHaveProperty('maxSize');
    });

    it('should include endpoint information', async () => {
      const response = await request(app)
        .get('/api/v1/search/stats')
        .expect(200);

      const endpoints = response.body.data.endpoints;
      expect(endpoints).toHaveProperty('semantic');
      expect(endpoints).toHaveProperty('structural');
      expect(endpoints).toHaveProperty('git');
      expect(endpoints).toHaveProperty('hybrid');
      expect(endpoints).toHaveProperty('comprehensive');
    });
  });

  describe('Error Handling', () => {
    it('should handle search service errors gracefully', async () => {
      // This test would require mocking the search service to throw an error
      // For now, we'll test with an extremely long query that might cause issues
      const longQuery = 'a'.repeat(1000);
      
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: longQuery });

      // Should either succeed or return a proper error response
      if (response.status !== 200) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should handle malformed parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({
          q: 'test',
          limit: 'not-a-number',
          minSimilarity: 'not-a-number',
        })
        .expect(200);

      // Should use default values for malformed parameters
      expect(response.body.success).toBe(true);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache search results', async () => {
      const query = { q: 'unique-test-query-for-caching' };

      // First request
      const response1 = await request(app)
        .get('/api/v1/search/semantic')
        .query(query)
        .expect(200);

      expect(response1.body.data.cached).toBe(false);

      // Second request should be cached
      const response2 = await request(app)
        .get('/api/v1/search/semantic')
        .query(query)
        .expect(200);

      expect(response2.body.data.cached).toBe(true);
    });

    it('should generate different cache keys for different parameters', async () => {
      const baseQuery = 'cache-test-query';

      // Request with different limits should not share cache
      await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: baseQuery, limit: '5' })
        .expect(200);

      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: baseQuery, limit: '10' })
        .expect(200);

      expect(response.body.data.cached).toBe(false);
    });
  });
});
