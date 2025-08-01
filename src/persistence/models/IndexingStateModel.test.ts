/**
 * @file Unit tests for IndexingStateModel class
 * Tests state tracking and status update functionality
 */

import { IndexingStateModel } from './IndexingStateModel';
import { IndexingStateDTO } from './IndexingStateDTO';

describe('IndexingStateModel', () => {
  let indexingStateDto: IndexingStateDTO;
  let indexingStateModel: IndexingStateModel;

  beforeEach(() => {
    indexingStateDto = new IndexingStateDTO(
      'indexing-state-1',
      'last_indexed_commit',
      'abc123def456'
    );
    
    indexingStateModel = new IndexingStateModel(indexingStateDto);
  });

  describe('constructor', () => {
    it('should initialize with provided IndexingStateDTO', () => {
      expect(indexingStateModel).toBeInstanceOf(IndexingStateModel);
      expect(indexingStateModel.getDto()).toBe(indexingStateDto);
    });

    it('should inherit all properties from DTO through BaseModel', () => {
      const dto = indexingStateModel.getDto();
      expect(dto.id).toBe('indexing-state-1');
      expect(dto.key).toBe('last_indexed_commit');
      expect(dto.value).toBe('abc123def456');
    });

    it('should handle different state keys', () => {
      const testCases = [
        { key: 'last_indexed_commit', value: 'commit-hash-123' },
        { key: 'indexing_progress', value: '75' },
        { key: 'last_error', value: 'Connection timeout' },
        { key: 'total_files_processed', value: '1250' },
        { key: 'indexing_start_time', value: '2024-01-15T10:30:00Z' },
        { key: 'current_phase', value: 'embedding_generation' }
      ];

      testCases.forEach((testCase, index) => {
        const dto = new IndexingStateDTO(
          `state-${index}`,
          testCase.key,
          testCase.value
        );
        const model = new IndexingStateModel(dto);
        
        expect(model.getDto().key).toBe(testCase.key);
        expect(model.getDto().value).toBe(testCase.value);
      });
    });
  });

  describe('state tracking functionality', () => {
    it('should track commit hash state', () => {
      const commitDto = new IndexingStateDTO(
        'commit-state',
        'last_indexed_commit',
        'a1b2c3d4e5f6'
      );
      const commitModel = new IndexingStateModel(commitDto);
      
      expect(commitModel.getDto().key).toBe('last_indexed_commit');
      expect(commitModel.getDto().value).toBe('a1b2c3d4e5f6');
    });

    it('should track indexing progress state', () => {
      const progressDto = new IndexingStateDTO(
        'progress-state',
        'indexing_progress',
        JSON.stringify({
          totalFiles: 1000,
          processedFiles: 750,
          percentage: 75,
          currentFile: 'src/components/Header.tsx'
        })
      );
      const progressModel = new IndexingStateModel(progressDto);
      
      expect(progressModel.getDto().key).toBe('indexing_progress');
      
      const progressData = JSON.parse(progressModel.getDto().value);
      expect(progressData.totalFiles).toBe(1000);
      expect(progressData.processedFiles).toBe(750);
      expect(progressData.percentage).toBe(75);
    });

    it('should track error state', () => {
      const errorDto = new IndexingStateDTO(
        'error-state',
        'last_error',
        JSON.stringify({
          timestamp: '2024-01-15T10:30:00Z',
          error: 'Database connection failed',
          phase: 'data_persistence',
          file: 'src/large-file.ts',
          retryCount: 3
        })
      );
      const errorModel = new IndexingStateModel(errorDto);
      
      expect(errorModel.getDto().key).toBe('last_error');
      
      const errorData = JSON.parse(errorModel.getDto().value);
      expect(errorData.error).toBe('Database connection failed');
      expect(errorData.phase).toBe('data_persistence');
      expect(errorData.retryCount).toBe(3);
    });

    it('should track phase-specific statistics', () => {
      const statsDto = new IndexingStateDTO(
        'stats-state',
        'phase_statistics',
        JSON.stringify({
          file_discovery: {
            duration: 1500,
            filesFound: 2500,
            filesFiltered: 2000
          },
          ast_parsing: {
            duration: 45000,
            filesProcessed: 2000,
            nodesExtracted: 15000
          },
          embedding_generation: {
            duration: 120000,
            embeddingsGenerated: 15000,
            batchSize: 32
          }
        })
      );
      const statsModel = new IndexingStateModel(statsDto);
      
      expect(statsModel.getDto().key).toBe('phase_statistics');
      
      const stats = JSON.parse(statsModel.getDto().value);
      expect(stats.file_discovery.filesFound).toBe(2500);
      expect(stats.ast_parsing.nodesExtracted).toBe(15000);
      expect(stats.embedding_generation.embeddingsGenerated).toBe(15000);
    });

    it('should track configuration state', () => {
      const configDto = new IndexingStateDTO(
        'config-state',
        'indexing_configuration',
        JSON.stringify({
          batchSize: 100,
          maxFileSize: 1048576, // 1MB
          excludePatterns: ['node_modules/**', '*.log'],
          includePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
          embeddingModel: 'all-MiniLM-L6-v2',
          vectorDimensions: 384
        })
      );
      const configModel = new IndexingStateModel(configDto);
      
      expect(configModel.getDto().key).toBe('indexing_configuration');
      
      const config = JSON.parse(configModel.getDto().value);
      expect(config.batchSize).toBe(100);
      expect(config.embeddingModel).toBe('all-MiniLM-L6-v2');
      expect(config.vectorDimensions).toBe(384);
    });
  });

  describe('status update functionality', () => {
    it('should handle status updates through DTO modification', () => {
      const dto = indexingStateModel.getDto();
      const originalValue = dto.value;
      
      // Simulate status update
      dto.value = 'new-commit-hash-789';
      dto.updated_at = new Date().toISOString();
      
      expect(indexingStateModel.getDto().value).toBe('new-commit-hash-789');
      expect(indexingStateModel.getDto().value).not.toBe(originalValue);
      expect(indexingStateModel.getDto().updated_at).toBeDefined();
    });

    it('should handle complex state updates', () => {
      const progressDto = new IndexingStateDTO(
        'progress-update',
        'indexing_progress',
        JSON.stringify({ processed: 100, total: 1000 })
      );
      const progressModel = new IndexingStateModel(progressDto);
      
      // Update progress
      const newProgress = { processed: 500, total: 1000, currentPhase: 'embedding' };
      progressModel.getDto().value = JSON.stringify(newProgress);
      
      const updatedProgress = JSON.parse(progressModel.getDto().value);
      expect(updatedProgress.processed).toBe(500);
      expect(updatedProgress.currentPhase).toBe('embedding');
    });

    it('should handle timestamp updates', () => {
      const timestampDto = new IndexingStateDTO(
        'timestamp-state',
        'last_update_time',
        '2024-01-15T10:00:00Z'
      );
      const timestampModel = new IndexingStateModel(timestampDto);
      
      const newTimestamp = '2024-01-15T11:00:00Z';
      timestampModel.getDto().value = newTimestamp;
      
      expect(timestampModel.getDto().value).toBe(newTimestamp);
    });

    it('should handle incremental counter updates', () => {
      const counterDto = new IndexingStateDTO(
        'counter-state',
        'files_processed_count',
        '0'
      );
      const counterModel = new IndexingStateModel(counterDto);
      
      // Simulate incremental updates
      for (let i = 1; i <= 10; i++) {
        counterModel.getDto().value = i.toString();
        expect(parseInt(counterModel.getDto().value)).toBe(i);
      }
    });

    it('should handle boolean state updates', () => {
      const booleanDto = new IndexingStateDTO(
        'boolean-state',
        'indexing_in_progress',
        'false'
      );
      const booleanModel = new IndexingStateModel(booleanDto);
      
      // Start indexing
      booleanModel.getDto().value = 'true';
      expect(booleanModel.getDto().value).toBe('true');
      
      // Complete indexing
      booleanModel.getDto().value = 'false';
      expect(booleanModel.getDto().value).toBe('false');
    });
  });

  describe('key-value pair management', () => {
    it('should handle various key formats', () => {
      const keyFormats = [
        'simple_key',
        'camelCaseKey',
        'kebab-case-key',
        'UPPER_CASE_KEY',
        'mixed_Format-Key123',
        'key.with.dots',
        'key:with:colons'
      ];

      keyFormats.forEach((key, index) => {
        const dto = new IndexingStateDTO(
          `key-format-${index}`,
          key,
          `value-for-${key}`
        );
        const model = new IndexingStateModel(dto);
        
        expect(model.getDto().key).toBe(key);
        expect(model.getDto().value).toBe(`value-for-${key}`);
      });
    });

    it('should handle various value types as strings', () => {
      const valueTypes = [
        { key: 'string_value', value: 'simple string' },
        { key: 'number_value', value: '12345' },
        { key: 'float_value', value: '123.45' },
        { key: 'boolean_value', value: 'true' },
        { key: 'json_value', value: JSON.stringify({ nested: 'object' }) },
        { key: 'array_value', value: JSON.stringify([1, 2, 3]) },
        { key: 'null_value', value: 'null' },
        { key: 'empty_value', value: '' }
      ];

      valueTypes.forEach((testCase, index) => {
        const dto = new IndexingStateDTO(
          `value-type-${index}`,
          testCase.key,
          testCase.value
        );
        const model = new IndexingStateModel(dto);
        
        expect(model.getDto().key).toBe(testCase.key);
        expect(model.getDto().value).toBe(testCase.value);
        expect(typeof model.getDto().value).toBe('string');
      });
    });

    it('should handle long keys and values', () => {
      const longKey = 'very_long_key_name_that_exceeds_normal_length_' + 'x'.repeat(100);
      const longValue = 'very long value content that contains a lot of text and data ' + 'y'.repeat(1000);
      
      const dto = new IndexingStateDTO(
        'long-content',
        longKey,
        longValue
      );
      const model = new IndexingStateModel(dto);
      
      expect(model.getDto().key).toBe(longKey);
      expect(model.getDto().value).toBe(longValue);
      expect(model.getDto().key.length).toBeGreaterThan(100);
      expect(model.getDto().value.length).toBeGreaterThan(1000);
    });

    it('should handle special characters in keys and values', () => {
      const specialKey = 'key_with_special_chars_!@#$%^&*()';
      const specialValue = 'value with special chars: 你好, 🌍, "quotes", \'apostrophes\', <tags>';
      
      const dto = new IndexingStateDTO(
        'special-chars',
        specialKey,
        specialValue
      );
      const model = new IndexingStateModel(dto);
      
      expect(model.getDto().key).toBe(specialKey);
      expect(model.getDto().value).toBe(specialValue);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(indexingStateModel.getTableName()).toBe('indexing_state');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new IndexingStateDTO(
        'another-state',
        'another_key',
        'another_value'
      );
      const anotherModel = new IndexingStateModel(anotherDto);
      
      expect(indexingStateModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = indexingStateModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        key: 'TEXT NOT NULL',
        value: 'TEXT NOT NULL',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should mark key and value as NOT NULL', () => {
      const schema = indexingStateModel.getSchema();
      
      expect(schema.key).toContain('NOT NULL');
      expect(schema.value).toContain('NOT NULL');
    });

    it('should include primary key constraint', () => {
      const schema = indexingStateModel.getSchema();
      
      expect(schema.id).toContain('PRIMARY KEY');
    });

    it('should include timestamp fields', () => {
      const schema = indexingStateModel.getSchema();
      
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });

    it('should use appropriate types for fields', () => {
      const schema = indexingStateModel.getSchema();
      
      expect(schema.id).toContain('TEXT');
      expect(schema.key).toContain('TEXT');
      expect(schema.value).toContain('TEXT');
      expect(schema.created_at).toContain('DATETIME');
      expect(schema.updated_at).toContain('DATETIME');
    });
  });

  describe('inheritance from BaseModel', () => {
    it('should inherit getId method', () => {
      expect(indexingStateModel.getId()).toBe('indexing-state-1');
    });

    it('should inherit getDto method', () => {
      const dto = indexingStateModel.getDto();
      expect(dto).toBe(indexingStateDto);
      expect(dto).toBeInstanceOf(IndexingStateDTO);
    });

    it('should maintain DTO reference integrity', () => {
      const dto1 = indexingStateModel.getDto();
      const dto2 = indexingStateModel.getDto();
      expect(dto1).toBe(dto2);
    });

    it('should reflect DTO changes immediately', () => {
      const originalKey = indexingStateModel.getDto().key;
      
      // Modify DTO
      indexingStateModel.getDto().key = 'modified_key';
      
      expect(indexingStateModel.getDto().key).toBe('modified_key');
      expect(indexingStateModel.getDto().key).not.toBe(originalKey);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty key and value', () => {
      const emptyDto = new IndexingStateDTO(
        'empty-state',
        '',
        ''
      );
      const emptyModel = new IndexingStateModel(emptyDto);
      
      expect(emptyModel.getDto().key).toBe('');
      expect(emptyModel.getDto().value).toBe('');
    });

    it('should handle whitespace-only key and value', () => {
      const whitespaceDto = new IndexingStateDTO(
        'whitespace-state',
        '   ',
        '   '
      );
      const whitespaceModel = new IndexingStateModel(whitespaceDto);
      
      expect(whitespaceModel.getDto().key).toBe('   ');
      expect(whitespaceModel.getDto().value).toBe('   ');
    });

    it('should handle newlines in values', () => {
      const multilineValue = `line 1
line 2
line 3`;
      
      const multilineDto = new IndexingStateDTO(
        'multiline-state',
        'multiline_key',
        multilineValue
      );
      const multilineModel = new IndexingStateModel(multilineDto);
      
      expect(multilineModel.getDto().value).toBe(multilineValue);
      expect(multilineModel.getDto().value.split('\n')).toHaveLength(3);
    });

    it('should handle very large JSON values', () => {
      const largeObject = {
        data: new Array(1000).fill(0).map((_, i) => ({
          id: i,
          name: `item-${i}`,
          value: Math.random()
        }))
      };
      
      const largeDto = new IndexingStateDTO(
        'large-state',
        'large_json_data',
        JSON.stringify(largeObject)
      );
      const largeModel = new IndexingStateModel(largeDto);
      
      const parsedData = JSON.parse(largeModel.getDto().value);
      expect(parsedData.data).toHaveLength(1000);
      expect(parsedData.data[0].id).toBe(0);
      expect(parsedData.data[999].id).toBe(999);
    });

    it('should handle malformed JSON values gracefully', () => {
      const malformedDto = new IndexingStateDTO(
        'malformed-state',
        'malformed_json',
        '{"incomplete": json'
      );
      const malformedModel = new IndexingStateModel(malformedDto);
      
      // Model should still be created, validation would happen at persistence layer
      expect(malformedModel.getDto().value).toBe('{"incomplete": json');
    });
  });

  describe('model state consistency', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = indexingStateModel.getId();
      const initialKey = indexingStateModel.getDto().key;
      const initialValue = indexingStateModel.getDto().value;
      
      // State should remain consistent
      expect(indexingStateModel.getId()).toBe(initialId);
      expect(indexingStateModel.getDto().key).toBe(initialKey);
      expect(indexingStateModel.getDto().value).toBe(initialValue);
    });

    it('should handle concurrent state updates', () => {
      const dto = indexingStateModel.getDto();
      
      // Simulate concurrent updates
      dto.key = 'updated_key_1';
      dto.value = 'updated_value_1';
      
      expect(indexingStateModel.getDto().key).toBe('updated_key_1');
      expect(indexingStateModel.getDto().value).toBe('updated_value_1');
      
      dto.key = 'updated_key_2';
      dto.value = 'updated_value_2';
      
      expect(indexingStateModel.getDto().key).toBe('updated_key_2');
      expect(indexingStateModel.getDto().value).toBe('updated_value_2');
    });

    it('should handle timestamp updates correctly', () => {
      const dto = indexingStateModel.getDto();
      const originalUpdatedAt = dto.updated_at;
      
      // Simulate timestamp update with a specific different timestamp
      const newTimestamp = '2024-01-15T11:00:00Z';
      dto.updated_at = newTimestamp;
      
      expect(indexingStateModel.getDto().updated_at).toBe(newTimestamp);
      expect(indexingStateModel.getDto().updated_at).not.toBe(originalUpdatedAt);
    });
  });

  describe('common indexing state scenarios', () => {
    it('should handle repository indexing progress tracking', () => {
      const progressDto = new IndexingStateDTO(
        'repo-progress',
        'repository_indexing_progress',
        JSON.stringify({
          repositoryId: 'repo-123',
          phase: 'ast_parsing',
          totalFiles: 500,
          processedFiles: 250,
          currentFile: 'src/components/App.tsx',
          startTime: '2024-01-15T10:00:00Z',
          estimatedCompletion: '2024-01-15T10:30:00Z'
        })
      );
      const progressModel = new IndexingStateModel(progressDto);
      
      const progress = JSON.parse(progressModel.getDto().value);
      expect(progress.repositoryId).toBe('repo-123');
      expect(progress.phase).toBe('ast_parsing');
      expect(progress.processedFiles / progress.totalFiles).toBe(0.5);
    });

    it('should handle error recovery state', () => {
      const errorDto = new IndexingStateDTO(
        'error-recovery',
        'indexing_error_recovery',
        JSON.stringify({
          lastError: 'Database connection timeout',
          errorTime: '2024-01-15T10:15:00Z',
          retryCount: 2,
          maxRetries: 5,
          nextRetryTime: '2024-01-15T10:20:00Z',
          recoveryStrategy: 'exponential_backoff'
        })
      );
      const errorModel = new IndexingStateModel(errorDto);
      
      const errorState = JSON.parse(errorModel.getDto().value);
      expect(errorState.retryCount).toBeLessThan(errorState.maxRetries);
      expect(errorState.recoveryStrategy).toBe('exponential_backoff');
    });

    it('should handle incremental indexing state', () => {
      const incrementalDto = new IndexingStateDTO(
        'incremental-state',
        'incremental_indexing_state',
        JSON.stringify({
          lastIndexedCommit: 'abc123',
          newCommits: ['def456', 'ghi789'],
          changedFiles: ['src/index.ts', 'src/utils.ts'],
          deletedFiles: ['src/old-file.ts'],
          incrementalMode: true,
          fullIndexRequired: false
        })
      );
      const incrementalModel = new IndexingStateModel(incrementalDto);
      
      const incrementalState = JSON.parse(incrementalModel.getDto().value);
      expect(incrementalState.incrementalMode).toBe(true);
      expect(incrementalState.newCommits).toHaveLength(2);
      expect(incrementalState.changedFiles).toContain('src/index.ts');
    });
  });
});
