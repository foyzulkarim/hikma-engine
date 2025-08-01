/**
 * @file Unit tests for FileModel class
 * Tests file model functionality including schema definition, constraints, and foreign key relationships
 */

import { FileModel } from './FileModel';
import { FileDTO } from './FileDTO';

describe('FileModel', () => {
  let fileDto: FileDTO;
  let fileModel: FileModel;

  beforeEach(() => {
    fileDto = new FileDTO(
      'file-123',
      'repo-456',
      'src/components/Button.tsx',
      'Button.tsx',
      {
        file_extension: '.tsx',
        language: 'typescript',
        size_kb: 2.5,
        content_hash: 'abc123def456',
        file_type: 'source',
        ai_summary: 'A reusable button component',
        imports: JSON.stringify(['react', 'styled-components']),
        exports: JSON.stringify(['Button', 'ButtonProps'])
      }
    );
    fileModel = new FileModel(fileDto);
  });

  describe('constructor', () => {
    it('should initialize with provided FileDTO', () => {
      expect(fileModel).toBeInstanceOf(FileModel);
      expect(fileModel.getDto()).toBe(fileDto);
    });

    it('should inherit from BaseModel', () => {
      expect(fileModel.getId()).toBe('file-123');
      expect(fileModel.getDto()).toBeInstanceOf(FileDTO);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(fileModel.getTableName()).toBe('files');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new FileDTO('file-789', 'repo-456', 'src/utils.ts', 'utils.ts');
      const anotherModel = new FileModel(anotherDto);
      
      expect(fileModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = fileModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        repo_id: 'TEXT NOT NULL',
        file_path: 'TEXT NOT NULL',
        file_name: 'TEXT NOT NULL',
        file_extension: 'TEXT',
        language: 'TEXT',
        size_kb: 'REAL',
        content_hash: 'TEXT',
        file_type: "TEXT CHECK (file_type IN ('source', 'test', 'config', 'dev', 'vendor'))",
        ai_summary: 'TEXT',
        imports: 'TEXT', // JSON array
        exports: 'TEXT', // JSON array
        content_embedding: 'BLOB', // Vector embedding
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'FOREIGN KEY (repo_id)': 'REFERENCES repositories(id) ON DELETE CASCADE'
      });
    });

    it('should include primary key constraint', () => {
      const schema = fileModel.getSchema();
      expect(schema.id).toBe('TEXT PRIMARY KEY');
    });

    it('should include NOT NULL constraints for required fields', () => {
      const schema = fileModel.getSchema();
      expect(schema.repo_id).toBe('TEXT NOT NULL');
      expect(schema.file_path).toBe('TEXT NOT NULL');
      expect(schema.file_name).toBe('TEXT NOT NULL');
    });

    it('should include foreign key constraint', () => {
      const schema = fileModel.getSchema();
      expect(schema['FOREIGN KEY (repo_id)']).toBe('REFERENCES repositories(id) ON DELETE CASCADE');
    });

    it('should include CHECK constraint for file_type', () => {
      const schema = fileModel.getSchema();
      expect(schema.file_type).toContain('CHECK');
      expect(schema.file_type).toContain("('source', 'test', 'config', 'dev', 'vendor')");
    });

    it('should include BLOB type for vector embedding', () => {
      const schema = fileModel.getSchema();
      expect(schema.content_embedding).toBe('BLOB');
    });

    it('should include REAL type for size_kb', () => {
      const schema = fileModel.getSchema();
      expect(schema.size_kb).toBe('REAL');
    });

    it('should include timestamp fields with defaults', () => {
      const schema = fileModel.getSchema();
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('data validation and constraints', () => {
    it('should handle file with all optional fields', () => {
      const completeDto = new FileDTO(
        'complete-file-id',
        'repo-123',
        'src/complete.ts',
        'complete.ts',
        {
          file_extension: '.ts',
          language: 'typescript',
          size_kb: 5.2,
          content_hash: 'hash123',
          file_type: 'source',
          ai_summary: 'Complete file with all fields',
          imports: JSON.stringify(['lodash', 'moment']),
          exports: JSON.stringify(['CompleteClass', 'helper'])
        }
      );
      const completeModel = new FileModel(completeDto);

      expect(completeModel.getId()).toBe('complete-file-id');
      expect(completeModel.getDto().file_extension).toBe('.ts');
      expect(completeModel.getDto().language).toBe('typescript');
      expect(completeModel.getDto().size_kb).toBe(5.2);
      expect(completeModel.getDto().content_hash).toBe('hash123');
      expect(completeModel.getDto().file_type).toBe('source');
      expect(completeModel.getDto().ai_summary).toBe('Complete file with all fields');
    });

    it('should handle file with minimal required fields only', () => {
      const minimalDto = new FileDTO('min-id', 'repo-id', 'file.js', 'file.js');
      const minimalModel = new FileModel(minimalDto);

      expect(minimalModel.getId()).toBe('min-id');
      expect(minimalModel.getDto().repo_id).toBe('repo-id');
      expect(minimalModel.getDto().file_path).toBe('file.js');
      expect(minimalModel.getDto().file_name).toBe('file.js');
      expect(minimalModel.getDto().file_extension).toBeUndefined();
      expect(minimalModel.getDto().language).toBeUndefined();
      expect(minimalModel.getDto().size_kb).toBeUndefined();
    });

    it('should handle different file types', () => {
      const fileTypes: Array<'source' | 'test' | 'config' | 'dev' | 'vendor'> = 
        ['source', 'test', 'config', 'dev', 'vendor'];

      fileTypes.forEach((type, index) => {
        const dto = new FileDTO(`file-${index}`, 'repo-id', `file-${index}.ts`, `file-${index}.ts`, {
          file_type: type
        });
        const model = new FileModel(dto);

        expect(model.getDto().file_type).toBe(type);
      });
    });

    it('should handle various file extensions and languages', () => {
      const testCases = [
        { ext: '.ts', lang: 'typescript' },
        { ext: '.js', lang: 'javascript' },
        { ext: '.py', lang: 'python' },
        { ext: '.java', lang: 'java' },
        { ext: '.go', lang: 'go' },
        { ext: '.cpp', lang: 'cpp' },
        { ext: '.json', lang: 'json' },
        { ext: '.md', lang: 'markdown' }
      ];

      testCases.forEach((testCase, index) => {
        const dto = new FileDTO(`file-${index}`, 'repo-id', `file${testCase.ext}`, `file${testCase.ext}`, {
          file_extension: testCase.ext,
          language: testCase.lang
        });
        const model = new FileModel(dto);

        expect(model.getDto().file_extension).toBe(testCase.ext);
        expect(model.getDto().language).toBe(testCase.lang);
      });
    });

    it('should handle JSON serialized imports and exports', () => {
      const imports = ['react', 'lodash', '@types/node'];
      const exports = ['Component', 'helper', 'default'];
      
      const dto = new FileDTO('json-file', 'repo-id', 'component.tsx', 'component.tsx', {
        imports: JSON.stringify(imports),
        exports: JSON.stringify(exports)
      });
      const model = new FileModel(dto);

      expect(model.getDto().imports).toBe(JSON.stringify(imports));
      expect(model.getDto().exports).toBe(JSON.stringify(exports));
      
      // Verify JSON can be parsed back
      expect(JSON.parse(model.getDto().imports!)).toEqual(imports);
      expect(JSON.parse(model.getDto().exports!)).toEqual(exports);
    });

    it('should handle various file sizes', () => {
      const sizes = [0, 0.1, 1.5, 10.25, 100.75, 1024.0, 5000.123];
      
      sizes.forEach((size, index) => {
        const dto = new FileDTO(`size-file-${index}`, 'repo-id', 'file.ts', 'file.ts', {
          size_kb: size
        });
        const model = new FileModel(dto);

        expect(model.getDto().size_kb).toBe(size);
      });
    });
  });

  describe('foreign key relationships', () => {
    it('should maintain repository relationship through repo_id', () => {
      expect(fileModel.getDto().repo_id).toBe('repo-456');
    });

    it('should handle different repository IDs', () => {
      const repoIds = ['repo-1', 'repo-2', 'another-repo-id', 'very-long-repository-identifier'];
      
      repoIds.forEach((repoId, index) => {
        const dto = new FileDTO(`file-${index}`, repoId, 'file.ts', 'file.ts');
        const model = new FileModel(dto);

        expect(model.getDto().repo_id).toBe(repoId);
      });
    });

    it('should support cascade delete through foreign key constraint', () => {
      const schema = fileModel.getSchema();
      const foreignKey = schema['FOREIGN KEY (repo_id)'];
      
      expect(foreignKey).toContain('ON DELETE CASCADE');
      expect(foreignKey).toContain('REFERENCES repositories(id)');
    });
  });

  describe('model property access', () => {
    it('should provide access to all file properties', () => {
      const dto = fileModel.getDto();
      
      expect(dto.id).toBe('file-123');
      expect(dto.repo_id).toBe('repo-456');
      expect(dto.file_path).toBe('src/components/Button.tsx');
      expect(dto.file_name).toBe('Button.tsx');
      expect(dto.file_extension).toBe('.tsx');
      expect(dto.language).toBe('typescript');
      expect(dto.size_kb).toBe(2.5);
      expect(dto.content_hash).toBe('abc123def456');
      expect(dto.file_type).toBe('source');
      expect(dto.ai_summary).toBe('A reusable button component');
    });

    it('should provide access to JSON serialized fields', () => {
      const dto = fileModel.getDto();
      
      expect(dto.imports).toBe(JSON.stringify(['react', 'styled-components']));
      expect(dto.exports).toBe(JSON.stringify(['Button', 'ButtonProps']));
      
      // Verify they can be parsed
      expect(JSON.parse(dto.imports!)).toEqual(['react', 'styled-components']);
      expect(JSON.parse(dto.exports!)).toEqual(['Button', 'ButtonProps']);
    });

    it('should provide access to timestamps', () => {
      const dto = fileModel.getDto();
      expect(dto.created_at).toBeDefined();
      expect(dto.updated_at).toBeDefined();
      expect(typeof dto.created_at).toBe('string');
      expect(typeof dto.updated_at).toBe('string');
    });

    it('should allow property modifications through DTO', () => {
      const dto = fileModel.getDto();
      
      dto.file_path = 'src/updated/path.ts';
      dto.file_name = 'updated.ts';
      dto.language = 'javascript';
      dto.size_kb = 10.5;

      expect(fileModel.getDto().file_path).toBe('src/updated/path.ts');
      expect(fileModel.getDto().file_name).toBe('updated.ts');
      expect(fileModel.getDto().language).toBe('javascript');
      expect(fileModel.getDto().size_kb).toBe(10.5);
    });
  });

  describe('model lifecycle and state management', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = fileModel.getId();
      const initialPath = fileModel.getDto().file_path;
      const initialRepoId = fileModel.getDto().repo_id;
      const initialTableName = fileModel.getTableName();

      // State should remain consistent
      expect(fileModel.getId()).toBe(initialId);
      expect(fileModel.getDto().file_path).toBe(initialPath);
      expect(fileModel.getDto().repo_id).toBe(initialRepoId);
      expect(fileModel.getTableName()).toBe(initialTableName);
    });

    it('should reflect DTO changes immediately', () => {
      const originalPath = fileModel.getDto().file_path;
      const originalSize = fileModel.getDto().size_kb;

      // Modify DTO
      fileModel.getDto().file_path = 'src/modified/file.ts';
      fileModel.getDto().size_kb = 15.75;

      expect(fileModel.getDto().file_path).toBe('src/modified/file.ts');
      expect(fileModel.getDto().size_kb).toBe(15.75);
      expect(fileModel.getDto().file_path).not.toBe(originalPath);
      expect(fileModel.getDto().size_kb).not.toBe(originalSize);
    });

    it('should handle complex property updates', () => {
      const dto = fileModel.getDto();
      
      // Update multiple properties
      dto.language = 'python';
      dto.file_type = 'test';
      dto.ai_summary = 'Updated summary';
      dto.imports = JSON.stringify(['pytest', 'numpy']);
      dto.exports = JSON.stringify(['test_function']);
      dto.updated_at = new Date().toISOString();

      expect(fileModel.getDto().language).toBe('python');
      expect(fileModel.getDto().file_type).toBe('test');
      expect(fileModel.getDto().ai_summary).toBe('Updated summary');
      expect(JSON.parse(fileModel.getDto().imports!)).toEqual(['pytest', 'numpy']);
      expect(JSON.parse(fileModel.getDto().exports!)).toEqual(['test_function']);
    });
  });

  describe('serialization and data transfer', () => {
    it('should be JSON serializable', () => {
      const dto = fileModel.getDto();
      const jsonString = JSON.stringify(dto);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe(dto.id);
      expect(parsed.repo_id).toBe(dto.repo_id);
      expect(parsed.file_path).toBe(dto.file_path);
      expect(parsed.file_name).toBe(dto.file_name);
      expect(parsed.file_extension).toBe(dto.file_extension);
      expect(parsed.language).toBe(dto.language);
      expect(parsed.size_kb).toBe(dto.size_kb);
    });

    it('should preserve all properties during serialization', () => {
      const dto = fileModel.getDto();
      const serialized = JSON.stringify(dto);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual({
        id: dto.id,
        repo_id: dto.repo_id,
        file_path: dto.file_path,
        file_name: dto.file_name,
        file_extension: dto.file_extension,
        language: dto.language,
        size_kb: dto.size_kb,
        content_hash: dto.content_hash,
        file_type: dto.file_type,
        ai_summary: dto.ai_summary,
        imports: dto.imports,
        exports: dto.exports,
        created_at: dto.created_at,
        updated_at: dto.updated_at
      });
    });

    it('should handle serialization with undefined optional fields', () => {
      const minimalDto = new FileDTO('min-file', 'repo-id', 'file.js', 'file.js');
      const minimalModel = new FileModel(minimalDto);
      
      const serialized = JSON.stringify(minimalModel.getDto());
      const deserialized = JSON.parse(serialized);

      expect(deserialized.id).toBe('min-file');
      expect(deserialized.repo_id).toBe('repo-id');
      expect(deserialized.file_path).toBe('file.js');
      expect(deserialized.file_name).toBe('file.js');
      expect(deserialized.file_extension).toBeUndefined();
      expect(deserialized.language).toBeUndefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle files with very long paths', () => {
      const longPath = 'src/' + 'very/long/path/'.repeat(20) + 'file.ts';
      const dto = new FileDTO('long-path-file', 'repo-id', longPath, 'file.ts');
      const model = new FileModel(dto);

      expect(model.getDto().file_path).toBe(longPath);
      expect(model.getDto().file_path.length).toBeGreaterThan(200);
    });

    it('should handle files with special characters in paths and names', () => {
      const specialPath = 'src/files with spaces/and-dashes/and_underscores/file (copy).ts';
      const specialName = 'file (copy).ts';
      
      const dto = new FileDTO('special-file', 'repo-id', specialPath, specialName);
      const model = new FileModel(dto);

      expect(model.getDto().file_path).toBe(specialPath);
      expect(model.getDto().file_name).toBe(specialName);
    });

    it('should handle files with Unicode characters', () => {
      const unicodePath = 'src/文件/with/中文/测试.ts';
      const unicodeName = '测试文件-🚀.ts';
      
      const dto = new FileDTO('unicode-file', 'repo-id', unicodePath, unicodeName, {
        ai_summary: '这是一个测试文件 with emoji 🎉'
      });
      const model = new FileModel(dto);

      expect(model.getDto().file_path).toBe(unicodePath);
      expect(model.getDto().file_name).toBe(unicodeName);
      expect(model.getDto().ai_summary).toBe('这是一个测试文件 with emoji 🎉');
    });

    it('should handle empty and null-like values appropriately', () => {
      const dto = new FileDTO('empty-file', 'repo-id', '', '', {
        file_extension: '',
        language: '',
        size_kb: 0,
        content_hash: '',
        ai_summary: '',
        imports: JSON.stringify([]),
        exports: JSON.stringify([])
      });
      const model = new FileModel(dto);

      expect(model.getDto().file_path).toBe('');
      expect(model.getDto().file_name).toBe('');
      expect(model.getDto().file_extension).toBe('');
      expect(model.getDto().language).toBe('');
      expect(model.getDto().size_kb).toBe(0);
      expect(JSON.parse(model.getDto().imports!)).toEqual([]);
      expect(JSON.parse(model.getDto().exports!)).toEqual([]);
    });
  });

  describe('schema validation and database constraints', () => {
    it('should define schema that enforces data integrity', () => {
      const schema = fileModel.getSchema();

      // Primary key constraint
      expect(schema.id).toContain('PRIMARY KEY');

      // NOT NULL constraints for required fields
      expect(schema.repo_id).toContain('NOT NULL');
      expect(schema.file_path).toContain('NOT NULL');
      expect(schema.file_name).toContain('NOT NULL');

      // Foreign key constraint
      expect(schema['FOREIGN KEY (repo_id)']).toContain('REFERENCES repositories(id)');
      expect(schema['FOREIGN KEY (repo_id)']).toContain('ON DELETE CASCADE');

      // CHECK constraint for file_type
      expect(schema.file_type).toContain('CHECK');
    });

    it('should have schema compatible with SQLite', () => {
      const schema = fileModel.getSchema();

      // Check SQLite data types
      expect(schema.id).toContain('TEXT');
      expect(schema.repo_id).toContain('TEXT');
      expect(schema.file_path).toContain('TEXT');
      expect(schema.file_name).toContain('TEXT');
      expect(schema.size_kb).toContain('REAL');
      expect(schema.content_embedding).toContain('BLOB');
      expect(schema.created_at).toContain('DATETIME');
      expect(schema.updated_at).toContain('DATETIME');
    });

    it('should define all required columns', () => {
      const schema = fileModel.getSchema();
      const requiredColumns = [
        'id', 'repo_id', 'file_path', 'file_name', 'file_extension', 
        'language', 'size_kb', 'content_hash', 'file_type', 'ai_summary',
        'imports', 'exports', 'content_embedding', 'created_at', 'updated_at'
      ];

      requiredColumns.forEach(column => {
        expect(schema).toHaveProperty(column);
        expect(typeof schema[column]).toBe('string');
      });
    });

    it('should validate file_type enum constraint', () => {
      const schema = fileModel.getSchema();
      const fileTypeConstraint = schema.file_type;
      
      expect(fileTypeConstraint).toContain('source');
      expect(fileTypeConstraint).toContain('test');
      expect(fileTypeConstraint).toContain('config');
      expect(fileTypeConstraint).toContain('dev');
      expect(fileTypeConstraint).toContain('vendor');
    });
  });
});
