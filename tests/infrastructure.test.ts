/**
 * @file Infrastructure Test - Verifies test infrastructure is working correctly
 */

import { TestDatabaseManager } from './utils/test-database-manager';
import { TestFileSystemManager } from './utils/test-filesystem-manager';
import { MockFactory } from './utils/mock-factory';
import { sampleTestData } from './fixtures/sample-data';

describe('Test Infrastructure', () => {
  let dbManager: TestDatabaseManager;
  let fsManager: TestFileSystemManager;

  beforeAll(async () => {
    dbManager = new TestDatabaseManager('unit');
    await dbManager.initialize();
    
    fsManager = new TestFileSystemManager();
    await fsManager.initialize();
  });

  afterAll(async () => {
    await dbManager.destroy();
    await fsManager.destroy();
  });

  describe('Database Manager', () => {
    it('should create and manage test databases', async () => {
      const db = await dbManager.createFreshDatabase('test');
      expect(db).toBeDefined();
      
      // Test basic database operations
      const result = db.prepare('SELECT 1 as test').get();
      expect(result).toEqual({ test: 1 });
    });

    it('should seed database with test data', async () => {
      const db = await dbManager.createFreshDatabase('seed-test');
      await dbManager.seedDatabase(sampleTestData, 'seed-test');
      
      // Verify data was seeded
      const repos = db.prepare('SELECT * FROM repositories').all() as any[];
      expect(repos).toHaveLength(2);
      expect(repos[0].name).toBe('sample-typescript-repo');
    });

    it('should clean up database data', async () => {
      const db = await dbManager.createFreshDatabase('cleanup-test');
      await dbManager.seedDatabase(sampleTestData, 'cleanup-test');
      
      // Verify data exists
      let repos = db.prepare('SELECT * FROM repositories').all() as any[];
      expect(repos).toHaveLength(2);
      
      // Clean up
      await dbManager.cleanup();
      
      // Verify data is cleaned
      repos = db.prepare('SELECT * FROM repositories').all() as any[];
      expect(repos).toHaveLength(0);
    });
  });

  describe('File System Manager', () => {
    it('should create temporary directories', async () => {
      const tempDir = await fsManager.createTempDirectory();
      expect(tempDir).toBeDefined();
      expect(await fsManager.fileExists(tempDir)).toBe(true);
    });

    it('should create file structures', async () => {
      const workspace = await fsManager.createCleanWorkspace();
      
      const structure = {
        'package.json': '{"name": "test"}',
        'src': {
          'index.ts': 'console.log("hello");',
          'utils.ts': 'export const test = true;',
        },
      };
      
      await fsManager.createFileStructure(workspace, structure);
      
      expect(await fsManager.fileExists(`${workspace}/package.json`)).toBe(true);
      expect(await fsManager.fileExists(`${workspace}/src/index.ts`)).toBe(true);
      expect(await fsManager.fileExists(`${workspace}/src/utils.ts`)).toBe(true);
      
      const content = await fsManager.readFile(`${workspace}/package.json`);
      expect(content).toBe('{"name": "test"}');
    });

    it('should create test projects', async () => {
      const workspace = await fsManager.createCleanWorkspace();
      const projectPath = await fsManager.createTestProject(workspace, 'test-project');
      
      expect(await fsManager.fileExists(`${projectPath}/package.json`)).toBe(true);
      expect(await fsManager.fileExists(`${projectPath}/src/index.ts`)).toBe(true);
      expect(await fsManager.fileExists(`${projectPath}/tsconfig.json`)).toBe(true);
    });
  });

  describe('Mock Factory', () => {
    it('should create consistent mocks', () => {
      const mockDb = MockFactory.createMockSQLiteClient();
      expect(mockDb.connect).toBeDefined();
      expect(mockDb.query).toBeDefined();
      expect(mockDb.execute).toBeDefined();
      
      // Test mock functionality
      mockDb.query.mockResolvedValue([{ id: 1, name: 'test' }]);
      expect(mockDb.query('SELECT * FROM test')).resolves.toEqual([{ id: 1, name: 'test' }]);
    });

    it('should create mock embedding service', async () => {
      const mockEmbedding = MockFactory.createMockEmbeddingService();
      expect(mockEmbedding.generateEmbedding).toBeDefined();
      expect(mockEmbedding.batchGenerate).toBeDefined();
      
      // Test deterministic embeddings
      const embedding1 = await mockEmbedding.generateEmbedding('test text');
      const embedding2 = await mockEmbedding.generateEmbedding('test text');
      expect(embedding1).toEqual(embedding2);
    });

    it('should create test data factories', () => {
      const repo = MockFactory.createTestRepository();
      expect(repo.id).toBeDefined();
      expect(repo.name).toBeDefined();
      expect(repo.path).toBeDefined();
      
      const file = MockFactory.createTestFile();
      expect(file.id).toBeDefined();
      expect(file.path).toBeDefined();
      expect(file.content).toBeDefined();
    });
  });

  describe('Test Data Fixtures', () => {
    it('should provide consistent sample data', () => {
      expect(sampleTestData.repositories).toHaveLength(2);
      expect(sampleTestData.files).toHaveLength(2);
      expect(sampleTestData.nodes).toHaveLength(3);
      expect(sampleTestData.edges).toHaveLength(2);
      expect(sampleTestData.embeddings).toHaveLength(2);
      
      // Verify data relationships
      const calculatorFile = sampleTestData.files.find(f => f.name === 'calculator.ts');
      const calculatorNodes = sampleTestData.nodes.filter(n => n.file_id === calculatorFile?.id);
      expect(calculatorNodes).toHaveLength(3); // Calculator class + 2 methods
    });
  });
});
