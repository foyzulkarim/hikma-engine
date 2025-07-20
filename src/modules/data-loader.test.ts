// /**
//  * @file Unit tests for DataLoader with unified SQLite storage
//  */

// import { DataLoader } from './data-loader';
// import { ConfigManager } from '../config';
// import { NodeWithEmbedding, FileNode, CodeNode, CommitNode, Edge } from '../types';
// import * as fs from 'fs';
// import * as path from 'path';
// import * as os from 'os';

// describe('DataLoader', () => {
//   let dataLoader: DataLoader;
//   let testDbPath: string;
//   let config: ConfigManager;

//   beforeAll(async () => {
//     // Create temporary database file for testing
//     const tempDir = os.tmpdir();
//     testDbPath = path.join(tempDir, `test-dataloader-${Date.now()}.db`);
    
//     // Initialize config manager
//     config = new ConfigManager(process.cwd());
//   });

//   beforeEach(async () => {
//     // Create fresh DataLoader instance for each test
//     dataLoader = new DataLoader(testDbPath, config);
//   });

//   afterEach(async () => {
//     // Clean up after each test
//     try {
//       await dataLoader.disconnect();
//     } catch (error) {
//       // Ignore disconnect errors in tests
//     }
    
//     // Remove test database file
//     if (fs.existsSync(testDbPath)) {
//       fs.unlinkSync(testDbPath);
//     }
//   });

//   describe('Initialization and Connection', () => {
//     it('should initialize DataLoader with SQLite path and config', () => {
//       expect(dataLoader).toBeDefined();
//     });

//     it('should connect to SQLite database only', async () => {
//       const stats = await dataLoader.getStats();
      
//       expect(stats).toHaveProperty('databases');
//       expect(stats).toHaveProperty('connectivity');
//       expect(stats.databases).toHaveProperty('sqlite');
//       expect(stats.connectivity).toHaveProperty('sqlite');
      
//       // Should not have LanceDB references
//       expect(stats.databases).not.toHaveProperty('lancedb');
//       expect(stats.connectivity).not.toHaveProperty('lancedb');
//     });

//     it('should handle connection failures gracefully', async () => {
//       const invalidLoader = new DataLoader('/invalid/path/database.db', config);
      
//       await expect(invalidLoader.load([], [])).rejects.toThrow();
//     });
//   });

//   // describe('Data Loading with Vectors', () => {
//   //   const createTestNodes = (): NodeWithEmbedding[] => [
//   //     {
//   //       id: 'file-1',
//   //       type: 'FileNode',
//   //       path: '/test/file1.ts',
//   //       name: 'file1.ts',
//   //       extension: 'ts',
//   //       size: 1000,
//   //       contentHash: 'hash1',
//   //       repositoryId: 'repo-1',
//   //       createdAt: new Date(),
//   //       updatedAt: new Date(),
//   //       embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
//   //     } as FileNode & { embedding: number[] },
//   //     {
//   //       id: 'code-1',
//   //       type: 'CodeNode',
//   //       fileId: 'file-1',
//   //       startLine: 1,
//   //       endLine: 10,
//   //       content: 'function test() { return true; }',
//   //       language: 'typescript',
//   //       repositoryId: 'repo-1',
//   //       createdAt: new Date(),
//   //       updatedAt: new Date(),
//   //       embedding: [0.2, 0.3, 0.4, 0.5, 0.6]
//   //     } as CodeNode & { embedding: number[] },
//   //     {
//   //       id: 'commit-1',
//   //       type: 'CommitNode',
//   //       hash: 'abc123',
//   //       message: 'Add test feature',
//   //       authorName: 'Test Author',
//   //       authorEmail: 'test@example.com',
//   //       date: new Date(),
//   //       repositoryId: 'repo-1',
//   //       createdAt: new Date(),
//   //       updatedAt: new Date(),
//   //       embedding: [0.3, 0.4, 0.5, 0.6, 0.7]
//   //     } as CommitNode & { embedding: number[] }
//   //   ];

//   //   const createTestEdges = (): Edge[] => [
//   //     {
//   //       id: 'edge-1',
//   //       source: 'file-1',
//   //       target: 'code-1',
//   //       type: 'contains',
//   //       properties: {},
//   //       createdAt: new Date(),
//   //       updatedAt: new Date()
//   //     }
//   //   ];

//   //   it('should load nodes and edges to unified SQLite storage', async () => {
//   //     const nodes = createTestNodes();
//   //     const edges = createTestEdges();

//   //     await dataLoader.load(nodes, edges);

