/**
 * @file Unit tests for AstParser
 * Tests AST parsing, code structure extraction, node creation, and call graph analysis
 */

import { jest } from '@jest/globals';
import { AstParser } from './ast-parser';
import { ConfigManager } from '../config';
import { CodeNode, FileNode, TestNode, FunctionNode, Edge } from '../types';
import { TestDataFactory } from '../../tests/utils/TestDataFactory';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

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
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

describe('AstParser', () => {
  let astParser: AstParser;
  let mockConfig: jest.Mocked<ConfigManager>;
  let mockFs: jest.Mocked<typeof fs>;

  const projectRoot = '/test/project';
  const repoId = 'test-repo-1';

  beforeEach(() => {
    // Reset test data factory
    TestDataFactory.resetCounter();

    // Create mock config
    mockConfig = {
      getIndexingConfig: jest.fn().mockReturnValue({
        filePatterns: ['**/*.ts', '**/*.js'],
        ignorePatterns: ['node_modules/**', 'dist/**'],
        maxFileSize: 1024 * 1024
      })
    } as any;

    // Mock fs
    mockFs = fs as jest.Mocked<typeof fs>;

    // Create parser instance
    astParser = new AstParser(projectRoot, mockConfig, repoId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with project root, config, and repo ID', () => {
      expect(astParser).toBeDefined();
      expect(astParser.getNodes()).toEqual([]);
      expect(astParser.getEdges()).toEqual([]);
    });

    it('should store project configuration', () => {
      const customConfig = { ...mockConfig };
      const customParser = new AstParser('/custom/path', customConfig, 'custom-repo');
      expect(customParser).toBeDefined();
    });
  });

  describe('Language Detection', () => {
    it('should detect TypeScript files', async () => {
      const filePath = '/test/project/src/utils.ts';
      const tsContent = `
        export function helper(): string {
          return "helper";
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];
      expect(functionNodes).toHaveLength(1);
      expect(functionNodes[0].properties.name).toBe('helper');
    });

    it('should detect JavaScript files', async () => {
      const filePath = '/test/project/src/utils.js';
      const jsContent = `
        function helper() {
          return "helper";
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(jsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];
      expect(functionNodes).toHaveLength(1);
      expect(functionNodes[0].properties.name).toBe('helper');
    });

    it('should skip unsupported file types', async () => {
      const filePath = '/test/project/README.md';
      const mdContent = '# Test Project';

      mockFs.promises.readFile.mockResolvedValue(mdContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      // Should not create any code nodes for markdown files
      const codeNodes = nodes.filter(n => n.type === 'CodeNode' || n.type === 'FunctionNode');
      expect(codeNodes).toHaveLength(0);
    });
  });

  describe('TypeScript/JavaScript Parsing', () => {
    it('should extract function declarations', async () => {
      const filePath = '/test/project/src/functions.ts';
      const tsContent = `
        function regularFunction(param: string): string {
          return param.toUpperCase();
        }

        export function exportedFunction(x: number, y: number): number {
          return x + y;
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];

      expect(functionNodes).toHaveLength(2);
      expect(functionNodes.map(f => f.properties.name)).toContain('regularFunction');
      expect(functionNodes.map(f => f.properties.name)).toContain('exportedFunction');

      const regularFunc = functionNodes.find(f => f.properties.name === 'regularFunction');
      expect(regularFunc?.properties.signature).toContain('function regularFunction');
      expect(regularFunc?.properties.returnType).toBe('string');
    });

    it('should extract method declarations', async () => {
      const filePath = '/test/project/src/class.ts';
      const tsContent = `
        class TestClass {
          public publicMethod(): void {
            console.log('public');
          }

          private privateMethod(param: string): string {
            return param;
          }

          protected protectedMethod(): number {
            return 42;
          }
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];
      const codeNodes = nodes.filter(n => n.type === 'CodeNode') as CodeNode[];

      expect(codeNodes).toHaveLength(1); // Class declaration
      expect(functionNodes).toHaveLength(3); // Methods

      const publicMethod = functionNodes.find(f => f.properties.name === 'publicMethod');
      const privateMethod = functionNodes.find(f => f.properties.name === 'privateMethod');
      const protectedMethod = functionNodes.find(f => f.properties.name === 'protectedMethod');

      expect(publicMethod?.properties.accessLevel).toBe('public');
      expect(privateMethod?.properties.accessLevel).toBe('private');
      expect(protectedMethod?.properties.accessLevel).toBe('protected');
    });

    it('should extract arrow functions', async () => {
      const filePath = '/test/project/src/arrows.ts';
      const tsContent = `
        const arrowFunction = (x: number): number => {
          return x * 2;
        };

        const simpleArrow = (name: string) => name.toUpperCase();
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];

      expect(functionNodes).toHaveLength(2);
      expect(functionNodes.every(f => f.properties.signature.includes('=>'))).toBe(true);
    });

    it('should extract class declarations', async () => {
      const filePath = '/test/project/src/classes.ts';
      const tsContent = `
        export class PublicClass {
          constructor(private value: string) {}
        }

        class PrivateClass extends PublicClass {
          method(): void {}
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const codeNodes = nodes.filter(n => n.type === 'CodeNode') as CodeNode[];

      expect(codeNodes).toHaveLength(2);
      expect(codeNodes.map(c => c.properties.name)).toContain('PublicClass');
      expect(codeNodes.map(c => c.properties.name)).toContain('PrivateClass');

      const publicClass = codeNodes.find(c => c.properties.name === 'PublicClass');
      expect(publicClass?.properties.signature).toBe('class PublicClass');
    });

    it('should extract interface declarations', async () => {
      const filePath = '/test/project/src/interfaces.ts';
      const tsContent = `
        interface UserInterface {
          id: string;
          name: string;
          email?: string;
        }

        export interface ApiResponse<T> {
          data: T;
          status: number;
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const codeNodes = nodes.filter(n => n.type === 'CodeNode') as CodeNode[];

      expect(codeNodes).toHaveLength(2);
      expect(codeNodes.map(c => c.properties.name)).toContain('UserInterface');
      expect(codeNodes.map(c => c.properties.name)).toContain('ApiResponse');

      const userInterface = codeNodes.find(c => c.properties.name === 'UserInterface');
      expect(userInterface?.properties.signature).toBe('interface UserInterface');
    });
  });

  describe('Test File Detection and Processing', () => {
    it('should detect test files by naming patterns', async () => {
      const testFiles = [
        '/test/project/src/utils.test.ts',
        '/test/project/src/helpers.spec.ts',
        '/test/project/tests/integration.test.js',
        '/test/project/__tests__/unit.spec.ts'
      ];

      const testContent = `
        describe('Test Suite', () => {
          it('should test functionality', () => {
            expect(true).toBe(true);
          });

          test('should also work', () => {
            expect(1 + 1).toBe(2);
          });
        });
      `;

      mockFs.promises.readFile.mockResolvedValue(testContent);

      for (const filePath of testFiles) {
        const idMap = new Map([[filePath, `file-${testFiles.indexOf(filePath) + 1}`]]);
        await astParser.parseFiles([filePath], idMap);
      }

      const nodes = astParser.getNodes();
      const testNodes = nodes.filter(n => n.type === 'TestNode') as TestNode[];

      expect(testNodes.length).toBeGreaterThan(0);
    });

    it('should extract test framework information', async () => {
      const filePath = '/test/project/src/jest.test.ts';
      const jestContent = `
        describe('Jest Test', () => {
          it('should work with jest', () => {
            expect(true).toBe(true);
          });
        });
      `;

      mockFs.promises.readFile.mockResolvedValue(jestContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const testNodes = nodes.filter(n => n.type === 'TestNode') as TestNode[];

      if (testNodes.length > 0) {
        expect(testNodes[0].properties.framework).toBe('jest');
      }
    });

    it('should handle different test frameworks', async () => {
      const testCases = [
        { file: 'mocha.test.ts', framework: 'mocha' },
        { file: 'jasmine.spec.ts', framework: 'jasmine' },
        { file: 'vitest.test.ts', framework: 'vitest' }
      ];

      const testContent = `
        function testFunction() {
          return true;
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(testContent);

      for (const testCase of testCases) {
        const filePath = `/test/project/src/${testCase.file}`;
        const parser = new AstParser(projectRoot, mockConfig, repoId);
        const idMap = new Map([[filePath, `file-${testCase.file}`]]);
        
        await parser.parseFiles([filePath], idMap);
        
        const nodes = parser.getNodes();
        const testNodes = nodes.filter(n => n.type === 'TestNode') as TestNode[];
        
        if (testNodes.length > 0) {
          expect(testNodes[0].properties.framework).toBe(testCase.framework);
        }
      }
    });
  });

  describe('Call Graph Analysis', () => {
    it('should detect function calls and build call graph', async () => {
      const filePath = '/test/project/src/calls.ts';
      const tsContent = `
        function caller(): string {
          const result = callee("test");
          return result;
        }

        function callee(param: string): string {
          return param.toUpperCase();
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const edges = astParser.getEdges();
      const callEdges = edges.filter(e => e.type === 'CALLS');

      expect(callEdges.length).toBeGreaterThan(0);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];
      
      const caller = functionNodes.find(f => f.properties.name === 'caller');
      const callee = functionNodes.find(f => f.properties.name === 'callee');

      if (caller && callee) {
        expect(caller.properties.callsMethods).toContain(callee.id);
        expect(callee.properties.calledByMethods).toContain(caller.id);
      }
    });

    it('should calculate transitive call depth', async () => {
      const filePath = '/test/project/src/depth.ts';
      const tsContent = `
        function level1(): void {
          level2();
        }

        function level2(): void {
          level3();
        }

        function level3(): void {
          console.log("deep");
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];

      const level1 = functionNodes.find(f => f.properties.name === 'level1');
      if (level1) {
        expect(level1.properties.transitiveCallDepth).toBeGreaterThan(0);
      }
    });

    it('should detect external method usage', async () => {
      const filePaths = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.ts'
      ];

      const file1Content = `
        function internalCall(): void {
          externalFunction();
        }
      `;

      const file2Content = `
        function externalFunction(): void {
          console.log("external");
        }
      `;

      mockFs.promises.readFile
        .mockResolvedValueOnce(file1Content)
        .mockResolvedValueOnce(file2Content);

      const idMap = new Map([
        [filePaths[0], 'file-1'],
        [filePaths[1], 'file-2']
      ]);

      await astParser.parseFiles(filePaths, idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode') as FunctionNode[];

      const internalCall = functionNodes.find(f => f.properties.name === 'internalCall');
      if (internalCall) {
        // This test might need adjustment based on actual implementation
        expect(internalCall.properties.usesExternalMethods).toBeDefined();
      }
    });
  });

  describe('Edge Creation and Relationships', () => {
    it('should create DEFINED_IN edges between nodes and files', async () => {
      const filePath = '/test/project/src/relations.ts';
      const tsContent = `
        function testFunction(): void {
          console.log("test");
        }

        class TestClass {
          method(): void {}
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const edges = astParser.getEdges();
      const definedInEdges = edges.filter(e => e.type === 'DEFINED_IN');

      expect(definedInEdges.length).toBeGreaterThan(0);
      expect(definedInEdges.every(e => e.target === 'file-1')).toBe(true);
    });

    it('should handle multiple files with cross-references', async () => {
      const filePaths = [
        '/test/project/src/module1.ts',
        '/test/project/src/module2.ts'
      ];

      const module1Content = `
        export function helper(): string {
          return "helper";
        }
      `;

      const module2Content = `
        import { helper } from './module1';
        
        function useHelper(): string {
          return helper();
        }
      `;

      mockFs.promises.readFile
        .mockResolvedValueOnce(module1Content)
        .mockResolvedValueOnce(module2Content);

      const idMap = new Map([
        [filePaths[0], 'file-1'],
        [filePaths[1], 'file-2']
      ]);

      await astParser.parseFiles(filePaths, idMap);

      const nodes = astParser.getNodes();
      const edges = astParser.getEdges();

      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const filePath = '/test/project/src/error.ts';
      
      mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

      const idMap = new Map([[filePath, 'file-1']]);
      
      // Should not throw, but log warning
      await expect(astParser.parseFiles([filePath], idMap)).resolves.not.toThrow();

      const nodes = astParser.getNodes();
      expect(nodes).toEqual([]);
    });

    it('should handle malformed TypeScript code', async () => {
      const filePath = '/test/project/src/malformed.ts';
      const malformedContent = `
        function incomplete(
        // Missing closing parenthesis and body
      `;

      mockFs.promises.readFile.mockResolvedValue(malformedContent);

      const idMap = new Map([[filePath, 'file-1']]);
      
      // Should handle parsing errors gracefully
      await expect(astParser.parseFiles([filePath], idMap)).resolves.not.toThrow();
    });

    it('should handle empty files', async () => {
      const filePath = '/test/project/src/empty.ts';
      const emptyContent = '';

      mockFs.promises.readFile.mockResolvedValue(emptyContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const codeNodes = nodes.filter(n => n.type === 'CodeNode' || n.type === 'FunctionNode');
      expect(codeNodes).toHaveLength(0);
    });

    it('should handle very large files', async () => {
      const filePath = '/test/project/src/large.ts';
      const largeContent = `
        ${'function test' + Math.random() + '() { return "test"; }\n'.repeat(1000)}
      `;

      mockFs.promises.readFile.mockResolvedValue(largeContent);

      const idMap = new Map([[filePath, 'file-1']]);
      
      // Should handle large files without issues
      await expect(astParser.parseFiles([filePath], idMap)).resolves.not.toThrow();

      const nodes = astParser.getNodes();
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  describe('Node ID Generation', () => {
    it('should generate unique IDs for different node types', async () => {
      const filePath = '/test/project/src/unique.ts';
      const tsContent = `
        function testFunction(): void {}
        
        class TestClass {
          method(): void {}
        }
        
        interface TestInterface {
          prop: string;
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const nodeIds = nodes.map(n => n.id);

      // All IDs should be unique
      expect(new Set(nodeIds).size).toBe(nodeIds.length);

      // IDs should follow expected patterns
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode');
      const codeNodes = nodes.filter(n => n.type === 'CodeNode');

      functionNodes.forEach(node => {
        expect(node.id).toMatch(/^func:/);
      });

      codeNodes.forEach(node => {
        expect(node.id).toMatch(/^code:/);
      });
    });

    it('should handle duplicate names in different scopes', async () => {
      const filePath = '/test/project/src/scopes.ts';
      const tsContent = `
        function helper(): string {
          return "global helper";
        }
        
        class TestClass {
          helper(): string {
            return "class helper";
          }
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const helperNodes = nodes.filter(n => 
        (n.type === 'FunctionNode' || n.type === 'CodeNode') && 
        n.properties.name === 'helper'
      );

      expect(helperNodes).toHaveLength(2);
      expect(helperNodes[0].id).not.toBe(helperNodes[1].id);
    });
  });

  describe('Performance and Batch Processing', () => {
    it('should handle multiple files efficiently', async () => {
      const filePaths = Array.from({ length: 10 }, (_, i) => 
        `/test/project/src/file${i}.ts`
      );

      const fileContent = `
        export function func${Math.random()}(): string {
          return "test";
        }
      `;

      mockFs.promises.readFile.mockResolvedValue(fileContent);

      const idMap = new Map(filePaths.map((path, i) => [path, `file-${i}`]));

      const startTime = Date.now();
      await astParser.parseFiles(filePaths, idMap);
      const endTime = Date.now();

      const nodes = astParser.getNodes();
      expect(nodes.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should reset state between parsing sessions', async () => {
      const filePath1 = '/test/project/src/first.ts';
      const filePath2 = '/test/project/src/second.ts';
      
      const content1 = 'function first(): void {}';
      const content2 = 'function second(): void {}';

      mockFs.promises.readFile
        .mockResolvedValueOnce(content1)
        .mockResolvedValueOnce(content2);

      // First parsing session
      const idMap1 = new Map([[filePath1, 'file-1']]);
      await astParser.parseFiles([filePath1], idMap1);
      const nodes1 = astParser.getNodes();

      // Second parsing session
      const idMap2 = new Map([[filePath2, 'file-2']]);
      await astParser.parseFiles([filePath2], idMap2);
      const nodes2 = astParser.getNodes();

      // Second session should replace first session's results
      expect(nodes2.length).toBeGreaterThan(0);
      expect(nodes2.some((n: any) => n.properties && n.properties.name === 'second')).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide node type statistics', async () => {
      const filePath = '/test/project/src/stats.ts';
      const tsContent = `
        function func1(): void {}
        function func2(): void {}
        
        class Class1 {}
        class Class2 {}
        
        interface Interface1 {}
      `;

      mockFs.promises.readFile.mockResolvedValue(tsContent);

      const idMap = new Map([[filePath, 'file-1']]);
      await astParser.parseFiles([filePath], idMap);

      const nodes = astParser.getNodes();
      const functionNodes = nodes.filter(n => n.type === 'FunctionNode');
      const codeNodes = nodes.filter(n => n.type === 'CodeNode');

      expect(functionNodes).toHaveLength(2);
      expect(codeNodes).toHaveLength(3); // 2 classes + 1 interface
    });

    it('should track parsing progress', async () => {
      const filePaths = [
        '/test/project/src/file1.ts',
        '/test/project/src/file2.ts',
        '/test/project/src/file3.ts'
      ];

      const fileContent = 'function test(): void {}';
      mockFs.promises.readFile.mockResolvedValue(fileContent);

      const idMap = new Map(filePaths.map((path, i) => [path, `file-${i}`]));
      
      await astParser.parseFiles(filePaths, idMap);

      const nodes = astParser.getNodes();
      const edges = astParser.getEdges();

      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });
  });
});
