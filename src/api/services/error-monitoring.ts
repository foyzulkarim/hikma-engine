/**
 * @file Error monitoring and alerting service for comprehensive error tracking.
 *       Provides error aggregation, alerting, and monitoring capabilities.
 */

import { getLogger } from '../../utils/logger';
import { BaseAPIError } from '../errors/api-errors';

const logger = getLogger('ErrorMonitoring');

/**
 * Error statistics interface.
 */
interface ErrorStats {
  count: number;
  lastOccurrence: Date;
  firstOccurrence: Date;
  errorCode: string;
  statusCode: number;
  samples: Array<{
    timestamp: Date;
    message: string;
    requestId?: string;
    context?: Record<string, any>;
  }>;
}

/**
 * Alert configuration interface.
 */
interface AlertConfig {
  errorCode?: string;
  statusCode?: number;
  threshold: number;
  timeWindow: number; // milliseconds
  enabled: boolean;
  lastAlerted?: Date;
  cooldownPeriod: number; // milliseconds
}

/**
 * Performance metrics interface.
 */
interface PerformanceMetrics {
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    endpoint: string;
    requestId?: string;
  }>;
  averageResponseTime: number;
  requestCount: number;
  errorRate: number;
}

/**
 * Error monitoring and alerting service.
 */
export class ErrorMonitoringService {
  private errorStats = new Map<string, ErrorStats>();
  private alertConfigs: AlertConfig[] = [];
  private performanceMetrics: PerformanceMetrics = {
    slowQueries: [],
    averageResponseTime: 0,
    requestCount: 0,
    errorRate: 0,
  };

  private readonly maxSamples = 10;
  private readonly maxSlowQueries = 50;

  constructor() {
    this.setupDefaultAlerts();
    this.startPeriodicCleanup();
  }

  /**
   * Records an error occurrence for monitoring.
   */
  recordError(error: BaseAPIError): void {
    const key = `${error.errorCode}:${error.statusCode}`;
    const now = new Date();

    let stats = this.errorStats.get(key);
    if (!stats) {
      stats = {
        count: 0,
        lastOccurrence: now,
        firstOccurrence: now,
        errorCode: error.errorCode,
        statusCode: error.statusCode,
        samples: [],
      };
      this.errorStats.set(key, stats);
    }

    // Update statistics
    stats.count++;
    stats.lastOccurrence = now;

    // Add sample (keep only recent samples)
    stats.samples.push({
      timestamp: now,
      message: error.message,
      requestId: error.requestId,
      context: error.context,
    });

    if (stats.samples.length > this.maxSamples) {
      stats.samples.shift();
    }

    // Check for alerts
    this.checkAlerts(stats);

    logger.debug('Error recorded', {
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      count: stats.count,
      requestId: error.requestId,
    });
  }

  /**
   * Records performance metrics for slow queries.
   */
  recordSlowQuery(
    query: string,
    duration: number,
    endpoint: string,
    requestId?: string
  ): void {
    this.performanceMetrics.slowQueries.push({
      query: query.substring(0, 100), // Truncate long queries
      duration,
      timestamp: new Date(),
      endpoint,
      requestId,
    });

    // Keep only recent slow queries
    if (this.performanceMetrics.slowQueries.length > this.maxSlowQueries) {
      this.performanceMetrics.slowQueries.shift();
    }

    logger.warn('Slow query detected', {
      query: query.substring(0, 100),
      duration: `${duration}ms`,
      endpoint,
      requestId,
    });
  }

  /**
   * Updates performance metrics.
   */
  updatePerformanceMetrics(responseTime: number, isError: boolean): void {
    this.performanceMetrics.requestCount++;
    
    // Update average response time (simple moving average)
    const alpha = 0.1; // Smoothing factor
    this.performanceMetrics.averageResponseTime = 
      (1 - alpha) * this.performanceMetrics.averageResponseTime + alpha * responseTime;

    // Update error rate
    if (isError) {
      const errorCount = Array.from(this.errorStats.values())
        .reduce((sum, stats) => sum + stats.count, 0);
      this.performanceMetrics.errorRate = errorCount / this.performanceMetrics.requestCount;
    }
  }

  /**
   * Gets current error statistics.
   */
  getErrorStats(): Array<ErrorStats & { key: string }> {
    return Array.from(this.errorStats.entries()).map(([key, stats]) => ({
      key,
      ...stats,
    }));
  }

