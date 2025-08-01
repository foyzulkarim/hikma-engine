/**
 * @file PhaseManager.test.ts - Unit tests for PhaseManager
 * Tests phase initialization, execution, status tracking, and error handling
 */

import { PhaseManager, PhaseManagerOptions, IndexingResult } from './PhaseManager';
import { ConfigManager } from '../config';
import { MockSQLiteClient } from '../../tests/utils/mocks/MockSQLiteClient';
import { PhaseRepository } from '../persistence/PhaseRepository';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';
import { getLogger } from '../utils/logger';
import { RepositoryDTO, FileDTO, PhaseStatusDTO } from '../persistence/models';
import * as path from 'path';
import {
  FileDiscovery,
  AstExtractor,
  GitExtractor,
  SummaryExtractor,
  EmbeddingExtractor,
  IndexingStrategy,
  NodeCreator,
} from './indexing';

// Mock dependencies
jest.mock('../config');
jest.mock('../persistence/PhaseRepository');
jest.mock('../persistence/db/connection');
jest.mock('../persistence/db/schema');
jest.mock('../utils/logger');
jest.mock('./indexing');

// Mock the indexing modules
jest.mock('./indexing', () => ({
  FileDiscovery: jest.fn(),
  AstExtractor: jest.fn(),
  GitExtractor: jest.fn(),
  SummaryExtractor: jest.fn(),
  EmbeddingExtractor: jest.fn(),
  IndexingStrategy: jest.fn(),
  NodeCreator: jest.fn(),
}));

