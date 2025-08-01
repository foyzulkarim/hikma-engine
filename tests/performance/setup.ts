/**
 * @file Performance test setup - configures performance monitoring and benchmarking
 */

import { TestDatabaseManager } from '../utils/test-database-manager';
import { TestFileSystemManager } from '../utils/test-filesystem-manager';
import { PerformanceMonitor } from '../utils/performance-monitor';
import path from 'path';

// Global test managers and monitors
let testDbManager: TestDatabaseManager;
let testFsManager: TestFileSystemManager;
let performanceMonitor: PerformanceMonitor;

beforeAll(async () => {
  // Initialize test managers for performance tests
  testDbManager = new TestDatabaseManager('performance');
  await testDbManager.initialize();
  
  testFsManager = new TestFileSystemManager();
  await testFsManager.initialize();
  
  // Initialize performance monitoring
  performanceMonitor = new PerformanceMonitor();
  
  // Set environment variables optimized for performance testing
  process.env.HIKMA_SQLITE_PATH = testDbManager.getDatabasePath();
  process.env.HIKMA_SQLITE_VEC_EXTENSION = path.join(__dirname, '../../extensions/vec0.dylib');
  process.env.HIKMA_LOG_LEVEL = 'error'; // Minimal logging for performance tests
  process.env.NODE_ENV = 'performance';
  
  // Warm up the system
  await performanceMonitor.warmUp();
});

beforeEach(async () => {
  // Create fresh environment for each performance test
  await testDbManager.createFreshDatabase();
  await testFsManager.createCleanWorkspace();
  
  // Start performance monitoring
  performanceMonitor.startMonitoring();
});

afterEach(async () => {
  // Stop performance monitoring and collect metrics
  const metrics = performanceMonitor.stopMonitoring();
  
  // Log performance metrics
  console.log('Performance Metrics:', JSON.stringify(metrics, null, 2));
  
  // Clean up test data
  await testDbManager.cleanup();
  await testFsManager.cleanup();
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
});

afterAll(async () => {
  // Generate performance report
  await performanceMonitor.generateReport();
  
  // Final cleanup
  await testDbManager.destroy();
  await testFsManager.destroy();
  
  // Reset environment variables
  delete process.env.HIKMA_SQLITE_PATH;
  delete process.env.HIKMA_SQLITE_VEC_EXTENSION;
  delete process.env.NODE_ENV;
});

// Export test utilities for use in performance tests
export { testDbManager, testFsManager, performanceMonitor };
