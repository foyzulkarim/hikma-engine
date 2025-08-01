/**
 * Jest configuration for unit tests
 * Fast, isolated tests with extensive mocking
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Unit Tests',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts',
    '!**/integration/**',
    '!**/e2e/**',
    '!**/performance/**'
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
  coverageDirectory: 'coverage/unit',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/unit/setup.ts'
  ],
  testTimeout: 10000,
  verbose: true,
  maxWorkers: '50%',
  // Mock external dependencies by default for unit tests
  clearMocks: true,
  restoreMocks: true,
};
