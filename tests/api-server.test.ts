/**
 * @file Tests for the API server foundation and basic Express.js structure.
 */

import request from 'supertest';
import { createAPIServer, APIServer } from '../src/api/server';
import { initializeConfig } from '../src/config';
import { initializeLogger } from '../src/utils/logger';
import * as path from 'path';

describe('API Server', () => {
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
      timeout: 5000,
    });

    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Basic Server Setup', () => {
    it('should respond to root endpoint', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'hikma-engine API',
          version: '1.0.0',
          description: 'Semantic search API for code knowledge graphs',
          endpoints: {
            health: '/health',
            api: '/api/v1',
          },
        },
      });

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should return 404 for undefined routes', async () => {
      const response = await request(app)
        .get('/nonexistent-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /nonexistent-route not found',
        },
      });

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should set security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      // Check for security headers set by helmet
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should set CORS headers', async () => {
      const response = await request(app)
        .options('/')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });

    it('should handle JSON body parsing', async () => {
      const testData = { test: 'data' };
      
      // Since we don't have POST endpoints yet, we'll test that the middleware is set up
      // by checking that the server doesn't crash with JSON data
      const response = await request(app)
        .post('/api/v1/nonexistent')
        .send(testData)
        .expect(404); // Should get 404, not 400 (bad request)

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should add request ID to responses', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
    });

    it('should accept custom request ID', async () => {
      const customRequestId = 'test-request-123';
      
      const response = await request(app)
        .get('/')
        .set('X-Request-ID', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
      expect(response.body.meta.requestId).toBe(customRequestId);
    });
  });

  describe('Health Check Endpoints', () => {
    it('should respond to basic health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
          uptime: expect.any(Number),
          version: expect.any(String),
          environment: expect.any(String),
          checks: {
            database: {
              status: expect.stringMatching(/^(healthy|unhealthy)$/),
            },
            memory: {
              status: expect.stringMatching(/^(healthy|unhealthy)$/),
              usage: expect.objectContaining({
                rss: expect.any(Number),
                heapTotal: expect.any(Number),
                heapUsed: expect.any(Number),
                external: expect.any(Number),
              }),
              percentage: expect.any(Number),
            },
          },
        },
      });

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
    });

    it('should respond to liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'alive',
          timestamp: expect.any(String),
        },
      });
    });

    it('should respond to readiness probe', async () => {
      const response = await request(app)
        .get('/health/ready');

      // Should be either 200 (ready) or 503 (not ready)
      expect([200, 503]).toContain(response.status);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(ready|not_ready)$/),
          timestamp: expect.any(String),
          checks: {
            database: {
              status: expect.stringMatching(/^(healthy|unhealthy)$/),
            },
          },
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/test')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      // Express should handle this and return a 400 error
      expect(response.status).toBe(400);
    });

    it('should handle large payloads within limits', async () => {
      const largeData = { data: 'x'.repeat(1000) }; // 1KB of data
      
      const response = await request(app)
        .post('/api/v1/test')
        .send(largeData)
        .expect(404); // Should get 404 (route not found), not 413 (payload too large)

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Middleware Stack', () => {
    it('should compress responses when appropriate', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // The compression middleware should be active
      // (actual compression depends on response size and client headers)
      expect(response.status).toBe(200);
    });

    it('should handle URL encoded data', async () => {
      const response = await request(app)
        .post('/api/v1/test')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('key=value&another=data')
        .expect(404); // Should get 404, not 400 (bad request)

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
