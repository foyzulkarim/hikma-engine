/**
 * @file Unit test setup - configures mocks and isolated test environment
 */

import { TestDatabaseManager } from '../utils/test-database-manager';
import { MockFactory } from '../utils/mock-factory';

// Global test database manager instance
let testDbManager: TestDatabaseManager;

beforeAll(async () => {
  // Initialize test database manager for unit tests (uses in-memory databases)
  testDbManager = new TestDatabaseManager('unit');
  
  // Set up global mocks for unit tests
  MockFactory.setupGlobalMocks();
  
  // Mock external services
  jest.mock('@xenova/transformers', () => ({
    pipeline: jest.fn().mockResolvedValue({
      predict: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }),
  }));
  
  // Mock file system operations
  jest.mock('fs/promises');
  jest.mock('glob');
  jest.mock('simple-git');
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset mock implementations
  MockFactory.resetMocks();
});

afterEach(async () => {
  // Clean up any test data
  if (testDbManager) {
    await testDbManager.cleanup();
  }
});

afterAll(async () => {
  // Final cleanup
  if (testDbManager) {
    await testDbManager.destroy();
  }
  
  // Restore all mocks
  jest.restoreAllMocks();
});

// Export test utilities for use in unit tests
export { testDbManager };