//   //     // Verify data was loaded
//   //     const stats = await dataLoader.getStats();
//   //     expect(stats.databases.sqlite).toBe(true);
//   //   });

//   //   it('should handle nodes with embeddings correctly', async () => {
//   //     const nodes = createTestNodes();
//   //     const edges: Edge[] = [];

//   //     await dataLoader.load(nodes, edges);

//   //     // All nodes should be loaded successfully
//   //     const stats = await dataLoader.getStats();
//   //     expect(stats.databases.sqlite).toBe(true);
//   //   });

//   //   it('should handle nodes without embeddings gracefully', async () => {
//   //     const nodesWithoutEmbeddings: NodeWithEmbedding[] = [
//   //       {
//   //         id: 'file-2',
//   //         type: 'FileNode',
//   //         path: '/test/file2.ts',
//   //         name: 'file2.ts',
//   //         extension: 'ts',
//   //         size: 1000,
//   //         contentHash: 'hash2',
//   //         repositoryId: 'repo-1',
//   //         createdAt: new Date(),
//   //         updatedAt: new Date()
//   //         // No embedding property
//   //       } as FileNode
//   //     ];

//   //     await expect(
//   //       dataLoader.load(nodesWithoutEmbeddings, [])
//   //     ).resolves.not.toThrow();
//   //   });

//   //   it('should handle large datasets efficiently', async () => {
//   //     const largeNodeSet: NodeWithEmbedding[] = [];
      
//   //     // Create 500 test nodes
//   //     for (let i = 0; i < 500; i++) {
//   //       largeNodeSet.push({
//   //         id: `file-${i}`,
//   //         type: 'FileNode',
//   //         path: `/test/file${i}.ts`,
//   //         name: `file${i}.ts`,
//   //         extension: 'ts',
//   //         size: 1000,
//   //         contentHash: `hash${i}`,
//   //         repositoryId: 'repo-1',
//   //         createdAt: new Date(),
//   //         updatedAt: new Date(),
//   //         embedding: Array.from({ length: 384 }, () => Math.random())
//   //       } as FileNode & { embedding: number[] });
//   //     }

//   //     const startTime = Date.now();
//   //     await dataLoader.load(largeNodeSet, []);
//   //     const endTime = Date.now();

//   //     // Should complete within reasonable time (less than 10 seconds)
//   //     expect(endTime - startTime).toBeLessThan(10000);
//   //   });
//   // });

//   describe('Error Handling and Recovery', () => {
//     it('should handle database connection errors', async () => {
//       const invalidLoader = new DataLoader('/invalid/path/database.db', config);
//       const nodes = createTestNodes();

//       await expect(invalidLoader.load(nodes, [])).rejects.toThrow();
//     });

//     it('should handle malformed node data', async () => {
//       const malformedNodes: any[] = [
//         {
//           // Missing required fields
//           id: 'malformed-1',
//           type: 'FileNode'
//           // Missing path, name, etc.
//         }
//       ];

//       await expect(
//         dataLoader.load(malformedNodes, [])
//       ).rejects.toThrow();
//     });

//     it('should handle partial failures gracefully', async () => {
//       const mixedNodes: NodeWithEmbedding[] = [
//         // Valid node
//         {
//           id: 'file-1',
//           type: 'FileNode',
//           path: '/test/file1.ts',
//           name: 'file1.ts',
//           extension: 'ts',
//           size: 1000,
//           contentHash: 'hash1',
//           repositoryId: 'repo-1',
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
//         } as FileNode & { embedding: number[] },
//         // Node with invalid embedding
//         {
//           id: 'file-2',
//           type: 'FileNode',
//           path: '/test/file2.ts',
//           name: 'file2.ts',
//           extension: 'ts',
//           size: 1000,
//           contentHash: 'hash2',
//           repositoryId: 'repo-1',
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           embedding: [NaN, Infinity, -Infinity] // Invalid embedding
//         } as FileNode & { embedding: number[] }
//       ];

//       // Should handle the error gracefully
//       await expect(
//         dataLoader.load(mixedNodes, [])
//       ).rejects.toThrow();
//     });

//     it('should retry failed operations', async () => {
//       const nodes = createTestNodes();
      
//       // First attempt might fail due to connection issues
//       // DataLoader should retry automatically
//       await expect(
//         dataLoader.load(nodes, [])
//       ).resolves.not.toThrow();
//     });
//   });

//   describe('Statistics and Monitoring', () => {
//     it('should provide accurate loading statistics', async () => {
//       const nodes = createTestNodes();
//       const edges = createTestEdges();

//       await dataLoader.load(nodes, edges);