  /**
   * Gets performance metrics.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Gets error summary for monitoring dashboard.
   */
  getErrorSummary(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    errorsByStatus: Record<number, number>;
    recentErrors: Array<{
      errorCode: string;
      count: number;
      lastOccurrence: Date;
    }>;
    criticalErrors: Array<{
      errorCode: string;
      count: number;
      statusCode: number;
    }>;
  } {
    const totalErrors = Array.from(this.errorStats.values())
      .reduce((sum, stats) => sum + stats.count, 0);

    const errorsByCode: Record<string, number> = {};
    const errorsByStatus: Record<number, number> = {};
    const recentErrors: Array<{
      errorCode: string;
      count: number;
      lastOccurrence: Date;
    }> = [];
    const criticalErrors: Array<{
      errorCode: string;
      count: number;
      statusCode: number;
    }> = [];

    for (const stats of this.errorStats.values()) {
      errorsByCode[stats.errorCode] = (errorsByCode[stats.errorCode] || 0) + stats.count;
      errorsByStatus[stats.statusCode] = (errorsByStatus[stats.statusCode] || 0) + stats.count;

      // Recent errors (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (stats.lastOccurrence > fiveMinutesAgo) {
        recentErrors.push({
          errorCode: stats.errorCode,
          count: stats.count,
          lastOccurrence: stats.lastOccurrence,
        });
      }

      // Critical errors (5xx status codes with high frequency)
      if (stats.statusCode >= 500 && stats.count > 5) {
        criticalErrors.push({
          errorCode: stats.errorCode,
          count: stats.count,
          statusCode: stats.statusCode,
        });
      }
    }

    // Sort by count (descending)
    recentErrors.sort((a, b) => b.count - a.count);
    criticalErrors.sort((a, b) => b.count - a.count);

