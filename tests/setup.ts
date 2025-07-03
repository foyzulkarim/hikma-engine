/**
 * @file Jest setup file for hikma-engine tests.
 */

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.HIKMA_LOG_LEVEL = 'error'; // Reduce log noise in tests
});

// Global test teardown
afterAll(() => {
  // Cleanup if needed
});

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  // Uncomment to silence console output in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
