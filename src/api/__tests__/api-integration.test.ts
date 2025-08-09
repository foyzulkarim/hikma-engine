/**
 * @file Integration tests for API server startup and basic functionality.
 */

import { createAPIServer, APIServer } from '../server';
import { initializeConfig } from '../../config';
import { initializeLogger } from '../../utils/logger';
import * as path from 'path';
import * as http from 'http';

describe('API Server Integration', () => {
  let server: APIServer;

  beforeAll(async () => {
    // Initialize configuration and logging for tests
    const projectRoot = path.resolve(__dirname, '..');
    initializeConfig(projectRoot);
    initializeLogger({
      level: 'error', // Reduce log noise in tests
      enableConsole: false,
      enableFile: false,
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should start and stop server gracefully', async () => {
    server = createAPIServer({
      port: 0, // Use random available port
      host: 'localhost',
    });

    // Start server
    await expect(server.start()).resolves.not.toThrow();

    // Stop server
    await expect(server.stop()).resolves.not.toThrow();
  }, 10000);

  it('should handle multiple start/stop cycles', async () => {
    server = createAPIServer({
      port: 0,
      host: 'localhost',
    });

    // First cycle
    await server.start();
    await server.stop();

    // Second cycle
    await server.start();
    await server.stop();
  }, 15000);

  it('should respond to HTTP requests when running', async () => {
    server = createAPIServer({
      port: 0,
      host: 'localhost',
    });

    await server.start();

    // Get the actual port the server is listening on
    const app = server.getApp();
    const serverInstance = (app as any).server || app.listen();
    const port = serverInstance.address()?.port;

    if (port) {
      // Make a simple HTTP request
      const response = await new Promise<string>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/health/live`, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => reject(new Error('Request timeout')));
      });

      const parsed = JSON.parse(response);
      expect(parsed).toMatchObject({
        success: true,
        data: {
          status: 'alive',
        },
      });
    }
  }, 10000);
});
