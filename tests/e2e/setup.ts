/**
 * @file End-to-end test setup - configures complete system environment
 */

import { TestDatabaseManager } from '../utils/test-database-manager';
import { TestFileSystemManager } from '../utils/test-filesystem-manager';
import { TestRepositoryManager } from '../utils/test-repository-manager';
import path from 'path';
import fs from 'fs/promises';

// Global test managers
let testDbManager: TestDatabaseManager;
let testFsManager: TestFileSystemManager;
let testRepoManager: TestRepositoryManager;

beforeAll(async () => {
  // Initialize all test managers for E2E tests
  testDbManager = new TestDatabaseManager('e2e');
  await testDbManager.initialize();
  
  testFsManager = new TestFileSystemManager();
  await testFsManager.initialize();
  
  testRepoManager = new TestRepositoryManager();
  await testRepoManager.initialize();
  
  // Set environment variables for E2E tests
  process.env.HIKMA_SQLITE_PATH = testDbManager.getDatabasePath();
  process.env.HIKMA_SQLITE_VEC_EXTENSION = path.join(__dirname, '../../extensions/vec0.dylib');
  process.env.HIKMA_LOG_LEVEL = 'info'; // More verbose logging for E2E tests
  
  // Ensure test directories exist
  const testDirs = ['temp', 'fixtures', 'repositories'];
  for (const dir of testDirs) {
    const dirPath = path.join(__dirname, '..', dir);
    await fs.mkdir(dirPath, { recursive: true });
  }
});

beforeEach(async () => {
  // Create fresh environment for each E2E test
  await testDbManager.createFreshDatabase();
  await testFsManager.createCleanWorkspace();
  await testRepoManager.createCleanRepositories();
});

afterEach(async () => {
  // Comprehensive cleanup after each test
  await testDbManager.cleanup();
  await testFsManager.cleanup();
  await testRepoManager.cleanup();
  
  // Force garbage collection to detect memory leaks
  if (global.gc) {
    global.gc();
  }
});

afterAll(async () => {
  // Final cleanup
  await testDbManager.destroy();
  await testFsManager.destroy();
  await testRepoManager.destroy();
  
  // Reset environment variables
  delete process.env.HIKMA_SQLITE_PATH;
  delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
});

// Export test utilities for use in E2E tests
export { testDbManager, testFsManager, testRepoManager };
