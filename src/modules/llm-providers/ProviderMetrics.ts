/**
 * Provider Metrics Collection System
 * Tracks performance, success rates, and usage patterns for LLM providers
 */

import { getLogger } from '../../utils/logger';
import { LLMProviderErrorType } from './types';

/**
 * Metrics for a single provider request
 */
export interface ProviderRequestMetrics {
  requestId: string;
  provider: string;
  timestamp: Date;
  queryLength: number;
  resultCount: number;
  responseTime: number;
  success: boolean;
  errorType?: LLMProviderErrorType;
  errorMessage?: string;
  tokenUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  explanationLength?: number;
}

/**
 * Aggregated metrics for a provider
 */
export interface ProviderAggregatedMetrics {
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  errorBreakdown: Record<LLMProviderErrorType, number>;
  lastUpdated: Date;
  timeWindow: {
    start: Date;
    end: Date;
  };
}

/**
 * Provider performance comparison metrics
 */
export interface ProviderComparison {
  providers: string[];
  metrics: {
    successRate: Record<string, number>;
    averageResponseTime: Record<string, number>;
    totalRequests: Record<string, number>;
    costEfficiency?: Record<string, number>; // requests per token
  };
  generatedAt: Date;
}

/**
 * Metrics collection and aggregation system
 */
export class ProviderMetrics {
  private logger = getLogger('ProviderMetrics');
  private requestMetrics: ProviderRequestMetrics[] = [];
  private aggregatedMetrics = new Map<string, ProviderAggregatedMetrics>();
  private maxStoredRequests = 10000; // Limit memory usage
  private metricsRetentionHours = 24; // Keep metrics for 24 hours

