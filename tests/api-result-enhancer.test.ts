/**
 * @file Tests for result enhancement service (Task 9).
 */

import { ResultEnhancerService, EnhancedSearchResult } from '../src/api/services/result-enhancer';
import { SearchResult } from '../src/modules/search-service';
import { SQLiteClient } from '../src/persistence/db-clients';
import { NodeType } from '../src/types';

// Mock SQLiteClient
const mockSQLiteClient = {
  all: jest.fn(),
  get: jest.fn(),
} as unknown as SQLiteClient;

describe('ResultEnhancerService', () => {
  let enhancerService: ResultEnhancerService;

  beforeEach(() => {
    enhancerService = new ResultEnhancerService(mockSQLiteClient);
    jest.clearAllMocks();
  });

  const createMockSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
    node: {
      id: 'test-node-1',
      type: 'CodeNode' as NodeType,
      properties: {
        name: 'testFunction',
        signature: 'function testFunction(): void',
        language: 'typescript',
        filePath: 'src/test.ts',
        startLine: 10,
        endLine: 15,
      },
      embedding: [],
    },
    similarity: 0.85,
    rank: 1,
    ...overrides,
  });

  describe('Basic Enhancement', () => {
    beforeEach(() => {
      // Mock database responses
      (mockSQLiteClient.get as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT language, size_kb')) {
          return {
            language: 'typescript',
            size_kb: 2.5,
            updated_at: '2025-07-18T10:00:00Z',
          };
        }
        if (query.includes('SELECT c.author, c.date')) {
          return {
            author: 'test-developer',
            date: '2025-07-15T14:30:00Z',
          };
        }
        return null;
      });

      (mockSQLiteClient.all as jest.Mock).mockReturnValue([]);
    });

    it('should enhance results with basic context', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeContext: true,
        includeSyntaxHighlighting: false,
        includeRelatedFiles: false,
      });

      expect(enhanced).toHaveLength(1);
      expect(enhanced[0]).toHaveProperty('context');
      expect(enhanced[0].context).toMatchObject({
        filePath: 'src/test.ts',
        fileName: 'test.ts',
        breadcrumbs: expect.arrayContaining(['src', 'src/test.ts']),
      });
    });

    it('should enhance results with metadata', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult]);

      expect(enhanced[0]).toHaveProperty('metadata');
      expect(enhanced[0].metadata).toMatchObject({
        language: 'typescript',
        author: 'test-developer',
        lastModified: '2025-07-15T14:30:00Z',
        fileSize: expect.any(Number),
      });
    });

    it('should add syntax highlighting when requested', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeSyntaxHighlighting: true,
        includeContext: true,
      });

      expect(enhanced[0].context?.syntaxHighlighted).toBeDefined();
      expect(enhanced[0].context?.syntaxHighlighted).toContain('<span class="keyword">function</span>');
    });

    it('should generate breadcrumbs correctly', async () => {
      const mockResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            filePath: 'src/components/ui/Button.tsx',
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeContext: true,
      });

      expect(enhanced[0].context?.breadcrumbs).toEqual([
        'src',
        'src/components',
        'src/components/ui',
        'src/components/ui/Button.tsx',
      ]);
    });
  });

  describe('Relevance Scoring', () => {
    it('should add relevance explanation when query is provided', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {}, 'testFunction');

      expect(enhanced[0].metadata).toHaveProperty('relevanceScore');
      expect(enhanced[0].metadata).toHaveProperty('relevanceExplanation');
      expect(enhanced[0].metadata).toHaveProperty('relevanceFactors');
      
      const explanation = (enhanced[0].metadata as any).relevanceExplanation;
      expect(explanation).toContain('Exact name match');
    });

    it('should calculate different scores for different match types', async () => {
      const exactMatch = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            name: 'testQuery',
          },
        },
      });

      const partialMatch = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            name: 'testQueryHelper',
          },
        },
      });

      const exactEnhanced = await enhancerService.enhanceResults([exactMatch], {}, 'testQuery');
      const partialEnhanced = await enhancerService.enhanceResults([partialMatch], {}, 'testQuery');

      const exactFactors = (exactEnhanced[0].metadata as any).relevanceFactors;
      const partialFactors = (partialEnhanced[0].metadata as any).relevanceFactors;

      const exactNameFactor = exactFactors.find((f: any) => f.factor === 'Exact name match');
      const partialNameFactor = partialFactors.find((f: any) => f.factor === 'Name contains query');

      expect(exactNameFactor).toBeDefined();
      expect(partialNameFactor).toBeDefined();
      expect(exactNameFactor.contribution).toBeGreaterThan(partialNameFactor.contribution);
    });

    it('should give bonus for recent activity', async () => {
      const recentResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([recentResult], {}, 'test');
      const factors = (enhanced[0].metadata as any).relevanceFactors;
      const recentActivityFactor = factors.find((f: any) => f.factor === 'Recent activity');

      expect(recentActivityFactor).toBeDefined();
      expect(recentActivityFactor.contribution).toBeGreaterThan(0);
    });
  });

  describe('Advanced Syntax Highlighting', () => {
    it('should highlight TypeScript code correctly', async () => {
      const mockResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            signature: 'async function fetchData(): Promise<string>',
            language: 'typescript',
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeSyntaxHighlighting: true,
        includeContext: true,
      });

      const highlighted = enhanced[0].context?.syntaxHighlighted;
      expect(highlighted).toContain('<span class="keyword">async</span>');
      expect(highlighted).toContain('<span class="keyword">function</span>');
      expect(highlighted).toContain('<span class="type">Promise</span>');
    });

    it('should highlight Python code correctly', async () => {
      const mockResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            signature: 'def calculate_sum(a: int, b: int) -> int:',
            language: 'python',
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeSyntaxHighlighting: true,
        includeContext: true,
      });

      const highlighted = enhanced[0].context?.syntaxHighlighted;
      expect(highlighted).toContain('<span class="keyword">def</span>');
    });

    it('should handle comments in syntax highlighting', async () => {
      const mockResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            signature: '// This is a test function\nfunction test() {}',
            language: 'javascript',
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeSyntaxHighlighting: true,
        includeContext: true,
      });

      const highlighted = enhanced[0].context?.syntaxHighlighted;
      expect(highlighted).toContain('<span class="comment">// This is a test function</span>');
      expect(highlighted).toContain('<span class="keyword">function</span>');
    });
  });

  describe('Related Files Discovery', () => {
    beforeEach(() => {
      // Mock related files queries
      (mockSQLiteClient.all as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('file_path LIKE')) {
          return [
            { file_path: 'src/test.spec.ts', file_name: 'test.spec.ts' },
            { file_path: 'src/testUtils.ts', file_name: 'testUtils.ts' },
          ];
        }
        if (query.includes('file_name LIKE')) {
          return [
            { file_path: 'src/components/Test.tsx', file_name: 'Test.tsx' },
          ];
        }
        if (query.includes('file_extension =')) {
          return [
            { file_path: 'src/other.ts', file_name: 'other.ts' },
          ];
        }
        if (query.includes('imported_path LIKE')) {
          return [
            { file_path: 'src/importer.ts' },
          ];
        }
        return [];
      });
    });

    it('should find related files with relationships', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeRelatedFiles: true,
      });

      expect(enhanced[0].context?.relatedFiles).toBeDefined();
      expect(enhanced[0].context?.relatedFiles?.length).toBeGreaterThan(0);
      
      const relationships = (enhanced[0].metadata as any).fileRelationships;
      expect(relationships).toBeDefined();
      expect(relationships[0]).toHaveProperty('file');
      expect(relationships[0]).toHaveProperty('relationship');
      expect(relationships[0]).toHaveProperty('strength');
    });

    it('should prioritize relationships by strength', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeRelatedFiles: true,
      });

      const relationships = (enhanced[0].metadata as any).fileRelationships;
      
      // Should be sorted by strength (descending)
      for (let i = 1; i < relationships.length; i++) {
        expect(relationships[i - 1].strength).toBeGreaterThanOrEqual(relationships[i].strength);
      }
    });

    it('should not include duplicate files', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeRelatedFiles: true,
      });

      const relatedFiles = enhanced[0].context?.relatedFiles || [];
      const uniqueFiles = new Set(relatedFiles);
      
      expect(relatedFiles.length).toBe(uniqueFiles.size);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (mockSQLiteClient.get as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult]);

      // Should still return enhanced results, just without some metadata
      expect(enhanced).toHaveLength(1);
      expect(enhanced[0]).toHaveProperty('node');
      expect(enhanced[0]).toHaveProperty('similarity');
    });

    it('should handle missing file paths gracefully', async () => {
      const mockResult = createMockSearchResult({
        node: {
          ...createMockSearchResult().node,
          properties: {
            ...createMockSearchResult().node.properties,
            filePath: undefined,
          },
        },
      });

      const enhanced = await enhancerService.enhanceResults([mockResult], {
        includeContext: true,
        includeRelatedFiles: true,
      });

      expect(enhanced).toHaveLength(1);
      // Should not crash, but context might be limited
    });

    it('should handle empty results array', async () => {
      const enhanced = await enhancerService.enhanceResults([]);
      expect(enhanced).toEqual([]);
    });
  });

  describe('Performance', () => {
    it('should add enhancement timestamp', async () => {
      const mockResult = createMockSearchResult();
      const enhanced = await enhancerService.enhanceResults([mockResult]);

      expect(enhanced[0].metadata).toHaveProperty('enhancementTimestamp');
      expect(enhanced[0].metadata?.enhancementTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle large result sets efficiently', async () => {
      const mockResults = Array.from({ length: 50 }, (_, i) => 
        createMockSearchResult({
          node: {
            ...createMockSearchResult().node,
            id: `test-node-${i}`,
            properties: {
              ...createMockSearchResult().node.properties,
              name: `testFunction${i}`,
            },
          },
        })
      );

      const startTime = Date.now();
      const enhanced = await enhancerService.enhanceResults(mockResults);
      const endTime = Date.now();

      expect(enhanced).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
