// Jest test setup file
// This file is loaded before each test suite

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.JEST_WORKER_ID = '1';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Allow tests to control console output
beforeEach(() => {
  // Reset console mocks for each test
  console.log = jest.fn(originalConsoleLog);
  console.error = jest.fn(originalConsoleError);
  console.warn = jest.fn(originalConsoleWarn);
});

// Clean up after each test
afterEach(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Test database configuration
export const TEST_DB_CONFIG = {
  inMemory: true,
  timeout: 5000,
  verbose: false,
};

// Helper function to create temporary test directories
export const createTempTestDir = (): string => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-test-'));
};

// Helper function to clean up temporary directories
export const cleanupTempTestDir = (dirPath: string): void => {
  const fs = require('fs');
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
};

// Mock external dependencies
jest.mock('../src/config/index', () => ({
  getConfig: jest.fn(() => ({
    database: {
      path: ':memory:',
      timeout: 5000,
    },
    openai: {
      apiKey: 'test-key',
      model: 'gpt-3.5-turbo',
    },
    logging: {
      level: 'silent',
    },
  })),
}));

// Mock process.exit for CLI tests
process.exit = jest.fn() as any;

// Mock process.argv for CLI argument parsing
const mockProcessArgv = (args: string[]) => {
  process.argv = ['node', 'test-script', ...args];
};

// Export utilities for use in tests
export { mockProcessArgv };