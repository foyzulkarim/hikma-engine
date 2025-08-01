/**
 * @file Mock Factory - Provides consistent mocks for external dependencies
 */

export interface MockSQLiteClient {
  connect: jest.Mock;
  disconnect: jest.Mock;
  query: jest.Mock;
  execute: jest.Mock;
  transaction: jest.Mock;
  prepare: jest.Mock;
  close: jest.Mock;
}

export interface MockEmbeddingService {
  generateEmbedding: jest.Mock;
  batchGenerate: jest.Mock;
}

export interface MockFileSystem {
  readFile: jest.Mock;
  writeFile: jest.Mock;
  mkdir: jest.Mock;
  readdir: jest.Mock;
  stat: jest.Mock;
  access: jest.Mock;
}

export interface MockGitService {
  clone: jest.Mock;
  log: jest.Mock;
  status: jest.Mock;
  diff: jest.Mock;
}

export class MockFactory {
  private static mocks: Map<string, any> = new Map();

  static setupGlobalMocks(): void {
    // Mock console methods to reduce test noise
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock process.exit to prevent tests from exiting
    const originalExit = process.exit;
    process.exit = jest.fn() as any;
    
    // Store original for restoration
    MockFactory.mocks.set('process.exit', originalExit);
  }

  static createMockSQLiteClient(): MockSQLiteClient {
    const mockClient: MockSQLiteClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn().mockImplementation(async (callback: any) => {
        return await callback();
      }),
      prepare: jest.fn().mockReturnValue({
        run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
        get: jest.fn().mockReturnValue(null),
        all: jest.fn().mockReturnValue([]),
      }),
      close: jest.fn(),
    };

    MockFactory.mocks.set('sqlite-client', mockClient);
    return mockClient;
  }

  static createMockEmbeddingService(): MockEmbeddingService {
    const mockService: MockEmbeddingService = {
      generateEmbedding: jest.fn().mockImplementation(async (text: any) => {
        // Generate a deterministic mock embedding based on text
        const hash = MockFactory.simpleHash(text);
        return Array.from({ length: 384 }, (_, i) => (hash + i) % 1000 / 1000);
      }),
      batchGenerate: jest.fn().mockImplementation(async (texts: any) => {
        return Promise.all(texts.map((text: any) => MockFactory.mocks.get('embedding-service').generateEmbedding(text)));
      }),
    };

    MockFactory.mocks.set('embedding-service', mockService);
    return mockService;
  }

  static createMockFileSystem(): MockFileSystem {
    const mockFs: MockFileSystem = {
      readFile: jest.fn().mockResolvedValue('mock file content'),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      readdir: jest.fn().mockResolvedValue(['file1.ts', 'file2.ts']),
      stat: jest.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
      }),
      access: jest.fn().mockResolvedValue(undefined),
    };

    MockFactory.mocks.set('file-system', mockFs);
    return mockFs;
  }

  static createMockGitService(): MockGitService {
    const mockGit: MockGitService = {
      clone: jest.fn().mockResolvedValue(undefined),
      log: jest.fn().mockResolvedValue([
        {
          hash: 'abc123',
          message: 'Initial commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          date: new Date().toISOString(),
        },
      ]),
      status: jest.fn().mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        ahead: 0,
        behind: 0,
        files: [],
      }),
      diff: jest.fn().mockResolvedValue('mock diff content'),
    };

    MockFactory.mocks.set('git-service', mockGit);
    return mockGit;
  }

  static createMockAIService() {
    const mockAI = {
      generateSummary: jest.fn().mockImplementation(async (text: any) => {
        return `Summary of: ${text.substring(0, 50)}...`;
      }),
      batchSummarize: jest.fn().mockImplementation(async (texts: any) => {
        return texts.map((text: any) => `Summary of: ${text.substring(0, 50)}...`);
      }),
    };

    MockFactory.mocks.set('ai-service', mockAI);
    return mockAI;
  }

  static createMockLogger() {
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLevel: jest.fn(),
    };

    MockFactory.mocks.set('logger', mockLogger);
    return mockLogger;
  }

  static getMock(name: string): any {
    return MockFactory.mocks.get(name);
  }

  static resetMocks(): void {
    // Reset all mock implementations
    for (const [name, mock] of MockFactory.mocks) {
      if (mock && typeof mock === 'object') {
        Object.values(mock).forEach((fn: any) => {
          if (jest.isMockFunction(fn)) {
            fn.mockReset();
          }
        });
      }
    }
  }

  static clearMocks(): void {
    // Clear all mock calls and instances
    for (const [name, mock] of MockFactory.mocks) {
      if (mock && typeof mock === 'object') {
        Object.values(mock).forEach((fn: any) => {
          if (jest.isMockFunction(fn)) {
            fn.mockClear();
          }
        });
      }
    }
  }

  static restoreMocks(): void {
    // Restore original implementations
    const originalExit = MockFactory.mocks.get('process.exit');
    if (originalExit) {
      process.exit = originalExit;
    }

    MockFactory.mocks.clear();
  }

  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Test data factories
  static createTestRepository(overrides: Partial<any> = {}) {
    return {
      id: 'test-repo-1',
      name: 'test-repository',
      path: '/test/path/repo',
      url: 'https://github.com/test/repo.git',
      ...overrides,
    };
  }

  static createTestFile(overrides: Partial<any> = {}) {
    return {
      id: 'test-file-1',
      repository_id: 'test-repo-1',
      path: 'src/test.ts',
      name: 'test.ts',
      extension: '.ts',
      size: 1024,
      hash: 'abc123',
      content: 'export function test() { return "hello"; }',
      ...overrides,
    };
  }

  static createTestNode(overrides: Partial<any> = {}) {
    return {
      id: 'test-node-1',
      type: 'function',
      name: 'test',
      file_id: 'test-file-1',
      properties: {
        parameters: [],
        returnType: 'string',
      },
      ...overrides,
    };
  }

  static createTestEdge(overrides: Partial<any> = {}) {
    return {
      id: 'test-edge-1',
      source_id: 'test-node-1',
      target_id: 'test-node-2',
      type: 'calls',
      properties: {},
      ...overrides,
    };
  }

  static createTestEmbedding(overrides: Partial<any> = {}) {
    return {
      id: 'test-embedding-1',
      node_id: 'test-node-1',
      vector: Array.from({ length: 384 }, () => Math.random()),
      dimensions: 384,
      model: 'test-model',
      ...overrides,
    };
  }
}
