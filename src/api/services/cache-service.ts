/**
 * @file In-memory cache service for API search results.
 *       Provides LRU caching with TTL support without external dependencies.
 */

import { getLogger } from '../../utils/logger';

const logger = getLogger('InMemoryCacheService');

/**
 * Cache entry interface.
 */
interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache configuration interface.
 */
interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // milliseconds
}

/**
 * In-memory cache service with LRU eviction and TTL support.
 */
export class InMemoryCacheService {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = []; // For LRU tracking
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes default
    };

    logger.info('Cache service initialized', {
      maxSize: this.config.maxSize,
      defaultTTL: `${this.config.defaultTTL / 1000}s`,
    });
  }

  /**
   * Sets a value in the cache with optional TTL.
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTTL = ttl || this.config.defaultTTL;

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key);
    }

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: now,
      ttl: entryTTL,
      accessCount: 0,
      lastAccessed: now,
    });

    // Update access order
    this.accessOrder.push(key);

    logger.debug('Cache entry set', {
      key: key.substring(0, 50),
      ttl: `${entryTTL / 1000}s`,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Gets a value from the cache.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      logger.debug('Cache miss', { key: key.substring(0, 50) });
      return null;
    }

    const now = Date.now();

    // Check if entry has expired
    if (now - entry.timestamp > entry.ttl) {
      this.delete(key);
      logger.debug('Cache entry expired', { 
        key: key.substring(0, 50),
        age: `${(now - entry.timestamp) / 1000}s`,
      });
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = now;
    this.updateAccessOrder(key);

    logger.debug('Cache hit', {
      key: key.substring(0, 50),
      accessCount: entry.accessCount,
      age: `${(now - entry.timestamp) / 1000}s`,
    });

    return entry.value as T;
  }

  /**
   * Deletes a value from the cache.
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.removeFromAccessOrder(key);
      logger.debug('Cache entry deleted', { key: key.substring(0, 50) });
    }
    return existed;
  }

  /**
   * Clears all cache entries.
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Gets cache statistics.
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
    oldestEntry?: { key: string; age: number };
  } {
    const now = Date.now();
    let oldestEntry: { key: string; age: number } | undefined;
    let oldestTime = now;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestEntry = {
          key: key.substring(0, 30),
          age: Math.floor((now - entry.timestamp) / 1000),
        };
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      oldestEntry,
    };
  }

  /**
   * Generates a cache key for search operations.
   */
  generateSearchKey(
    searchType: string,
    query: string,
    options: Record<string, any> = {}
  ): string {
    // Create a deterministic key from search parameters
    const optionsStr = JSON.stringify(options, Object.keys(options).sort());
    const key = `search:${searchType}:${query}:${optionsStr}`;
    
    // Hash long keys to prevent memory issues
    if (key.length > 200) {
      return `search:${searchType}:${this.simpleHash(key)}`;
    }
    
    return key;
  }

  /**
   * Evicts least recently used entries.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();

    logger.debug('LRU eviction', {
      evictedKey: lruKey.substring(0, 50),
      cacheSize: this.cache.size,
    });
  }

  /**
   * Updates access order for LRU tracking.
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Removes key from access order array.
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Simple hash function for long cache keys.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cleanup expired entries (can be called periodically).
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('Cache cleanup completed', { removedEntries: removedCount });
    }

    return removedCount;
  }
}

/**
 * Default cache instance for the API.
 */
export const defaultCacheService = new InMemoryCacheService({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});