//       const stats = await dataLoader.getStats();
      
//       expect(stats).toHaveProperty('databases');
//       expect(stats).toHaveProperty('lastLoad');
//       expect(stats).toHaveProperty('connectivity');
      
//       expect(stats.databases.sqlite).toBe(true);
//       expect(stats.connectivity.sqlite).toBe(true);
//       expect(stats.lastLoad).toBeInstanceOf(Date);
//     });

//     it('should track database connectivity status', async () => {
//       const connectivity = await dataLoader.verifyDatabaseConnectivity();
      
//       expect(connectivity).toHaveProperty('sqlite');
//       expect(typeof connectivity.sqlite).toBe('boolean');
      
//       // Should not have LanceDB connectivity
//       expect(connectivity).not.toHaveProperty('lancedb');
//     });
//   });

//   describe('Unified Storage Verification', () => {
//     it('should store all data types in single SQLite database', async () => {
//       const nodes: NodeWithEmbedding[] = [
//         {
//           id: 'file-1',
//           type: 'FileNode',
//           path: '/test/file1.ts',
//           name: 'file1.ts',
//           extension: 'ts',
//           size: 1000,
//           contentHash: 'hash1',
//           repositoryId: 'repo-1',
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           embedding: [0.1, 0.2, 0.3]
//         } as FileNode & { embedding: number[] },
//         {
//           id: 'code-1',
//           type: 'CodeNode',
//           fileId: 'file-1',
//           startLine: 1,
//           endLine: 10,
//           content: 'function test() {}',
//           language: 'typescript',
//           repositoryId: 'repo-1',
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           embedding: [0.2, 0.3, 0.4]
//         } as CodeNode & { embedding: number[] },
//         {
//           id: 'commit-1',
//           type: 'CommitNode',
//           hash: 'abc123',
//           message: 'Test commit',
//           authorName: 'Test Author',
//           authorEmail: 'test@example.com',
//           date: new Date(),
//           repositoryId: 'repo-1',
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           embedding: [0.3, 0.4, 0.5]
//         } as CommitNode & { embedding: number[] }
//       ];

//       const edges: Edge[] = [
//         {
//           id: 'edge-1',
//           source: 'file-1',
//           target: 'code-1',
//           type: 'contains',
//           properties: {},
//           createdAt: new Date(),
//           updatedAt: new Date()
//         }
//       ];

//       await dataLoader.load(nodes, edges);

//       // Verify all data is in single database
//       const stats = await dataLoader.getStats();
//       expect(stats.databases.sqlite).toBe(true);
      
//       // Should only have SQLite connection
//       expect(Object.keys(stats.databases)).toEqual(['sqlite']);
//       expect(Object.keys(stats.connectivity)).toEqual(['sqlite']);
//     });

//     it('should handle vector and metadata storage together', async () => {
//       const nodeWithEmbedding: NodeWithEmbedding = {
//         id: 'test-node',
//         type: 'FileNode',
//         path: '/test/file.ts',
//         name: 'file.ts',
//         extension: 'ts',
//         size: 1000,
//         contentHash: 'hash',
//         repositoryId: 'repo-1',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         embedding: Array.from({ length: 384 }, () => Math.random())
//       } as FileNode & { embedding: number[] };

//       await dataLoader.load([nodeWithEmbedding], []);

//       // Both metadata and vector should be stored in same database
//       const stats = await dataLoader.getStats();
//       expect(stats.databases.sqlite).toBe(true);
//     });
//   });

//   describe('Disconnection and Cleanup', () => {
//     it('should disconnect from SQLite database cleanly', async () => {
//       const nodes = createTestNodes();
//       await dataLoader.load(nodes, []);

//       await dataLoader.disconnect();

//       // After disconnect, connectivity should be false
//       const connectivity = await dataLoader.verifyDatabaseConnectivity();
//       expect(connectivity.sqlite).toBe(false);
//     });

//     it('should handle multiple disconnect calls gracefully', async () => {
//       await dataLoader.disconnect();
//       await expect(dataLoader.disconnect()).resolves.not.toThrow();
//     });
//   });

//   // Helper function to create test nodes
//   function createTestNodes(): NodeWithEmbedding[] {
//     return [
//       {
//         id: 'file-1',
//         type: 'FileNode',
//         path: '/test/file1.ts',
//         name: 'file1.ts',
//         extension: 'ts',
//         size: 1000,
//         contentHash: 'hash1',
//         repositoryId: 'repo-1',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
//       } as FileNode & { embedding: number[] }
//     ];
//   }
// });
