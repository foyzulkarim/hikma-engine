/**
 * @file Tests for mock implementations
 */

import {
  MockSQLiteClient,
  MockFileSystem,
  MockEmbeddingService,
  MockAIService
} from './index';
import { TestDataFactory } from '../TestDataFactory';

describe('Mock Implementations', () => {
  describe('MockSQLiteClient', () => {
    let mockClient: MockSQLiteClient;

    beforeEach(() => {
      mockClient = new MockSQLiteClient(':memory:');
    });

    afterEach(() => {
      mockClient.clearMocks();
    });

    it('should handle connection lifecycle', async () => {
      expect(mockClient.isConnectedToDatabase()).toBe(false);
      
      await mockClient.connect();
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.isConnectedToDatabase()).toBe(true);
      
      mockClient.disconnect();
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockClient.isConnectedToDatabase()).toBe(false);
    });

    it('should simulate connection failures', async () => {
      mockClient.simulateConnectionFailure(true);
      
      await expect(mockClient.connect()).rejects.toThrow('Mock connection failure');
    });

    it('should handle database operations', async () => {
      await mockClient.connect();
      
      const result = mockClient.run('INSERT INTO test (name) VALUES (?)', ['test']) as any;
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeDefined();
    });

    it('should handle mock data queries', async () => {
      await mockClient.connect();
      
      const testData = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' }
      ];
      
      mockClient.setMockData('test_table', testData);
      
      const results = mockClient.all('SELECT * FROM test_table');
      expect(results).toEqual(testData);
      
      const singleResult = mockClient.get('SELECT * FROM test_table WHERE id = ?', ['1']);
      expect(singleResult).toEqual(testData[0]);
    });

    it('should handle vector operations', async () => {
      await mockClient.connect();
      
      const embedding = [0.1, 0.2, 0.3, 0.4];
      await mockClient.storeVector('embeddings', 'vector', 'node-1', embedding);
      expect(mockClient.storeVector).toHaveBeenCalledWith('embeddings', 'vector', 'node-1', embedding);
      
      const searchResults = await mockClient.vectorSearch('embeddings', 'vector', embedding, 5) as any[];
      expect(searchResults).toHaveLength(5);
      expect(searchResults[0]).toHaveProperty('similarity');
      expect(searchResults[0]).toHaveProperty('data');
    });

    it('should handle transactions', async () => {
      await mockClient.connect();
      
      const result = mockClient.transaction(() => {
        return 'transaction result';
      });
      
      expect(result).toBe('transaction result');
      expect(mockClient.transaction).toHaveBeenCalled();
    });
  });

  describe('MockFileSystem', () => {
    let mockFs: MockFileSystem;

    beforeEach(() => {
      mockFs = new MockFileSystem({
        initialFiles: {
          'src': {
            'index.ts': 'export function main() {}',
            'utils.ts': 'export function helper() {}'
          },
          'package.json': '{"name": "test"}'
        }
      });
    });

    afterEach(() => {
      mockFs.clearMocks();
    });

    it('should handle file operations', async () => {
      const content = await mockFs.readFile('src/index.ts');
      expect(content).toBe('export function main() {}');
      
      await mockFs.writeFile('src/new.ts', 'new content');
      expect(mockFs.hasFile('src/new.ts')).toBe(true);
      
      const newContent = await mockFs.readFile('src/new.ts');
      expect(newContent).toBe('new content');
    });

    it('should handle directory operations', async () => {
      await mockFs.mkdir('src/components');
      expect(mockFs.hasDirectory('src/components')).toBe(true);
      
      const entries = await mockFs.readdir('src');
      expect(entries).toContain('components');
      expect(entries).toContain('index.ts');
      expect(entries).toContain('utils.ts');
    });

    it('should handle file stats', async () => {
      const stats = await mockFs.stat('src/index.ts') as any;
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should simulate file system errors', async () => {
      await expect(mockFs.readFile('nonexistent.txt')).rejects.toThrow('ENOENT');
      
      mockFs.simulateFailure(true);
      await expect(mockFs.readFile('src/index.ts')).rejects.toThrow('Mock file read failure');
    });

    it('should handle file permissions', async () => {
      mockFs.setPermission('src/index.ts', false);
      await expect(mockFs.access('src/index.ts')).rejects.toThrow('EACCES');
    });
  });

  describe('MockEmbeddingService', () => {
    let mockService: MockEmbeddingService;

    beforeEach(() => {
      mockService = new MockEmbeddingService({
        embeddingDimensions: 384,
        batchSize: 2
      });
    });

    afterEach(() => {
      mockService.clearMocks();
    });

    it('should load model', async () => {
      expect(mockService.isModelLoaded()).toBe(false);
      
      await mockService.loadModel();
      expect(mockService.loadModel).toHaveBeenCalled();
      expect(mockService.isModelLoaded()).toBe(true);
    });

    it('should generate embeddings for nodes', async () => {
      const nodes = [
        TestDataFactory.createCodeNode({ name: 'function1' }),
        TestDataFactory.createFile({ name: 'file1.ts' })
      ];
      
      const nodesWithEmbeddings = await mockService.embedNodes(nodes) as any[];
      
      expect(nodesWithEmbeddings).toHaveLength(2);
      expect(nodesWithEmbeddings[0]).toHaveProperty('embedding');
      expect(nodesWithEmbeddings[0]).toHaveProperty('sourceText');
      expect(nodesWithEmbeddings[0].embedding).toHaveLength(384);
    });

    it('should generate query embeddings', async () => {
      const embedding = await mockService.embedQuery('test query');
      
      expect(embedding).toHaveLength(384);
      expect(mockService.embedQuery).toHaveBeenCalledWith('test query');
    });

    it('should calculate similarity', () => {
      const embedding1 = [0.1, 0.2, 0.3];
      const embedding2 = [0.2, 0.3, 0.4];
      
      const similarity = mockService.calculateSimilarity(embedding1, embedding2);
      
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
      expect(mockService.calculateSimilarity).toHaveBeenCalledWith(embedding1, embedding2);
    });

    it('should find similar nodes', async () => {
      const nodes = [
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode({ name: 'func1' })),
        TestDataFactory.createNodeWithEmbedding(TestDataFactory.createCodeNode({ name: 'func2' }))
      ];
      
      const queryEmbedding = TestDataFactory.createEmbedding();
      const similar = mockService.findSimilarNodes(queryEmbedding, nodes, 1) as any[];
      
      expect(similar).toHaveLength(1);
      expect(similar[0]).toHaveProperty('node');
      expect(similar[0]).toHaveProperty('similarity');
    });

    it('should simulate failures', async () => {
      mockService.simulateFailure(true);
      
      await expect(mockService.loadModel()).rejects.toThrow('Mock model loading failure');
    });

    it('should provide stats', async () => {
      const stats = await mockService.getStats() as any;
      
      expect(stats).toHaveProperty('modelLoaded');
      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('dimensions');
      expect(stats.dimensions).toBe(384);
    });
  });

  describe('MockAIService', () => {
    let mockService: MockAIService;

    beforeEach(() => {
      mockService = new MockAIService({
        maxTokens: 100,
        temperature: 0.7
      });
    });

    afterEach(() => {
      mockService.clearMocks();
    });

    it('should load model', async () => {
      expect(mockService.isModelLoaded()).toBe(false);
      
      await mockService.loadModel();
      expect(mockService.loadModel).toHaveBeenCalled();
      expect(mockService.isModelLoaded()).toBe(true);
    });

    it('should generate summaries', async () => {
      const text = 'This is a test function that performs various operations';
      const summary = await mockService.generateSummary(text);
      
      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
      expect(mockService.generateSummary).toHaveBeenCalledWith(text);
    });

    it('should batch summarize', async () => {
      const texts = [
        'First test function',
        'Second test function',
        'Third test function'
      ];
      
      const summaries = await mockService.batchSummarize(texts) as any[];
      
      expect(summaries).toHaveLength(3);
      expect(summaries.every((s: any) => typeof s === 'string')).toBe(true);
    });

    it('should generate docstrings', async () => {
      const docstring = await mockService.generateDocstring(
        'testFunction',
        'function testFunction(param1: string, param2: number): string',
        'return param1 + param2;'
      );
      
      expect(docstring).toContain('/**');
      expect(docstring).toContain('testFunction');
      expect(docstring).toContain('@param');
      expect(docstring).toContain('*/');
    });

    it('should analyze code', async () => {
      const analysis = await mockService.analyzeCode('function test() { return "hello"; }') as any;
      
      expect(analysis).toHaveProperty('complexity');
      expect(analysis).toHaveProperty('maintainability');
      expect(analysis).toHaveProperty('readability');
      expect(analysis).toHaveProperty('suggestions');
      expect(Array.isArray(analysis.suggestions)).toBe(true);
    });

    it('should extract keywords', async () => {
      const keywords = await mockService.extractKeywords('This is a test function with various keywords', 5) as any[];
      
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('should classify code', async () => {
      const classification = await mockService.classifyCode('class TestClass { constructor() {} }') as any;
      
      expect(classification).toHaveProperty('type');
      expect(classification).toHaveProperty('confidence');
      expect(classification).toHaveProperty('categories');
      expect(Array.isArray(classification.categories)).toBe(true);
    });

    it('should simulate failures', async () => {
      mockService.simulateFailure(true);
      
      await expect(mockService.generateSummary('test')).rejects.toThrow('Mock summary generation failure');
    });

    it('should provide stats', async () => {
      const stats = await mockService.getStats() as any;
      
      expect(stats).toHaveProperty('modelLoaded');
      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('maxTokens');
      expect(stats).toHaveProperty('temperature');
      expect(stats.maxTokens).toBe(100);
      expect(stats.temperature).toBe(0.7);
    });
  });

  describe('TestDataFactory', () => {
    beforeEach(() => {
      TestDataFactory.resetCounter();
    });

    it('should create repository nodes', () => {
      const repo = TestDataFactory.createRepository({
        name: 'test-repo',
        path: '/test/path'
      });
      
      expect(repo.type).toBe('RepositoryNode');
      expect(repo.properties.repoName).toBe('test-repo');
      expect(repo.properties.repoPath).toBe('/test/path');
    });

    it('should create file nodes', () => {
      const file = TestDataFactory.createFile({
        name: 'test.ts',
        language: 'typescript'
      });
      
      expect(file.type).toBe('FileNode');
      expect(file.properties.fileName).toBe('test.ts');
      expect(file.properties.language).toBe('typescript');
    });

    it('should create code nodes', () => {
      const code = TestDataFactory.createCodeNode({
        name: 'testFunction'
      });
      
      expect(code.type).toBe('CodeNode');
      expect(code.properties.name).toBe('testFunction');
    });

    it('should create edges', () => {
      const edge = TestDataFactory.createEdge({
        source: 'node1',
        target: 'node2',
        type: 'CALLS'
      });
      
      expect(edge.source).toBe('node1');
      expect(edge.target).toBe('node2');
      expect(edge.type).toBe('CALLS');
    });

    it('should create nodes with embeddings', () => {
      const node = TestDataFactory.createCodeNode();
      const nodeWithEmbedding = TestDataFactory.createNodeWithEmbedding(node, 384);
      
      expect(nodeWithEmbedding).toHaveProperty('embedding');
      expect(nodeWithEmbedding).toHaveProperty('sourceText');
      expect(nodeWithEmbedding.embedding).toHaveLength(384);
    });

    it('should create connected nodes', () => {
      const { nodes, edges } = TestDataFactory.createConnectedNodes(3);
      
      expect(nodes).toHaveLength(3);
      expect(edges).toHaveLength(2);
      expect(edges[0].source).toBe(nodes[0].id);
      expect(edges[0].target).toBe(nodes[1].id);
    });

    it('should create repository with files', () => {
      const { repository, files } = TestDataFactory.createRepositoryWithFiles({}, 3);
      
      expect(repository.type).toBe('RepositoryNode');
      expect(files).toHaveLength(3);
      expect(files.every(f => f.properties.repoId === repository.id)).toBe(true);
    });

    it('should create large datasets', () => {
      const dataset = TestDataFactory.generateLargeDataset('small');
      
      expect(dataset.repositories).toHaveLength(2);
      expect(dataset.files.length).toBeGreaterThan(0);
      expect(dataset.nodes.length).toBeGreaterThan(0);
      expect(dataset.edges.length).toBeGreaterThan(0);
    });

    it('should create project structures', () => {
      const tsProject = TestDataFactory.createTypescriptProject();
      
      expect(tsProject.name).toContain('typescript-project');
      expect(tsProject.files['package.json']).toBeDefined();
      expect(tsProject.files['tsconfig.json']).toBeDefined();
      expect(tsProject.files['src/index.ts']).toBeDefined();
    });
  });
});
