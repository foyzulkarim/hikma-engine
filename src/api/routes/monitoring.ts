/**
 * @file Monitoring routes for basic health status.
 *       Simplified version for initial API functionality.
 */

import { Router, Request, Response } from 'express';
import { healthCheckService } from '../services/health-check';
import { formatResponse } from '../utils/response-formatter';
import { asyncErrorHandler } from '../middleware/error-handling';
import { optionalAuth } from '../middleware/auth';
import { getLogger } from '../../utils/logger';

const logger = getLogger('MonitoringRoutes');

/**
 * Creates the monitoring router with basic health endpoint.
 */
export function createMonitoringRouter(): Router {
  const router = Router();

  // Apply optional authentication to monitoring endpoints
  router.use(optionalAuth);

  /**
   * Simple health status endpoint.
   * GET /api/v1/monitoring/health
   */
  router.get(
    '/health',
    asyncErrorHandler(async (req: Request, res: Response) => {
      const health = await healthCheckService.performHealthCheck();

      // Set appropriate HTTP status based on health
      let statusCode = 200;
      if (health.status === 'degraded') {
        statusCode = 200; // Still operational
      } else if (health.status === 'unhealthy') {
        statusCode = 503; // Service unavailable
      }

      res.status(statusCode).json(formatResponse.success(req, health));
    })
  );

  /**
   * Detailed health status endpoint.
   * GET /api/v1/monitoring/health/detailed
   */
  router.get(
    '/health/detailed',
    asyncErrorHandler(async (req: Request, res: Response) => {
      const detailedStatus = await healthCheckService.getDetailedStatus();
      res.json(formatResponse.success(req, detailedStatus));
    })
  );

  /**
   * Simple status endpoint for load balancers.
   * GET /api/v1/monitoring/status
   */
  router.get(
    '/status',
    asyncErrorHandler(async (req: Request, res: Response) => {
      const health = await healthCheckService.performHealthCheck();

      if (health.status === 'healthy') {
        res.status(200).send('OK');
      } else if (health.status === 'degraded') {
        res.status(200).send('DEGRADED');
      } else {
        res.status(503).send('UNHEALTHY');
      }
    })
  );

  /**
   * Kubernetes readiness probe endpoint.
   * GET /api/v1/monitoring/readiness
   */
  router.get(
    '/readiness',
    asyncErrorHandler(async (req: Request, res: Response) => {
      const health = await healthCheckService.performHealthCheck();

      // Check if critical services are available
      const criticalChecks = ['searchService', 'sqlite'];
      const criticalFailures = criticalChecks.filter(
        (check) => health.checks[check]?.status === 'fail'
      );

      if (criticalFailures.length === 0) {
        res.status(200).json({ status: 'ready' });
      } else {
        res.status(503).json({
          status: 'not ready',
          failures: criticalFailures,
        });
      }
    })
  );

  /**
   * Kubernetes liveness probe endpoint.
   * GET /api/v1/monitoring/liveness
   */
  router.get('/liveness', (req: Request, res: Response) => {
    // Simple liveness check - if we can respond, we're alive
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * System information endpoint.
   * GET /api/v1/monitoring/system
   */
  router.get(
    '/system',
    asyncErrorHandler(async (req: Request, res: Response) => {
      const systemInfo = healthCheckService.getSystemInfo();
      res.json(formatResponse.success(req, systemInfo));
    })
  );

  /**
   * Version information endpoint.
   * GET /api/v1/monitoring/version
   */
  router.get('/version', (req: Request, res: Response) => {
    const version = {
      api: process.env.npm_package_version || '1.0.0',
      node: process.version,
      environment: process.env.NODE_ENV || 'development',
      buildTime: process.env.BUILD_TIME || 'unknown',
      gitCommit: process.env.GIT_COMMIT || 'unknown',
    };

    res.json(formatResponse.success(req, version));
  });

  return router;
}
