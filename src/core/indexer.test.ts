/**
 * @file Unit tests for core indexer functionality
 * Tests initialization, configuration handling, error recovery, and phase execution
 */

import { jest } from '@jest/globals';
import { Indexer, IndexingOptions } from './indexer';
import { PhaseManager, PhaseManagerOptions, IndexingResult } from './PhaseManager';
import { ConfigManager } from '../config';
import { Logger } from '../utils/logger';

// Mock dependencies
jest.mock('./PhaseManager');
jest.mock('../config');
jest.mock('../utils/logger');
jest.mock('../utils/error-handling');

// Mock external dependencies that cause ES module issues
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  env: {
    allowLocalModels: false,
    allowRemoteModels: true,
  },
}));

// Mock the embedding service and other modules that depend on transformers
jest.mock('../modules/embedding-service');
jest.mock('../core/indexing/EmbeddingExtractor');
jest.mock('../core/indexing/SummaryExtractor');
jest.mock('../core/indexing/AstExtractor');
jest.mock('../core/indexing/GitExtractor');
jest.mock('../core/indexing/FileDiscovery');
jest.mock('../core/indexing/NodeCreator');
jest.mock('../core/indexing/IndexingStrategy');

const MockedPhaseManager = PhaseManager as jest.MockedClass<typeof PhaseManager>;
const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;

