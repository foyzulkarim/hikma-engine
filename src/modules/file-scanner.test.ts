/**
 * @file Unit tests for FileScanner
 * Tests file discovery, filtering, metadata extraction, and incremental scanning
 */

import { jest } from '@jest/globals';
import { FileScanner, FileMetadata } from './file-scanner';
import { ConfigManager } from '../config';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../config');
jest.mock('../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    operation: jest.fn(() => jest.fn())
  }))
}));
jest.mock('../utils/error-handling', () => ({
  getErrorMessage: jest.fn((error: any) => error?.message || 'Unknown error')
}));
jest.mock('glob', () => ({
  glob: jest.fn()
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
    access: jest.fn()
  },
  constants: {
    R_OK: 4
  }
}));
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mock-hash-123')
  }))
}));

describe('FileScanner', () => {
  let fileScanner: FileScanner;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockFs: jest.Mocked<typeof fs>;
  let mockGlob: jest.MockedFunction<any>;
  let mockCrypto: jest.Mocked<typeof crypto>;

  const projectRoot = '/test/project';

  const mockIndexingConfig = {
    filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
    ignorePatterns: ['node_modules/**', 'dist/**', '*.log'],
    maxFileSize: 1024 * 1024 // 1MB
  };

  beforeEach(() => {
    // Reset test data factory
    TestDataFactory.resetCounter();

    // Create mock config
    mockConfig = {
      getIndexingConfig: jest.fn().mockReturnValue(mockIndexingConfig)
    } as any;

    // Mock fs
    mockFs = fs as jest.Mocked<typeof fs>;
    
    // Mock glob
    const { glob } = require('glob');
    mockGlob = glob as jest.MockedFunction<any>;

    // Mock crypto
    mockCrypto = crypto as jest.Mocked<typeof crypto>;

    // Create scanner instance
    fileScanner = new FileScanner(projectRoot, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with project root and config', () => {
      expect(fileScanner).toBeDefined();
      expect(mockConfig.getIndexingConfig).toHaveBeenCalled();
    });

    it('should store project root path', () => {
      const customRoot = '/custom/project';
      const customScanner = new FileScanner(customRoot, mockConfig);
      expect(customScanner).toBeDefined();
    });
  });

  describe('GitIgnore Pattern Loading', () => {
    it('should load patterns from .gitignore file', async () => {
      const gitignoreContent = `
        node_modules/
        dist/
        *.log
        # Comment line
        
        .env
      `;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.promises.readFile.mockResolvedValue(gitignoreContent);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);

      mockGlob.mockResolvedValue([
        '/test/project/src/index.ts',
        '/test/project/src/utils.ts'
      ]);

      await fileScanner.findAllFiles(['**/*.ts']);

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(
        path.join(projectRoot, '.gitignore'),
        'utf-8'
      );
      expect(mockGlob).toHaveBeenCalledWith(
        ['**/*.ts'],
        expect.objectContaining({
          ignore: expect.arrayContaining(['node_modules/', 'dist/', '*.log', '.env'])
        })
      );
    });

    it('should handle missing .gitignore file', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);

      mockGlob.mockResolvedValue(['/test/project/src/index.ts']);

      await fileScanner.findAllFiles(['**/*.ts']);

      expect(mockFs.promises.readFile).not.toHaveBeenCalled();
      expect(mockGlob).toHaveBeenCalledWith(
        ['**/*.ts'],
        expect.objectContaining({
          ignore: mockIndexingConfig.ignorePatterns
        })
      );
    });

    it('should handle .gitignore read errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.promises.readFile.mockRejectedValue(new Error('Permission denied'));
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);

      mockGlob.mockResolvedValue(['/test/project/src/index.ts']);

      // Should not throw, but log warning
      await expect(fileScanner.findAllFiles(['**/*.ts'])).resolves.not.toThrow();
    });

    it('should filter out comments and empty lines from .gitignore', async () => {
      const gitignoreContent = `
        # This is a comment
        node_modules/
        
        # Another comment
        dist/
        
        *.log
      `;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.promises.readFile.mockResolvedValue(gitignoreContent);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);

      mockGlob.mockResolvedValue(['/test/project/src/index.ts']);

      await fileScanner.findAllFiles(['**/*.ts']);

      expect(mockGlob).toHaveBeenCalledWith(
        ['**/*.ts'],
        expect.objectContaining({
          ignore: expect.arrayContaining(['node_modules/', 'dist/', '*.log'])
        })
      );
    });
  });

  describe('File Discovery', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false); // No .gitignore
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test content'));
    });

    it('should find files matching patterns', async () => {
      const mockFiles = [
        '/test/project/src/index.ts',
        '/test/project/src/utils.ts',
        '/test/project/src/helpers.js'
      ];

      mockGlob.mockResolvedValue(mockFiles);

      const result = await fileScanner.findAllFiles(['**/*.ts', '**/*.js']);

      expect(result).toHaveLength(3);
      expect(result.map(f => f.path)).toEqual(mockFiles);
      expect(mockGlob).toHaveBeenCalledWith(
        ['**/*.ts', '**/*.js'],
        expect.objectContaining({
          cwd: projectRoot,
          ignore: mockIndexingConfig.ignorePatterns,
          nodir: true,
          absolute: true
        })
      );
    });

    it('should handle glob errors', async () => {
      mockGlob.mockRejectedValue(new Error('Glob pattern error'));

      await expect(fileScanner.findAllFiles(['**/*.ts'])).rejects.toThrow('Glob pattern error');
    });

    it('should return empty array for no matches', async () => {
      mockGlob.mockResolvedValue([]);

      const result = await fileScanner.findAllFiles(['**/*.nonexistent']);

      expect(result).toEqual([]);
    });

    it('should use absolute paths', async () => {
      const mockFiles = [
        '/test/project/src/index.ts',
        '/test/project/lib/utils.ts'
      ];

      mockGlob.mockResolvedValue(mockFiles);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result.every(f => path.isAbsolute(f.path))).toBe(true);
    });
  });

  describe('File Filtering', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test content'));
    });

    it('should filter files by size limit', async () => {
      const mockFiles = [
        '/test/project/small.ts',
        '/test/project/large.ts'
      ];

      mockGlob.mockResolvedValue(mockFiles);

      // Mock different file sizes
      mockFs.promises.stat
        .mockResolvedValueOnce({ size: 1024, isFile: () => true } as any) // Small file
        .mockResolvedValueOnce({ size: 2 * 1024 * 1024, isFile: () => true } as any); // Large file (2MB)

      mockFs.promises.access.mockResolvedValue(undefined);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/test/project/small.ts');
    });

    it('should filter out inaccessible files', async () => {
      const mockFiles = [
        '/test/project/accessible.ts',
        '/test/project/restricted.ts'
      ];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      // Mock access permissions
      mockFs.promises.access
        .mockResolvedValueOnce(undefined) // Accessible
        .mockRejectedValueOnce(new Error('Permission denied')); // Restricted

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/test/project/accessible.ts');
    });

    it('should handle stat errors gracefully', async () => {
      const mockFiles = ['/test/project/error.ts'];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.promises.stat.mockRejectedValue(new Error('Stat failed'));

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toEqual([]);
    });
  });

  describe('Incremental Scanning', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test content'));
    });

    it('should filter to only changed files when provided', async () => {
      const allFiles = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.ts',
        '/test/project/src/file3.ts'
      ];

      const changedFiles = [
        'src/file1.ts',
        'src/file3.ts'
      ];

      mockGlob.mockResolvedValue(allFiles);

      const result = await fileScanner.findAllFiles(['**/*.ts'], changedFiles);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toEqual([
        '/test/project/src/file1.ts',
        '/test/project/src/file3.ts'
      ]);
    });

    it('should handle absolute paths in changed files', async () => {
      const allFiles = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.ts'
      ];

      const changedFiles = [
        '/test/project/src/file1.ts' // Absolute path
      ];

      mockGlob.mockResolvedValue(allFiles);

      const result = await fileScanner.findAllFiles(['**/*.ts'], changedFiles);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/test/project/src/file1.ts');
    });

    it('should return empty array if no changed files match', async () => {
      const allFiles = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.ts'
      ];

      const changedFiles = [
        'src/nonexistent.ts'
      ];

      mockGlob.mockResolvedValue(allFiles);

      const result = await fileScanner.findAllFiles(['**/*.ts'], changedFiles);

      expect(result).toEqual([]);
    });
  });

  describe('File Metadata Extraction', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.access.mockResolvedValue(undefined);
    });

    it('should extract complete file metadata', async () => {
      const mockFile = '/test/project/src/utils.ts';
      const mockContent = Buffer.from('export function helper() { return "test"; }');

      mockGlob.mockResolvedValue([mockFile]);
      mockFs.promises.stat.mockResolvedValue({
        size: mockContent.length,
        isFile: () => true
      } as any);
      mockFs.promises.readFile.mockResolvedValue(mockContent);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toHaveLength(1);
      const metadata = result[0];

      expect(metadata.path).toBe(mockFile);
      expect(metadata.name).toBe('utils.ts');
      expect(metadata.extension).toBe('ts');
      expect(metadata.language).toBe('TypeScript');
      expect(metadata.sizeKb).toBe(Math.ceil(mockContent.length / 1024));
      expect(metadata.contentHash).toBe('mock-hash-123');
      expect(metadata.fileType).toBe('source');
    });

    it('should detect different file types correctly', async () => {
      const testCases = [
        { file: '/test/project/src/utils.ts', expectedType: 'source' },
        { file: '/test/project/src/utils.test.ts', expectedType: 'test' },
        { file: '/test/project/package.json', expectedType: 'config' },
        { file: '/test/project/node_modules/lib.js', expectedType: 'vendor' },
        { file: '/test/project/scripts/build.js', expectedType: 'dev' }
      ];

      for (const testCase of testCases) {
        mockGlob.mockResolvedValue([testCase.file]);
        mockFs.promises.stat.mockResolvedValue({
          size: 1024,
          isFile: () => true
        } as any);
        mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));

        const result = await fileScanner.findAllFiles(['**/*']);

        expect(result[0].fileType).toBe(testCase.expectedType);
      }
    });

    it('should detect programming languages correctly', async () => {
      const languageTests = [
        { ext: 'ts', expected: 'TypeScript' },
        { ext: 'js', expected: 'JavaScript' },
        { ext: 'py', expected: 'Python' },
        { ext: 'java', expected: 'Java' },
        { ext: 'go', expected: 'Go' },
        { ext: 'unknown', expected: 'Unknown' }
      ];

      for (const test of languageTests) {
        const mockFile = `/test/project/file.${test.ext}`;
        mockGlob.mockResolvedValue([mockFile]);
        mockFs.promises.stat.mockResolvedValue({
          size: 1024,
          isFile: () => true
        } as any);
        mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));

        const result = await fileScanner.findAllFiles(['**/*']);

        expect(result[0].language).toBe(test.expected);
      }
    });

    it('should handle metadata extraction errors', async () => {
      const mockFile = '/test/project/error.ts';

      mockGlob.mockResolvedValue([mockFile]);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);
      mockFs.promises.readFile.mockRejectedValue(new Error('Read failed'));

      await expect(fileScanner.findAllFiles(['**/*.ts'])).rejects.toThrow('Read failed');
    });

    it('should generate content hashes correctly', async () => {
      const mockFile = '/test/project/src/test.ts';
      const mockContent = Buffer.from('test content for hashing');

      mockGlob.mockResolvedValue([mockFile]);
      mockFs.promises.stat.mockResolvedValue({
        size: mockContent.length,
        isFile: () => true
      } as any);
      mockFs.promises.readFile.mockResolvedValue(mockContent);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(result[0].contentHash).toBe('mock-hash-123');
    });
  });

  describe('File Statistics', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.access.mockResolvedValue(undefined);
    });

    it('should calculate file statistics correctly', async () => {
      const mockFiles = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.js',
        '/test/project/src/file3.ts'
      ];

      mockGlob.mockResolvedValue(mockFiles);
      
      // Mock different file sizes
      mockFs.promises.stat
        .mockResolvedValueOnce({ size: 1024, isFile: () => true } as any)
        .mockResolvedValueOnce({ size: 2048, isFile: () => true } as any)
        .mockResolvedValueOnce({ size: 512, isFile: () => true } as any);

      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));

      const stats = await fileScanner.getFileStats();

      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBe(1024 + 2048 + 512);
      expect(stats.filesByExtension['.ts']).toBe(2);
      expect(stats.filesByExtension['.js']).toBe(1);
    });

    it('should handle empty project', async () => {
      mockGlob.mockResolvedValue([]);

      const stats = await fileScanner.getFileStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.filesByExtension).toEqual({});
    });

    it('should handle stat errors in statistics', async () => {
      const mockFiles = [
        '/test/project/good.ts',
        '/test/project/bad.ts'
      ];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.promises.stat
        .mockResolvedValueOnce({ size: 1024, isFile: () => true } as any)
        .mockRejectedValueOnce(new Error('Stat failed'));

      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));

      const stats = await fileScanner.getFileStats();

      // Should only count the successful file
      expect(stats.totalFiles).toBe(1);
      expect(stats.totalSize).toBe(1024);
    });
  });

  describe('Performance and Edge Cases', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));
    });

    it('should handle large numbers of files efficiently', async () => {
      const mockFiles = Array.from({ length: 1000 }, (_, i) => 
        `/test/project/src/file${i}.ts`
      );

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      const startTime = Date.now();
      const result = await fileScanner.findAllFiles(['**/*.ts']);
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle files with special characters in names', async () => {
      const specialFiles = [
        '/test/project/src/file with spaces.ts',
        '/test/project/src/file-with-dashes.ts',
        '/test/project/src/file_with_underscores.ts',
        '/test/project/src/file.with.dots.ts',
        '/test/project/src/файл-с-unicode.ts'
      ];

      mockGlob.mockResolvedValue(specialFiles);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toHaveLength(5);
      expect(result.map(f => f.path)).toEqual(specialFiles);
    });

    it('should handle very deep directory structures', async () => {
      const deepPath = '/test/project/' + 'deep/'.repeat(20) + 'file.ts';

      mockGlob.mockResolvedValue([deepPath]);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      const result = await fileScanner.findAllFiles(['**/*.ts']);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(deepPath);
    });

    it('should handle concurrent scanning operations', async () => {
      const mockFiles1 = ['/test/project/src/file1.ts'];
      const mockFiles2 = ['/test/project/src/file2.ts'];

      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      // Create separate scanner instances
      const scanner1 = new FileScanner('/test/project1', mockConfig);
      const scanner2 = new FileScanner('/test/project2', mockConfig);

      mockGlob
        .mockResolvedValueOnce(mockFiles1)
        .mockResolvedValueOnce(mockFiles2);

      const [result1, result2] = await Promise.all([
        scanner1.findAllFiles(['**/*.ts']),
        scanner2.findAllFiles(['**/*.ts'])
      ]);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });

    it('should handle empty file patterns', async () => {
      const result = await fileScanner.findAllFiles([]);

      expect(result).toEqual([]);
    });

    it('should handle null or undefined changed files', async () => {
      const mockFiles = ['/test/project/src/file.ts'];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true
      } as any);

      const result = await fileScanner.findAllFiles(['**/*.ts'], undefined);

      expect(result).toHaveLength(1);
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration file patterns', async () => {
      const customConfig = {
        filePatterns: ['**/*.custom'],
        ignorePatterns: ['ignore/**'],
        maxFileSize: 512,
        supportedLanguages: ['custom']
      };

      mockConfig.getIndexingConfig.mockReturnValue(customConfig);

      const customScanner = new FileScanner(projectRoot, mockConfig);
      const mockFiles = ['/test/project/file.custom'];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.stat.mockResolvedValue({
        size: 256,
        isFile: () => true
      } as any);
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue(Buffer.from('test'));

      const result = await customScanner.findAllFiles(customConfig.filePatterns);

      expect(mockGlob).toHaveBeenCalledWith(
        customConfig.filePatterns,
        expect.objectContaining({
          ignore: customConfig.ignorePatterns
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should respect configuration size limits', async () => {
      const customConfig = {
        ...mockIndexingConfig,
        maxFileSize: 100, // Very small limit
        supportedLanguages: ['ts', 'js']
      };

      mockConfig.getIndexingConfig.mockReturnValue(customConfig);

      const customScanner = new FileScanner(projectRoot, mockConfig);
      const mockFiles = ['/test/project/large.ts'];

      mockGlob.mockResolvedValue(mockFiles);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024, // Larger than limit
        isFile: () => true
      } as any);

      const result = await customScanner.findAllFiles(['**/*.ts']);

      expect(result).toEqual([]); // Should be filtered out
    });
  });
});
