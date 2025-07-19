/**
 * @file Response timing and metadata injection utilities.
 *       Provides comprehensive timing and performance monitoring for API responses.
 */

import { Request, Response, NextFunction } from 'express';
import { getRequestLogger } from '../middleware/correlation';

/**
 * Performance timing interface.
 */
export interface PerformanceTiming {
  startTime: number;
  endTime?: number;
  duration?: number;
  markers: Record<string, number>;
  measures: Record<string, number>;
}

/**
 * Request timing context.
 */
export interface TimingContext {
  request: PerformanceTiming;
  database?: PerformanceTiming;
  cache?: PerformanceTiming;
  search?: PerformanceTiming;
  processing?: PerformanceTiming;
}

/**
 * Timing measurement utility class.
 */
export class TimingUtil {
  private timings: Map<string, PerformanceTiming> = new Map();

  /**
   * Starts a new timing measurement.
   */
  start(name: string): void {
    const timing: PerformanceTiming = {
      startTime: Date.now(),
      markers: {},
      measures: {},
    };
    this.timings.set(name, timing);
  }

  /**
   * Ends a timing measurement.
   */
  end(name: string): number {
    const timing = this.timings.get(name);
    if (!timing) {
      throw new Error(`Timing '${name}' not found`);
    }

    timing.endTime = Date.now();
    timing.duration = timing.endTime - timing.startTime;
    return timing.duration;
  }

  /**
   * Adds a marker to a timing measurement.
   */
  mark(timingName: string, markerName: string): void {
    const timing = this.timings.get(timingName);
    if (timing) {
      timing.markers[markerName] = Date.now() - timing.startTime;
    }
  }

  /**
   * Measures time between two markers.
   */
  measure(timingName: string, measureName: string, startMarker: string, endMarker: string): void {
    const timing = this.timings.get(timingName);
    if (timing && timing.markers[startMarker] && timing.markers[endMarker]) {
      timing.measures[measureName] = timing.markers[endMarker] - timing.markers[startMarker];
    }
  }

  /**
   * Gets timing information.
   */
  getTiming(name: string): PerformanceTiming | undefined {
    return this.timings.get(name);
  }

  /**
   * Gets all timings.
   */
  getAllTimings(): Record<string, PerformanceTiming> {
    const result: Record<string, PerformanceTiming> = {};
    this.timings.forEach((timing, name) => {
      result[name] = timing;
    });
    return result;
  }

  /**
   * Clears all timings.
   */
  clear(): void {
    this.timings.clear();
  }

  /**
   * Gets duration for a completed timing.
   */
  getDuration(name: string): number | undefined {
    const timing = this.timings.get(name);
    return timing?.duration;
  }
}

/**
 * Request timing manager that attaches to request context.
 */
export class RequestTimingManager {
  private timingUtil: TimingUtil;
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.timingUtil = new TimingUtil();
  }

  /**
   * Starts request timing.
   */
  startRequest(): void {
    this.timingUtil.start('request');
  }

  /**
   * Ends request timing.
   */
  endRequest(): number {
    return this.timingUtil.end('request');
  }

  /**
   * Times a database operation.
   */
  async timeDatabase<T>(operation: () => Promise<T>): Promise<T> {
    this.timingUtil.start('database');
    try {
      const result = await operation();
      this.timingUtil.end('database');
      return result;
    } catch (error) {
      this.timingUtil.end('database');
      throw error;
    }
  }

  /**
   * Times a cache operation.
   */
  async timeCache<T>(operation: () => Promise<T>): Promise<T> {
    this.timingUtil.start('cache');
    try {
      const result = await operation();
      this.timingUtil.end('cache');
      return result;
    } catch (error) {
      this.timingUtil.end('cache');
      throw error;
    }
  }

  /**
   * Times a search operation.
   */
  async timeSearch<T>(operation: () => Promise<T>): Promise<T> {
    this.timingUtil.start('search');
    try {
      const result = await operation();
      this.timingUtil.end('search');
      return result;
    } catch (error) {
      this.timingUtil.end('search');
      throw error;
    }
  }

  /**
   * Times a processing operation.
   */
  async timeProcessing<T>(operation: () => Promise<T>): Promise<T> {
    this.timingUtil.start('processing');
    try {
      const result = await operation();
      this.timingUtil.end('processing');
      return result;
    } catch (error) {
      this.timingUtil.end('processing');
      throw error;
    }
  }

  /**
   * Adds a custom marker.
   */
  mark(marker: string): void {
    this.timingUtil.mark('request', marker);
  }

  /**
   * Gets performance summary.
   */
  getPerformanceSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    const timings = this.timingUtil.getAllTimings();

    Object.entries(timings).forEach(([name, timing]) => {
      if (timing.duration !== undefined) {
        summary[`${name}Time`] = timing.duration;
      }
    });

    return summary;
  }

  /**
   * Gets detailed timing information.
   */
  getDetailedTiming(): TimingContext {
    const timings = this.timingUtil.getAllTimings();
    
    return {
      request: timings.request || { startTime: Date.now(), markers: {}, measures: {} },
      database: timings.database,
      cache: timings.cache,
      search: timings.search,
      processing: timings.processing,
    };
  }
}

