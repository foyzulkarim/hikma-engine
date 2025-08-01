/**
 * @file Unit tests for RepositoryModel class
 * Tests repository model functionality including schema definition, table naming, and data validation
 */

import { RepositoryModel } from './RepositoryModel';
import { RepositoryDTO } from './RepositoryDTO';

describe('RepositoryModel', () => {
  let repositoryDto: RepositoryDTO;
  let repositoryModel: RepositoryModel;

  beforeEach(() => {
    repositoryDto = new RepositoryDTO(
      'repo-123',
      '/path/to/repository',
      'test-repository'
    );
    repositoryModel = new RepositoryModel(repositoryDto);
  });

  describe('constructor', () => {
    it('should initialize with provided RepositoryDTO', () => {
      expect(repositoryModel).toBeInstanceOf(RepositoryModel);
      expect(repositoryModel.getDto()).toBe(repositoryDto);
    });

    it('should inherit from BaseModel', () => {
      expect(repositoryModel.getId()).toBe('repo-123');
      expect(repositoryModel.getDto()).toBeInstanceOf(RepositoryDTO);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(repositoryModel.getTableName()).toBe('repositories');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new RepositoryDTO('repo-456', '/another/path', 'another-repo');
      const anotherModel = new RepositoryModel(anotherDto);
      
      expect(repositoryModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = repositoryModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        repo_path: 'TEXT NOT NULL',
        repo_name: 'TEXT NOT NULL',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should include primary key constraint', () => {
      const schema = repositoryModel.getSchema();
      expect(schema.id).toBe('TEXT PRIMARY KEY');
    });

    it('should include NOT NULL constraints for required fields', () => {
      const schema = repositoryModel.getSchema();
      expect(schema.repo_path).toBe('TEXT NOT NULL');
      expect(schema.repo_name).toBe('TEXT NOT NULL');
    });

    it('should include timestamp fields with defaults', () => {
      const schema = repositoryModel.getSchema();
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });

    it('should return schema as object with string values', () => {
      const schema = repositoryModel.getSchema();
      expect(typeof schema).toBe('object');
      Object.values(schema).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('data validation and constraints', () => {
    it('should handle repository with valid data', () => {
      const validDto = new RepositoryDTO(
        'valid-repo-id',
        '/valid/repository/path',
        'valid-repository-name'
      );
      const validModel = new RepositoryModel(validDto);

      expect(validModel.getId()).toBe('valid-repo-id');
      expect(validModel.getDto().repo_path).toBe('/valid/repository/path');
      expect(validModel.getDto().repo_name).toBe('valid-repository-name');
    });

    it('should handle repository with minimal valid data', () => {
      const minimalDto = new RepositoryDTO('min-id', '/', 'r');
      const minimalModel = new RepositoryModel(minimalDto);

      expect(minimalModel.getId()).toBe('min-id');
      expect(minimalModel.getDto().repo_path).toBe('/');
      expect(minimalModel.getDto().repo_name).toBe('r');
    });

    it('should handle repository with long paths and names', () => {
      const longPath = '/very/long/path/to/repository/with/many/nested/directories/and/subdirectories';
      const longName = 'very-long-repository-name-with-many-characters-and-descriptive-text';
      
      const longDto = new RepositoryDTO('long-id', longPath, longName);
      const longModel = new RepositoryModel(longDto);

      expect(longModel.getDto().repo_path).toBe(longPath);
      expect(longModel.getDto().repo_name).toBe(longName);
    });

    it('should handle repository with special characters in path and name', () => {
      const specialPath = '/path/with spaces/and-dashes/and_underscores/and.dots';
      const specialName = 'repo-with_special.chars and spaces';
      
      const specialDto = new RepositoryDTO('special-id', specialPath, specialName);
      const specialModel = new RepositoryModel(specialDto);

      expect(specialModel.getDto().repo_path).toBe(specialPath);
      expect(specialModel.getDto().repo_name).toBe(specialName);
    });

    it('should handle repository with Unicode characters', () => {
      const unicodePath = '/路径/with/中文/characters';
      const unicodeName = '测试仓库-with-unicode-🚀';
      
      const unicodeDto = new RepositoryDTO('unicode-id', unicodePath, unicodeName);
      const unicodeModel = new RepositoryModel(unicodeDto);

      expect(unicodeModel.getDto().repo_path).toBe(unicodePath);
      expect(unicodeModel.getDto().repo_name).toBe(unicodeName);
    });
  });

  describe('model property access', () => {
    it('should provide access to repository path', () => {
      expect(repositoryModel.getDto().repo_path).toBe('/path/to/repository');
    });

    it('should provide access to repository name', () => {
      expect(repositoryModel.getDto().repo_name).toBe('test-repository');
    });

    it('should provide access to timestamps', () => {
      const dto = repositoryModel.getDto();
      expect(dto.created_at).toBeDefined();
      expect(dto.updated_at).toBeDefined();
      expect(typeof dto.created_at).toBe('string');
      expect(typeof dto.updated_at).toBe('string');
    });

    it('should allow property modifications through DTO', () => {
      const dto = repositoryModel.getDto();
      dto.repo_path = '/new/path';
      dto.repo_name = 'new-name';

      expect(repositoryModel.getDto().repo_path).toBe('/new/path');
      expect(repositoryModel.getDto().repo_name).toBe('new-name');
    });
  });

  describe('model lifecycle and state management', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = repositoryModel.getId();
      const initialPath = repositoryModel.getDto().repo_path;
      const initialName = repositoryModel.getDto().repo_name;
      const initialTableName = repositoryModel.getTableName();
      const initialSchema = repositoryModel.getSchema();

      // State should remain consistent
      expect(repositoryModel.getId()).toBe(initialId);
      expect(repositoryModel.getDto().repo_path).toBe(initialPath);
      expect(repositoryModel.getDto().repo_name).toBe(initialName);
      expect(repositoryModel.getTableName()).toBe(initialTableName);
      expect(repositoryModel.getSchema()).toEqual(initialSchema);
    });

    it('should reflect DTO changes immediately', () => {
      const originalPath = repositoryModel.getDto().repo_path;
      const originalName = repositoryModel.getDto().repo_name;

      // Modify DTO
      repositoryModel.getDto().repo_path = '/modified/path';
      repositoryModel.getDto().repo_name = 'modified-name';

      expect(repositoryModel.getDto().repo_path).toBe('/modified/path');
      expect(repositoryModel.getDto().repo_name).toBe('modified-name');
      expect(repositoryModel.getDto().repo_path).not.toBe(originalPath);
      expect(repositoryModel.getDto().repo_name).not.toBe(originalName);
    });

    it('should handle timestamp updates', () => {
      const dto = repositoryModel.getDto();
      const originalUpdatedAt = dto.updated_at;

      // Update timestamp to a specific different value
      const newTimestamp = '2023-12-25T10:30:00.000Z';
      dto.updated_at = newTimestamp;

      expect(repositoryModel.getDto().updated_at).toBe(newTimestamp);
      expect(repositoryModel.getDto().updated_at).not.toBe(originalUpdatedAt);
      expect(repositoryModel.getDto().updated_at).toBeDefined();
    });
  });

  describe('serialization and data transfer', () => {
    it('should be JSON serializable', () => {
      const dto = repositoryModel.getDto();
      const jsonString = JSON.stringify(dto);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe(dto.id);
      expect(parsed.repo_path).toBe(dto.repo_path);
      expect(parsed.repo_name).toBe(dto.repo_name);
      expect(parsed.created_at).toBe(dto.created_at);
      expect(parsed.updated_at).toBe(dto.updated_at);
    });

    it('should preserve all properties during serialization', () => {
      const dto = repositoryModel.getDto();
      const serialized = JSON.stringify(dto);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual({
        id: dto.id,
        repo_path: dto.repo_path,
        repo_name: dto.repo_name,
        created_at: dto.created_at,
        updated_at: dto.updated_at
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty string values', () => {
      const emptyDto = new RepositoryDTO('empty-id', '', '');
      const emptyModel = new RepositoryModel(emptyDto);

      expect(emptyModel.getId()).toBe('empty-id');
      expect(emptyModel.getDto().repo_path).toBe('');
      expect(emptyModel.getDto().repo_name).toBe('');
    });

    it('should handle very long ID strings', () => {
      const longId = 'a'.repeat(1000);
      const longIdDto = new RepositoryDTO(longId, '/path', 'name');
      const longIdModel = new RepositoryModel(longIdDto);

      expect(longIdModel.getId()).toBe(longId);
      expect(longIdModel.getId().length).toBe(1000);
    });

    it('should handle special characters in ID', () => {
      const specialId = 'repo-id-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const specialDto = new RepositoryDTO(specialId, '/path', 'name');
      const specialModel = new RepositoryModel(specialDto);

      expect(specialModel.getId()).toBe(specialId);
    });
  });

  describe('schema validation and database constraints', () => {
    it('should define schema that enforces data integrity', () => {
      const schema = repositoryModel.getSchema();

      // Primary key constraint
      expect(schema.id).toContain('PRIMARY KEY');

      // NOT NULL constraints for required fields
      expect(schema.repo_path).toContain('NOT NULL');
      expect(schema.repo_name).toContain('NOT NULL');

      // Timestamp defaults
      expect(schema.created_at).toContain('DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toContain('DEFAULT CURRENT_TIMESTAMP');
    });

    it('should have schema compatible with SQLite', () => {
      const schema = repositoryModel.getSchema();

      // Check SQLite data types
      expect(schema.id).toContain('TEXT');
      expect(schema.repo_path).toContain('TEXT');
      expect(schema.repo_name).toContain('TEXT');
      expect(schema.created_at).toContain('DATETIME');
      expect(schema.updated_at).toContain('DATETIME');
    });

    it('should define all required columns', () => {
      const schema = repositoryModel.getSchema();
      const requiredColumns = ['id', 'repo_path', 'repo_name', 'created_at', 'updated_at'];

      requiredColumns.forEach(column => {
        expect(schema).toHaveProperty(column);
        expect(typeof schema[column]).toBe('string');
      });
    });
  });

  describe('model comparison and equality', () => {
    it('should support model comparison by ID', () => {
      const dto1 = new RepositoryDTO('same-id', '/path1', 'name1');
      const dto2 = new RepositoryDTO('same-id', '/path2', 'name2');
      const model1 = new RepositoryModel(dto1);
      const model2 = new RepositoryModel(dto2);

      expect(model1.getId()).toBe(model2.getId());
    });

    it('should distinguish different models by ID', () => {
      const dto1 = new RepositoryDTO('id-1', '/path', 'name');
      const dto2 = new RepositoryDTO('id-2', '/path', 'name');
      const model1 = new RepositoryModel(dto1);
      const model2 = new RepositoryModel(dto2);

      expect(model1.getId()).not.toBe(model2.getId());
    });

    it('should handle model cloning through DTO', () => {
      const originalDto = repositoryModel.getDto();
      const clonedDto = new RepositoryDTO(
        originalDto.id,
        originalDto.repo_path,
        originalDto.repo_name
      );
      const clonedModel = new RepositoryModel(clonedDto);

      expect(clonedModel.getId()).toBe(repositoryModel.getId());
      expect(clonedModel.getDto().repo_path).toBe(repositoryModel.getDto().repo_path);
      expect(clonedModel.getDto().repo_name).toBe(repositoryModel.getDto().repo_name);
      expect(clonedModel.getDto()).not.toBe(repositoryModel.getDto()); // Different instances
    });
  });
});
