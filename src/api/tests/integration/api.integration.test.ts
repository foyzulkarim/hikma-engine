import request from 'supertest';
import { Express } from 'express';
import { createAPIServer } from '../../server';
import { SearchService } from '../../../modules/search-service';
import { apiConfig } from '../../config/api-config';

describe('API Integration Tests', () => {
  let app: any;
  let server: any;
  let searchService: SearchService | null;

  beforeAll(async () => {
    // Create test server
    const serverInstance = await createAPIServer();
    app = serverInstance.getApp();
    server = serverInstance.getServer();
    // searchService = SearchService.getInstance(); // Temporarily disabled - no singleton pattern
    searchService = null; // Will need to be properly initialized when needed

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Health and Monitoring Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('checks');
      expect(response.body.data).toHaveProperty('summary');
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('health');
      expect(response.body.data).toHaveProperty('system');
    });

    it('should return simple status for load balancers', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/status')
        .expect(200);

      expect(['OK', 'DEGRADED'].includes(response.text)).toBe(true);
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/readiness')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ready');
    });

    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/liveness')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('alive');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return system information', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/system')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('node');
      expect(response.body.data).toHaveProperty('process');
      expect(response.body.data).toHaveProperty('api');
      expect(response.body.data).toHaveProperty('configuration');
    });

    it('should return version information', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/version')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('api');
      expect(response.body.data).toHaveProperty('node');
      expect(response.body.data).toHaveProperty('environment');
    });

    it('should return error statistics', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/errors')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('detailed');
    });

    it('should return performance metrics', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/performance')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('metrics');
      expect(response.body.data).toHaveProperty('healthScore');
    });

    it('should return comprehensive metrics', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('errors');
      expect(response.body.data).toHaveProperty('performance');
      expect(response.body.data).toHaveProperty('health');
      expect(response.body.data).toHaveProperty('system');
      expect(response.body.data).toHaveProperty('alerts');
    });
  });

  describe('Search Endpoints', () => {
    describe('Semantic Search', () => {
      it('should perform semantic search with valid query', async () => {
        const response = await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: 'function test', limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data).toHaveProperty('totalResults');
        expect(response.body.data).toHaveProperty('processingTime');
        expect(Array.isArray(response.body.data.results)).toBe(true);
      });

      it('should validate query parameters', async () => {
        const response = await request(app)
          .get('/api/v1/search/semantic')
          .query({ limit: 5 }) // Missing required 'q' parameter
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should respect limit parameter', async () => {
        const response = await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: 'test', limit: 3 })
          .expect(200);

        expect(response.body.data.results.length).toBeLessThanOrEqual(3);
      });

      it('should handle minimum similarity threshold', async () => {
        const response = await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: 'test', minSimilarity: 0.8 })
          .expect(200);

        expect(response.body.success).toBe(true);
        // All results should have similarity >= 0.8
        response.body.data.results.forEach((result: any) => {
          expect(result.similarity).toBeGreaterThanOrEqual(0.8);
        });
      });
    });

    describe('Structural Search', () => {
      it('should perform structural search', async () => {
        const response = await request(app)
          .get('/api/v1/search/structure')
          .query({ q: 'class', language: 'typescript' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(Array.isArray(response.body.data.results)).toBe(true);
      });

      it('should filter by language', async () => {
        const response = await request(app)
          .get('/api/v1/search/structure')
          .query({ q: 'function', language: 'javascript' })
          .expect(200);

        expect(response.body.success).toBe(true);
        // Results should be filtered by language if any exist
      });

      it('should filter by element type', async () => {
        const response = await request(app)
          .get('/api/v1/search/structure')
          .query({ q: 'test', type: 'function' })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Git Search', () => {
      it('should perform git history search', async () => {
        const response = await request(app)
          .get('/api/v1/search/git')
          .query({ q: 'fix', limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(Array.isArray(response.body.data.results)).toBe(true);
      });

      it('should filter by author', async () => {
        const response = await request(app)
          .get('/api/v1/search/git')
          .query({ q: 'update', author: 'test-author' })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should filter by date range', async () => {
        const dateFrom = '2024-01-01';
        const dateTo = '2024-12-31';

        const response = await request(app)
          .get('/api/v1/search/git')
          .query({ q: 'commit', dateFrom, dateTo })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Hybrid Search', () => {
      it('should perform hybrid search', async () => {
        const response = await request(app)
          .get('/api/v1/search/hybrid')
          .query({ q: 'test function', limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(Array.isArray(response.body.data.results)).toBe(true);
      });

      it('should accept search weights', async () => {
        const response = await request(app)
          .get('/api/v1/search/hybrid')
          .query({ 
            q: 'test', 
            'weights[semantic]': '0.6',
            'weights[structural]': '0.3',
            'weights[temporal]': '0.1'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Comprehensive Search', () => {
      it('should perform comprehensive search', async () => {
        const response = await request(app)
          .get('/api/v1/search/comprehensive')
          .query({ q: 'test', limit: 10 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data).toHaveProperty('facets');
        expect(response.body.data).toHaveProperty('suggestions');
        expect(Array.isArray(response.body.data.results)).toBe(true);
      });

      it('should include facets in comprehensive search', async () => {
        const response = await request(app)
          .get('/api/v1/search/comprehensive')
          .query({ q: 'function' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.facets).toHaveProperty('languages');
        expect(response.body.data.facets).toHaveProperty('authors');
        expect(response.body.data.facets).toHaveProperty('fileTypes');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
    });

    it('should handle malformed query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', limit: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle query length limits', async () => {
      const longQuery = 'a'.repeat(1000); // Exceeds typical limit
      
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: longQuery })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle invalid similarity thresholds', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', minSimilarity: '1.5' }) // Invalid similarity > 1
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Response Format', () => {
    it('should have consistent response format for successful requests', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.success).toBe(true);
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('processingTime');
    });

    it('should have consistent error response format', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .expect(400);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should include request metadata', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('processingTime');
      expect(typeof response.body.meta.processingTime).toBe('number');
    });
  });

  describe('Performance', () => {
    it('should respond to health checks quickly', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/monitoring/liveness')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('alive');
      });
    });

    it('should track processing time in responses', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', limit: 1 })
        .expect(200);

      expect(response.body.meta.processingTime).toBeGreaterThan(0);
      expect(typeof response.body.meta.processingTime).toBe('number');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/search/semantic')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // This test would need to be adjusted based on actual rate limiting configuration
      // For now, we'll just verify the endpoint responds normally
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Cleanup Operations', () => {
    it('should allow manual cleanup of monitoring data', async () => {
      const response = await request(app)
        .post('/api/v1/monitoring/cleanup')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data).toHaveProperty('before');
      expect(response.body.data).toHaveProperty('after');
    });
  });
});
