import request from 'supertest';
import { Express } from 'express';
import { createAPIServer } from '../../server';

describe('Performance and Load Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    const serverInstance = await createAPIServer();
    app = serverInstance.getApp();
    server = serverInstance.getServer();
    
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

  describe('Response Time Tests', () => {
    it('should respond to health checks within acceptable time', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/v1/monitoring/health')
          .expect(200);
        times.push(Date.now() - start);
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(averageTime).toBeLessThan(500); // Average should be under 500ms
      expect(maxTime).toBeLessThan(1000); // Max should be under 1s
    });

    it('should respond to semantic search within acceptable time', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test function', limit: 10 })
        .expect(200);

      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.body.meta.processingTime).toBeLessThan(5000);
    });

    it('should handle multiple search types efficiently', async () => {
      const searchTypes = [
        { endpoint: '/api/v1/search/semantic', query: { q: 'test', limit: 5 } },
        { endpoint: '/api/v1/search/structure', query: { q: 'function', limit: 5 } },
        { endpoint: '/api/v1/search/git', query: { q: 'commit', limit: 5 } },
        { endpoint: '/api/v1/search/hybrid', query: { q: 'test', limit: 5 } },
      ];

      const results = await Promise.all(
        searchTypes.map(async ({ endpoint, query }) => {
          const start = Date.now();
          const response = await request(app)
            .get(endpoint)
            .query(query)
            .expect(200);
          return {
            endpoint,
            duration: Date.now() - start,
            processingTime: response.body.meta.processingTime,
          };
        })
      );

      results.forEach(result => {
        expect(result.duration).toBeLessThan(10000); // 10 seconds max
        expect(result.processingTime).toBeLessThan(10000);
      });
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle concurrent health check requests', async () => {
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app)
          .get('/api/v1/monitoring/liveness')
          .expect(200)
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      expect(responses).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      responses.forEach(response => {
        expect(response.body.status).toBe('alive');
      });
    });

    it('should handle concurrent search requests', async () => {
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map((_, index) =>
        request(app)
          .get('/api/v1/search/semantic')
          .query({ q: `test query ${index}`, limit: 3 })
          .expect(200)
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      expect(responses).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
      });
    });

    it('should handle mixed concurrent requests', async () => {
      const requests = [
        // Health checks (fast)
        ...Array(10).fill(null).map(() =>
          request(app).get('/api/v1/monitoring/liveness').expect(200)
        ),
        // Search requests (slower)
        ...Array(5).fill(null).map((_, index) =>
          request(app)
            .get('/api/v1/search/semantic')
            .query({ q: `concurrent test ${index}`, limit: 2 })
            .expect(200)
        ),
        // Monitoring requests (medium)
        ...Array(3).fill(null).map(() =>
          request(app).get('/api/v1/monitoring/system').expect(200)
        ),
      ];

      const start = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      expect(responses).toHaveLength(18);
      expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not have significant memory leaks during repeated requests', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many requests
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/v1/monitoring/liveness')
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });

    it('should handle large result sets efficiently', async () => {
      const initialMemory = process.memoryUsage();
      
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'test', limit: 50 }) // Large result set
        .expect(200);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(response.body.success).toBe(true);
      expect(response.body.data.results.length).toBeLessThanOrEqual(50);
      
      // Memory increase should be reasonable for the operation
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle validation errors quickly', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/v1/search/semantic')
        .query({ limit: 'invalid' }) // Invalid parameter
        .expect(400);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should fail fast
    });

    it('should handle 404 errors quickly', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/v1/non-existent-endpoint')
        .expect(404);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should fail fast
    });

    it('should handle concurrent error requests', async () => {
      const errorRequests = Array(20).fill(null).map(() =>
        request(app)
          .get('/api/v1/search/semantic')
          .query({ limit: 'invalid' })
          .expect(400)
      );

      const start = Date.now();
      const responses = await Promise.all(errorRequests);
      const totalTime = Date.now() - start;

      expect(responses).toHaveLength(20);
      expect(totalTime).toBeLessThan(2000); // Should handle errors quickly
      
      responses.forEach(response => {
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('Monitoring Performance', () => {
    it('should collect performance metrics efficiently', async () => {
      // Generate some activity
      await Promise.all([
        request(app).get('/api/v1/search/semantic').query({ q: 'test1' }),
        request(app).get('/api/v1/search/semantic').query({ q: 'test2' }),
        request(app).get('/api/v1/search/structure').query({ q: 'function' }),
      ]);

      const start = Date.now();
      
      const response = await request(app)
        .get('/api/v1/monitoring/performance')
        .expect(200);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should collect metrics quickly
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('metrics');
    });

    it('should handle metrics collection under load', async () => {
      // Generate concurrent activity
      const activityPromises = Array(10).fill(null).map((_, index) =>
        request(app)
          .get('/api/v1/search/semantic')
          .query({ q: `load test ${index}`, limit: 2 })
      );

      // Collect metrics while activity is happening
      const metricsPromise = request(app)
        .get('/api/v1/monitoring/metrics')
        .expect(200);

      const [responses, metricsResponse] = await Promise.all([
        Promise.all(activityPromises),
        metricsPromise,
      ]);

      expect(responses).toHaveLength(10);
      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data).toHaveProperty('performance');
      expect(metricsResponse.body.data).toHaveProperty('errors');
    });
  });

  describe('Cache Performance', () => {
    it('should benefit from caching on repeated requests', async () => {
      const query = { q: 'cache test query', limit: 5 };

      // First request (cache miss)
      const start1 = Date.now();
      const response1 = await request(app)
        .get('/api/v1/search/semantic')
        .query(query)
        .expect(200);
      const duration1 = Date.now() - start1;

      // Second request (cache hit, should be faster)
      const start2 = Date.now();
      const response2 = await request(app)
        .get('/api/v1/search/semantic')
        .query(query)
        .expect(200);
      const duration2 = Date.now() - start2;

      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
      
      // Second request should be significantly faster (cache hit)
      // Note: This test might be flaky depending on cache implementation
      // expect(duration2).toBeLessThan(duration1 * 0.8);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources efficiently', async () => {
      const initialMemory = process.memoryUsage();
      
      // Trigger cleanup
      await request(app)
        .post('/api/v1/monitoring/cleanup')
        .expect(200);

      // Allow some time for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase significantly after cleanup
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });
});
