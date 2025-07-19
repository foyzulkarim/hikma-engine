import { z } from 'zod';

// Configuration schema for validation
const ApiConfigSchema = z.object({
  server: z.object({
    port: z.number().min(1000).max(65535).default(3000),
    host: z.string().default('localhost'),
    timeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
    maxRequestSize: z.string().default('10mb'),
  }),
  
  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(['*']),
    credentials: z.boolean().default(false),
    methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
  }),
  
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    windowMs: z.number().min(1000).default(60000), // 1 minute
    maxRequests: z.number().min(1).default(100),
    skipSuccessfulRequests: z.boolean().default(false),
    skipFailedRequests: z.boolean().default(false),
  }),
  
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.object({
      semantic: z.number().min(60).default(900), // 15 minutes
      structural: z.number().min(60).default(1800), // 30 minutes
      git: z.number().min(60).default(3600), // 60 minutes
      hybrid: z.number().min(60).default(900), // 15 minutes
      comprehensive: z.number().min(60).default(1200), // 20 minutes
    }),
    maxSize: z.number().min(100).default(1000),

  }),
  
  search: z.object({
    limits: z.object({
      maxResults: z.number().min(1).max(1000).default(100),
      defaultResults: z.number().min(1).max(100).default(10),
      maxQueryLength: z.number().min(10).max(2000).default(500),
    }),
    
    thresholds: z.object({
      minSimilarity: z.number().min(0).max(1).default(0.1),
      maxSimilarity: z.number().min(0).max(1).default(1.0),
      relevanceThreshold: z.number().min(0).max(1).default(0.3),
    }),
    
    filters: z.object({
      allowedFileTypes: z.array(z.string()).default([
        '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.cpp', '.c', '.h',
        '.cs', '.php', '.rb', '.rs', '.kt', '.swift', '.scala', '.clj', '.hs'
      ]),
      excludedDirectories: z.array(z.string()).default([
        'node_modules', 'dist', 'build', '.git', '.vscode', '.idea',
        'coverage', 'tmp', 'temp', 'logs'
      ]),
      maxFileSize: z.number().min(1024).default(1048576), // 1MB
    }),
    
    enhancement: z.object({
      syntaxHighlighting: z.boolean().default(true),
      relatedFiles: z.boolean().default(true),
      breadcrumbs: z.boolean().default(true),
      relevanceExplanation: z.boolean().default(true),
      maxContextLines: z.number().min(0).max(20).default(5),
    }),
  }),
  
  monitoring: z.object({
    enabled: z.boolean().default(true),
    healthCheck: z.object({
      enabled: z.boolean().default(true),
      interval: z.number().min(1000).default(30000), // 30 seconds
      timeout: z.number().min(1000).default(5000), // 5 seconds
    }),
    
    metrics: z.object({
      enabled: z.boolean().default(true),
      collectInterval: z.number().min(1000).default(10000), // 10 seconds
      retentionPeriod: z.number().min(3600).default(86400), // 24 hours
    }),
    
    alerts: z.object({
      enabled: z.boolean().default(true),
      errorRateThreshold: z.number().min(0).max(1).default(0.1), // 10%
      responseTimeThreshold: z.number().min(100).default(5000), // 5 seconds
      cooldownPeriod: z.number().min(60).default(300), // 5 minutes
    }),
  }),
  
  security: z.object({
    apiKey: z.object({
      enabled: z.boolean().default(false),
      header: z.string().default('X-API-Key'),
      keys: z.array(z.string()).default([]),
    }),
    
    jwt: z.object({
      enabled: z.boolean().default(false),
      secret: z.string().optional(),
      expiresIn: z.string().default('1h'),
      algorithm: z.string().default('HS256'),
    }),
    
    headers: z.object({
      contentSecurityPolicy: z.boolean().default(true),
      xFrameOptions: z.boolean().default(true),
      xContentTypeOptions: z.boolean().default(true),
      referrerPolicy: z.boolean().default(true),
    }),
  }),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('json'),
    includeRequestId: z.boolean().default(true),
    includeTimestamp: z.boolean().default(true),
    logRequests: z.boolean().default(true),
    logResponses: z.boolean().default(false),
  }),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

class ApiConfigService {
  private config: ApiConfig;
  private static instance: ApiConfigService;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  public static getInstance(): ApiConfigService {
    if (!ApiConfigService.instance) {
      ApiConfigService.instance = new ApiConfigService();
    }
    return ApiConfigService.instance;
  }

