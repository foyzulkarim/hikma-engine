/**
 * @file Monitoring routes for error statistics and health status.
 *       Provides endpoints for monitoring API health and error metrics.
 */

import { Router, Request, Response } from 'express';
import { errorMonitoringService } from '../services/error-monitoring';
import { healthCheckService } from '../services/health-check';
import { apiConfig } from '../config/api-config';
import { formatResponse } from '../utils/response-formatter';
import { asyncErrorHandler } from '../middleware/error-handling';
import { optionalAuth } from '../middleware/auth';
import { getLogger } from '../../utils/logger';

const logger = getLogger('MonitoringRoutes');

/**
 * Creates the monitoring router with health and metrics endpoints.
 */
export function createMonitoringRouter(): Router {
  const router = Router();

  // Apply optional authentication to monitoring endpoints
  router.use(optionalAuth);

  /**
   * Health status endpoint with comprehensive health metrics.
   * GET /api/v1/monitoring/health
   */
  router.get('/health', asyncErrorHandler(async (req: Request, res: Response) => {
    const health = await healthCheckService.performHealthCheck();
    
    // Set appropriate HTTP status based on health
    let statusCode = 200;
    if (health.status === 'degraded') {
      statusCode = 200; // Still operational
    } else if (health.status === 'unhealthy') {
      statusCode = 503; // Service unavailable
    }

    res.status(statusCode).json(formatResponse.success(req, health));
  }));

  /**
   * Detailed health status endpoint.
   * GET /api/v1/monitoring/health/detailed
   */
  router.get('/health/detailed', asyncErrorHandler(async (req: Request, res: Response) => {
    const detailedStatus = await healthCheckService.getDetailedStatus();
    res.json(formatResponse.success(req, detailedStatus));
  }));

  /**
   * Simple status endpoint for load balancers.
   * GET /api/v1/monitoring/status
   */
  router.get('/status', asyncErrorHandler(async (req: Request, res: Response) => {
    const health = await healthCheckService.performHealthCheck();
    
    if (health.status === 'healthy') {
      res.status(200).send('OK');
    } else if (health.status === 'degraded') {
      res.status(200).send('DEGRADED');
    } else {
      res.status(503).send('UNHEALTHY');
    }
  }));

  /**
   * Kubernetes readiness probe endpoint.
   * GET /api/v1/monitoring/readiness
   */
  router.get('/readiness', asyncErrorHandler(async (req: Request, res: Response) => {
    const health = await healthCheckService.performHealthCheck();
    
    // Check if critical services are available
    const criticalChecks = ['searchService', 'lancedb', 'sqlite'];
    const criticalFailures = criticalChecks.filter(check => 
      health.checks[check]?.status === 'fail'
    );
    
    if (criticalFailures.length === 0) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not ready', 
        failures: criticalFailures 
      });
    }
  }));

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
   * Error statistics endpoint.
   * GET /api/v1/monitoring/errors
   */
  router.get('/errors', asyncErrorHandler(async (req: Request, res: Response) => {
    const errorSummary = errorMonitoringService.getErrorSummary();
    const errorStats = errorMonitoringService.getErrorStats();

    const response = {
      summary: errorSummary,
      detailed: errorStats.map(stat => ({
        errorCode: stat.errorCode,
        statusCode: stat.statusCode,
        count: stat.count,
        firstOccurrence: stat.firstOccurrence,
        lastOccurrence: stat.lastOccurrence,
        recentSamples: stat.samples.slice(-3), // Last 3 samples
      })),
      timestamp: new Date().toISOString(),
    };

    res.json(formatResponse.success(req, response));
  }));

  /**
   * Performance metrics endpoint.
   * GET /api/v1/monitoring/performance
   */
  router.get('/performance', asyncErrorHandler(async (req: Request, res: Response) => {
    const performanceMetrics = errorMonitoringService.getPerformanceMetrics();
    const healthStatus = errorMonitoringService.getHealthStatus();

    const response = {
      metrics: {
        requests: {
          total: performanceMetrics.requestCount,
          errorRate: Math.round(performanceMetrics.errorRate * 100 * 100) / 100, // Percentage with 2 decimals
        },
        responseTime: {
          average: Math.round(performanceMetrics.averageResponseTime),
          status: performanceMetrics.averageResponseTime > 2000 ? 'slow' : 
                  performanceMetrics.averageResponseTime > 1000 ? 'moderate' : 'fast',
        },
        slowQueries: {
          count: performanceMetrics.slowQueries.length,
          recent: performanceMetrics.slowQueries
            .filter(q => Date.now() - q.timestamp.getTime() < 5 * 60 * 1000) // Last 5 minutes
            .map(q => ({
              query: q.query,
              duration: q.duration,
              endpoint: q.endpoint,
              timestamp: q.timestamp,
            })),
        },
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          uptime: process.uptime(),
        },
      },
      healthScore: healthStatus.score,
      timestamp: new Date().toISOString(),
    };

    res.json(formatResponse.success(req, response));
  }));

  /**
   * Error trends endpoint (last 24 hours).
   * GET /api/v1/monitoring/trends
   */
  router.get('/trends', asyncErrorHandler(async (req: Request, res: Response) => {
    const errorStats = errorMonitoringService.getErrorStats();
    const performanceMetrics = errorMonitoringService.getPerformanceMetrics();

    // Group errors by hour for the last 24 hours
    const now = new Date();
    const hourlyTrends: Record<string, { errors: number; slowQueries: number }> = {};

    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = hour.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      hourlyTrends[hourKey] = { errors: 0, slowQueries: 0 };
    }

    // Count errors by hour
    errorStats.forEach(stat => {
      stat.samples.forEach(sample => {
        const hourKey = sample.timestamp.toISOString().substring(0, 13);
        if (hourlyTrends[hourKey]) {
          hourlyTrends[hourKey].errors++;
        }
      });
    });

    // Count slow queries by hour
    performanceMetrics.slowQueries.forEach(query => {
      const hourKey = query.timestamp.toISOString().substring(0, 13);
      if (hourlyTrends[hourKey]) {
        hourlyTrends[hourKey].slowQueries++;
      }
    });

    const response = {
      trends: Object.entries(hourlyTrends).map(([hour, data]) => ({
        hour,
        errors: data.errors,
        slowQueries: data.slowQueries,
      })),
      summary: {
        totalErrors: Object.values(hourlyTrends).reduce((sum, data) => sum + data.errors, 0),
        totalSlowQueries: Object.values(hourlyTrends).reduce((sum, data) => sum + data.slowQueries, 0),
        peakErrorHour: Object.entries(hourlyTrends).reduce((max, [hour, data]) => 
          data.errors > max.errors ? { hour, errors: data.errors } : max, 
          { hour: '', errors: 0 }
        ),
      },
      timestamp: new Date().toISOString(),
    };

    res.json(formatResponse.success(req, response));
  }));

  /**
   * System information endpoint.
   * GET /api/v1/monitoring/system
   */
  router.get('/system', asyncErrorHandler(async (req: Request, res: Response) => {
    const systemInfo = healthCheckService.getSystemInfo();
    res.json(formatResponse.success(req, systemInfo));
  }));

  /**
   * Configuration endpoint.
   * GET /api/v1/monitoring/config
   */
  router.get('/config', asyncErrorHandler(async (req: Request, res: Response) => {
    const config = {
      monitoring: apiConfig.getMonitoringConfig(),
      server: apiConfig.getServerConfig(),
      cache: apiConfig.getCacheConfig(),
      security: {
        apiKey: apiConfig.getSecurityConfig().apiKey.enabled,
        jwt: apiConfig.getSecurityConfig().jwt.enabled,
      },
    };
    
    res.json(formatResponse.success(req, config));
  }));

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

  /**
   * Active alerts endpoint.
   * GET /api/v1/monitoring/alerts
   */
  router.get('/alerts', asyncErrorHandler(async (req: Request, res: Response) => {
    const alerts = errorMonitoringService.getActiveAlerts();
    res.json(formatResponse.success(req, alerts));
  }));

  /**
   * Comprehensive metrics endpoint.
   * GET /api/v1/monitoring/metrics
   */
  router.get('/metrics', asyncErrorHandler(async (req: Request, res: Response) => {
    const metrics = {
      errors: errorMonitoringService.getErrorStatistics(),
      performance: errorMonitoringService.getPerformanceMetrics(),
      health: healthCheckService.getLastHealthCheck(),
      system: healthCheckService.getSystemInfo(),
      alerts: errorMonitoringService.getActiveAlerts(),
    };
    
    res.json(formatResponse.success(req, metrics));
  }));

  /**
   * Cleanup endpoint to manually trigger cleanup of old data.
   * POST /api/v1/monitoring/cleanup
   */
  router.post('/cleanup', asyncErrorHandler(async (req: Request, res: Response) => {
    const beforeStats = errorMonitoringService.getErrorStats();
    const beforePerformance = errorMonitoringService.getPerformanceMetrics();

    errorMonitoringService.cleanup();

    const afterStats = errorMonitoringService.getErrorStats();
    const afterPerformance = errorMonitoringService.getPerformanceMetrics();

    const response = {
      message: 'Cleanup completed successfully',
      before: {
        errorSamples: beforeStats.reduce((sum, stat) => sum + stat.samples.length, 0),
        slowQueries: beforePerformance.slowQueries.length,
      },
      after: {
        errorSamples: afterStats.reduce((sum, stat) => sum + stat.samples.length, 0),
        slowQueries: afterPerformance.slowQueries.length,
      },
      timestamp: new Date().toISOString(),
    };

    logger.info('Manual cleanup triggered', {
      requestId: req.context?.requestId,
      before: response.before,
      after: response.after,
    });

    res.json(formatResponse.success(req, response));
  }));

  return router;
}
