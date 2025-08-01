/**
 * Jest configuration for end-to-end tests
 * Tests complete workflows with real file systems and databases
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'End-to-End Tests',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: [
    '**/e2e/**/*.test.ts',
    '**/e2e/**/*.spec.ts',
    '**/*.e2e.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage/e2e',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/e2e/setup.ts'
  ],
  testTimeout: 60000, // Longer timeout for E2E tests
  verbose: true,
  maxWorkers: 1, // Run E2E tests sequentially
  // Use real implementations for E2E tests
  clearMocks: false,
  restoreMocks: false,
  // Detect open handles to ensure proper cleanup
  detectOpenHandles: true,
  forceExit: true,
};
