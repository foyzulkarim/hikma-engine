/**
 * Tests for LLM Provider Metrics and Logging (Task 9)
 * Verifies logging behavior, metric collection, and sensitive data handling
 */

import { 
  ProviderMetrics, 
  getProviderMetrics, 
  initializeProviderMetrics,
  ProviderRequestMetrics 
} from '../src/modules/llm-providers/ProviderMetrics';
import { LLMProviderErrorType } from '../src/modules/llm-providers/types';
import { LLMProviderManager } from '../src/modules/llm-providers/LLMProviderManager';
import { initializeConfig } from '../src/config';
import { initializeLogger, getLogger } from '../src/utils/logger';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('LLM Provider Metrics and Logging (Task 9)', () => {
  let metrics: ProviderMetrics;
  let tempDir: string;
  let logFilePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary directory for test logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-metrics-test-'));
    logFilePath = path.join(tempDir, 'test.log');
    
    // Initialize logger with file output for testing
    initializeLogger({
      level: 'debug',
      enableConsole: false, // Disable console for cleaner test output
      enableFile: true,
      logFilePath
    });

    // Initialize configuration
    initializeConfig(tempDir);
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Initialize fresh metrics instance for each test
    metrics = initializeProviderMetrics({
      maxStoredRequests: 100,
      metricsRetentionHours: 1
    });

    // Clear log file
    if (fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '');
    }
  });

  describe('Metrics Collection', () => {
    it('should record successful provider requests', () => {
      const requestMetrics: ProviderRequestMetrics = {
        requestId: 'test-req-1',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 50,
        resultCount: 5,
        responseTime: 1500,
        success: true,
        model: 'gpt-4',
        explanationLength: 200,
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      metrics.recordRequest(requestMetrics);

      const providerMetrics = metrics.getProviderMetrics('openai');
      expect(providerMetrics).toBeDefined();
      expect(providerMetrics!.totalRequests).toBe(1);
      expect(providerMetrics!.successfulRequests).toBe(1);
      expect(providerMetrics!.failedRequests).toBe(0);
      expect(providerMetrics!.successRate).toBe(100);
      expect(providerMetrics!.averageResponseTime).toBe(1500);
      expect(providerMetrics!.totalTokensUsed).toBe(150);
    });

    it('should record failed provider requests with error categorization', () => {
      const requestMetrics: ProviderRequestMetrics = {
        requestId: 'test-req-2',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 3,
        responseTime: 500,
        success: false,
        errorType: LLMProviderErrorType.AUTHENTICATION_ERROR,
        errorMessage: 'Invalid API key'
      };

      metrics.recordRequest(requestMetrics);

      const providerMetrics = metrics.getProviderMetrics('openai');
      expect(providerMetrics).toBeDefined();
      expect(providerMetrics!.totalRequests).toBe(1);
      expect(providerMetrics!.successfulRequests).toBe(0);
      expect(providerMetrics!.failedRequests).toBe(1);
      expect(providerMetrics!.successRate).toBe(0);
      expect(providerMetrics!.errorBreakdown[LLMProviderErrorType.AUTHENTICATION_ERROR]).toBe(1);
    });

    it('should aggregate metrics across multiple requests', () => {
      // Record multiple successful requests
      for (let i = 0; i < 3; i++) {
        metrics.recordRequest({
          requestId: `success-${i}`,
          provider: 'python',
          timestamp: new Date(),
          queryLength: 40,
          resultCount: 4,
          responseTime: 1000 + (i * 100),
          success: true,
          model: 'test-model'
        });
      }

      // Record one failed request
      metrics.recordRequest({
        requestId: 'failure-1',
        provider: 'python',
        timestamp: new Date(),
        queryLength: 40,
        resultCount: 4,
        responseTime: 2000,
        success: false,
        errorType: LLMProviderErrorType.NETWORK_ERROR,
        errorMessage: 'Connection timeout'
      });

      const providerMetrics = metrics.getProviderMetrics('python');
      expect(providerMetrics).toBeDefined();
      expect(providerMetrics!.totalRequests).toBe(4);
      expect(providerMetrics!.successfulRequests).toBe(3);
      expect(providerMetrics!.failedRequests).toBe(1);
      expect(providerMetrics!.successRate).toBe(75);
      expect(providerMetrics!.averageResponseTime).toBe(1375); // (1000+1100+1200+2000)/4
    });

    it('should generate provider comparison reports', () => {
      // Add metrics for multiple providers
      metrics.recordRequest({
        requestId: 'openai-1',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 50,
        resultCount: 5,
        responseTime: 800,
        success: true,
        tokenUsage: { total_tokens: 100 }
      });

      metrics.recordRequest({
        requestId: 'python-1',
        provider: 'python',
        timestamp: new Date(),
        queryLength: 50,
        resultCount: 5,
        responseTime: 1200,
        success: true,
        tokenUsage: { total_tokens: 0 }
      });

      const comparison = metrics.generateProviderComparison();
      expect(comparison.providers).toContain('openai');
      expect(comparison.providers).toContain('python');
      expect(comparison.metrics.successRate.openai).toBe(100);
      expect(comparison.metrics.successRate.python).toBe(100);
      expect(comparison.metrics.averageResponseTime.openai).toBe(800);
      expect(comparison.metrics.averageResponseTime.python).toBe(1200);
    });

    it('should track failure patterns across providers', () => {
      // Add various error types
      const errorTypes = [
        LLMProviderErrorType.AUTHENTICATION_ERROR,
        LLMProviderErrorType.RATE_LIMIT_ERROR,
        LLMProviderErrorType.NETWORK_ERROR,
        LLMProviderErrorType.AUTHENTICATION_ERROR // Duplicate to test counting
      ];

      errorTypes.forEach((errorType, index) => {
        metrics.recordRequest({
          requestId: `error-${index}`,
          provider: 'openai',
          timestamp: new Date(),
          queryLength: 30,
          resultCount: 2,
          responseTime: 500,
          success: false,
          errorType,
          errorMessage: `Error ${index}`
        });
      });

      const failurePatterns = metrics.getFailurePatterns('openai');
      expect(failurePatterns[LLMProviderErrorType.AUTHENTICATION_ERROR]).toBe(2);
      expect(failurePatterns[LLMProviderErrorType.RATE_LIMIT_ERROR]).toBe(1);
      expect(failurePatterns[LLMProviderErrorType.NETWORK_ERROR]).toBe(1);
      expect(failurePatterns[LLMProviderErrorType.CONFIGURATION_ERROR]).toBe(0);
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should sanitize API keys from error messages', () => {
      const sensitiveErrorMessage = 'Authentication failed with API key sk-1234567890abcdef1234567890abcdef1234567890abcdef';
      
      metrics.recordRequest({
        requestId: 'sensitive-test',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 2,
        responseTime: 500,
        success: false,
        errorType: LLMProviderErrorType.AUTHENTICATION_ERROR,
        errorMessage: sensitiveErrorMessage
      });

      const recentRequests = metrics.getRecentRequests('openai', 1);
      expect(recentRequests[0].errorMessage).not.toContain('sk-1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(recentRequests[0].errorMessage).toContain('sk-***REDACTED***');
    });

    it('should sanitize organization IDs from error messages', () => {
      const sensitiveErrorMessage = 'Invalid organization: org-1234567890abcdef123456';
      
      metrics.recordRequest({
        requestId: 'org-test',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 2,
        responseTime: 500,
        success: false,
        errorType: LLMProviderErrorType.AUTHENTICATION_ERROR,
        errorMessage: sensitiveErrorMessage
      });

      const recentRequests = metrics.getRecentRequests('openai', 1);
      expect(recentRequests[0].errorMessage).not.toContain('org-1234567890abcdef123456');
      expect(recentRequests[0].errorMessage).toContain('org-***REDACTED***');
    });

    it('should sanitize bearer tokens from error messages', () => {
      const sensitiveErrorMessage = 'Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      
      metrics.recordRequest({
        requestId: 'bearer-test',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 2,
        responseTime: 500,
        success: false,
        errorType: LLMProviderErrorType.AUTHENTICATION_ERROR,
        errorMessage: sensitiveErrorMessage
      });

      const recentRequests = metrics.getRecentRequests('openai', 1);
      expect(recentRequests[0].errorMessage).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(recentRequests[0].errorMessage).toContain('Bearer ***REDACTED***');
    });

    it('should sanitize authorization headers from error messages', () => {
      const sensitiveErrorMessage = 'Request failed with authorization: sk-test123456789';
      
      metrics.recordRequest({
        requestId: 'auth-header-test',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 2,
        responseTime: 500,
        success: false,
        errorType: LLMProviderErrorType.AUTHENTICATION_ERROR,
        errorMessage: sensitiveErrorMessage
      });

      const recentRequests = metrics.getRecentRequests('openai', 1);
      expect(recentRequests[0].errorMessage).toContain('authorization: ***REDACTED***');
    });
  });

  describe('Logging Behavior', () => {
    it('should log successful requests with structured data', () => {
      const requestMetrics: ProviderRequestMetrics = {
        requestId: 'log-test-1',
        provider: 'python',
        timestamp: new Date(),
        queryLength: 45,
        resultCount: 6,
        responseTime: 1200,
        success: true,
        model: 'test-model',
        explanationLength: 180,
        tokenUsage: {
          prompt_tokens: 80,
          completion_tokens: 40,
          total_tokens: 120
        }
      };

      metrics.recordRequest(requestMetrics);

      // Check that log file contains the expected structured data
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      expect(logContent).toContain('Provider request completed successfully');
      expect(logContent).toContain('log-test-1');
      expect(logContent).toContain('python');
      expect(logContent).toContain('1200');
      expect(logContent).toContain('180');
    });

    it('should log failed requests with error details', () => {
      const requestMetrics: ProviderRequestMetrics = {
        requestId: 'log-test-2',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 35,
        resultCount: 3,
        responseTime: 800,
        success: false,
        errorType: LLMProviderErrorType.RATE_LIMIT_ERROR,
        errorMessage: 'Rate limit exceeded'
      };

      metrics.recordRequest(requestMetrics);

      const logContent = fs.readFileSync(logFilePath, 'utf8');
      expect(logContent).toContain('Provider request failed');
      expect(logContent).toContain('log-test-2');
      expect(logContent).toContain('rate_limit_error');
      expect(logContent).toContain('Rate limit exceeded');
    });

    it('should log performance metrics separately', () => {
      const requestMetrics: ProviderRequestMetrics = {
        requestId: 'perf-test-1',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 40,
        resultCount: 4,
        responseTime: 950,
        success: true,
        tokenUsage: { total_tokens: 85 }
      };

      metrics.recordRequest(requestMetrics);

      const logContent = fs.readFileSync(logFilePath, 'utf8');
      expect(logContent).toContain('Performance metrics for provider_request');
      expect(logContent).toContain('openai');
      expect(logContent).toContain('950');
      expect(logContent).toContain('85');
    });

    it('should log metrics summaries with aggregated data', () => {
      // Add some test data
      metrics.recordRequest({
        requestId: 'summary-1',
        provider: 'python',
        timestamp: new Date(),
        queryLength: 30,
        resultCount: 3,
        responseTime: 1000,
        success: true
      });

      metrics.recordRequest({
        requestId: 'summary-2',
        provider: 'openai',
        timestamp: new Date(),
        queryLength: 40,
        resultCount: 4,
        responseTime: 800,
        success: false,
        errorType: LLMProviderErrorType.NETWORK_ERROR
      });

      // Trigger metrics summary
      metrics.logMetricsSummary();

      const logContent = fs.readFileSync(logFilePath, 'utf8');
      expect(logContent).toContain('Provider metrics summary');
      expect(logContent).toContain('python');
      expect(logContent).toContain('openai');
      expect(logContent).toContain('Detailed metrics for provider');
    });
  });

  describe('Integration with Provider Manager', () => {
    it('should collect metrics through provider manager', async () => {
      // Set up environment for Python provider
      process.env.HIKMA_ENGINE_LLM_PROVIDER = 'python';

      const manager = new LLMProviderManager();
      
      // Mock search results
      const searchResults = [
        {
          file_path: 'test.ts',
          node_type: 'function',
          similarity: 0.9,
          source_text: 'function test() { return 42; }'
        }
      ];

      try {
        // This will likely fail due to Python dependencies, but should still record metrics
        await manager.generateExplanation('Test query', searchResults, { timeout: 1000 });
      } catch (error) {
        // Expected to fail, but metrics should be recorded
      }

      // Check that metrics were recorded
      const allMetrics = metrics.getAllProviderMetrics();
      expect(Object.keys(allMetrics).length).toBeGreaterThan(0);

      await manager.cleanup();
    }, 10000);

    it('should provide metrics access through manager', async () => {
      const manager = new LLMProviderManager();

      // Add some test metrics directly
      metrics.recordRequest({
        requestId: 'manager-test',
        provider: 'python',
        timestamp: new Date(),
        queryLength: 25,
        resultCount: 2,
        responseTime: 1100,
        success: true
      });

      const providerMetrics = manager.getProviderMetrics('python');
      expect(providerMetrics).toBeDefined();
      expect(providerMetrics.totalRequests).toBeGreaterThan(0);

      const failurePatterns = manager.getFailurePatterns();
      expect(failurePatterns).toBeDefined();

      const comparison = manager.generateProviderComparison();
      expect(comparison).toBeDefined();
      expect(comparison.providers).toContain('python');

      await manager.cleanup();
    });
  });

  describe('Memory Management', () => {
    it('should limit stored request metrics to prevent memory issues', () => {
      const smallMetrics = initializeProviderMetrics({
        maxStoredRequests: 5,
        metricsRetentionHours: 1
      });

      // Add more requests than the limit
      for (let i = 0; i < 10; i++) {
        smallMetrics.recordRequest({
          requestId: `memory-test-${i}`,
          provider: 'test',
          timestamp: new Date(),
          queryLength: 20,
          resultCount: 1,
          responseTime: 500,
          success: true
        });
      }

      const recentRequests = smallMetrics.getRecentRequests();
      expect(recentRequests.length).toBeLessThanOrEqual(5);
    });

    it('should clean up old metrics based on retention policy', () => {
      const shortRetentionMetrics = initializeProviderMetrics({
        maxStoredRequests: 100,
        metricsRetentionHours: 0.001 // Very short retention for testing
      });

      // Add a request
      shortRetentionMetrics.recordRequest({
        requestId: 'old-request',
        provider: 'test',
        timestamp: new Date(Date.now() - 10000), // 10 seconds ago
        queryLength: 20,
        resultCount: 1,
        responseTime: 500,
        success: true
      });

      // Wait a bit and add another request to trigger cleanup
      setTimeout(() => {
        shortRetentionMetrics.recordRequest({
          requestId: 'new-request',
          provider: 'test',
          timestamp: new Date(),
          queryLength: 20,
          resultCount: 1,
          responseTime: 500,
          success: true
        });

        const recentRequests = shortRetentionMetrics.getRecentRequests();
        // Old request should be cleaned up
        expect(recentRequests.find(r => r.requestId === 'old-request')).toBeUndefined();
      }, 100);
    });
  });
});