    return {
      totalErrors,
      errorsByCode,
      errorsByStatus,
      recentErrors: recentErrors.slice(0, 10),
      criticalErrors: criticalErrors.slice(0, 5),
    };
  }

  /**
   * Adds or updates alert configuration.
   */
  addAlert(config: Omit<AlertConfig, 'lastAlerted'>): void {
    const existingIndex = this.alertConfigs.findIndex(
      alert => alert.errorCode === config.errorCode && alert.statusCode === config.statusCode
    );

    if (existingIndex >= 0) {
      this.alertConfigs[existingIndex] = { ...config, lastAlerted: this.alertConfigs[existingIndex].lastAlerted };
    } else {
      this.alertConfigs.push(config);
    }

    logger.info('Alert configuration added/updated', config);
  }

  /**
   * Removes alert configuration.
   */
  removeAlert(errorCode?: string, statusCode?: number): void {
    const initialLength = this.alertConfigs.length;
    this.alertConfigs = this.alertConfigs.filter(
      alert => !(alert.errorCode === errorCode && alert.statusCode === statusCode)
    );

    if (this.alertConfigs.length < initialLength) {
      logger.info('Alert configuration removed', { errorCode, statusCode });
    }
  }

  /**
   * Gets health status based on error rates and performance.
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number; // 0-100
    issues: string[];
    metrics: {
      errorRate: number;
      averageResponseTime: number;
      criticalErrorCount: number;
      slowQueryCount: number;
    };
  } {
    const issues: string[] = [];
    let score = 100;

    // Check error rate
    if (this.performanceMetrics.errorRate > 0.1) { // 10% error rate
      issues.push(`High error rate: ${(this.performanceMetrics.errorRate * 100).toFixed(1)}%`);
      score -= 30;
    } else if (this.performanceMetrics.errorRate > 0.05) { // 5% error rate
      issues.push(`Elevated error rate: ${(this.performanceMetrics.errorRate * 100).toFixed(1)}%`);
      score -= 15;
    }

    // Check response time
    if (this.performanceMetrics.averageResponseTime > 5000) { // 5 seconds
      issues.push(`Slow response time: ${this.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
      score -= 25;
    } else if (this.performanceMetrics.averageResponseTime > 2000) { // 2 seconds
      issues.push(`Elevated response time: ${this.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
      score -= 10;
    }

    // Check critical errors
    const criticalErrorCount = Array.from(this.errorStats.values())
      .filter(stats => stats.statusCode >= 500)
      .reduce((sum, stats) => sum + stats.count, 0);

    if (criticalErrorCount > 10) {
      issues.push(`High critical error count: ${criticalErrorCount}`);
      score -= 20;
    } else if (criticalErrorCount > 5) {
      issues.push(`Elevated critical error count: ${criticalErrorCount}`);
      score -= 10;
    }

    // Check slow queries
    const recentSlowQueries = this.performanceMetrics.slowQueries.filter(
      query => Date.now() - query.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );

    if (recentSlowQueries.length > 10) {
      issues.push(`Many slow queries: ${recentSlowQueries.length} in last 5 minutes`);
      score -= 15;
    } else if (recentSlowQueries.length > 5) {
      issues.push(`Some slow queries: ${recentSlowQueries.length} in last 5 minutes`);
      score -= 5;
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      metrics: {
        errorRate: this.performanceMetrics.errorRate,
        averageResponseTime: this.performanceMetrics.averageResponseTime,
        criticalErrorCount,
        slowQueryCount: recentSlowQueries.length,
      },
    };
  }

  /**
   * Clears old statistics and metrics.
   */
  cleanup(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Clean up old error samples
    for (const stats of this.errorStats.values()) {
      stats.samples = stats.samples.filter(sample => sample.timestamp > oneDayAgo);
    }

    // Clean up old slow queries
    this.performanceMetrics.slowQueries = this.performanceMetrics.slowQueries.filter(
      query => query.timestamp > oneDayAgo
    );

    logger.debug('Error monitoring cleanup completed');
  }

  /**
   * Sets up default alert configurations.
   */
  private setupDefaultAlerts(): void {
    // High error rate alert
    this.addAlert({
      statusCode: 500,
      threshold: 10,
      timeWindow: 5 * 60 * 1000, // 5 minutes
      enabled: true,
      cooldownPeriod: 15 * 60 * 1000, // 15 minutes
    });

    // Search service errors
    this.addAlert({
      errorCode: 'SEARCH_SERVICE_ERROR',
      threshold: 5,
      timeWindow: 5 * 60 * 1000,
      enabled: true,
      cooldownPeriod: 10 * 60 * 1000,
    });

    // Database errors
    this.addAlert({
      errorCode: 'DATABASE_ERROR',
      threshold: 3,
      timeWindow: 5 * 60 * 1000,
      enabled: true,
      cooldownPeriod: 10 * 60 * 1000,
    });

    // Rate limiting alerts
    this.addAlert({
      errorCode: 'RATE_LIMIT_EXCEEDED',
      threshold: 50,
      timeWindow: 5 * 60 * 1000,
      enabled: true,
      cooldownPeriod: 30 * 60 * 1000,
    });
  }

  /**
   * Checks if any alerts should be triggered.
   */
  private checkAlerts(stats: ErrorStats): void {
    const now = new Date();

    for (const alertConfig of this.alertConfigs) {
      if (!alertConfig.enabled) continue;

      // Check if alert matches this error
      const matches = 
        (!alertConfig.errorCode || alertConfig.errorCode === stats.errorCode) &&
        (!alertConfig.statusCode || alertConfig.statusCode === stats.statusCode);

      if (!matches) continue;

      // Check cooldown period
      if (alertConfig.lastAlerted) {
        const timeSinceLastAlert = now.getTime() - alertConfig.lastAlerted.getTime();
        if (timeSinceLastAlert < alertConfig.cooldownPeriod) {
          continue;
        }
      }

      // Check if threshold is exceeded within time window
      const windowStart = new Date(now.getTime() - alertConfig.timeWindow);
      const recentSamples = stats.samples.filter(sample => sample.timestamp > windowStart);

      if (recentSamples.length >= alertConfig.threshold) {
        this.triggerAlert(alertConfig, stats, recentSamples.length);
        alertConfig.lastAlerted = now;
      }
    }
  }

  /**
   * Triggers an alert (logs for now, could integrate with external services).
   */
  private triggerAlert(
    config: AlertConfig,
    stats: ErrorStats,
    occurrenceCount: number
  ): void {
    const alertData = {
      alertType: 'ERROR_THRESHOLD_EXCEEDED',
      errorCode: stats.errorCode,
      statusCode: stats.statusCode,
      threshold: config.threshold,
      actualCount: occurrenceCount,
      timeWindow: `${config.timeWindow / 1000}s`,
      totalOccurrences: stats.count,
      firstOccurrence: stats.firstOccurrence,
      lastOccurrence: stats.lastOccurrence,
    };

    logger.error('ALERT: Error threshold exceeded', alertData);

    // Here you could integrate with external alerting services:
    // - Send email notifications
    // - Post to Slack/Discord
    // - Create PagerDuty incidents
    // - Send to monitoring services (DataDog, New Relic, etc.)
  }

  /**
   * Starts periodic cleanup of old data.
   */
  private startPeriodicCleanup(): void {
    // Clean up every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Get error statistics (alias for getErrorSummary for compatibility)
   */
  public getErrorStatistics(): ErrorSummary {
    return this.getErrorSummary();
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    const now = new Date();
    return this.alerts.filter(alert => {
      const alertAge = now.getTime() - alert.timestamp.getTime();
      return alertAge < this.alertConfig.cooldownPeriod * 1000;
    });
  }

  /**
   * Cleanup old data with configurable time period
   */
  public cleanup(olderThanHours: number = 24): { 
    before: { errorSamples: number; slowQueries: number };
    after: { errorSamples: number; slowQueries: number };
  } {
    const beforeErrorSamples = this.errorStats.reduce((sum, stat) => sum + stat.samples.length, 0);
    const beforeSlowQueries = this.performanceMetrics.slowQueries.length;

    // Call the existing cleanup method
    this.cleanup();

    const afterErrorSamples = this.errorStats.reduce((sum, stat) => sum + stat.samples.length, 0);
    const afterSlowQueries = this.performanceMetrics.slowQueries.length;

    return {
      before: { errorSamples: beforeErrorSamples, slowQueries: beforeSlowQueries },
      after: { errorSamples: afterErrorSamples, slowQueries: afterSlowQueries }
    };
  }
}

/**
 * Default error monitoring service instance.
 */
export const errorMonitoringService = new ErrorMonitoringService();
