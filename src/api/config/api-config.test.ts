import { apiConfig } from './api-config';

describe('ApiConfigService', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.HIKMA_API_PORT;
    delete process.env.HIKMA_API_HOST;
    delete process.env.HIKMA_API_CORS_ENABLED;
    delete process.env.HIKMA_API_RATE_LIMIT_MAX_REQUESTS;
  });

  describe('Configuration Loading', () => {
    it('should load default configuration', () => {
      const config = apiConfig.getConfig();
      
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.cors.enabled).toBe(true);
      expect(config.rateLimit.maxRequests).toBe(100);
      expect(config.cache.enabled).toBe(true);
      expect(config.monitoring.enabled).toBe(true);
    });

    it('should override configuration with environment variables', () => {
      process.env.HIKMA_API_PORT = '4000';
      process.env.HIKMA_API_HOST = '0.0.0.0';
      process.env.HIKMA_API_CORS_ENABLED = 'false';
      process.env.HIKMA_API_RATE_LIMIT_MAX_REQUESTS = '200';

      // Create new instance to test environment variable loading
      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.server.port).toBe(4000);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.cors.enabled).toBe(false);
      expect(config.rateLimit.maxRequests).toBe(200);
    });

    it('should handle array environment variables', () => {
      process.env.HIKMA_API_CORS_ORIGINS = 'http://localhost:3000,https://example.com';
      process.env.HIKMA_API_SEARCH_ALLOWED_FILE_TYPES = '.ts,.js,.py';

      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.cors.origins).toEqual(['http://localhost:3000', 'https://example.com']);
      expect(config.search.filters.allowedFileTypes).toEqual(['.ts', '.js', '.py']);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      expect(apiConfig.validateConfiguration()).toBe(true);
    });

    it('should reject invalid port numbers', () => {
      expect(() => {
        apiConfig.updateConfig({
          server: {
            ...apiConfig.getServerConfig(),
            port: 99999, // Invalid port
          },
        });
      }).toThrow();
    });

    it('should reject invalid similarity thresholds', () => {
      expect(() => {
        apiConfig.updateConfig({
          search: {
            ...apiConfig.getSearchConfig(),
            thresholds: {
              ...apiConfig.getSearchConfig().thresholds,
              minSimilarity: 1.5, // Invalid similarity
            },
          },
        });
      }).toThrow();
    });
  });

  describe('Configuration Access Methods', () => {
    it('should provide server configuration', () => {
      const serverConfig = apiConfig.getServerConfig();
      
      expect(serverConfig).toHaveProperty('port');
      expect(serverConfig).toHaveProperty('host');
      expect(serverConfig).toHaveProperty('timeout');
      expect(serverConfig).toHaveProperty('maxRequestSize');
    });

    it('should provide cache configuration', () => {
      const cacheConfig = apiConfig.getCacheConfig();
      
      expect(cacheConfig).toHaveProperty('enabled');
      expect(cacheConfig).toHaveProperty('ttl');
      expect(cacheConfig).toHaveProperty('maxSize');

    });

    it('should provide search configuration', () => {
      const searchConfig = apiConfig.getSearchConfig();
      
      expect(searchConfig).toHaveProperty('limits');
      expect(searchConfig).toHaveProperty('thresholds');
      expect(searchConfig).toHaveProperty('filters');
      expect(searchConfig).toHaveProperty('enhancement');
    });

    it('should provide monitoring configuration', () => {
      const monitoringConfig = apiConfig.getMonitoringConfig();
      
      expect(monitoringConfig).toHaveProperty('enabled');
      expect(monitoringConfig).toHaveProperty('healthCheck');
      expect(monitoringConfig).toHaveProperty('metrics');
      expect(monitoringConfig).toHaveProperty('alerts');
    });

    it('should provide security configuration', () => {
      const securityConfig = apiConfig.getSecurityConfig();
      
      expect(securityConfig).toHaveProperty('apiKey');
      expect(securityConfig).toHaveProperty('jwt');
      expect(securityConfig).toHaveProperty('headers');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration at runtime', () => {
      const originalPort = apiConfig.getServerConfig().port;
      
      apiConfig.updateConfig({
        server: {
          ...apiConfig.getServerConfig(),
          port: 4000,
        },
      });

      expect(apiConfig.getServerConfig().port).toBe(4000);
      
      // Restore original configuration
      apiConfig.updateConfig({
        server: {
          ...apiConfig.getServerConfig(),
          port: originalPort,
        },
      });
    });

    it('should validate updates', () => {
      expect(() => {
        apiConfig.updateConfig({
          server: {
            ...apiConfig.getServerConfig(),
            port: -1, // Invalid port
          },
        });
      }).toThrow();
    });
  });

  describe('Configuration Summary', () => {
    it('should provide configuration summary', () => {
      const summary = apiConfig.getConfigSummary();
      
      expect(summary).toHaveProperty('server');
      expect(summary).toHaveProperty('cache');
      expect(summary).toHaveProperty('security');
      expect(summary).toHaveProperty('monitoring');
      expect(summary).toHaveProperty('rateLimit');
      
      expect(summary.server).toHaveProperty('port');
      expect(summary.server).toHaveProperty('host');
      expect(summary.cache).toHaveProperty('enabled');
      expect(summary.security).toHaveProperty('apiKey');
      expect(summary.monitoring).toHaveProperty('enabled');
      expect(summary.rateLimit).toHaveProperty('enabled');
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse boolean environment variables correctly', () => {
      process.env.HIKMA_API_CACHE_ENABLED = 'true';
      process.env.HIKMA_API_MONITORING_ENABLED = 'false';

      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.cache.enabled).toBe(true);
      expect(config.monitoring.enabled).toBe(false);
    });

    it('should parse number environment variables correctly', () => {
      process.env.HIKMA_API_CACHE_TTL_SEMANTIC = '1200';
      process.env.HIKMA_API_SEARCH_MAX_RESULTS = '50';

      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.cache.ttl.semantic).toBe(1200);
      expect(config.search.limits.maxResults).toBe(50);
    });

    it('should handle empty array environment variables', () => {
      process.env.HIKMA_API_CORS_ORIGINS = '';

      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.cors.origins).toEqual([]);
    });

    it('should trim array values', () => {
      process.env.HIKMA_API_CORS_ORIGINS = ' http://localhost:3000 , https://example.com ';

      const testConfig = require('./api-config').apiConfig;
      const config = testConfig.getConfig();

      expect(config.cors.origins).toEqual(['http://localhost:3000', 'https://example.com']);
    });
  });

  describe('Default Values', () => {
    it('should use default values when environment variables are not set', () => {
      const config = apiConfig.getConfig();
      
      expect(config.server.port).toBe(3000);
      expect(config.server.timeout).toBe(30000);
      expect(config.rateLimit.windowMs).toBe(60000);
      expect(config.cache.ttl.semantic).toBe(900);
      expect(config.search.limits.maxResults).toBe(100);
      expect(config.monitoring.healthCheck.interval).toBe(30000);
    });

    it('should use default arrays for file types and excluded directories', () => {
      const config = apiConfig.getConfig();
      
      expect(config.search.filters.allowedFileTypes).toContain('.ts');
      expect(config.search.filters.allowedFileTypes).toContain('.js');
      expect(config.search.filters.allowedFileTypes).toContain('.py');
      
      expect(config.search.filters.excludedDirectories).toContain('node_modules');
      expect(config.search.filters.excludedDirectories).toContain('dist');
      expect(config.search.filters.excludedDirectories).toContain('.git');
    });
  });
});