/**
 * Extended Request interface with timing manager.
 */
declare global {
  namespace Express {
    interface Request {
      timing?: RequestTimingManager;
    }
  }
}

/**
 * Middleware to initialize request timing.
 */
export function initializeTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.context?.requestId || 'unknown';
  req.timing = new RequestTimingManager(requestId);
  req.timing.startRequest();

  // Override response methods to end timing
  const originalJson = res.json;
  res.json = function(data: any) {
    if (req.timing) {
      const duration = req.timing.endRequest();
      
      // Inject timing into response if it's a standard API response
      if (data && typeof data === 'object' && 'meta' in data) {
        if (!data.meta.processingTime) {
          data.meta.processingTime = duration;
        }
        
        // Add performance data in development
        if (process.env.NODE_ENV === 'development') {
          data.meta.performance = req.timing.getPerformanceSummary();
        }
      }
    }
    
    return originalJson.call(this, data);
  };

  next();
}

/**
 * Middleware to log performance metrics.
 */
export function performanceLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (req.timing) {
      const performance = req.timing.getPerformanceSummary();
      const logger = getRequestLogger(req);
      
      // Log slow requests
      const totalTime = performance.requestTime || 0;
      const slowThreshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000', 10);
      
      if (totalTime > slowThreshold) {
        logger.warn('Slow request detected', {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          performance,
          threshold: slowThreshold,
        });
      } else {
        logger.debug('Request performance', {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          performance,
        });
      }
    }
  });

  next();
}

/**
 * Utility function to create timing decorator for async functions.
 */
export function withTiming<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const timing = new TimingUtil();
    timing.start(name);
    
    try {
      const result = await fn(...args);
      timing.end(name);
      return result;
    } catch (error) {
      timing.end(name);
      throw error;
    }
  };
}

/**
 * Server-side performance metrics collector.
 */
export class PerformanceMetrics {
  private static metrics: Map<string, number[]> = new Map();

  /**
   * Records a metric value.
   */
  static record(metric: string, value: number): void {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    
    const values = this.metrics.get(metric)!;
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
  }

  /**
   * Gets metric statistics.
   */
  static getStats(metric: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Gets all metrics.
   */
  static getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.metrics.forEach((_, metric) => {
      stats[metric] = this.getStats(metric);
    });
    
    return stats;
  }

  /**
   * Clears all metrics.
   */
  static clear(): void {
    this.metrics.clear();
  }
}

/**
 * Middleware to collect performance metrics.
 */
export function metricsCollectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record metrics
    PerformanceMetrics.record(`request.${method}.duration`, duration);
    PerformanceMetrics.record(`request.${method}.${route}.duration`, duration);
    PerformanceMetrics.record(`response.${statusCode}.count`, 1);
    
    if (req.timing) {
      const performance = req.timing.getPerformanceSummary();
      
      Object.entries(performance).forEach(([key, value]) => {
        PerformanceMetrics.record(`timing.${key}`, value);
      });
    }
  });

  next();
}

/**
 * Response header injection utilities.
 */
export const responseHeaders = {
  /**
   * Adds performance headers to response.
   */
  addPerformanceHeaders(res: Response, timing: RequestTimingManager): void {
    const performance = timing.getPerformanceSummary();
    
    if (performance.requestTime) {
      res.setHeader('X-Response-Time', `${performance.requestTime}ms`);
    }
    
    if (performance.databaseTime) {
      res.setHeader('X-Database-Time', `${performance.databaseTime}ms`);
    }
    
    if (performance.cacheTime) {
      res.setHeader('X-Cache-Time', `${performance.cacheTime}ms`);
    }
    
    if (performance.searchTime) {
      res.setHeader('X-Search-Time', `${performance.searchTime}ms`);
    }
  },

  /**
   * Adds cache headers to response.
   */
  addCacheHeaders(res: Response, hit: boolean, ttl?: number): void {
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    
    if (ttl) {
      res.setHeader('X-Cache-TTL', ttl.toString());
    }
  },

  /**
   * Adds security headers to response.
   */
  addSecurityHeaders(res: Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
  },
}; 
