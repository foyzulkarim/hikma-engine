import { LRUCache } from 'lru-cache';
import { apiConfig } from '../config/api-config';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PerformanceOptimizer');

/**
 * Performance optimization service for the API
 * Handles caching, connection pooling, and performance monitoring
 */

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  updateAgeOnGet?: boolean;
}

export interface PerformanceMetrics {
  cacheHitRate: number;
  averageResponseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  activeConnections: number;
  queuedRequests: number;
}

export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private caches: Map<string, LRUCache<string, any>>;
  private connectionPools: Map<string, any>;
  private requestQueue: Array<{ id: string; timestamp: Date; priority: number }>;
  private activeRequests: Set<string>;
  private responseTimeHistory: number[];
  private cacheStats: Map<string, { hits: number; misses: number }>;

  private constructor() {
    this.caches = new Map();
    this.connectionPools = new Map();
    this.requestQueue = [];
    this.activeRequests = new Set();
    this.responseTimeHistory = [];
    this.cacheStats = new Map();
    
    this.initializeCaches();
    this.initializeConnectionPools();
    this.startPerformanceMonitoring();
  }

  public static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  private initializeCaches(): void {
    const cacheConfig = apiConfig.getCacheConfig();
    
    if (!cacheConfig.enabled) {
      return;
    }

    // Initialize different cache types with specific TTLs
    const cacheTypes = [
      { name: 'semantic', ttl: cacheConfig.ttl.semantic },
      { name: 'structural', ttl: cacheConfig.ttl.structural },
      { name: 'git', ttl: cacheConfig.ttl.git },
      { name: 'hybrid', ttl: cacheConfig.ttl.hybrid },
      { name: 'comprehensive', ttl: cacheConfig.ttl.comprehensive },
      { name: 'metadata', ttl: 3600 }, // 1 hour for metadata
      { name: 'health', ttl: 300 }, // 5 minutes for health data
    ];

    cacheTypes.forEach(({ name, ttl }) => {
      const cache = new LRUCache<string, any>({
        max: cacheConfig.maxSize,
        ttl: ttl * 1000, // Convert to milliseconds
        updateAgeOnGet: true,
        allowStale: false,
      });

      this.caches.set(name, cache);
      this.cacheStats.set(name, { hits: 0, misses: 0 });
    });

    logger.info('Performance caches initialized', {
      cacheTypes: cacheTypes.map(c => c.name),
      maxSize: cacheConfig.maxSize,
    });
  }

  private initializeConnectionPools(): void {
    // Initialize connection pools for different services
    // This would be implemented based on actual database clients
    
    // Example: Database connection pool
    this.connectionPools.set('database', {
      maxConnections: 20,
      activeConnections: 0,
      idleConnections: [],
      waitingQueue: [],
    });

    // Example: HTTP client pool
    this.connectionPools.set('http', {
      maxConnections: 50,
      activeConnections: 0,
      keepAlive: true,
      timeout: 30000,
    });

    logger.info('Connection pools initialized');
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance metrics every 30 seconds
    setInterval(() => {
      this.collectPerformanceMetrics();
      this.optimizeMemoryUsage();
      this.cleanupExpiredData();
    }, 30000);
  }

  // Cache Management
  public async getFromCache<T>(
    cacheType: string,
    key: string,
    fallbackFn?: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T | null> {
    const cache = this.caches.get(cacheType);
    if (!cache) {
      if (fallbackFn) {
        return await fallbackFn();
      }
      return null;
    }

    const stats = this.cacheStats.get(cacheType)!;
    const cachedValue = cache.get(key);

    if (cachedValue !== undefined) {
      stats.hits++;
      return cachedValue;
    }

    stats.misses++;

    if (fallbackFn) {
      try {
        const value = await fallbackFn();
        this.setCache(cacheType, key, value, options);
        return value;
      } catch (error) {
        logger.error('Cache fallback function failed', { cacheType, key, error });
        return null;
      }
    }

    return null;
  }

  public setCache(
    cacheType: string,
    key: string,
    value: any,
    options?: CacheOptions
  ): void {
    const cache = this.caches.get(cacheType);
    if (!cache) {
      return;
    }

    const setOptions: any = {};
    if (options?.ttl) {
      setOptions.ttl = options.ttl * 1000; // Convert to milliseconds
    }

    cache.set(key, value, setOptions);
  }

  public invalidateCache(cacheType: string, key?: string): void {
    const cache = this.caches.get(cacheType);
    if (!cache) {
      return;
    }

    if (key) {
      cache.delete(key);
    } else {
      cache.clear();
    }
  }

  public getCacheStats(cacheType?: string): Record<string, any> {
    if (cacheType) {
      const cache = this.caches.get(cacheType);
      const stats = this.cacheStats.get(cacheType);
      
      if (!cache || !stats) {
        return {};
      }

      const total = stats.hits + stats.misses;
      return {
        size: cache.size,
        maxSize: cache.max,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: total > 0 ? (stats.hits / total) * 100 : 0,
      };
    }

    const allStats: Record<string, any> = {};
    for (const [type, cache] of this.caches) {
      allStats[type] = this.getCacheStats(type);
    }
    return allStats;
  }

  // Request Queue Management
  public async queueRequest<T>(
    requestId: string,
    requestFn: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    // Add request to queue
    this.requestQueue.push({
      id: requestId,
      timestamp: new Date(),
      priority,
    });

    // Sort queue by priority (higher priority first)
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    // Wait for turn if queue is full
    while (this.activeRequests.size >= this.getMaxConcurrentRequests()) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Execute request
    this.activeRequests.add(requestId);
    const startTime = Date.now();

    try {
      const result = await requestFn();
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      return result;
    } finally {
      this.activeRequests.delete(requestId);
      this.requestQueue = this.requestQueue.filter(req => req.id !== requestId);
    }
  }

  private getMaxConcurrentRequests(): number {
    // Dynamic concurrency based on system resources
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (memoryUsagePercent > 80) {
      return 5; // Reduce concurrency under high memory usage
    } else if (memoryUsagePercent > 60) {
      return 10;
    } else {
      return 20; // Normal concurrency
    }
  }

  private recordResponseTime(responseTime: number): void {
    this.responseTimeHistory.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.responseTimeHistory.length > 1000) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-1000);
    }
  }

  // Memory Optimization
  private optimizeMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    if (memoryUsagePercent > 85) {
      logger.warn('High memory usage detected, triggering optimization', {
        memoryUsagePercent,
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      });

      // Reduce cache sizes
      for (const [type, cache] of this.caches) {
        const currentSize = cache.size;
        const targetSize = Math.floor(currentSize * 0.7); // Reduce by 30%
        
        if (currentSize > targetSize) {
          // LRU cache will automatically evict oldest items
          cache.max = targetSize;
          logger.info(`Reduced cache size for ${type}`, {
            from: currentSize,
            to: targetSize,
          });
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  private cleanupExpiredData(): void {
    // Clean up old response time history
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    this.responseTimeHistory = this.responseTimeHistory.filter(
      (_, index) => index >= this.responseTimeHistory.length - 100 // Keep last 100
    );

    // Clean up old queued requests (older than 5 minutes)
    const queueCutoff = new Date(Date.now() - 5 * 60 * 1000);
    this.requestQueue = this.requestQueue.filter(
      req => req.timestamp > queueCutoff
    );
  }

  // Performance Metrics
  public getPerformanceMetrics(): PerformanceMetrics {
    const cacheStats = this.getCacheStats();
    const totalHits = Object.values(cacheStats).reduce((sum: number, stats: any) => sum + (stats.hits || 0), 0);
    const totalRequests = Object.values(cacheStats).reduce((sum: number, stats: any) => sum + (stats.hits || 0) + (stats.misses || 0), 0);
    
    const averageResponseTime = this.responseTimeHistory.length > 0
      ? this.responseTimeHistory.reduce((sum, time) => sum + time, 0) / this.responseTimeHistory.length
      : 0;

    return {
      cacheHitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
      averageResponseTime: Math.round(averageResponseTime),
      memoryUsage: process.memoryUsage(),
      activeConnections: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
    };
  }

  private collectPerformanceMetrics(): void {
    const metrics = this.getPerformanceMetrics();
    
    // Log performance metrics periodically
    logger.debug('Performance metrics collected', {
      cacheHitRate: `${metrics.cacheHitRate.toFixed(2)}%`,
      averageResponseTime: `${metrics.averageResponseTime}ms`,
      memoryUsed: `${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
      activeConnections: metrics.activeConnections,
      queuedRequests: metrics.queuedRequests,
    });

    // Alert on performance issues
    if (metrics.averageResponseTime > 5000) {
      logger.warn('High average response time detected', {
        averageResponseTime: metrics.averageResponseTime,
      });
    }

    if (metrics.cacheHitRate < 50 && this.responseTimeHistory.length > 100) {
      logger.warn('Low cache hit rate detected', {
        cacheHitRate: metrics.cacheHitRate,
      });
    }
  }

  // Connection Pool Management
  public async getConnection(poolName: string): Promise<any> {
    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      throw new Error(`Connection pool '${poolName}' not found`);
    }

    // This would implement actual connection pooling logic
    // For now, return a mock connection
    return { id: `conn_${Date.now()}`, poolName };
  }

  public releaseConnection(poolName: string, connection: any): void {
    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      return;
    }

    // This would implement actual connection release logic
    logger.debug('Connection released', { poolName, connectionId: connection.id });
  }

  // Batch Processing
  public async batchProcess<T, R>(
    items: T[],
    processFn: (batch: T[]) => Promise<R[]>,
    batchSize: number = 10
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processFn(batch);
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return results;
  }

  // Streaming for large datasets
  public async* streamResults<T>(
    dataSource: () => AsyncIterable<T>,
    chunkSize: number = 100
  ): AsyncGenerator<T[], void, unknown> {
    let chunk: T[] = [];
    
    for await (const item of dataSource()) {
      chunk.push(item);
      
      if (chunk.length >= chunkSize) {
        yield chunk;
        chunk = [];
      }
    }
    
    if (chunk.length > 0) {
      yield chunk;
    }
  }

  // Cleanup
  public destroy(): void {
    // Clear all caches
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    
    // Clear connection pools
    this.connectionPools.clear();
    
    // Clear queues
    this.requestQueue = [];
    this.activeRequests.clear();
    this.responseTimeHistory = [];
    
    logger.info('Performance optimizer destroyed');
  }
}

export const performanceOptimizer = PerformanceOptimizer.getInstance();