  private loadConfiguration(): ApiConfig {
    const envConfig = {
      server: {
        port: this.getEnvNumber('HIKMA_API_PORT', 3000),
        host: this.getEnvString('HIKMA_API_HOST', 'localhost'),
        timeout: this.getEnvNumber('HIKMA_API_TIMEOUT', 30000),
        maxRequestSize: this.getEnvString('HIKMA_API_MAX_REQUEST_SIZE', '10mb'),
      },
      
      cors: {
        enabled: this.getEnvBoolean('HIKMA_API_CORS_ENABLED', true),
        origins: this.getEnvArray('HIKMA_API_CORS_ORIGINS', ['*']),
        credentials: this.getEnvBoolean('HIKMA_API_CORS_CREDENTIALS', false),
        methods: this.getEnvArray('HIKMA_API_CORS_METHODS', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
      },
      
      rateLimit: {
        enabled: this.getEnvBoolean('HIKMA_API_RATE_LIMIT_ENABLED', true),
        windowMs: this.getEnvNumber('HIKMA_API_RATE_LIMIT_WINDOW_MS', 60000),
        maxRequests: this.getEnvNumber('HIKMA_API_RATE_LIMIT_MAX_REQUESTS', 100),
        skipSuccessfulRequests: this.getEnvBoolean('HIKMA_API_RATE_LIMIT_SKIP_SUCCESS', false),
        skipFailedRequests: this.getEnvBoolean('HIKMA_API_RATE_LIMIT_SKIP_FAILED', false),
      },
      
      cache: {
        enabled: this.getEnvBoolean('HIKMA_API_CACHE_ENABLED', true),
        ttl: {
          semantic: this.getEnvNumber('HIKMA_API_CACHE_TTL_SEMANTIC', 900),
          structural: this.getEnvNumber('HIKMA_API_CACHE_TTL_STRUCTURAL', 1800),
          git: this.getEnvNumber('HIKMA_API_CACHE_TTL_GIT', 3600),
          hybrid: this.getEnvNumber('HIKMA_API_CACHE_TTL_HYBRID', 900),
          comprehensive: this.getEnvNumber('HIKMA_API_CACHE_TTL_COMPREHENSIVE', 1200),
        },
        maxSize: this.getEnvNumber('HIKMA_API_CACHE_MAX_SIZE', 1000),

      },
      
      search: {
        limits: {
          maxResults: this.getEnvNumber('HIKMA_API_SEARCH_MAX_RESULTS', 100),
          defaultResults: this.getEnvNumber('HIKMA_API_SEARCH_DEFAULT_RESULTS', 10),
          maxQueryLength: this.getEnvNumber('HIKMA_API_SEARCH_MAX_QUERY_LENGTH', 500),
        },
        
        thresholds: {
          minSimilarity: this.getEnvNumber('HIKMA_API_SEARCH_MIN_SIMILARITY', 0.1),
          maxSimilarity: this.getEnvNumber('HIKMA_API_SEARCH_MAX_SIMILARITY', 1.0),
          relevanceThreshold: this.getEnvNumber('HIKMA_API_SEARCH_RELEVANCE_THRESHOLD', 0.3),
        },
        
        filters: {
          allowedFileTypes: this.getEnvArray('HIKMA_API_SEARCH_ALLOWED_FILE_TYPES', [
            '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.cpp', '.c', '.h',
            '.cs', '.php', '.rb', '.rs', '.kt', '.swift', '.scala', '.clj', '.hs'
          ]),
          excludedDirectories: this.getEnvArray('HIKMA_API_SEARCH_EXCLUDED_DIRECTORIES', [
            'node_modules', 'dist', 'build', '.git', '.vscode', '.idea',
            'coverage', 'tmp', 'temp', 'logs'
          ]),
          maxFileSize: this.getEnvNumber('HIKMA_API_SEARCH_MAX_FILE_SIZE', 1048576),
        },
        
        enhancement: {
          syntaxHighlighting: this.getEnvBoolean('HIKMA_API_SEARCH_SYNTAX_HIGHLIGHTING', true),
          relatedFiles: this.getEnvBoolean('HIKMA_API_SEARCH_RELATED_FILES', true),
          breadcrumbs: this.getEnvBoolean('HIKMA_API_SEARCH_BREADCRUMBS', true),
          relevanceExplanation: this.getEnvBoolean('HIKMA_API_SEARCH_RELEVANCE_EXPLANATION', true),
          maxContextLines: this.getEnvNumber('HIKMA_API_SEARCH_MAX_CONTEXT_LINES', 5),
        },
      },
      
      monitoring: {
        enabled: this.getEnvBoolean('HIKMA_API_MONITORING_ENABLED', true),
        healthCheck: {
          enabled: this.getEnvBoolean('HIKMA_API_HEALTH_CHECK_ENABLED', true),
          interval: this.getEnvNumber('HIKMA_API_HEALTH_CHECK_INTERVAL', 30000),
          timeout: this.getEnvNumber('HIKMA_API_HEALTH_CHECK_TIMEOUT', 5000),
        },
        
        metrics: {
          enabled: this.getEnvBoolean('HIKMA_API_METRICS_ENABLED', true),
          collectInterval: this.getEnvNumber('HIKMA_API_METRICS_COLLECT_INTERVAL', 10000),
          retentionPeriod: this.getEnvNumber('HIKMA_API_METRICS_RETENTION_PERIOD', 86400),
        },
        
        alerts: {
          enabled: this.getEnvBoolean('HIKMA_API_ALERTS_ENABLED', true),
          errorRateThreshold: this.getEnvNumber('HIKMA_API_ALERTS_ERROR_RATE_THRESHOLD', 0.1),
          responseTimeThreshold: this.getEnvNumber('HIKMA_API_ALERTS_RESPONSE_TIME_THRESHOLD', 5000),
          cooldownPeriod: this.getEnvNumber('HIKMA_API_ALERTS_COOLDOWN_PERIOD', 300),
        },
      },
      
      security: {
        apiKey: {
          enabled: this.getEnvBoolean('HIKMA_API_KEY_ENABLED', false),
          header: this.getEnvString('HIKMA_API_KEY_HEADER', 'X-API-Key'),
          keys: this.getEnvArray('HIKMA_API_KEYS', []),
        },
        
        jwt: {
          enabled: this.getEnvBoolean('HIKMA_API_JWT_ENABLED', false),
          secret: this.getEnvString('HIKMA_API_JWT_SECRET'),
          expiresIn: this.getEnvString('HIKMA_API_JWT_EXPIRES_IN', '1h'),
          algorithm: this.getEnvString('HIKMA_API_JWT_ALGORITHM', 'HS256'),
        },
        
        headers: {
          contentSecurityPolicy: this.getEnvBoolean('HIKMA_API_CSP_ENABLED', true),
          xFrameOptions: this.getEnvBoolean('HIKMA_API_X_FRAME_OPTIONS_ENABLED', true),
          xContentTypeOptions: this.getEnvBoolean('HIKMA_API_X_CONTENT_TYPE_OPTIONS_ENABLED', true),
          referrerPolicy: this.getEnvBoolean('HIKMA_API_REFERRER_POLICY_ENABLED', true),
        },
      },
      
      logging: {
        level: this.getEnvString('HIKMA_API_LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
        format: this.getEnvString('HIKMA_API_LOG_FORMAT', 'json') as 'json' | 'text',
        includeRequestId: this.getEnvBoolean('HIKMA_API_LOG_INCLUDE_REQUEST_ID', true),
        includeTimestamp: this.getEnvBoolean('HIKMA_API_LOG_INCLUDE_TIMESTAMP', true),
        logRequests: this.getEnvBoolean('HIKMA_API_LOG_REQUESTS', true),
        logResponses: this.getEnvBoolean('HIKMA_API_LOG_RESPONSES', false),
      },
    };

    try {
      return ApiConfigSchema.parse(envConfig);
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw new Error('Invalid API configuration');
    }
  }

  private getEnvString(key: string, defaultValue?: string): string | undefined {
    const value = process.env[key];
    return value !== undefined ? value : defaultValue;
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  private getEnvArray(key: string, defaultValue: string[]): string[] {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  public getConfig(): ApiConfig {
    return this.config;
  }

  public updateConfig(updates: Partial<ApiConfig>): void {
    this.config = ApiConfigSchema.parse({
      ...this.config,
      ...updates,
    });
  }

  public getServerConfig() {
    return this.config.server;
  }

  public getCorsConfig() {
    return this.config.cors;
  }

  public getRateLimitConfig() {
    return this.config.rateLimit;
  }

  public getCacheConfig() {
    return this.config.cache;
  }

  public getSearchConfig() {
    return this.config.search;
  }

  public getMonitoringConfig() {
    return this.config.monitoring;
  }

  public getSecurityConfig() {
    return this.config.security;
  }

  public getLoggingConfig() {
    return this.config.logging;
  }

  public validateConfiguration(): boolean {
    try {
      ApiConfigSchema.parse(this.config);
      return true;
    } catch {
      return false;
    }
  }

  public getConfigSummary(): Record<string, any> {
    return {
      server: {
        port: this.config.server.port,
        host: this.config.server.host,
        timeout: this.config.server.timeout,
      },
      cache: {
        enabled: this.config.cache.enabled,
      },
      security: {
        apiKey: this.config.security.apiKey.enabled,
        jwt: this.config.security.jwt.enabled,
      },
      monitoring: {
        enabled: this.config.monitoring.enabled,
        healthCheck: this.config.monitoring.healthCheck.enabled,
        metrics: this.config.monitoring.metrics.enabled,
      },
      rateLimit: {
        enabled: this.config.rateLimit.enabled,
        maxRequests: this.config.rateLimit.maxRequests,
        windowMs: this.config.rateLimit.windowMs,
      },
    };
  }
}

export const apiConfig = ApiConfigService.getInstance();
export default apiConfig;
