/**
 * @file Test Configuration - Central configuration for all test environments
 */

export interface TestConfig {
  database: {
    unit: {
      type: 'memory';
      cleanup: boolean;
    };
    integration: {
      type: 'file';
      path: string;
      cleanup: boolean;
    };
    e2e: {
      type: 'file';
      path: string;
      cleanup: boolean;
    };
    performance: {
      type: 'file';
      path: string;
      cleanup: boolean;
    };
  };
  filesystem: {
    tempDir: string;
    cleanup: boolean;
  };
  performance: {
    thresholds: {
      unit: {
        maxDuration: number;
        maxMemoryUsage: number;
        maxCpuUsage: number;
      };
      integration: {
        maxDuration: number;
        maxMemoryUsage: number;
        maxCpuUsage: number;
      };
      e2e: {
        maxDuration: number;
        maxMemoryUsage: number;
        maxCpuUsage: number;
      };
    };
  };
  coverage: {
    unit: {
      branches: number;
      functions: number;
      lines: number;
      statements: number;
    };
    integration: {
      branches: number;
      functions: number;
      lines: number;
      statements: number;
    };
  };
}

export const testConfig: TestConfig = {
  database: {
    unit: {
      type: 'memory',
      cleanup: true,
    },
    integration: {
      type: 'file',
      path: 'tests/temp/integration.db',
      cleanup: true,
    },
    e2e: {
      type: 'file',
      path: 'tests/temp/e2e.db',
      cleanup: true,
    },
    performance: {
      type: 'file',
      path: 'tests/temp/performance.db',
      cleanup: true,
    },
  },
  filesystem: {
    tempDir: 'tests/temp',
    cleanup: true,
  },
  performance: {
    thresholds: {
      unit: {
        maxDuration: 1000, // 1 second
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        maxCpuUsage: 500, // 500ms
      },
      integration: {
        maxDuration: 10000, // 10 seconds
        maxMemoryUsage: 200 * 1024 * 1024, // 200MB
        maxCpuUsage: 2000, // 2 seconds
      },
      e2e: {
        maxDuration: 60000, // 60 seconds
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB
        maxCpuUsage: 10000, // 10 seconds
      },
    },
  },
  coverage: {
    unit: {
      branches: 80,
      functions: 85,
      lines: 80,
      statements: 80,
    },
    integration: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
};

export default testConfig;