  /**
   * Records metrics for a provider request
   */
  recordRequest(metrics: ProviderRequestMetrics): void {
    // Sanitize sensitive information before logging
    const sanitizedMetrics = this.sanitizeMetrics(metrics);
    
    // Store the request metrics
    this.requestMetrics.push(sanitizedMetrics);
    
    // Limit stored requests to prevent memory issues
    if (this.requestMetrics.length > this.maxStoredRequests) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxStoredRequests);
    }

    // Update aggregated metrics
    this.updateAggregatedMetrics(sanitizedMetrics);

    // Log the request with structured data
    this.logRequestMetrics(sanitizedMetrics);

    // Clean up old metrics
    this.cleanupOldMetrics();
  }

  /**
   * Sanitizes metrics to remove sensitive information
   */
  private sanitizeMetrics(metrics: ProviderRequestMetrics): ProviderRequestMetrics {
    return {
      ...metrics,
      // Ensure no sensitive data is included
      errorMessage: metrics.errorMessage ? this.sanitizeErrorMessage(metrics.errorMessage) : undefined
    };
  }

  /**
   * Sanitizes error messages to remove API keys and other sensitive data
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove API keys (various formats)
    let sanitized = message.replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***REDACTED***');
    sanitized = sanitized.replace(/org-[a-zA-Z0-9]{24}/g, 'org-***REDACTED***');
    
    // Remove bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***REDACTED***');
    
    // Remove authorization headers
    sanitized = sanitized.replace(/authorization:\s*[^\s,]+/gi, 'authorization: ***REDACTED***');
    
    // Remove any other potential tokens (generic pattern)
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, (match) => {
      // Only redact if it looks like a token (long alphanumeric string)
      if (match.length >= 32 && /^[a-zA-Z0-9._-]+$/.test(match)) {
        return '***REDACTED***';
      }
      return match;
    });

    return sanitized;
  }

  /**
   * Updates aggregated metrics for a provider
   */
  private updateAggregatedMetrics(metrics: ProviderRequestMetrics): void {
    const existing = this.aggregatedMetrics.get(metrics.provider);
    const now = new Date();

    if (!existing) {
      // Create new aggregated metrics
      const newMetrics: ProviderAggregatedMetrics = {
        provider: metrics.provider,
        totalRequests: 1,
        successfulRequests: metrics.success ? 1 : 0,
        failedRequests: metrics.success ? 0 : 1,
        successRate: metrics.success ? 100 : 0,
        averageResponseTime: metrics.responseTime,
        totalTokensUsed: metrics.tokenUsage?.total_tokens || 0,
        errorBreakdown: this.initializeErrorBreakdown(metrics.errorType),
        lastUpdated: now,
        timeWindow: {
          start: now,
          end: now
        }
      };
      this.aggregatedMetrics.set(metrics.provider, newMetrics);
    } else {
      // Update existing metrics
      existing.totalRequests += 1;
      if (metrics.success) {
        existing.successfulRequests += 1;
      } else {
        existing.failedRequests += 1;
        if (metrics.errorType) {
          existing.errorBreakdown[metrics.errorType] = (existing.errorBreakdown[metrics.errorType] || 0) + 1;
        }
      }
      
      existing.successRate = (existing.successfulRequests / existing.totalRequests) * 100;
      existing.averageResponseTime = (existing.averageResponseTime * (existing.totalRequests - 1) + metrics.responseTime) / existing.totalRequests;
      existing.totalTokensUsed += metrics.tokenUsage?.total_tokens || 0;
      existing.lastUpdated = now;
      existing.timeWindow.end = now;
    }
  }

  /**
   * Initializes error breakdown with the first error
   */
  private initializeErrorBreakdown(errorType?: LLMProviderErrorType): Record<LLMProviderErrorType, number> {
    const breakdown: Record<LLMProviderErrorType, number> = {
      [LLMProviderErrorType.CONFIGURATION_ERROR]: 0,
      [LLMProviderErrorType.NETWORK_ERROR]: 0,
      [LLMProviderErrorType.AUTHENTICATION_ERROR]: 0,
      [LLMProviderErrorType.RATE_LIMIT_ERROR]: 0,
      [LLMProviderErrorType.PROVIDER_UNAVAILABLE]: 0,
      [LLMProviderErrorType.RESPONSE_FORMAT_ERROR]: 0
    };

    if (errorType) {
      breakdown[errorType] = 1;
    }

    return breakdown;
  }

  /**
   * Logs request metrics with structured data
   */
  private logRequestMetrics(metrics: ProviderRequestMetrics): void {
    const logData = {
      requestId: metrics.requestId,
      provider: metrics.provider,
      queryLength: metrics.queryLength,
      resultCount: metrics.resultCount,
      responseTime: metrics.responseTime,
      success: metrics.success,
      model: metrics.model,
      explanationLength: metrics.explanationLength,
      tokenUsage: metrics.tokenUsage
    };

    if (metrics.success) {
      this.logger.info('Provider request completed successfully', logData);
    } else {
      this.logger.warn('Provider request failed', {
        ...logData,
        errorType: metrics.errorType,
        errorMessage: metrics.errorMessage
      });
    }

    // Log performance metrics separately for easier analysis
    this.logger.performance('provider_request', {
      provider: metrics.provider,
      responseTime: metrics.responseTime,
      success: metrics.success,
      tokenUsage: metrics.tokenUsage?.total_tokens || 0
    });
  }

  /**
   * Cleans up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - (this.metricsRetentionHours * 60 * 60 * 1000));
    
    // Remove old request metrics
    this.requestMetrics = this.requestMetrics.filter(metric => metric.timestamp > cutoffTime);

    // Reset aggregated metrics if they're too old
    for (const [provider, metrics] of this.aggregatedMetrics.entries()) {
      if (metrics.timeWindow.start < cutoffTime) {
        // Reset the metrics window
        metrics.timeWindow.start = cutoffTime;
        this.logger.debug(`Reset metrics window for provider ${provider}`);
      }
    }
  }

  /**
   * Gets aggregated metrics for a specific provider
   */
  getProviderMetrics(provider: string): ProviderAggregatedMetrics | null {
    return this.aggregatedMetrics.get(provider) || null;
  }

  /**
   * Gets aggregated metrics for all providers
   */
  getAllProviderMetrics(): Record<string, ProviderAggregatedMetrics> {
    const result: Record<string, ProviderAggregatedMetrics> = {};
    for (const [provider, metrics] of this.aggregatedMetrics.entries()) {
      result[provider] = { ...metrics }; // Return a copy
    }
    return result;
  }

  /**
   * Gets recent request metrics for analysis
   */
  getRecentRequests(provider?: string, limit: number = 100): ProviderRequestMetrics[] {
    let filtered = this.requestMetrics;
    
    if (provider) {
      filtered = filtered.filter(metric => metric.provider === provider);
    }

    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Generates a comparison report between providers
   */
  generateProviderComparison(): ProviderComparison {
    const providers = Array.from(this.aggregatedMetrics.keys());
    const comparison: ProviderComparison = {
      providers,
      metrics: {
        successRate: {},
        averageResponseTime: {},
        totalRequests: {},
        costEfficiency: {}
      },
      generatedAt: new Date()
    };

    for (const provider of providers) {
      const metrics = this.aggregatedMetrics.get(provider)!;
      comparison.metrics.successRate[provider] = metrics.successRate;
      comparison.metrics.averageResponseTime[provider] = metrics.averageResponseTime;
      comparison.metrics.totalRequests[provider] = metrics.totalRequests;
      
      // Calculate cost efficiency (requests per token)
      if (metrics.totalTokensUsed > 0) {
        comparison.metrics.costEfficiency![provider] = metrics.totalRequests / metrics.totalTokensUsed;
      }
    }

    return comparison;
  }

  /**
   * Logs a comprehensive metrics summary
   */
  logMetricsSummary(): void {
    const summary = this.generateProviderComparison();
    
    this.logger.info('Provider metrics summary', {
      totalProviders: summary.providers.length,
      providers: summary.providers,
      successRates: summary.metrics.successRate,
      averageResponseTimes: summary.metrics.averageResponseTime,
      totalRequests: summary.metrics.totalRequests,
      costEfficiency: summary.metrics.costEfficiency
    });

    // Log detailed breakdown for each provider
    for (const provider of summary.providers) {
      const metrics = this.aggregatedMetrics.get(provider)!;
      this.logger.info(`Detailed metrics for provider: ${provider}`, {
        provider,
        totalRequests: metrics.totalRequests,
        successRate: `${metrics.successRate.toFixed(2)}%`,
        averageResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
        totalTokensUsed: metrics.totalTokensUsed,
        errorBreakdown: metrics.errorBreakdown,
        timeWindow: {
          start: metrics.timeWindow.start.toISOString(),
          end: metrics.timeWindow.end.toISOString(),
          duration: `${Math.round((metrics.timeWindow.end.getTime() - metrics.timeWindow.start.getTime()) / 1000 / 60)}min`
        }
      });
    }
  }

  /**
   * Gets failure patterns for analysis
   */
  getFailurePatterns(provider?: string): Record<LLMProviderErrorType, number> {
    const patterns: Record<LLMProviderErrorType, number> = {
      [LLMProviderErrorType.CONFIGURATION_ERROR]: 0,
      [LLMProviderErrorType.NETWORK_ERROR]: 0,
      [LLMProviderErrorType.AUTHENTICATION_ERROR]: 0,
      [LLMProviderErrorType.RATE_LIMIT_ERROR]: 0,
      [LLMProviderErrorType.PROVIDER_UNAVAILABLE]: 0,
      [LLMProviderErrorType.RESPONSE_FORMAT_ERROR]: 0
    };

    const metricsToAnalyze = provider 
      ? [this.aggregatedMetrics.get(provider)].filter((m): m is ProviderAggregatedMetrics => m !== undefined)
      : Array.from(this.aggregatedMetrics.values());

    for (const metrics of metricsToAnalyze) {
      for (const [errorType, count] of Object.entries(metrics.errorBreakdown)) {
        patterns[errorType as LLMProviderErrorType] += count;
      }
    }

    return patterns;
  }

  /**
   * Resets all metrics (useful for testing)
   */
  reset(): void {
    this.requestMetrics = [];
    this.aggregatedMetrics.clear();
    this.logger.debug('Provider metrics reset');
  }
}

// Global metrics instance
let globalMetrics: ProviderMetrics | null = null;

/**
 * Gets the global metrics instance
 */
export function getProviderMetrics(): ProviderMetrics {
  if (!globalMetrics) {
    globalMetrics = new ProviderMetrics();
  }
  return globalMetrics;
}

/**
 * Initializes provider metrics with custom configuration
 */
export function initializeProviderMetrics(config?: {
  maxStoredRequests?: number;
  metricsRetentionHours?: number;
}): ProviderMetrics {
  globalMetrics = new ProviderMetrics();
  
  if (config?.maxStoredRequests) {
    (globalMetrics as any).maxStoredRequests = config.maxStoredRequests;
  }
  
  if (config?.metricsRetentionHours) {
    (globalMetrics as any).metricsRetentionHours = config.metricsRetentionHours;
  }
  
  return globalMetrics;
}
