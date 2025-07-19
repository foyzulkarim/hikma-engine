/**
 * @file Express.js API server for hikma-engine semantic search.
 *       Provides RESTful endpoints for semantic, structural, git, and hybrid searches.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { getLogger, Logger } from '../utils/logger';
import { getConfig } from '../config';
import { createHealthRouter } from './routes/health';
import {
  getEnvironmentRateLimit,
  addRateLimitHeaders,
  correlationMiddleware,
  timingMiddleware,
  requestLoggingMiddleware,
  performanceMonitoringMiddleware,
  globalErrorHandler,
} from './middleware';

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  timeout: number;
}

/**
 * API Server class that manages the Express.js application lifecycle.
 */
export class APIServer {
  private app: Application;
  private server: any;
  private logger: Logger;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = getLogger('APIServer');
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Sets up middleware stack for the Express application.
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Rate limiting (before other middleware for efficiency)
    this.app.use(getEnvironmentRateLimit());

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Correlation and request tracking middleware
    this.app.use(correlationMiddleware);
    this.app.use(timingMiddleware);
    this.app.use(requestLoggingMiddleware);
    this.app.use(performanceMonitoringMiddleware);

    // Rate limit headers middleware
    this.app.use(addRateLimitHeaders);

    // Request logging middleware (using morgan for HTTP logs)
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          this.logger.info(message.trim(), { source: 'http' });
        },
      },
    }));

    // Request timeout middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setTimeout(this.config.timeout, () => {
        this.logger.warn('Request timeout', {
          method: req.method,
          url: req.url,
          timeout: this.config.timeout,
          requestId: req.context?.requestId,
        });
        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request timeout',
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId: req.context?.requestId || 'unknown',
            },
          });
        }
      });
      next();
    });
  }

  /**
   * Sets up API routes.
   */
  private setupRoutes(): void {
    // Health check routes
    this.app.use('/health', createHealthRouter());

    // API version prefix
    const apiV1 = express.Router();
    this.app.use('/api/v1', apiV1);

    // Search routes
    const { createSearchRouter } = require('./routes/search');
    const { createMonitoringRouter } = require('./routes/monitoring');
    const { getConfig } = require('../config');
    
    apiV1.use('/search', createSearchRouter(getConfig()));
    apiV1.use('/monitoring', createMonitoringRouter());

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          name: 'hikma-engine API',
          version: '1.0.0',
          description: 'Semantic search API for code knowledge graphs',
          endpoints: {
            health: '/health',
            api: '/api/v1',
            search: {
              semantic: '/api/v1/search/semantic',
              structural: '/api/v1/search/structure',
              git: '/api/v1/search/git',
              hybrid: '/api/v1/search/hybrid',
              comprehensive: '/api/v1/search/comprehensive',
              stats: '/api/v1/search/stats',
            },
            monitoring: {
              health: '/api/v1/monitoring/health',
              errors: '/api/v1/monitoring/errors',
              performance: '/api/v1/monitoring/performance',
              trends: '/api/v1/monitoring/trends',
              system: '/api/v1/monitoring/system',
              cleanup: '/api/v1/monitoring/cleanup',
            },
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
        },
      });
    });
  }

  /**
   * Sets up global error handling middleware.
   */
  private setupErrorHandling(): void {
    // 404 handler for undefined routes
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `Route ${req.method} ${req.url} not found`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
        },
      });
    });

    // Global error handler (must be last)
    this.app.use(globalErrorHandler);
  }

  /**
   * Starts the server and begins listening for requests.
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.logger.info('API server started', {
            host: this.config.host,
            port: this.config.port,
            environment: process.env.NODE_ENV || 'development',
          });
          resolve();
        });

        this.server.on('error', (error: Error) => {
          this.logger.error('Server error', { error: error.message });
          reject(error);
        });

        // Setup graceful shutdown handlers
        this.setupGracefulShutdown();

      } catch (error) {
        this.logger.error('Failed to start server', { error: (error as Error).message });
        reject(error);
      }
    });
  }

  /**
   * Stops the server gracefully.
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.logger.info('Shutting down API server...');
        
        this.server.close(() => {
          this.logger.info('API server shut down successfully');
          resolve();
        });

        // Force close after timeout
        setTimeout(() => {
          this.logger.warn('Force closing server after timeout');
          this.server.destroy();
          resolve();
        }, 10000);
      } else {
        resolve();
      }
    });
  }

  /**
   * Sets up graceful shutdown handling for process signals.
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown', { error: (error as Error).message });
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason: any) => {
      this.logger.error('Unhandled rejection', { reason: reason?.toString() });
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Gets the Express application instance.
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Gets the HTTP server instance.
   */
  public getServer(): any {
    return this.server;
  }
}

/**
 * Creates and configures the API server with default settings.
 */
export function createAPIServer(overrides: Partial<ServerConfig> = {}): APIServer {
  const defaultConfig: ServerConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
      credentials: true,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10), // 30 seconds
  };

  const config = { ...defaultConfig, ...overrides };
  return new APIServer(config);
}
