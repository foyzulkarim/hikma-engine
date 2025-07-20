/**
 * Error Monitoring Service
 * 
 * Provides error tracking, monitoring, and alerting capabilities for the API.
 */

import { Logger, getLogger } from '../../utils/logger';

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
  recentErrors: Array<{
    timestamp: Date;
    type: string;
    message: string;
    endpoint?: string;
    stack?: string;
  }>;
}

export class ErrorMonitoringService {
  private logger: Logger;
  private metrics: ErrorMetrics;
  private maxRecentErrors = 100;

  constructor() {
    this.logger = getLogger('ErrorMonitoringService');
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByEndpoint: {},
      recentErrors: []
    };
  }

  /**
   * Record an error occurrence
   */
  recordError(error: Error, endpoint?: string): void {
    this.metrics.totalErrors++;
    
    // Track by error type
    const errorType = error.constructor.name;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
    
    // Track by endpoint if provided
    if (endpoint) {
      this.metrics.errorsByEndpoint[endpoint] = (this.metrics.errorsByEndpoint[endpoint] || 0) + 1;
    }
    
    // Add to recent errors
    this.metrics.recentErrors.unshift({
      timestamp: new Date(),
      type: errorType,
      message: error.message,
      endpoint,
      stack: error.stack
    });
    
    // Keep only recent errors
    if (this.metrics.recentErrors.length > this.maxRecentErrors) {
      this.metrics.recentErrors = this.metrics.recentErrors.slice(0, this.maxRecentErrors);
    }
    
    this.logger.error('Error recorded', {
      type: errorType,
      message: error.message,
      endpoint,
      totalErrors: this.metrics.totalErrors
    });
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset error metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByEndpoint: {},
      recentErrors: []
    };
    this.logger.info('Error metrics reset');
  }

  /**
   * Check if error rate is above threshold
   */
  isErrorRateHigh(timeWindowMs: number = 60000, threshold: number = 10): boolean {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    const recentErrorCount = this.metrics.recentErrors.filter(
      error => error.timestamp > cutoffTime
    ).length;
    
    return recentErrorCount > threshold;
  }

  /**
   * Get error summary for health checks
   */
  getHealthSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    totalErrors: number;
    recentErrorRate: number;
  } {
    const recentErrors = this.metrics.recentErrors.filter(
      error => error.timestamp > new Date(Date.now() - 300000) // Last 5 minutes
    ).length;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (recentErrors > 20) {
      status = 'critical';
    } else if (recentErrors > 5) {
      status = 'warning';
    }
    
    return {
      status,
      totalErrors: this.metrics.totalErrors,
      recentErrorRate: recentErrors
    };
  }
}

// Singleton instance
let errorMonitoringService: ErrorMonitoringService | null = null;

export function getErrorMonitoringService(): ErrorMonitoringService {
  if (!errorMonitoringService) {
    errorMonitoringService = new ErrorMonitoringService();
  }
  return errorMonitoringService;
}