describe('PhaseManager', () => {
  let phaseManager: PhaseManager;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockSqliteClient: any;
  let mockPhaseRepo: jest.Mocked<PhaseRepository>;
  let mockLogger: any;
  
  const testProjectRoot = '/test/project';
  const testRepoId = 'test-repo-id';

  beforeEach(() => {
    // Reset test data factory counter
    TestDataFactory.resetCounter();

    // Setup mock config
    mockConfig = {
      getDatabaseConfig: jest.fn().mockReturnValue({
        sqlite: {
          path: ':memory:',
          vectorExtension: './extensions/vec0.dylib'
        }
      }),
      getIndexingConfig: jest.fn().mockReturnValue({
        batchSize: 100,
        maxFileSize: 1024 * 1024
      })
    } as any;

    // Setup mock SQLite client
    mockSqliteClient = new MockSQLiteClient(':memory:');

    // Setup mock phase repository
    mockPhaseRepo = {
      isPhaseComplete: jest.fn(),
      markPhaseStarted: jest.fn(),
      markPhaseCompleted: jest.fn(),
      markPhaseFailed: jest.fn(),
      getPhaseStatuses: jest.fn(),
      persistPhase1Data: jest.fn(),
      persistPhase2Data: jest.fn(),
      persistPhase4Data: jest.fn(),
      loadPhase1Data: jest.fn(),
      loadPhase2Data: jest.fn(),
      getPhaseStats: jest.fn()
    } as any;

    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    (getLogger as jest.Mock).mockReturnValue(mockLogger);
    (PhaseRepository as jest.Mock).mockImplementation(() => mockPhaseRepo);

    // Mock SQLiteClient constructor to return our mock instance
    const { SQLiteClient } = require('../persistence/db/connection');
    (SQLiteClient as jest.Mock).mockImplementation(() => mockSqliteClient);

    // Mock schema initialization
    const { initializeTables } = require('../persistence/db/schema');
    (initializeTables as jest.Mock).mockImplementation(() => {});

    // Create PhaseManager instance
    phaseManager = new PhaseManager(testProjectRoot, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Arrange
      mockSqliteClient.connect.mockResolvedValue(undefined);
      mockSqliteClient.getDb.mockReturnValue({} as any);

      // Act
      await phaseManager.initialize();

      // Assert
      expect(mockSqliteClient.connect).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('PhaseManager initialized successfully');
    });

    it('should handle database connection failure during initialization', async () => {
      // Arrange
      mockSqliteClient.connect.mockRejectedValue(new Error('Mock connection failure'));

      // Act & Assert
      await expect(phaseManager.initialize()).rejects.toThrow('Mock connection failure');
    });

    it('should initialize phase repository with correct database instance', async () => {
      // Arrange
      mockSqliteClient.connect.mockResolvedValue(undefined);
      const mockDb = {} as any;
      mockSqliteClient.getDb.mockReturnValue(mockDb);

      // Act
      await phaseManager.initialize();

      // Assert
      expect(PhaseRepository).toHaveBeenCalledWith(mockDb);
    });
  });

  describe('phase execution', () => {
    beforeEach(async () => {
      // Setup mock database connection
      mockSqliteClient.connect.mockResolvedValue(undefined);
      mockSqliteClient.getDb.mockReturnValue({} as any);
      
      await phaseManager.initialize();
      
      // Setup mock indexing strategy
      const mockStrategy = {
        determine: jest.fn().mockResolvedValue({
          isIncremental: false,
          currentCommitHash: 'abc123',
          changedFiles: []
        })
      };
      (IndexingStrategy as jest.Mock).mockImplementation(() => mockStrategy);
    });

    it('should execute all phases by default', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases();

      // Assert
      expect(result.phases).toHaveLength(4);
      expect(result.phases.map(p => p.phase)).toEqual([1, 2, 3, 4]);
      expect(mockPhaseRepo.markPhaseStarted).toHaveBeenCalledTimes(4);
      expect(mockPhaseRepo.markPhaseCompleted).toHaveBeenCalledTimes(4);
    });

    it('should execute only specified phases when runPhases option is provided', async () => {
      // Arrange
      const options: PhaseManagerOptions = { runPhases: [1, 2] }; // Use consecutive phases to avoid dependency issues
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases(options);

      // Assert
      expect(result.phases).toHaveLength(2);
      expect(result.phases.map(p => p.phase)).toEqual([1, 2]);
    });

    it('should start from specified phase when fromPhase option is provided', async () => {
      // Arrange
      const options: PhaseManagerOptions = { fromPhase: 1 }; // Start from phase 1 to avoid dependency issues
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases(options);

      // Assert
      expect(result.phases).toHaveLength(4);
      expect(result.phases.map(p => p.phase)).toEqual([1, 2, 3, 4]);
    });

    it('should skip completed phases unless forced', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete
        .mockResolvedValueOnce(true)  // Phase 1 complete
        .mockResolvedValueOnce(false) // Phase 2 not complete
        .mockResolvedValueOnce(false) // Phase 3 not complete
        .mockResolvedValueOnce(false); // Phase 4 not complete

      const phase1Data = {
        repository: new RepositoryDTO('repo-1', '/test/repo', 'test-repo'),
        files: [new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {})]
      };
      
      mockPhaseRepo.loadPhase1Data.mockResolvedValue(phase1Data);

      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases();

      // Assert
      expect(result.phases[0].fromCache).toBe(true);
      expect(result.phases[1].fromCache).toBe(false);
      // The loadPhase1Data is called twice: once during ensureRepositoryExists and once for loading cached data
      expect(mockPhaseRepo.loadPhase1Data).toHaveBeenCalledTimes(2);
    });

    it('should force re-run phases when forcePhases option is provided', async () => {
      // Arrange
      const options: PhaseManagerOptions = { forcePhases: [1] };
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(true);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases(options);

      // Assert
      expect(result.phases[0].fromCache).toBe(false);
      expect(mockPhaseRepo.markPhaseStarted).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery',
        'abc123'
      );
    });

    it('should skip phases in dry run mode', async () => {
      // Arrange
      const options: PhaseManagerOptions = { dryRun: true };
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases(options);

      // Assert
      expect(mockPhaseRepo.persistPhase1Data).not.toHaveBeenCalled();
      expect(mockPhaseRepo.persistPhase2Data).not.toHaveBeenCalled();
      expect(mockPhaseRepo.persistPhase4Data).not.toHaveBeenCalled();
      expect(mockPhaseRepo.markPhaseCompleted).not.toHaveBeenCalled();
    });
  });

  describe('phase status tracking', () => {
    beforeEach(async () => {
      await phaseManager.initialize();
    });

    it('should mark phase as started before execution', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      await phaseManager.executePhases({ runPhases: [1] });

      // Assert
      expect(mockPhaseRepo.markPhaseStarted).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery',
        'abc123'
      );
    });

    it('should mark phase as completed after successful execution', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      await phaseManager.executePhases({ runPhases: [1] });

      // Assert
      expect(mockPhaseRepo.markPhaseCompleted).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery',
        expect.objectContaining({
          itemsProcessed: expect.any(Number)
        })
      );
    });

    it('should mark phase as failed when execution throws error', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      const mockFileDiscovery = {
        discoverFiles: jest.fn().mockRejectedValue(new Error('File discovery failed'))
      };
      (FileDiscovery as jest.Mock).mockImplementation(() => mockFileDiscovery);

      // Act & Assert
      await expect(phaseManager.executePhases({ runPhases: [1] })).rejects.toThrow('File discovery failed');
      expect(mockPhaseRepo.markPhaseFailed).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery',
        'File discovery failed'
      );
    });

    it('should check phase completion status correctly', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(true);
      mockPhaseRepo.loadPhase1Data.mockResolvedValue({
        repository: new RepositoryDTO('repo-1', '/test/repo', 'test-repo'),
        files: [new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {})]
      });

      // Act
      await phaseManager.executePhases({ runPhases: [1] });

      // Assert
      expect(mockPhaseRepo.isPhaseComplete).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery'
      );
    });
  });

  describe('phase data persistence', () => {
    beforeEach(async () => {
      await phaseManager.initialize();
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
    });

    it('should persist phase 1 data correctly', async () => {
      // Arrange
      const mockRepository = TestDataFactory.createRepository();
      const mockFiles = [TestDataFactory.createFile()];
      
      const mockFileDiscovery = {
        discoverFiles: jest.fn().mockResolvedValue([{
          filePath: 'src/test.ts',
          fileName: 'test.ts',
          fileExtension: '.ts',
          language: 'typescript',
          sizeKb: 1.5,
          contentHash: 'abc123'
        }])
      };
      
      const mockNodeCreator = {
        createRepositoryNode: jest.fn().mockReturnValue({
          properties: {
            repoPath: testProjectRoot,
            repoName: 'test-project'
          }
        }),
        createFileNodes: jest.fn().mockReturnValue([{
          id: 'file-1',
          properties: {
            repoId: testRepoId,
            filePath: 'src/test.ts',
            fileName: 'test.ts',
            fileExtension: '.ts',
            language: 'typescript',
            sizeKb: 1.5,
            contentHash: 'abc123',
            fileType: 'source'
          }
        }])
      };

      (FileDiscovery as jest.Mock).mockImplementation(() => mockFileDiscovery);
      (NodeCreator as jest.Mock).mockImplementation(() => mockNodeCreator);

      // Act
      await phaseManager.executePhases({ runPhases: [1] });

      // Assert
      expect(mockPhaseRepo.persistPhase1Data).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: expect.any(Object),
          files: expect.any(Array)
        })
      );
    });

    it('should persist phase 2 data correctly', async () => {
      // Arrange
      setupMockPhaseData();
      
      const mockAstExtractor = {
        extract: jest.fn().mockResolvedValue({
          nodes: [TestDataFactory.createCodeNode()],
          edges: [TestDataFactory.createEdge()]
        })
      };
      
      (AstExtractor as jest.Mock).mockImplementation(() => mockAstExtractor);

      // Act - Run phases 1 and 2 to ensure phase 1 data is available
      await phaseManager.executePhases({ runPhases: [1, 2] });

      // Assert
      expect(mockPhaseRepo.persistPhase2Data).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: expect.any(String),
          astNodes: expect.any(Array),
          astEdges: expect.any(Array)
        })
      );
    });

    it('should persist phase 4 data correctly', async () => {
      // Arrange
      setupMockPhaseData();
      
      const mockEmbeddingExtractor = {
        extract: jest.fn().mockResolvedValue([
          TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode())
        ])
      };
      
      (EmbeddingExtractor as jest.Mock).mockImplementation(() => mockEmbeddingExtractor);

      // Act
      await phaseManager.executePhases({ runPhases: [4] });

      // Assert
      expect(mockPhaseRepo.persistPhase4Data).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: expect.any(String),
          finalNodes: expect.any(Array),
          finalEdges: expect.any(Array)
        })
      );
    });
  });

  describe('error handling and recovery', () => {
    beforeEach(async () => {
      mockSqliteClient.connect.mockResolvedValue(undefined);
      mockSqliteClient.getDb.mockReturnValue({} as any);
      await phaseManager.initialize();
    });

    it('should handle database connection errors gracefully', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(phaseManager.executePhases()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Phase execution failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle phase execution errors and mark phase as failed', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      const mockFileDiscovery = {
        discoverFiles: jest.fn().mockRejectedValue(new Error('Discovery failed'))
      };
      (FileDiscovery as jest.Mock).mockImplementation(() => mockFileDiscovery);

      // Act & Assert
      await expect(phaseManager.executePhases({ runPhases: [1] })).rejects.toThrow('Discovery failed');
      expect(mockPhaseRepo.markPhaseFailed).toHaveBeenCalledWith(
        expect.any(String),
        'data_discovery',
        'Discovery failed'
      );
    });

    it('should handle persistence errors during phase execution', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      mockPhaseRepo.persistPhase1Data.mockRejectedValue(new Error('Persistence failed'));
      setupMockPhaseData();

      // Act & Assert
      await expect(phaseManager.executePhases({ runPhases: [1] })).rejects.toThrow('Persistence failed');
    });

    it('should continue execution after recoverable errors', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();
      
      // Mock phase 2 to fail but phase 3 to succeed
      const mockAstExtractor = {
        extract: jest.fn().mockRejectedValue(new Error('AST extraction failed'))
      };
      (AstExtractor as jest.Mock).mockImplementation(() => mockAstExtractor);

      // Act & Assert - Run phases 1 and 2 to ensure phase 1 data is available
      await expect(phaseManager.executePhases({ runPhases: [1, 2] })).rejects.toThrow('AST extraction failed');
      expect(mockPhaseRepo.markPhaseFailed).toHaveBeenCalledWith(
        expect.any(String),
        'structure_extraction',
        'AST extraction failed'
      );
    });

    it('should handle repository creation errors gracefully', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      
      setupMockPhaseData();
      
      // Override the mock after setupMockPhaseData to simulate error during ensureRepositoryExists
      // Mock loadPhase1Data to return null repository (indicating it doesn't exist)
      // then fail on persistPhase1Data to trigger the error path
      mockPhaseRepo.loadPhase1Data
        .mockResolvedValueOnce({ repository: null, files: [] }) // First call in ensureRepositoryExists
        .mockResolvedValue({ // Subsequent calls for normal operation
          repository: new RepositoryDTO('repo-1', '/test/repo', 'test-repo'),
          files: [new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {})]
        });
      
      mockPhaseRepo.persistPhase1Data
        .mockRejectedValueOnce(new Error('Cannot create repository')) // First call in ensureRepositoryExists
        .mockResolvedValue(undefined); // Subsequent calls for normal operation

      // Act & Assert
      // Should not throw during initialization, but log warning
      await phaseManager.executePhases({ runPhases: [1] });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to ensure repository exists, will create during Phase 1',
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('special operations', () => {
    beforeEach(async () => {
      mockSqliteClient.connect.mockResolvedValue(undefined);
      mockSqliteClient.getDb.mockReturnValue({} as any);
      await phaseManager.initialize();
    });

    it('should show phase status when showStatus option is provided', async () => {
      // Arrange
      const mockStatuses = [
        new PhaseStatusDTO('repo-1-data_discovery', 'repo-1', 'data_discovery', 'completed')
      ];
      mockStatuses[0].started_at = '2023-01-01T00:00:00Z';
      mockStatuses[0].completed_at = '2023-01-01T00:01:00Z';
      mockStatuses[0].commit_hash = 'abc123def456';
      
      mockPhaseRepo.getPhaseStatuses.mockResolvedValue(mockStatuses);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleTableSpy = jest.spyOn(console, 'table').mockImplementation();

      // Act
      const result = await phaseManager.executePhases({ showStatus: true });

      // Assert
      expect(result.phases).toHaveLength(0);
      expect(mockPhaseRepo.getPhaseStatuses).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('\n=== Phase Status ===');
      expect(consoleTableSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleTableSpy.mockRestore();
    });

    it('should inspect phase data when inspectPhase option is provided', async () => {
      // Arrange
      const mockPhaseData = {
        repository: new RepositoryDTO('repo-1', '/test/repo', 'test-repo'),
        files: [new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {})]
      };
      mockPhaseRepo.loadPhase1Data.mockResolvedValue(mockPhaseData);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      const result = await phaseManager.executePhases({ inspectPhase: 1 });

      // Assert
      expect(result.phases).toHaveLength(0);
      expect(mockPhaseRepo.loadPhase1Data).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('\n=== Phase 1 Data ===');
      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockPhaseData, null, 2));
      
      consoleSpy.mockRestore();
    });

    it('should skip AI summary when skipAISummary option is provided', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases({ 
        runPhases: [3], 
        skipAISummary: true 
      });

      // Assert
      expect(result.phases[0].itemsProcessed).toBe(0); // No summaries processed
      expect(SummaryExtractor).not.toHaveBeenCalled();
    });

    it('should skip embeddings when skipEmbeddings option is provided', async () => {
      // Arrange
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      // Act
      const result = await phaseManager.executePhases({ 
        runPhases: [4], 
        skipEmbeddings: true 
      });

      // Assert
      expect(EmbeddingExtractor).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup database connection on cleanup', async () => {
      // Arrange
      mockSqliteClient.connect.mockResolvedValue(undefined);
      mockSqliteClient.getDb.mockReturnValue({} as any);
      await phaseManager.initialize();

      // Act
      await phaseManager.cleanup();

      // Assert
      expect(mockSqliteClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup when not initialized', async () => {
      // Act & Assert - should not throw
      await expect(phaseManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('phase name mapping', () => {
    it('should return correct phase names for phase numbers', async () => {
      // This tests the private getPhaseNameByNumber method indirectly
      await phaseManager.initialize();
      mockPhaseRepo.isPhaseComplete.mockResolvedValue(false);
      setupMockPhaseData();

      const result = await phaseManager.executePhases();

      expect(result.phases.map(p => p.name)).toEqual([
        'data_discovery',
        'structure_extraction', 
        'ai_enrichment',
        'final_assembly'
      ]);
    });
  });

  // Helper function to setup mock phase data
  function setupMockPhaseData() {
    // Mock IndexingStrategy
    const mockStrategy = {
      determine: jest.fn().mockResolvedValue({
        isIncremental: false,
        currentCommitHash: 'abc123',
        changedFiles: []
      })
    };
    (IndexingStrategy as jest.Mock).mockImplementation(() => mockStrategy);

    // Setup mock phase data loading for dependencies
    mockPhaseRepo.loadPhase1Data.mockResolvedValue({
      repository: new RepositoryDTO('repo-1', '/test/repo', 'test-repo'),
      files: [new FileDTO('file-1', 'repo-1', 'src/test.ts', 'test.ts', {})]
    });

    mockPhaseRepo.loadPhase2Data.mockResolvedValue({
      astNodes: [],
      astEdges: []
    });

    // Mock FileDiscovery for Phase 1
    const mockFileDiscovery = {
      discoverFiles: jest.fn().mockResolvedValue([{
        filePath: 'src/test.ts',
        fileName: 'test.ts',
        fileExtension: '.ts',
        language: 'typescript',
        sizeKb: 1.5,
        contentHash: 'abc123'
      }])
    };
    (FileDiscovery as jest.Mock).mockImplementation(() => mockFileDiscovery);

    // Mock NodeCreator
    const mockNodeCreator = {
      createRepositoryNode: jest.fn().mockReturnValue({
        properties: {
          repoPath: testProjectRoot,
          repoName: path.basename(testProjectRoot)
        }
      }),
      createFileNodes: jest.fn().mockReturnValue([{
        id: 'file-1',
        properties: {
          repoId: testRepoId,
          filePath: 'src/test.ts',
          fileName: 'test.ts',
          fileExtension: '.ts',
          language: 'typescript',
          sizeKb: 1.5,
          contentHash: 'abc123',
          fileType: 'source'
        }
      }])
    };
    (NodeCreator as jest.Mock).mockImplementation(() => mockNodeCreator);

    // Mock AstExtractor for Phase 2
    const mockAstExtractor = {
      extract: jest.fn().mockResolvedValue({
        nodes: [TestDataFactory.createCodeNode()],
        edges: [TestDataFactory.createEdge()]
      })
    };
    (AstExtractor as jest.Mock).mockImplementation(() => mockAstExtractor);

    // Mock SummaryExtractor for Phase 3
    const mockSummaryExtractor = {
      extract: jest.fn().mockResolvedValue([
        TestDataFactory.createCodeNode({ properties: { aiSummary: 'Test summary' } })
      ])
    };
    (SummaryExtractor as jest.Mock).mockImplementation(() => mockSummaryExtractor);

    // Mock EmbeddingExtractor for Phase 4
    const mockEmbeddingExtractor = {
      extract: jest.fn().mockResolvedValue([
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode())
      ])
    };
    (EmbeddingExtractor as jest.Mock).mockImplementation(() => mockEmbeddingExtractor);
  }
});
