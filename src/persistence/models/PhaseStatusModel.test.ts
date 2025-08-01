/**
 * @file Unit tests for PhaseStatusModel class
 * Tests phase status tracking, transitions, and specialized model behavior
 */

import { PhaseStatusModel } from './PhaseStatusModel';
import { PhaseStatusDTO, PhaseStatus } from './PhaseStatusDTO';

describe('PhaseStatusModel', () => {
  let phaseStatusDto: PhaseStatusDTO;
  let phaseStatusModel: PhaseStatusModel;

  beforeEach(() => {
    phaseStatusDto = new PhaseStatusDTO(
      'phase-status-1',
      'repo-123',
      'file_discovery',
      'pending'
    );
    
    phaseStatusModel = new PhaseStatusModel(phaseStatusDto);
  });

  describe('constructor', () => {
    it('should initialize with provided PhaseStatusDTO', () => {
      expect(phaseStatusModel).toBeInstanceOf(PhaseStatusModel);
      expect(phaseStatusModel.getDto()).toBe(phaseStatusDto);
    });

    it('should inherit all properties from DTO through BaseModel', () => {
      const dto = phaseStatusModel.getDto();
      expect(dto.id).toBe('phase-status-1');
      expect(dto.repo_id).toBe('repo-123');
      expect(dto.phase_name).toBe('file_discovery');
      expect(dto.status).toBe('pending');
    });

    it('should handle all valid phase statuses', () => {
      const validStatuses: PhaseStatus[] = ['pending', 'running', 'completed', 'failed'];
      
      validStatuses.forEach((status, index) => {
        const dto = new PhaseStatusDTO(
          `phase-${index}`,
          'repo-123',
          'test_phase',
          status
        );
        const model = new PhaseStatusModel(dto);
        
        expect(model.getDto().status).toBe(status);
      });
    });

    it('should handle different phase names', () => {
      const phaseNames = [
        'file_discovery',
        'ast_parsing',
        'git_analysis',
        'embedding_generation',
        'summary_generation',
        'data_persistence',
        'vector_indexing'
      ];

      phaseNames.forEach((phaseName, index) => {
        const dto = new PhaseStatusDTO(
          `phase-${index}`,
          'repo-123',
          phaseName,
          'pending'
        );
        const model = new PhaseStatusModel(dto);
        
        expect(model.getDto().phase_name).toBe(phaseName);
      });
    });
  });

  describe('phase status tracking', () => {
    it('should track pending phase status', () => {
      const pendingDto = new PhaseStatusDTO(
        'pending-phase',
        'repo-456',
        'file_discovery',
        'pending'
      );
      const pendingModel = new PhaseStatusModel(pendingDto);
      
      expect(pendingModel.getDto().status).toBe('pending');
      expect(pendingModel.getDto().started_at).toBeUndefined();
      expect(pendingModel.getDto().completed_at).toBeUndefined();
    });

    it('should track running phase status', () => {
      const runningDto = new PhaseStatusDTO(
        'running-phase',
        'repo-456',
        'ast_parsing',
        'running'
      );
      runningDto.started_at = '2024-01-15T10:00:00Z';
      
      const runningModel = new PhaseStatusModel(runningDto);
      
      expect(runningModel.getDto().status).toBe('running');
      expect(runningModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(runningModel.getDto().completed_at).toBeUndefined();
    });

    it('should track completed phase status', () => {
      const completedDto = new PhaseStatusDTO(
        'completed-phase',
        'repo-456',
        'embedding_generation',
        'completed'
      );
      completedDto.started_at = '2024-01-15T10:00:00Z';
      completedDto.completed_at = '2024-01-15T10:30:00Z';
      
      const completedModel = new PhaseStatusModel(completedDto);
      
      expect(completedModel.getDto().status).toBe('completed');
      expect(completedModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(completedModel.getDto().completed_at).toBe('2024-01-15T10:30:00Z');
    });

    it('should track failed phase status', () => {
      const failedDto = new PhaseStatusDTO(
        'failed-phase',
        'repo-456',
        'data_persistence',
        'failed'
      );
      failedDto.started_at = '2024-01-15T10:00:00Z';
      failedDto.completed_at = '2024-01-15T10:15:00Z';
      
      const failedModel = new PhaseStatusModel(failedDto);
      
      expect(failedModel.getDto().status).toBe('failed');
      expect(failedModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(failedModel.getDto().completed_at).toBe('2024-01-15T10:15:00Z');
    });
  });

  describe('phase status transitions', () => {
    it('should handle pending to running transition', () => {
      const dto = phaseStatusModel.getDto();
      
      // Start the phase
      dto.status = 'running';
      dto.started_at = '2024-01-15T10:00:00Z';
      
      expect(phaseStatusModel.getDto().status).toBe('running');
      expect(phaseStatusModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(phaseStatusModel.getDto().completed_at).toBeUndefined();
    });

    it('should handle running to completed transition', () => {
      const dto = phaseStatusModel.getDto();
      
      // Start the phase
      dto.status = 'running';
      dto.started_at = '2024-01-15T10:00:00Z';
      
      // Complete the phase
      dto.status = 'completed';
      dto.completed_at = '2024-01-15T10:30:00Z';
      
      expect(phaseStatusModel.getDto().status).toBe('completed');
      expect(phaseStatusModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(phaseStatusModel.getDto().completed_at).toBe('2024-01-15T10:30:00Z');
    });

    it('should handle running to failed transition', () => {
      const dto = phaseStatusModel.getDto();
      
      // Start the phase
      dto.status = 'running';
      dto.started_at = '2024-01-15T10:00:00Z';
      
      // Fail the phase
      dto.status = 'failed';
      dto.completed_at = '2024-01-15T10:15:00Z';
      
      expect(phaseStatusModel.getDto().status).toBe('failed');
      expect(phaseStatusModel.getDto().started_at).toBe('2024-01-15T10:00:00Z');
      expect(phaseStatusModel.getDto().completed_at).toBe('2024-01-15T10:15:00Z');
    });

    it('should handle phase restart (failed to pending)', () => {
      const dto = phaseStatusModel.getDto();
      
      // Set to failed state
      dto.status = 'failed';
      dto.started_at = '2024-01-15T10:00:00Z';
      dto.completed_at = '2024-01-15T10:15:00Z';
      
      // Restart the phase
      dto.status = 'pending';
      dto.started_at = undefined;
      dto.completed_at = undefined;
      
      expect(phaseStatusModel.getDto().status).toBe('pending');
      expect(phaseStatusModel.getDto().started_at).toBeUndefined();
      expect(phaseStatusModel.getDto().completed_at).toBeUndefined();
    });
  });

  describe('commit hash tracking', () => {
    it('should track commit hash for phase execution', () => {
      const dto = phaseStatusModel.getDto();
      dto.commit_hash = 'abc123def456';
      
      expect(phaseStatusModel.getDto().commit_hash).toBe('abc123def456');
    });

    it('should handle different commit hash formats', () => {
      const commitHashes = [
        'abc123def456',
        'a1b2c3d4e5f6789012345678901234567890abcd',
        'short123',
        'very-long-commit-hash-with-special-characters-123456789'
      ];

      commitHashes.forEach((commitHash, index) => {
        const dto = new PhaseStatusDTO(
          `commit-${index}`,
          'repo-123',
          'test_phase',
          'pending'
        );
        dto.commit_hash = commitHash;
        
        const model = new PhaseStatusModel(dto);
        
        expect(model.getDto().commit_hash).toBe(commitHash);
      });
    });

    it('should handle null commit hash', () => {
      const dto = phaseStatusModel.getDto();
      dto.commit_hash = undefined;
      
      expect(phaseStatusModel.getDto().commit_hash).toBeUndefined();
    });
  });

  describe('phase statistics tracking', () => {
    it('should track basic phase statistics', () => {
      const stats = {
        filesProcessed: 150,
        nodesExtracted: 1200,
        duration: 45000,
        memoryUsed: 256000000
      };
      
      const dto = phaseStatusModel.getDto();
      dto.stats = JSON.stringify(stats);
      
      const parsedStats = JSON.parse(phaseStatusModel.getDto().stats!);
      expect(parsedStats.filesProcessed).toBe(150);
      expect(parsedStats.nodesExtracted).toBe(1200);
      expect(parsedStats.duration).toBe(45000);
    });

    it('should track file discovery statistics', () => {
      const fileDiscoveryStats = {
        totalFilesFound: 2500,
        filteredFiles: 2000,
        excludedFiles: 500,
        supportedLanguages: ['typescript', 'javascript', 'python'],
        largestFile: 'src/large-component.tsx',
        largestFileSize: 1048576,
        averageFileSize: 15000
      };
      
      const dto = new PhaseStatusDTO(
        'file-discovery-stats',
        'repo-123',
        'file_discovery',
        'completed'
      );
      dto.stats = JSON.stringify(fileDiscoveryStats);
      
      const model = new PhaseStatusModel(dto);
      const parsedStats = JSON.parse(model.getDto().stats!);
      
      expect(parsedStats.totalFilesFound).toBe(2500);
      expect(parsedStats.supportedLanguages).toContain('typescript');
      expect(parsedStats.largestFileSize).toBe(1048576);
    });

    it('should track AST parsing statistics', () => {
      const astStats = {
        filesProcessed: 2000,
        functionsExtracted: 8000,
        classesExtracted: 1500,
        variablesExtracted: 12000,
        importsExtracted: 5000,
        parseErrors: 25,
        averageParseTime: 150,
        totalParseTime: 300000
      };
      
      const dto = new PhaseStatusDTO(
        'ast-parsing-stats',
        'repo-123',
        'ast_parsing',
        'completed'
      );
      dto.stats = JSON.stringify(astStats);
      
      const model = new PhaseStatusModel(dto);
      const parsedStats = JSON.parse(model.getDto().stats!);
      
      expect(parsedStats.functionsExtracted).toBe(8000);
      expect(parsedStats.parseErrors).toBe(25);
      expect(parsedStats.totalParseTime).toBe(300000);
    });

    it('should track embedding generation statistics', () => {
      const embeddingStats = {
        nodesProcessed: 15000,
        embeddingsGenerated: 14950,
        batchSize: 32,
        totalBatches: 468,
        averageBatchTime: 2500,
        failedEmbeddings: 50,
        embeddingDimensions: 384,
        modelUsed: 'all-MiniLM-L6-v2'
      };
      
      const dto = new PhaseStatusDTO(
        'embedding-stats',
        'repo-123',
        'embedding_generation',
        'completed'
      );
      dto.stats = JSON.stringify(embeddingStats);
      
      const model = new PhaseStatusModel(dto);
      const parsedStats = JSON.parse(model.getDto().stats!);
      
      expect(parsedStats.embeddingsGenerated).toBe(14950);
      expect(parsedStats.embeddingDimensions).toBe(384);
      expect(parsedStats.modelUsed).toBe('all-MiniLM-L6-v2');
    });

    it('should track error statistics for failed phases', () => {
      const errorStats = {
        errorType: 'DatabaseConnectionError',
        errorMessage: 'Connection timeout after 30 seconds',
        errorCount: 3,
        firstErrorTime: '2024-01-15T10:05:00Z',
        lastErrorTime: '2024-01-15T10:15:00Z',
        retryAttempts: 2,
        partialProgress: {
          filesProcessed: 500,
          totalFiles: 2000
        }
      };
      
      const dto = new PhaseStatusDTO(
        'error-stats',
        'repo-123',
        'data_persistence',
        'failed'
      );
      dto.stats = JSON.stringify(errorStats);
      
      const model = new PhaseStatusModel(dto);
      const parsedStats = JSON.parse(model.getDto().stats!);
      
      expect(parsedStats.errorType).toBe('DatabaseConnectionError');
      expect(parsedStats.retryAttempts).toBe(2);
      expect(parsedStats.partialProgress.filesProcessed).toBe(500);
    });

    it('should handle null statistics', () => {
      const dto = phaseStatusModel.getDto();
      dto.stats = undefined;
      
      expect(phaseStatusModel.getDto().stats).toBeUndefined();
    });

    it('should handle empty statistics object', () => {
      const dto = phaseStatusModel.getDto();
      dto.stats = JSON.stringify({});
      
      const parsedStats = JSON.parse(phaseStatusModel.getDto().stats!);
      expect(parsedStats).toEqual({});
    });
  });

  describe('repository and phase identification', () => {
    it('should handle different repository ID formats', () => {
      const repoIds = [
        'repo-123',
        'repository_456',
        'github.com/user/repo',
        'uuid-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'simple-repo-name'
      ];

      repoIds.forEach((repoId, index) => {
        const dto = new PhaseStatusDTO(
          `phase-${index}`,
          repoId,
          'test_phase',
          'pending'
        );
        const model = new PhaseStatusModel(dto);
        
        expect(model.getDto().repo_id).toBe(repoId);
      });
    });

    it('should handle complex phase names', () => {
      const phaseNames = [
        'file_discovery_with_filtering',
        'ast_parsing_typescript_only',
        'embedding_generation_batch_32',
        'vector_indexing_with_compression',
        'incremental_update_phase',
        'error_recovery_phase'
      ];

      phaseNames.forEach((phaseName, index) => {
        const dto = new PhaseStatusDTO(
          `phase-${index}`,
          'repo-123',
          phaseName,
          'pending'
        );
        const model = new PhaseStatusModel(dto);
        
        expect(model.getDto().phase_name).toBe(phaseName);
      });
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(phaseStatusModel.getTableName()).toBe('phase_status');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new PhaseStatusDTO(
        'another-phase',
        'another-repo',
        'another_phase',
        'pending'
      );
      const anotherModel = new PhaseStatusModel(anotherDto);
      
      expect(phaseStatusModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        repo_id: 'TEXT NOT NULL',
        phase_name: 'TEXT NOT NULL',
        status: "TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed'))",
        started_at: 'DATETIME',
        completed_at: 'DATETIME',
        commit_hash: 'TEXT',
        stats: 'TEXT',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'UNIQUE(repo_id, phase_name)': '',
        'FOREIGN KEY (repo_id)': 'REFERENCES repositories(id) ON DELETE CASCADE'
      });
    });

    it('should include status constraint with valid values', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema.status).toContain("CHECK (status IN ('pending', 'running', 'completed', 'failed'))");
    });

    it('should include unique constraint for repo_id and phase_name', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema['UNIQUE(repo_id, phase_name)']).toBe('');
    });

    it('should include foreign key constraint for repo_id', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema['FOREIGN KEY (repo_id)']).toBe('REFERENCES repositories(id) ON DELETE CASCADE');
    });

    it('should mark required fields as NOT NULL', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema.id).toContain('PRIMARY KEY');
      expect(schema.repo_id).toContain('NOT NULL');
      expect(schema.phase_name).toContain('NOT NULL');
      expect(schema.status).toContain('NOT NULL');
    });

    it('should allow optional fields to be nullable', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema.started_at).toBe('DATETIME');
      expect(schema.completed_at).toBe('DATETIME');
      expect(schema.commit_hash).toBe('TEXT');
      expect(schema.stats).toBe('TEXT');
    });

    it('should include timestamp fields', () => {
      const schema = phaseStatusModel.getSchema();
      
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('inheritance from BaseModel', () => {
    it('should inherit getId method', () => {
      expect(phaseStatusModel.getId()).toBe('phase-status-1');
    });

    it('should inherit getDto method', () => {
      const dto = phaseStatusModel.getDto();
      expect(dto).toBe(phaseStatusDto);
      expect(dto).toBeInstanceOf(PhaseStatusDTO);
    });

    it('should maintain DTO reference integrity', () => {
      const dto1 = phaseStatusModel.getDto();
      const dto2 = phaseStatusModel.getDto();
      expect(dto1).toBe(dto2);
    });

    it('should reflect DTO changes immediately', () => {
      const originalStatus = phaseStatusModel.getDto().status;
      
      // Modify DTO
      phaseStatusModel.getDto().status = 'running';
      
      expect(phaseStatusModel.getDto().status).toBe('running');
      expect(phaseStatusModel.getDto().status).not.toBe(originalStatus);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very long phase names', () => {
      const longPhaseName = 'very_long_phase_name_that_exceeds_normal_length_' + 'x'.repeat(100);
      
      const dto = new PhaseStatusDTO(
        'long-phase-name',
        'repo-123',
        longPhaseName,
        'pending'
      );
      const model = new PhaseStatusModel(dto);
      
      expect(model.getDto().phase_name).toBe(longPhaseName);
      expect(model.getDto().phase_name.length).toBeGreaterThan(100);
    });

    it('should handle special characters in phase names', () => {
      const specialPhaseName = 'phase_with_special_chars_!@#$%^&*()';
      
      const dto = new PhaseStatusDTO(
        'special-phase',
        'repo-123',
        specialPhaseName,
        'pending'
      );
      const model = new PhaseStatusModel(dto);
      
      expect(model.getDto().phase_name).toBe(specialPhaseName);
    });

    it('should handle malformed statistics JSON gracefully', () => {
      const dto = phaseStatusModel.getDto();
      dto.stats = 'invalid-json-string';
      
      // Model should still be created, validation would happen at persistence layer
      expect(phaseStatusModel.getDto().stats).toBe('invalid-json-string');
    });

    it('should handle very large statistics objects', () => {
      const largeStats = {
        fileDetails: new Array(1000).fill(0).map((_, i) => ({
          path: `src/file-${i}.ts`,
          size: Math.floor(Math.random() * 100000),
          processed: true
        }))
      };
      
      const dto = phaseStatusModel.getDto();
      dto.stats = JSON.stringify(largeStats);
      
      const parsedStats = JSON.parse(phaseStatusModel.getDto().stats!);
      expect(parsedStats.fileDetails).toHaveLength(1000);
    });

    it('should handle invalid timestamp formats', () => {
      const dto = phaseStatusModel.getDto();
      dto.started_at = 'invalid-timestamp';
      dto.completed_at = 'another-invalid-timestamp';
      
      // Model should still be created, validation would happen at persistence layer
      expect(phaseStatusModel.getDto().started_at).toBe('invalid-timestamp');
      expect(phaseStatusModel.getDto().completed_at).toBe('another-invalid-timestamp');
    });
  });

  describe('model state consistency', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = phaseStatusModel.getId();
      const initialRepoId = phaseStatusModel.getDto().repo_id;
      const initialPhaseName = phaseStatusModel.getDto().phase_name;
      const initialStatus = phaseStatusModel.getDto().status;
      
      // State should remain consistent
      expect(phaseStatusModel.getId()).toBe(initialId);
      expect(phaseStatusModel.getDto().repo_id).toBe(initialRepoId);
      expect(phaseStatusModel.getDto().phase_name).toBe(initialPhaseName);
      expect(phaseStatusModel.getDto().status).toBe(initialStatus);
    });

    it('should handle complex phase lifecycle', () => {
      const dto = phaseStatusModel.getDto();
      
      // Start phase
      dto.status = 'running';
      dto.started_at = '2024-01-15T10:00:00Z';
      dto.commit_hash = 'abc123';
      
      expect(dto.status).toBe('running');
      expect(dto.started_at).toBe('2024-01-15T10:00:00Z');
      
      // Update progress
      dto.stats = JSON.stringify({ progress: 50 });
      expect(JSON.parse(dto.stats!).progress).toBe(50);
      
      // Complete phase
      dto.status = 'completed';
      dto.completed_at = '2024-01-15T10:30:00Z';
      dto.stats = JSON.stringify({ progress: 100, duration: 1800000 });
      
      expect(dto.status).toBe('completed');
      expect(dto.completed_at).toBe('2024-01-15T10:30:00Z');
      expect(JSON.parse(dto.stats!).duration).toBe(1800000);
    });

    it('should handle timestamp updates correctly', () => {
      const dto = phaseStatusModel.getDto();
      const originalUpdatedAt = dto.updated_at;
      
      // Simulate timestamp update with a specific different timestamp
      const newTimestamp = '2024-01-15T11:00:00Z';
      dto.updated_at = newTimestamp;
      
      expect(phaseStatusModel.getDto().updated_at).toBe(newTimestamp);
      expect(phaseStatusModel.getDto().updated_at).not.toBe(originalUpdatedAt);
    });
  });

  describe('common phase status scenarios', () => {
    it('should handle complete indexing pipeline status tracking', () => {
      const phases = [
        'file_discovery',
        'ast_parsing',
        'git_analysis',
        'embedding_generation',
        'summary_generation',
        'data_persistence',
        'vector_indexing'
      ];

      const phaseModels = phases.map((phase, index) => {
        const dto = new PhaseStatusDTO(
          `pipeline-${index}`,
          'repo-pipeline-test',
          phase,
          index < 3 ? 'completed' : index === 3 ? 'running' : 'pending'
        );
        
        if (index < 3) {
          dto.started_at = `2024-01-15T10:${index.toString().padStart(2, '0')}:00Z`;
          dto.completed_at = `2024-01-15T10:${(index + 1).toString().padStart(2, '0')}:00Z`;
        } else if (index === 3) {
          dto.started_at = `2024-01-15T10:03:00Z`;
        }
        
        return new PhaseStatusModel(dto);
      });

      // Verify pipeline state
      expect(phaseModels[0].getDto().status).toBe('completed');
      expect(phaseModels[1].getDto().status).toBe('completed');
      expect(phaseModels[2].getDto().status).toBe('completed');
      expect(phaseModels[3].getDto().status).toBe('running');
      expect(phaseModels[4].getDto().status).toBe('pending');
    });

    it('should handle phase retry scenarios', () => {
      const retryDto = new PhaseStatusDTO(
        'retry-phase',
        'repo-retry-test',
        'embedding_generation',
        'failed'
      );
      retryDto.started_at = '2024-01-15T10:00:00Z';
      retryDto.completed_at = '2024-01-15T10:15:00Z';
      retryDto.stats = JSON.stringify({
        error: 'Rate limit exceeded',
        retryCount: 1,
        nextRetryTime: '2024-01-15T10:20:00Z'
      });
      
      const retryModel = new PhaseStatusModel(retryDto);
      
      // Simulate retry
      const dto = retryModel.getDto();
      dto.status = 'running';
      dto.started_at = '2024-01-15T10:20:00Z';
      dto.completed_at = undefined;
      
      const retryStats = JSON.parse(dto.stats!);
      retryStats.retryCount = 2;
      dto.stats = JSON.stringify(retryStats);
      
      expect(dto.status).toBe('running');
      expect(JSON.parse(dto.stats!).retryCount).toBe(2);
    });
  });
});
