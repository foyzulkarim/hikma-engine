/**
 * @file Health check routes for monitoring API server status.
 *       Provides endpoints to check server health and database connectivity.
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../../utils/logger';
import { getConfig } from '../../config';

const logger = getLogger('HealthRouter');

/**
 * Health check response interface.
 */
interface HealthCheckResponse {
  success: boolean;
  data: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    checks: {
      database: {
        status: 'healthy' | 'unhealthy';
        responseTime?: number;
        error?: string;
      };
      memory: {
        status: 'healthy' | 'unhealthy';
        usage: {
          rss: number;
          heapTotal: number;
          heapUsed: number;
          external: number;
        };
        percentage: number;
      };
    };
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Checks database connectivity status.
 */
async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const config = getConfig();
    const dbConfig = config.getDatabaseConfig();
    
    // For now, we'll do basic checks on database paths/URLs
    // In a full implementation, we would actually test connections
    
    // Check if database paths are accessible (for file-based databases)
    const fs = require('fs');
    const path = require('path');
    
    // Check SQLite database directory exists
    const sqliteDir = path.dirname(dbConfig.sqlite.path);
    if (!fs.existsSync(sqliteDir)) {
      return {
        status: 'unhealthy',
        error: `SQLite database directory does not exist: ${sqliteDir}`,
      };
    }
    

    
    const responseTime = Date.now() - startTime;
    return {
      status: 'healthy',
      responseTime,
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      responseTime,
      error: (error as Error).message,
    };
  }
}

/**
 * Checks memory usage status.
 */
function checkMemoryHealth(): { status: 'healthy' | 'unhealthy'; usage: any; percentage: number } {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const memoryPercentage = (memUsage.rss / totalMemory) * 100;
  
  return {
    status: memoryPercentage > 90 ? 'unhealthy' : 'healthy',
    usage: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
    },
    percentage: Math.round(memoryPercentage * 100) / 100,
  };
}

/**
 * Creates the health check router.
 */
export function createHealthRouter(): Router {
  const router = Router();

  /**
   * Basic health check endpoint.
   * GET /health
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      
      // Perform health checks
      const databaseCheck = await checkDatabaseHealth();
      const memoryCheck = checkMemoryHealth();
      
      // Determine overall status
      let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      if (databaseCheck.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (memoryCheck.status === 'unhealthy') {
        overallStatus = 'degraded';
      }
      
      const response: HealthCheckResponse = {
        success: true,
        data: {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          checks: {
            database: databaseCheck,
            memory: memoryCheck,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown',
        },
      };
      
      const processingTime = Date.now() - startTime;
      logger.debug('Health check completed', {
        status: overallStatus,
        processingTime: `${processingTime}ms`,
        requestId: req.headers['x-request-id'],
      });
      
      // Set appropriate HTTP status code
      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      res.status(statusCode).json(response);
      
    } catch (error) {
      logger.error('Health check failed', {
        error: (error as Error).message,
        requestId: req.headers['x-request-id'],
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Health check failed',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  });

  /**
   * Liveness probe endpoint (simple check that server is running).
   * GET /health/live
   */
  router.get('/live', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'alive',
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  });

  /**
   * Readiness probe endpoint (check if server is ready to handle requests).
   * GET /health/ready
   */
  router.get('/ready', async (req: Request, res: Response) => {
    try {
      const databaseCheck = await checkDatabaseHealth();
      const isReady = databaseCheck.status === 'healthy';
      
      res.status(isReady ? 200 : 503).json({
        success: true,
        data: {
          status: isReady ? 'ready' : 'not_ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: databaseCheck,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
      
    } catch (error) {
      logger.error('Readiness check failed', {
        error: (error as Error).message,
        requestId: req.headers['x-request-id'],
      });
      
      res.status(503).json({
        success: false,
        error: {
          code: 'READINESS_CHECK_FAILED',
          message: 'Readiness check failed',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  });

  return router;
}
