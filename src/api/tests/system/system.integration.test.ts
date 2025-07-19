import request from 'supertest';
import { Express } from 'express';
import { createApiServer } from '../../server';
import { SearchService } from '../../../core/search-service';
import { apiConfig } from '../../config/api-config';
import { healthCheckService } from '../../services/health-check';
import { errorMonitoringService } from '../../services/error-monitoring';
import { performanceOptimizer } from '../../services/performance-optimizer';

describe('System Integration Tests', () => {
  let app: Express;
  let server: any;
  let searchService: SearchService;

  beforeAll(async () => {
    // Create test server with full configuration
    const serverInstance = await createApiServer();
    app = serverInstance.app;
    server = serverInstance.server;
    searchService = SearchService.getInstance();

    // Wait for all services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    
    // Cleanup services
    healthCheckService.destroy();
    performanceOptimizer.destroy();
  });

  describe('Full System Health Check', () => {
    it('should have all services running and healthy', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('health');
      expect(response.body.data).toHaveProperty('system');
      
      const health = response.body.data.health;
      expect(health.status).toMatch(/healthy|degraded/);
      expect(health.summary.total).toBeGreaterThan(0);
      expect(health.summary.failed).toBe(0); // No critical failures
    });

    it('should have all required services initialized', async () => {
      // Check search service
      expect(searchService).toBeDefined();
      
      // Check configuration
      expect(apiConfig.validateConfiguration()).toBe(true);
      
      // Check monitoring services
      const healthStatus = await healthCheckService.performHealthCheck();
      expect(healthStatus).toHaveProperty('status');
      expect(healthStatus).toHaveProperty('checks');
      
      const performanceMetrics = performanceOptimizer.getPerformanceMetrics();
      expect(performanceMetrics).toHaveProperty('cacheHitRate');
      expect(performanceMetrics).toHaveProperty('averageResponseTime');
    });
  });

  describe('End-to-End Search Workflows', () => {
    it('should complete a full semantic search workflow', async () => {
      // Step 1: Perform semantic search
      const searchResponse = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'authentication function', limit: 10 })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data).toHaveProperty('results');
      expect(searchResponse.body.data).toHaveProperty('totalResults');
      expect(searchResponse.body.data).toHaveProperty('processingTime');
      expect(searchResponse.body.meta).toHaveProperty('requestId');

      // Step 2: Verify result structure
      if (searchResponse.body.data.results.length > 0) {
        const result = searchResponse.body.data.results[0];
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('rank');
      }

      // Step 3: Check that metrics were recorded
      const metricsResponse = await request(app)
        .get('/api/v1/monitoring/performance')
        .expect(200);

      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data.metrics.requests.total).toBeGreaterThan(0);
    });

    it('should complete a comprehensive search workflow with facets', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'user service implementation', limit: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data).toHaveProperty('facets');
      expect(response.body.data).toHaveProperty('suggestions');
      
      // Verify facets structure
      const facets = response.body.data.facets;
      expect(facets).toHaveProperty('languages');
      expect(facets).toHaveProperty('authors');
      expect(facets).toHaveProperty('fileTypes');
      
      // Verify suggestions are provided
      expect(Array.isArray(response.body.data.suggestions)).toBe(true);
    });

    it('should handle multi-step search refinement', async () => {
      // Step 1: Initial broad search
      const initialSearch = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'database', limit: 20 })
        .expect(200);

      expect(initialSearch.body.success).toBe(true);
      const initialCount = initialSearch.body.data.totalResults;

      // Step 2: Refined structural search
      const refinedSearch = await request(app)
        .get('/api/v1/search/structure')
        .query({ q: 'database connection', language: 'typescript', limit: 10 })
        .expect(200);

      expect(refinedSearch.body.success).toBe(true);
      
      // Step 3: Hybrid search combining both
      const hybridSearch = await request(app)
        .get('/api/v1/search/hybrid')
        .query({ 
          q: 'database connection',
          'weights[semantic]': '0.6',
          'weights[structural]': '0.4',
          limit: 15
        })
        .expect(200);

      expect(hybridSearch.body.success).toBe(true);
      expect(hybridSearch.body.data.results).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle and recover from validation errors', async () => {
      // Generate validation error
      const errorResponse = await request(app)
        .get('/api/v1/search/semantic')
        .query({ limit: 'invalid', minSimilarity: '2.0' })
        .expect(400);

      expect(errorResponse.body.success).toBe(false);
      expect(errorResponse.body.error.code).toBe('VALIDATION_ERROR');

      // Verify error was recorded
      const errorStats = await request(app)
        .get('/api/v1/monitoring/errors')
        .expect(200);

      expect(errorStats.body.success).toBe(true);
      expect(errorStats.body.data.summary.totalErrors).toBeGreaterThan(0);

      // Verify system can still handle valid requests
      const validResponse = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'test', limit: 5 })
        .expect(200);

      expect(validResponse.body.success).toBe(true);
    });

    it('should maintain service availability during error conditions', async () => {
      // Generate multiple errors
      const errorPromises = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/search/semantic')
          .query({ limit: 'invalid' })
          .expect(400)
      );

      await Promise.all(errorPromises);

      // Verify health status is still acceptable
      const healthResponse = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(healthResponse.body.success).toBe(true);
      // System should be healthy or degraded, but not unhealthy
      expect(['healthy', 'degraded']).toContain(healthResponse.body.data.status);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const requests = Array(concurrentRequests).fill(null).map((_, index) =>
        request(app)
          .get('/api/v1/search/semantic')
          .query({ q: `concurrent test ${index}`, limit: 5 })
          .expect(200)
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });

      // Should complete within reasonable time (adjust based on system capacity)
      expect(totalTime).toBeLessThan(30000); // 30 seconds

      // Check performance metrics
      const metricsResponse = await request(app)
        .get('/api/v1/monitoring/performance')
        .expect(200);

      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data.metrics.requests.total).toBeGreaterThanOrEqual(concurrentRequests);
    });

    it('should maintain performance under sustained load', async () => {
      const iterations = 50;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: `sustained load test ${i}`, limit: 3 })
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        expect(response.body.success).toBe(true);

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Calculate performance statistics
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      // Performance should remain consistent
      expect(avgResponseTime).toBeLessThan(5000); // Average under 5 seconds
      expect(maxResponseTime).toBeLessThan(10000); // Max under 10 seconds

      console.log(`Performance stats - Avg: ${avgResponseTime.toFixed(2)}ms, Min: ${minResponseTime}ms, Max: ${maxResponseTime}ms`);
    });
  });

  describe('Cache and Optimization', () => {
    it('should demonstrate cache effectiveness', async () => {
      const testQuery = 'cache effectiveness test';

      // First request (cache miss)
      const firstResponse = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: testQuery, limit: 5 })
        .expect(200);

      const firstResponseTime = firstResponse.body.meta.processingTime;

      // Second request (cache hit)
      const secondResponse = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: testQuery, limit: 5 })
        .expect(200);

      const secondResponseTime = secondResponse.body.meta.processingTime;

      // Cache should improve performance
      expect(secondResponseTime).toBeLessThanOrEqual(firstResponseTime);
      
      // Results should be consistent
      expect(firstResponse.body.data.totalResults).toBe(secondResponse.body.data.totalResults);
    });

    it('should show cache statistics', async () => {
      // Generate some cached requests
      const queries = ['cache test 1', 'cache test 2', 'cache test 3'];
      
      for (const query of queries) {
        await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: query, limit: 3 })
          .expect(200);
      }

      // Repeat some queries to generate cache hits
      for (const query of queries.slice(0, 2)) {
        await request(app)
          .get('/api/v1/search/semantic')
          .query({ q: query, limit: 3 })
          .expect(200);
      }

      // Check performance metrics for cache statistics
      const metricsResponse = await request(app)
        .get('/api/v1/monitoring/performance')
        .expect(200);

      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data).toHaveProperty('metrics');
    });
  });

  describe('Monitoring and Observability', () => {
    it('should provide comprehensive monitoring data', async () => {
      const metricsResponse = await request(app)
        .get('/api/v1/monitoring/metrics')
        .expect(200);

      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data).toHaveProperty('errors');
      expect(metricsResponse.body.data).toHaveProperty('performance');
      expect(metricsResponse.body.data).toHaveProperty('health');
      expect(metricsResponse.body.data).toHaveProperty('system');
      expect(metricsResponse.body.data).toHaveProperty('alerts');
    });

    it('should track request correlation across services', async () => {
      const response = await request(app)
        .get('/api/v1/search/comprehensive')
        .query({ q: 'correlation test', limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('processingTime');

      const requestId = response.body.meta.requestId;
      expect(requestId).toMatch(/^req_/); // Should follow request ID format
    });

    it('should provide system information for debugging', async () => {
      const systemResponse = await request(app)
        .get('/api/v1/monitoring/system')
        .expect(200);

      expect(systemResponse.body.success).toBe(true);
      expect(systemResponse.body.data).toHaveProperty('node');
      expect(systemResponse.body.data).toHaveProperty('process');
      expect(systemResponse.body.data).toHaveProperty('api');
      expect(systemResponse.body.data).toHaveProperty('configuration');

      // Verify system info structure
      const systemData = systemResponse.body.data;
      expect(systemData.node).toHaveProperty('version');
      expect(systemData.process).toHaveProperty('pid');
      expect(systemData.api).toHaveProperty('version');
      expect(systemData.configuration).toHaveProperty('server');
    });
  });

  describe('Security and Authentication', () => {
    it('should handle requests without authentication when disabled', async () => {
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: 'security test', limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should sanitize input parameters', async () => {
      const maliciousQuery = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .get('/api/v1/search/semantic')
        .query({ q: maliciousQuery, limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Query should be sanitized (no script tags in response)
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toContain('<script>');
      expect(responseStr).not.toContain('alert(');
    });
  });

  describe('Configuration and Environment', () => {
    it('should load and validate configuration correctly', async () => {
      const configResponse = await request(app)
        .get('/api/v1/monitoring/config')
        .expect(200);

      expect(configResponse.body.success).toBe(true);
      expect(configResponse.body.data).toHaveProperty('monitoring');
      expect(configResponse.body.data).toHaveProperty('server');
      expect(configResponse.body.data).toHaveProperty('cache');
      expect(configResponse.body.data).toHaveProperty('security');

      // Verify configuration structure
      const config = configResponse.body.data;
      expect(config.server).toHaveProperty('port');
      expect(config.monitoring).toHaveProperty('enabled');
      expect(config.cache).toHaveProperty('enabled');
    });

    it('should provide version information', async () => {
      const versionResponse = await request(app)
        .get('/api/v1/monitoring/version')
        .expect(200);

      expect(versionResponse.body.success).toBe(true);
      expect(versionResponse.body.data).toHaveProperty('api');
      expect(versionResponse.body.data).toHaveProperty('node');
      expect(versionResponse.body.data).toHaveProperty('environment');
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain data consistency across search types', async () => {
      const query = 'data consistency test';

      // Perform different types of searches with the same query
      const [semanticResponse, structuralResponse, hybridResponse] = await Promise.all([
        request(app).get('/api/v1/search/semantic').query({ q: query, limit: 10 }),
        request(app).get('/api/v1/search/structure').query({ q: query, limit: 10 }),
        request(app).get('/api/v1/search/hybrid').query({ q: query, limit: 10 })
      ]);

      // All should succeed
      expect(semanticResponse.status).toBe(200);
      expect(structuralResponse.status).toBe(200);
      expect(hybridResponse.status).toBe(200);

      // All should have consistent response structure
      [semanticResponse, structuralResponse, hybridResponse].forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data).toHaveProperty('totalResults');
        expect(response.body.meta).toHaveProperty('requestId');
      });
    });

    it('should handle cleanup operations correctly', async () => {
      // Trigger cleanup
      const cleanupResponse = await request(app)
        .post('/api/v1/monitoring/cleanup')
        .send({ olderThanHours: 1 })
        .expect(200);

      expect(cleanupResponse.body.success).toBe(true);
      expect(cleanupResponse.body.data).toHaveProperty('message');
      expect(cleanupResponse.body.data).toHaveProperty('before');
      expect(cleanupResponse.body.data).toHaveProperty('after');

      // System should still be operational after cleanup
      const healthResponse = await request(app)
        .get('/api/v1/monitoring/health')
        .expect(200);

      expect(healthResponse.body.success).toBe(true);
    });
  });

  describe('Production Readiness', () => {
    it('should pass all readiness checks', async () => {
      const readinessResponse = await request(app)
        .get('/api/v1/monitoring/readiness')
        .expect(200);

      expect(readinessResponse.body.status).toBe('ready');
    });

    it('should pass liveness checks', async () => {
      const livenessResponse = await request(app)
        .get('/api/v1/monitoring/liveness')
        .expect(200);

      expect(livenessResponse.body.status).toBe('alive');
      expect(livenessResponse.body).toHaveProperty('timestamp');
      expect(livenessResponse.body).toHaveProperty('uptime');
    });

    it('should demonstrate system stability over time', async () => {
      const iterations = 20;
      const healthChecks: boolean[] = [];

      for (let i = 0; i < iterations; i++) {
        const response = await request(app)
          .get('/api/v1/monitoring/health')
          .expect(200);

        healthChecks.push(response.body.data.status === 'healthy');
        
        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // System should be consistently healthy
      const healthyCount = healthChecks.filter(Boolean).length;
      const healthyPercentage = (healthyCount / iterations) * 100;

      expect(healthyPercentage).toBeGreaterThanOrEqual(80); // At least 80% healthy
    });
  });
});
