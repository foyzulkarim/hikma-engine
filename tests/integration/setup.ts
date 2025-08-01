/**
 * @file Integration test setup - configures real databases and component interactions
 */

import { TestDatabaseManager } from '../utils/test-database-manager';
import { TestFileSystemManager } from '../utils/test-filesystem-manager';
import path from 'path';

// Global test managers
let testDbManager: TestDatabaseManager;
let testFsManager: TestFileSystemManager;

beforeAll(async () => {
  // Initialize test database manager for integration tests (uses real SQLite files)
  testDbManager = new TestDatabaseManager('integration');
  await testDbManager.initialize();
  
  // Initialize test file system manager
  testFsManager = new TestFileSystemManager();
  await testFsManager.initialize();
  
  // Set environment variables for integration tests
  process.env.HIKMA_SQLITE_PATH = testDbManager.getDatabasePath();
  process.env.HIKMA_SQLITE_VEC_EXTENSION = path.join(__dirname, '../../extensions/vec0.dylib');
  process.env.HIKMA_LOG_LEVEL = 'warn'; // Reduce log noise but keep warnings
});

beforeEach(async () => {
  // Create fresh test database for each test
  await testDbManager.createFreshDatabase();
  
  // Create clean test directory structure
  await testFsManager.createCleanWorkspace();
});

afterEach(async () => {
  // Clean up test data after each test
  await testDbManager.cleanup();
  await testFsManager.cleanup();
});

afterAll(async () => {
  // Final cleanup
  await testDbManager.destroy();
  await testFsManager.destroy();
  
  // Reset environment variables
  delete process.env.HIKMA_SQLITE_PATH;
  delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
});

// Export test utilities for use in integration tests
export { testDbManager, testFsManager };
