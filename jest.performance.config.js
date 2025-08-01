/**
 * Jest configuration for performance tests
 * Tests system performance under load and stress conditions
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Performance Tests',
  roots: ['<rootDir>/tests/performance'],
  testMatch: [
    '**/performance/**/*.test.ts',
    '**/performance/**/*.spec.ts',
    '**/*.performance.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/performance/setup.ts'
  ],
  testTimeout: 300000, // 5 minutes for performance tests
  verbose: true,
  maxWorkers: 1, // Run performance tests sequentially
  // Use real implementations for performance tests
  clearMocks: false,
  restoreMocks: false,
  // Detect open handles and memory leaks
  detectOpenHandles: true,
  detectLeaks: true,
  // Don't collect coverage for performance tests (impacts performance)
  collectCoverage: false,
};
