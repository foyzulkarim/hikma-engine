/**
 * @file Performance Monitor - Tracks performance metrics during tests
 */

import fs from 'fs/promises';
import path from 'path';

export interface PerformanceMetrics {
  testName: string;
  duration: number;
  memoryUsage: MemoryMetrics;
  cpuUsage: number;
  databaseOperations: DatabaseMetrics;
  customMetrics: Record<string, number>;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface DatabaseMetrics {
  queries: number;
  inserts: number;
  updates: number;
  deletes: number;
  totalTime: number;
}

export interface PerformanceThreshold {
  maxDuration: number;
  maxMemoryUsage: number;
  maxCpuUsage: number;
}

export class PerformanceMonitor {
  private startTime: number = 0;
  private startMemory: MemoryMetrics | null = null;
  private startCpuUsage: NodeJS.CpuUsage | null = null;
  private databaseMetrics: DatabaseMetrics = {
    queries: 0,
    inserts: 0,
    updates: 0,
    deletes: 0,
    totalTime: 0,
  };
  private customMetrics: Record<string, number> = {};
  private isMonitoring: boolean = false;
  private reportPath: string;

  constructor() {
    this.reportPath = path.join(__dirname, '../temp/performance-reports');
  }

  async warmUp(): Promise<void> {
    // Warm up the system by performing some operations
    const warmupOperations = [
      () => JSON.stringify({ test: 'warmup' }),
      () => JSON.parse('{"test": "warmup"}'),
      () => Buffer.alloc(1024),
      () => new Date().toISOString(),
    ];

    for (let i = 0; i < 100; i++) {
      for (const operation of warmupOperations) {
        operation();
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Wait a bit for the system to stabilize
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      throw new Error('Performance monitoring is already active');
    }

    this.isMonitoring = true;
    this.startTime = performance.now();
    this.startMemory = this.getMemoryUsage();
    this.startCpuUsage = process.cpuUsage();
    this.databaseMetrics = {
      queries: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
      totalTime: 0,
    };
    this.customMetrics = {};
  }

  stopMonitoring(): PerformanceMetrics {
    if (!this.isMonitoring) {
      throw new Error('Performance monitoring is not active');
    }

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const endCpuUsage = process.cpuUsage(this.startCpuUsage!);

    const duration = endTime - this.startTime;
    const cpuUsage = (endCpuUsage.user + endCpuUsage.system) / 1000; // Convert to milliseconds

    this.isMonitoring = false;

    return {
      testName: this.getCurrentTestName(),
      duration,
      memoryUsage: endMemory,
      cpuUsage,
      databaseOperations: { ...this.databaseMetrics },
      customMetrics: { ...this.customMetrics },
    };
  }

  recordDatabaseOperation(type: 'query' | 'insert' | 'update' | 'delete', duration: number): void {
    if (!this.isMonitoring) return;

    this.databaseMetrics[type === 'query' ? 'queries' : `${type}s` as keyof DatabaseMetrics]++;
    this.databaseMetrics.totalTime += duration;
  }

  recordCustomMetric(name: string, value: number): void {
    if (!this.isMonitoring) return;
    this.customMetrics[name] = value;
  }

  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      this.recordCustomMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordCustomMetric(`${name}_error`, duration);
      throw error;
    }
  }

  measureSync<T>(name: string, operation: () => T): T {
    const startTime = performance.now();
    try {
      const result = operation();
      const duration = performance.now() - startTime;
      this.recordCustomMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordCustomMetric(`${name}_error`, duration);
      throw error;
    }
  }

  private getMemoryUsage(): MemoryMetrics {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers,
    };
  }

  private getCurrentTestName(): string {
    // Try to extract test name from Jest context
    const testName = expect.getState()?.currentTestName;
    if (testName) {
      return testName;
    }

    // Fallback to extracting from stack trace
    const stack = new Error().stack;
    if (stack) {
      const testMatch = stack.match(/at.*\.(test|spec)\.ts:\d+:\d+/);
      if (testMatch) {
        return testMatch[0];
      }
    }

    return 'unknown-test';
  }

  async generateReport(): Promise<void> {
    // This would be called at the end of performance test suite
    // to generate a comprehensive performance report
    
    await fs.mkdir(this.reportPath, { recursive: true });
    
    const reportFile = path.join(this.reportPath, `performance-report-${Date.now()}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      // Additional system information would be added here
    };

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  }

  static validatePerformance(metrics: PerformanceMetrics, thresholds: PerformanceThreshold): void {
    const failures: string[] = [];

    if (metrics.duration > thresholds.maxDuration) {
      failures.push(`Duration ${metrics.duration}ms exceeds threshold ${thresholds.maxDuration}ms`);
    }

    if (metrics.memoryUsage.heapUsed > thresholds.maxMemoryUsage) {
      failures.push(`Memory usage ${metrics.memoryUsage.heapUsed} exceeds threshold ${thresholds.maxMemoryUsage}`);
    }

    if (metrics.cpuUsage > thresholds.maxCpuUsage) {
      failures.push(`CPU usage ${metrics.cpuUsage}ms exceeds threshold ${thresholds.maxCpuUsage}ms`);
    }

    if (failures.length > 0) {
      throw new Error(`Performance thresholds exceeded:\n${failures.join('\n')}`);
    }
  }

  static formatMetrics(metrics: PerformanceMetrics): string {
    return `
Performance Metrics for ${metrics.testName}:
  Duration: ${metrics.duration.toFixed(2)}ms
  Memory Usage:
    Heap Used: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
    Heap Total: ${(metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
    RSS: ${(metrics.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB
  CPU Usage: ${metrics.cpuUsage.toFixed(2)}ms
  Database Operations:
    Queries: ${metrics.databaseOperations.queries}
    Inserts: ${metrics.databaseOperations.inserts}
    Updates: ${metrics.databaseOperations.updates}
    Deletes: ${metrics.databaseOperations.deletes}
    Total DB Time: ${metrics.databaseOperations.totalTime.toFixed(2)}ms
  Custom Metrics:
${Object.entries(metrics.customMetrics)
  .map(([key, value]) => `    ${key}: ${value.toFixed(2)}ms`)
  .join('\n')}
    `.trim();
  }
}
