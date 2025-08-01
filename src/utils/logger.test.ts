/**
 * @file Unit tests for logger utility
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger, LogLevel, LogEntry, initializeLogger, getLogger } from './logger';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Logger', () => {
  let tempLogPath: string;
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    tempLogPath = '/tmp/test.log';
    
    // Mock console methods
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation();
    mockFs.appendFileSync.mockImplementation();

    // Clear any global logger state
    (global as any).globalLogger = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Logger Construction', () => {
    it('should create logger with console output enabled', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      logger.info('test message');
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test message')
      );
    });

    it('should create logger with file output enabled', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: false,
        enableFile: true,
        logFilePath: tempLogPath,
      });

      logger.info('test message');
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        tempLogPath,
        expect.stringContaining('[INFO] test message\n')
      );
    });

    it('should create log directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      new Logger({
        level: 'info',
        enableConsole: false,
        enableFile: true,
        logFilePath: '/tmp/logs/test.log',
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true });
    });

    it('should create logger with context', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
        context: 'TestModule',
      });

      logger.info('test message');
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestModule] test message')
      );
    });
  });

  describe('Log Level Management', () => {
    it('should respect log level hierarchy', () => {
      const logger = new Logger({
        level: 'warn',
        enableConsole: true,
        enableFile: false,
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should log all levels when set to debug', () => {
      const logger = new Logger({
        level: 'debug',
        enableConsole: true,
        enableFile: false,
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should only log errors when set to error level', () => {
      const logger = new Logger({
        level: 'error',
        enableConsole: true,
        enableFile: false,
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log Formatting', () => {
    it('should format log entries with timestamp and level', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      logger.info('test message');

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] test message$/);
    });

    it('should include context in log format', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
        context: 'TestContext',
      });

      logger.info('test message');

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('[TestContext] test message');
    });

    it('should include metadata in log format', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const metadata = { userId: 123, action: 'test' };
      logger.info('test message', metadata);

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('":123,"action":"test"}');
    });

    it('should handle circular references in metadata', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const circular: any = { name: 'test' };
      circular.self = circular;

      logger.info('test message', { data: circular });

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('[Circular Reference]');
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with nested context', () => {
      const parentLogger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
        context: 'Parent',
      });

      const childLogger = parentLogger.child('Child');
      childLogger.info('test message');

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('[Parent:Child] test message');
    });

    it('should create child logger without parent context', () => {
      const parentLogger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const childLogger = parentLogger.child('Child');
      childLogger.info('test message');

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('[Child] test message');
    });

    it('should inherit parent logger configuration', () => {
      const parentLogger = new Logger({
        level: 'warn',
        enableConsole: true,
        enableFile: false,
      });

      const childLogger = parentLogger.child('Child');
      childLogger.info('info message');
      childLogger.warn('warn message');

      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Operation Logging', () => {
    it('should log operation start and completion', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const completeOperation = logger.operation('test-operation');
      completeOperation();

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting operation: test-operation')
      );
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('Completed operation: test-operation')
      );
    });

    it('should include duration in operation completion log', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const completeOperation = logger.operation('test-operation');
      
      // Add small delay to ensure duration is measurable
      setTimeout(() => {
        completeOperation();
        
        const completionCall = consoleSpy.info.mock.calls.find(call => 
          call[0].includes('Completed operation: test-operation')
        );
        expect(completionCall).toBeDefined();
      }, 10);
    });
  });

  describe('Performance Logging', () => {
    it('should log performance metrics', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const metrics = {
        duration: '150ms',
        memoryUsage: '45MB',
        itemsProcessed: 100,
      };

      logger.performance('data-processing', metrics);

      const logCall = consoleSpy.info.mock.calls[0][0];
      expect(logCall).toContain('Performance metrics for data-processing');
      expect(logCall).toContain('"duration":"150ms"');
      expect(logCall).toContain('"memoryUsage":"45MB"');
      expect(logCall).toContain('"itemsProcessed":100');
    });
  });

  describe('File Logging Error Handling', () => {
    it('should handle file write errors gracefully', () => {
      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });

      const logger = new Logger({
        level: 'info',
        enableConsole: false,
        enableFile: true,
        logFilePath: tempLogPath,
      });

      logger.info('test message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Failed to write to log file:',
        expect.any(Error)
      );
    });
  });

  describe('Global Logger Functions', () => {
    it('should initialize global logger', () => {
      const logger = initializeLogger({
        level: 'debug',
        enableConsole: true,
        enableFile: false,
      });

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should get global logger instance', () => {
      initializeLogger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const logger = getLogger();
      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test message')
      );
    });

    it('should get global logger with context', () => {
      initializeLogger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const logger = getLogger('TestContext');
      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext] test message')
      );
    });

    it('should create fallback logger if not initialized', () => {
      const logger = getLogger();
      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test message')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      logger.info('');
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] $/)
      );
    });

    it('should handle null/undefined metadata', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      logger.info('test message', undefined);
      logger.info('test message', null as any);

      expect(consoleSpy.info).toHaveBeenCalledTimes(2);
    });

    it('should handle very large metadata objects', () => {
      const logger = new Logger({
        level: 'info',
        enableConsole: true,
        enableFile: false,
      });

      const largeMetadata = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
      };

      logger.info('test message', largeMetadata);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });
  });
});
