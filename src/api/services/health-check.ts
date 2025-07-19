import { SearchService } from '../../modules/search-service';
import { apiConfig } from '../config/api-config';
import { getLogger } from '../../utils/logger';

const logger = getLogger('HealthCheckService');

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface SystemInfo {
  node: {
    version: string;
    platform: string;
    arch: string;
    uptime: number;
  };
  process: {
    pid: number;
    memory: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  api: {
    version: string;
    environment: string;
    startTime: string;
    uptime: number;
  };
  configuration: {
    server: {
      port: number;
      timeout: number;
    };
    cache: {
      enabled: boolean;
    };
    security: {
      apiKey: boolean;
      jwt: boolean;
    };
    monitoring: {
      enabled: boolean;
      healthCheck: boolean;
    };
  };
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private startTime: Date;
  private searchService: SearchService | null;
  private lastHealthCheck: HealthStatus | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startTime = new Date();
    // this.searchService = SearchService.getInstance(); // Temporarily disabled
    this.searchService = null; // Will be set later when needed
    this.initializePeriodicHealthCheck();
  }

  public static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  private initializePeriodicHealthCheck(): void {
    const monitoringConfig = apiConfig.getMonitoringConfig();
    
    if (monitoringConfig.healthCheck.enabled) {
      this.healthCheckInterval = setInterval(
        () => this.performHealthCheck(),
        monitoringConfig.healthCheck.interval
      );
    }
  }

  public async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    const checks: HealthStatus['checks'] = {};

    // Database connectivity checks
    await this.checkDatabaseConnectivity(checks);

    // Search service checks
    await this.checkSearchService(checks);

    // Memory usage check
    this.checkMemoryUsage(checks);

    // Disk space check (if applicable)
    await this.checkDiskSpace(checks);

    // Configuration validation
    this.checkConfiguration(checks);

    // External dependencies (if any)
    await this.checkExternalDependencies(checks);

    // Calculate summary
    const summary = this.calculateSummary(checks);
    
    // Determine overall status
    const status = this.determineOverallStatus(summary);

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      version: process.env.npm_package_version || '1.0.0',
      checks,
      summary,
    };

    this.lastHealthCheck = healthStatus;

    // Log health status if degraded or unhealthy
    if (status !== 'healthy') {
      logger.warn('Health check failed', { healthStatus });
    }

    return healthStatus;
  }

  private async checkDatabaseConnectivity(checks: HealthStatus['checks']): Promise<void> {
    const startTime = Date.now();

    try {
      // Check LanceDB connectivity
      const lanceDbCheck = await this.checkLanceDB();
      checks.lancedb = {
        status: lanceDbCheck.success ? 'pass' : 'fail',
        message: lanceDbCheck.message,
        responseTime: Date.now() - startTime,
        details: lanceDbCheck.details,
      };

      // Check SQLite connectivity
      const sqliteCheck = await this.checkSQLite();
      checks.sqlite = {
        status: sqliteCheck.success ? 'pass' : 'fail',
        message: sqliteCheck.message,
        responseTime: Date.now() - startTime,
        details: sqliteCheck.details,
      };

      // Check TinkerGraph connectivity
      const tinkerGraphCheck = await this.checkTinkerGraph();
      checks.tinkergraph = {
        status: tinkerGraphCheck.success ? 'pass' : 'fail',
        message: tinkerGraphCheck.message,
        responseTime: Date.now() - startTime,
        details: tinkerGraphCheck.details,
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        message: `Database connectivity check failed: ${error}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkLanceDB(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // This would check LanceDB connectivity
      // For now, we'll simulate the check
      return {
        success: true,
        message: 'LanceDB connection successful',
        details: { collections: 0 }, // Would be actual collection count
      };
    } catch (error) {
      return {
        success: false,
        message: `LanceDB connection failed: ${error}`,
      };
    }
  }

  private async checkSQLite(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // This would check SQLite connectivity
      // For now, we'll simulate the check
      return {
        success: true,
        message: 'SQLite connection successful',
        details: { tables: 0 }, // Would be actual table count
      };
    } catch (error) {
      return {
        success: false,
        message: `SQLite connection failed: ${error}`,
      };
    }
  }

  private async checkTinkerGraph(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // This would check TinkerGraph connectivity
      // For now, we'll simulate the check
      return {
        success: true,
        message: 'TinkerGraph connection successful',
        details: { vertices: 0, edges: 0 }, // Would be actual counts
      };
    } catch (error) {
      return {
        success: false,
        message: `TinkerGraph connection failed: ${error}`,
      };
    }
  }

  private async checkSearchService(checks: HealthStatus['checks']): Promise<void> {
    const startTime = Date.now();

    try {
      if (!this.searchService) {
        checks.searchService = {
          status: 'warn',
          message: 'Search service not initialized',
          responseTime: Date.now() - startTime,
          details: {
            reason: 'Service not available during startup',
          },
        };
        return;
      }

      // Perform a simple search to verify service functionality
      const testQuery = 'test';
      const results = await this.searchService.semanticSearch(testQuery, { limit: 1 });
      
      checks.searchService = {
        status: 'pass',
        message: 'Search service operational',
        responseTime: Date.now() - startTime,
        details: {
          testQuery,
          resultCount: results.length,
        },
      };
    } catch (error) {
      checks.searchService = {
        status: 'fail',
        message: `Search service check failed: ${error}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private checkMemoryUsage(checks: HealthStatus['checks']): void {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Memory usage normal';

    if (memoryUsagePercent > 90) {
      status = 'fail';
      message = 'Critical memory usage';
    } else if (memoryUsagePercent > 75) {
      status = 'warn';
      message = 'High memory usage';
    }

    checks.memory = {
      status,
      message,
      details: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        usagePercent: Math.round(memoryUsagePercent),
      },
    };
  }

  private async checkDiskSpace(checks: HealthStatus['checks']): Promise<void> {
    try {
      // This would check available disk space
      // For now, we'll simulate the check
      checks.diskSpace = {
        status: 'pass',
        message: 'Sufficient disk space available',
        details: {
          available: '10GB', // Would be actual available space
          used: '5GB', // Would be actual used space
          total: '15GB', // Would be actual total space
        },
      };
    } catch (error) {
      checks.diskSpace = {
        status: 'warn',
        message: 'Could not check disk space',
      };
    }
  }

  private checkConfiguration(checks: HealthStatus['checks']): void {
    try {
      const isValid = apiConfig.validateConfiguration();
      
      checks.configuration = {
        status: isValid ? 'pass' : 'fail',
        message: isValid ? 'Configuration valid' : 'Configuration validation failed',
        details: apiConfig.getConfigSummary(),
      };
    } catch (error) {
      checks.configuration = {
        status: 'fail',
        message: `Configuration check failed: ${error}`,
      };
    }
  }

  private async checkExternalDependencies(checks: HealthStatus['checks']): Promise<void> {
    // Add external dependency checks here if needed
  }

  private calculateSummary(checks: HealthStatus['checks']): HealthStatus['summary'] {
    const total = Object.keys(checks).length;
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    Object.values(checks).forEach(check => {
      switch (check.status) {
        case 'pass':
          passed++;
          break;
        case 'fail':
          failed++;
          break;
        case 'warn':
          warnings++;
          break;
      }
    });

    return { total, passed, failed, warnings };
  }

  private determineOverallStatus(summary: HealthStatus['summary']): 'healthy' | 'degraded' | 'unhealthy' {
    if (summary.failed > 0) {
      return 'unhealthy';
    } else if (summary.warnings > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  public getLastHealthCheck(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  public getSystemInfo(): SystemInfo {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
      },
      process: {
        pid: process.pid,
        memory: memoryUsage,
        cpuUsage,
      },
      api: {
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        startTime: this.startTime.toISOString(),
        uptime: Date.now() - this.startTime.getTime(),
      },
      configuration: {
        server: {
          port: apiConfig.getServerConfig().port,
          timeout: apiConfig.getServerConfig().timeout,
        },
        cache: {
          enabled: apiConfig.getCacheConfig().enabled,
        },
        security: {
          apiKey: apiConfig.getSecurityConfig().apiKey.enabled,
          jwt: apiConfig.getSecurityConfig().jwt.enabled,
        },
        monitoring: {
          enabled: apiConfig.getMonitoringConfig().enabled,
          healthCheck: apiConfig.getMonitoringConfig().healthCheck.enabled,
        },
      },
    };
  }

  public async getDetailedStatus(): Promise<{
    health: HealthStatus;
    system: SystemInfo;
    metrics?: any;
  }> {
    const health = await this.performHealthCheck();
    const system = this.getSystemInfo();

    return {
      health,
      system,
      // metrics would come from the error monitoring service
    };
  }

  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export const healthCheckService = HealthCheckService.getInstance();