describe('Indexer', () => {
  let indexer: Indexer;
  let mockPhaseManager: jest.Mocked<PhaseManager>;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockLogger: jest.Mocked<Logger>;

  const testProjectRoot = '/test/project';

  const mockIndexingResult: IndexingResult = {
    totalNodes: 100,
    totalEdges: 50,
    processedFiles: 25,
    isIncremental: false,
    duration: 5000,
    phases: [
      {
        phase: 1,
        name: 'data_discovery',
        duration: 1000,
        itemsProcessed: 25,
        fromCache: false,
      },
      {
        phase: 2,
        name: 'structure_extraction',
        duration: 2000,
        itemsProcessed: 100,
        fromCache: false,
      },
    ],
    errors: [],
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockConfig = new MockedConfigManager(testProjectRoot) as jest.Mocked<ConfigManager>;
    
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
      operation: jest.fn(),
      performance: jest.fn(),
      level: 'info',
      enableConsole: true,
      enableFile: false,
      shouldLog: jest.fn().mockReturnValue(true),
      writeLog: jest.fn(),
      formatLogEntry: jest.fn(),
      safeStringify: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Mock getLogger to return our mock logger
    const { getLogger } = require('../utils/logger');
    (getLogger as jest.Mock).mockReturnValue(mockLogger);

    // Setup PhaseManager mock methods
    mockPhaseManager = {
      initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      executePhases: jest.fn<(options?: PhaseManagerOptions) => Promise<IndexingResult>>().mockResolvedValue(mockIndexingResult),
      cleanup: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PhaseManager>;

    // Mock the PhaseManager constructor to return our mock instance
    MockedPhaseManager.mockImplementation(() => mockPhaseManager);

    // Create indexer instance
    indexer = new Indexer(testProjectRoot, mockConfig);
  });

  describe('Constructor', () => {
    it('should initialize with project root and config', () => {
      expect(indexer).toBeInstanceOf(Indexer);
      expect(MockedPhaseManager).toHaveBeenCalledWith(testProjectRoot, mockConfig);
    });

    it('should create logger with correct name', () => {
      const { getLogger } = require('../utils/logger');
      expect(getLogger).toHaveBeenCalledWith('Indexer');
    });
  });

  describe('run method', () => {
    describe('successful execution', () => {
      beforeEach(() => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);
      });

      it('should execute complete indexing pipeline with default options', async () => {
        const result = await indexer.run();

        expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith({
          runPhases: undefined,
          fromPhase: undefined,
          forcePhases: undefined,
          inspectPhase: undefined,
          showStatus: undefined,
          skipAISummary: undefined,
          skipEmbeddings: undefined,
          dryRun: undefined,
        });
        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
        expect(result).toEqual(mockIndexingResult);
      });

      it('should pass indexing options to phase manager correctly', async () => {
        const options: IndexingOptions = {
          forceFullIndex: true,
          skipAISummary: true,
          skipEmbeddings: false,
          dryRun: true,
          runPhases: [1, 2],
          fromPhase: 2,
          forcePhases: [1],
          inspectPhase: 3,
          showStatus: true,
        };

        await indexer.run(options);

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith({
          runPhases: [1, 2],
          fromPhase: 2,
          forcePhases: [1],
          inspectPhase: 3,
          showStatus: true,
          skipAISummary: true,
          skipEmbeddings: false,
          dryRun: true,
        });
      });

      it('should log start and completion messages', async () => {
        const startTime = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(startTime);

        await indexer.run();

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Starting hikma-engine indexing pipeline',
          expect.objectContaining({
            projectRoot: testProjectRoot,
            options: {},
            startTime,
          })
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Indexing pipeline completed successfully',
          expect.objectContaining({
            totalNodes: 100,
            totalEdges: 50,
            processedFiles: 25,
            phases: expect.arrayContaining([
              expect.objectContaining({
                phase: 1,
                name: 'data_discovery',
              }),
            ]),
          })
        );
      });

      it('should sanitize result for logging by removing verbose data fields', async () => {
        const resultWithData: IndexingResult = {
          ...mockIndexingResult,
          phases: [
            {
              phase: 1,
              name: 'data_discovery',
              duration: 1000,
              itemsProcessed: 25,
              fromCache: false,
              data: { largeDataObject: 'should be removed from logs' },
            },
          ],
        };

        mockPhaseManager.executePhases.mockResolvedValue(resultWithData);

        await indexer.run();

        // Verify that the logged result doesn't contain the data field
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Indexing pipeline completed successfully',
          expect.objectContaining({
            phases: [
              expect.not.objectContaining({
                data: expect.anything(),
              }),
            ],
          })
        );
      });
    });

    describe('error handling', () => {
      it('should handle initialization errors', async () => {
        const initError = new Error('Initialization failed');
        mockPhaseManager.initialize.mockRejectedValue(initError);

        await expect(indexer.run()).rejects.toThrow('Initialization failed');

        expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.executePhases).not.toHaveBeenCalled();
        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
      });

      it('should handle phase execution errors', async () => {
        const phaseError = new Error('Phase execution failed');
        mockPhaseManager.executePhases.mockRejectedValue(phaseError);

        await expect(indexer.run()).rejects.toThrow('Phase execution failed');

        expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.executePhases).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
      });

      it('should log errors with proper context', async () => {
        const testError = new Error('Test error message');
        mockPhaseManager.executePhases.mockRejectedValue(testError);

        // Mock the error handling utilities
        const { logError, getErrorMessage } = require('../utils/error-handling');
        (getErrorMessage as jest.Mock).mockReturnValue('Test error message');

        await expect(indexer.run()).rejects.toThrow('Test error message');

        expect(logError).toHaveBeenCalledWith(
          mockLogger,
          'Indexing pipeline failed',
          testError
        );
      });

      it('should ensure cleanup is called even when errors occur', async () => {
        const initError = new Error('Init failed');
        mockPhaseManager.initialize.mockRejectedValue(initError);

        await expect(indexer.run()).rejects.toThrow();

        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
      });

      it('should handle cleanup errors gracefully', async () => {
        const cleanupError = new Error('Cleanup failed');
        mockPhaseManager.cleanup.mockRejectedValue(cleanupError);
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        // Cleanup errors should be thrown since they're in finally block
        await expect(indexer.run()).rejects.toThrow('Cleanup failed');
        
        // But the main execution should have completed first
        expect(mockPhaseManager.executePhases).toHaveBeenCalledTimes(1);
      });
    });

    describe('options processing and validation', () => {
      it('should handle empty options object', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        await indexer.run({});

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith({
          runPhases: undefined,
          fromPhase: undefined,
          forcePhases: undefined,
          inspectPhase: undefined,
          showStatus: undefined,
          skipAISummary: undefined,
          skipEmbeddings: undefined,
          dryRun: undefined,
        });
      });

      it('should handle partial options', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        const partialOptions: IndexingOptions = {
          skipAISummary: true,
          dryRun: false,
        };

        await indexer.run(partialOptions);

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith({
          runPhases: undefined,
          fromPhase: undefined,
          forcePhases: undefined,
          inspectPhase: undefined,
          showStatus: undefined,
          skipAISummary: true,
          skipEmbeddings: undefined,
          dryRun: false,
        });
      });

      it('should handle all boolean options correctly', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        const booleanOptions: IndexingOptions = {
          forceFullIndex: true,
          skipAISummary: false,
          skipEmbeddings: true,
          dryRun: false,
          showStatus: true,
        };

        await indexer.run(booleanOptions);

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith(
          expect.objectContaining({
            skipAISummary: false,
            skipEmbeddings: true,
            dryRun: false,
            showStatus: true,
          })
        );
      });

      it('should handle array options correctly', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        const arrayOptions: IndexingOptions = {
          runPhases: [1, 3, 4],
          forcePhases: [2],
        };

        await indexer.run(arrayOptions);

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith(
          expect.objectContaining({
            runPhases: [1, 3, 4],
            forcePhases: [2],
          })
        );
      });

      it('should handle numeric options correctly', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        const numericOptions: IndexingOptions = {
          fromPhase: 2,
          inspectPhase: 3,
        };

        await indexer.run(numericOptions);

        expect(mockPhaseManager.executePhases).toHaveBeenCalledWith(
          expect.objectContaining({
            fromPhase: 2,
            inspectPhase: 3,
          })
        );
      });
    });

    describe('phase manager interaction', () => {
      it('should call phase manager methods in correct order', async () => {
        mockPhaseManager.executePhases.mockResolvedValue(mockIndexingResult);

        await indexer.run();

        const initializeCall = mockPhaseManager.initialize.mock.invocationCallOrder[0];
        const executePhasesCall = mockPhaseManager.executePhases.mock.invocationCallOrder[0];
        const cleanupCall = mockPhaseManager.cleanup.mock.invocationCallOrder[0];

        expect(initializeCall).toBeLessThan(executePhasesCall);
        expect(executePhasesCall).toBeLessThan(cleanupCall);
      });

      it('should not call executePhases if initialization fails', async () => {
        mockPhaseManager.initialize.mockRejectedValue(new Error('Init failed'));

        await expect(indexer.run()).rejects.toThrow();

        expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.executePhases).not.toHaveBeenCalled();
        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
      });

      it('should call cleanup even if executePhases fails', async () => {
        mockPhaseManager.executePhases.mockRejectedValue(new Error('Execution failed'));

        await expect(indexer.run()).rejects.toThrow();

        expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.executePhases).toHaveBeenCalledTimes(1);
        expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(1);
      });
    });

    describe('result handling', () => {
      it('should return the exact result from phase manager', async () => {
        const customResult: IndexingResult = {
          totalNodes: 200,
          totalEdges: 150,
          processedFiles: 50,
          isIncremental: true,
          duration: 10000,
          phases: [],
          errors: ['warning message'],
        };

        mockPhaseManager.executePhases.mockResolvedValue(customResult);

        const result = await indexer.run();

        expect(result).toEqual(customResult);
        expect(result).toBe(customResult); // Should be the exact same object
      });

      it('should handle results with no phases', async () => {
        const emptyResult: IndexingResult = {
          totalNodes: 0,
          totalEdges: 0,
          processedFiles: 0,
          isIncremental: false,
          duration: 100,
          phases: [],
          errors: [],
        };

        mockPhaseManager.executePhases.mockResolvedValue(emptyResult);

        const result = await indexer.run();

        expect(result).toEqual(emptyResult);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Indexing pipeline completed successfully',
          expect.objectContaining({
            phases: [],
          })
        );
      });

      it('should handle results with errors', async () => {
        const resultWithErrors: IndexingResult = {
          totalNodes: 50,
          totalEdges: 25,
          processedFiles: 10,
          isIncremental: false,
          duration: 3000,
          phases: [],
          errors: ['Error 1', 'Error 2'],
        };

        mockPhaseManager.executePhases.mockResolvedValue(resultWithErrors);

        const result = await indexer.run();

        expect(result).toEqual(resultWithErrors);
        expect(result.errors).toEqual(['Error 1', 'Error 2']);
      });
    });
  });

  describe('error recovery', () => {
    it('should maintain error state across multiple runs', async () => {
      // First run fails
      const firstError = new Error('First error');
      mockPhaseManager.executePhases.mockRejectedValueOnce(firstError);

      await expect(indexer.run()).rejects.toThrow('First error');

      // Second run succeeds
      const successResult: IndexingResult = {
        totalNodes: 10,
        totalEdges: 5,
        processedFiles: 2,
        isIncremental: false,
        duration: 1000,
        phases: [],
        errors: [],
      };
      mockPhaseManager.executePhases.mockResolvedValue(successResult);

      const result = await indexer.run();
      expect(result).toEqual(successResult);
    });

    it('should handle multiple consecutive errors', async () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      mockPhaseManager.executePhases
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2);

      await expect(indexer.run()).rejects.toThrow('Error 1');
      await expect(indexer.run()).rejects.toThrow('Error 2');

      expect(mockPhaseManager.initialize).toHaveBeenCalledTimes(2);
      expect(mockPhaseManager.cleanup).toHaveBeenCalledTimes(2);
    });
  });

  describe('logging functionality', () => {
    beforeEach(() => {
      mockPhaseManager.executePhases.mockResolvedValue({
        totalNodes: 0,
        totalEdges: 0,
        processedFiles: 0,
        isIncremental: false,
        duration: 0,
        phases: [],
        errors: [],
      });
    });

    it('should log with correct context information', async () => {
      const options: IndexingOptions = {
        skipAISummary: true,
        dryRun: true,
      };

      const startTime = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(startTime);

      await indexer.run(options);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting hikma-engine indexing pipeline',
        {
          projectRoot: testProjectRoot,
          options,
          startTime,
        }
      );
    });

    it('should use the correct logger instance', () => {
      const { getLogger } = require('../utils/logger');
      
      // Create a new indexer to trigger logger creation
      new Indexer('/another/path', mockConfig);

      expect(getLogger).toHaveBeenCalledWith('Indexer');
    });

    it('should log completion with sanitized results', async () => {
      const resultWithVerboseData: IndexingResult = {
        totalNodes: 5,
        totalEdges: 3,
        processedFiles: 2,
        isIncremental: false,
        duration: 500,
        phases: [
          {
            phase: 1,
            name: 'test_phase',
            duration: 500,
            itemsProcessed: 2,
            fromCache: false,
            data: {
              largeObject: { /* large data */ },
              files: ['file1.ts', 'file2.ts'],
            },
          },
        ],
        errors: [],
      };

      mockPhaseManager.executePhases.mockResolvedValue(resultWithVerboseData);

      await indexer.run();

      // Verify the logged result has data removed from phases
      const loggedResult = mockLogger.info.mock.calls.find(
        (call: any) => call[0] === 'Indexing pipeline completed successfully'
      )?.[1];

      expect(loggedResult).toBeDefined();
      if (loggedResult) {
        expect(loggedResult.phases[0]).not.toHaveProperty('data');
        expect(loggedResult.phases[0]).toEqual({
          phase: 1,
          name: 'test_phase',
          duration: 500,
          itemsProcessed: 2,
          fromCache: false,
        });
      }
    });
  });
});
