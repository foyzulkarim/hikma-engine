/**
 * Jest configuration for integration tests
 * Tests component interactions with real databases
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Integration Tests',
  roots: ['<rootDir>/tests/integration', '<rootDir>/src'],
  testMatch: [
    '**/integration/**/*.test.ts',
    '**/integration/**/*.spec.ts',
    '**/*.integration.test.ts'
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
  coverageDirectory: 'coverage/integration',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/integration/setup.ts'
  ],
  testTimeout: 30000,
  verbose: true,
  maxWorkers: 1, // Run integration tests sequentially to avoid database conflicts
  // Don't clear mocks for integration tests - we want some real implementations
  clearMocks: false,
  restoreMocks: false,
  // Mock problematic modules
  moduleNameMapper: {
    '^@xenova/transformers$': '<rootDir>/tests/__mocks__/@xenova/transformers.js'
  },
};
