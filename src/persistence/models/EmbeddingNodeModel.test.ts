/**
 * @file Unit tests for EmbeddingNodeModel class
 * Tests embedding vector validation, storage, and specialized model behavior
 */

import { EmbeddingNodeModel } from './EmbeddingNodeModel';
import { EmbeddingNodeDTO } from './EmbeddingNodeDTO';
import { TestDataFactory } from '../../../tests/utils/TestDataFactory';

describe('EmbeddingNodeModel', () => {
  let embeddingNodeDto: EmbeddingNodeDTO;
  let embeddingNodeModel: EmbeddingNodeModel;

  beforeEach(() => {
    // Reset test data factory counter for consistent test data
    TestDataFactory.resetCounter();
    
    // Create test embedding vector (384 dimensions)
    const testEmbedding = TestDataFactory.createEmbedding(384);
    
    embeddingNodeDto = new EmbeddingNodeDTO(
      'embedding-node-1',
      'graph-node-1',
      JSON.stringify(testEmbedding),
      'function testFunction() { return "test"; }',
      'FunctionNode',
      'src/test.ts'
    );
    
    embeddingNodeModel = new EmbeddingNodeModel(embeddingNodeDto);
  });

  describe('constructor', () => {
    it('should initialize with provided EmbeddingNodeDTO', () => {
      expect(embeddingNodeModel).toBeInstanceOf(EmbeddingNodeModel);
      expect(embeddingNodeModel.getDto()).toBe(embeddingNodeDto);
    });

    it('should set all properties from DTO', () => {
      expect(embeddingNodeModel.id).toBe('embedding-node-1');
      expect(embeddingNodeModel.node_id).toBe('graph-node-1');
      expect(embeddingNodeModel.embedding).toBe(embeddingNodeDto.embedding);
      expect(embeddingNodeModel.source_text).toBe('function testFunction() { return "test"; }');
      expect(embeddingNodeModel.node_type).toBe('FunctionNode');
      expect(embeddingNodeModel.file_path).toBe('src/test.ts');
    });

    it('should handle null optional properties', () => {
      const dtoWithNulls = new EmbeddingNodeDTO(
        'embedding-node-2',
        'graph-node-2',
        JSON.stringify([0.1, 0.2, 0.3]),
        null,
        null,
        null
      );
      
      const modelWithNulls = new EmbeddingNodeModel(dtoWithNulls);
      
      expect(modelWithNulls.source_text).toBeNull();
      expect(modelWithNulls.node_type).toBeNull();
      expect(modelWithNulls.file_path).toBeNull();
    });

    it('should handle empty embedding vector', () => {
      const dtoWithEmptyEmbedding = new EmbeddingNodeDTO(
        'embedding-node-3',
        'graph-node-3',
        JSON.stringify([]),
        'empty embedding test',
        'TestNode',
        'src/empty.ts'
      );
      
      const modelWithEmptyEmbedding = new EmbeddingNodeModel(dtoWithEmptyEmbedding);
      
      expect(modelWithEmptyEmbedding.embedding).toBe('[]');
      expect(JSON.parse(modelWithEmptyEmbedding.embedding)).toEqual([]);
    });
  });

  describe('embedding vector validation and storage', () => {
    it('should store embedding as JSON string', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const dto = new EmbeddingNodeDTO(
        'embedding-test-1',
        'node-1',
        JSON.stringify(embedding),
        'test source',
        'TestNode',
        'test.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(typeof model.embedding).toBe('string');
      expect(JSON.parse(model.embedding)).toEqual(embedding);
    });

    it('should handle high-dimensional embeddings', () => {
      const highDimEmbedding = TestDataFactory.createEmbedding(1536); // OpenAI embedding size
      const dto = new EmbeddingNodeDTO(
        'embedding-high-dim',
        'node-high-dim',
        JSON.stringify(highDimEmbedding),
        'high dimensional test',
        'TestNode',
        'high-dim.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      const parsedEmbedding = JSON.parse(model.embedding);
      
      expect(parsedEmbedding).toHaveLength(1536);
      expect(parsedEmbedding.every((val: number) => typeof val === 'number')).toBe(true);
    });

    it('should handle normalized embeddings', () => {
      const normalizedEmbedding = TestDataFactory.createEmbedding(384);
      const dto = new EmbeddingNodeDTO(
        'embedding-normalized',
        'node-normalized',
        JSON.stringify(normalizedEmbedding),
        'normalized embedding test',
        'TestNode',
        'normalized.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      const parsedEmbedding = JSON.parse(model.embedding);
      
      // Check that embedding is normalized (magnitude should be close to 1)
      const magnitude = Math.sqrt(parsedEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should handle zero embeddings', () => {
      const zeroEmbedding = new Array(384).fill(0);
      const dto = new EmbeddingNodeDTO(
        'embedding-zero',
        'node-zero',
        JSON.stringify(zeroEmbedding),
        'zero embedding test',
        'TestNode',
        'zero.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      const parsedEmbedding = JSON.parse(model.embedding);
      
      expect(parsedEmbedding).toHaveLength(384);
      expect(parsedEmbedding.every((val: number) => val === 0)).toBe(true);
    });

    it('should handle embeddings with extreme values', () => {
      const extremeEmbedding = [-1, 1, -0.999, 0.999, 0];
      const dto = new EmbeddingNodeDTO(
        'embedding-extreme',
        'node-extreme',
        JSON.stringify(extremeEmbedding),
        'extreme values test',
        'TestNode',
        'extreme.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      const parsedEmbedding = JSON.parse(model.embedding);
      
      expect(parsedEmbedding).toEqual(extremeEmbedding);
      expect(Math.min(...parsedEmbedding)).toBe(-1);
      expect(Math.max(...parsedEmbedding)).toBe(1);
    });
  });

  describe('source text handling', () => {
    it('should store source text for code nodes', () => {
      const sourceCode = `
        function calculateSum(a: number, b: number): number {
          return a + b;
        }
      `;
      
      const dto = new EmbeddingNodeDTO(
        'embedding-code',
        'node-code',
        JSON.stringify([0.1, 0.2, 0.3]),
        sourceCode,
        'FunctionNode',
        'src/calculator.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.source_text).toBe(sourceCode);
      expect(model.node_type).toBe('FunctionNode');
      expect(model.file_path).toBe('src/calculator.ts');
    });

    it('should handle long source text', () => {
      const longSourceText = 'a'.repeat(10000); // 10KB of text
      const dto = new EmbeddingNodeDTO(
        'embedding-long',
        'node-long',
        JSON.stringify([0.1, 0.2, 0.3]),
        longSourceText,
        'ClassNode',
        'src/large-class.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.source_text).toBe(longSourceText);
      expect(model.source_text?.length).toBe(10000);
    });

    it('should handle source text with special characters', () => {
      const specialText = 'function test() { return "Hello, 世界! 🌍"; }';
      const dto = new EmbeddingNodeDTO(
        'embedding-special',
        'node-special',
        JSON.stringify([0.1, 0.2, 0.3]),
        specialText,
        'FunctionNode',
        'src/international.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.source_text).toBe(specialText);
    });

    it('should handle multiline source text', () => {
      const multilineText = `class TestClass {
        private value: number;
        
        constructor(value: number) {
          this.value = value;
        }
        
        getValue(): number {
          return this.value;
        }
      }`;
      
      const dto = new EmbeddingNodeDTO(
        'embedding-multiline',
        'node-multiline',
        JSON.stringify([0.1, 0.2, 0.3]),
        multilineText,
        'ClassNode',
        'src/test-class.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.source_text).toBe(multilineText);
      expect(model.source_text?.split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('node type classification', () => {
    const nodeTypes = [
      'FunctionNode',
      'ClassNode',
      'VariableNode',
      'ImportNode',
      'ExportNode',
      'TestNode',
      'FileNode',
      'RepositoryNode'
    ];

    nodeTypes.forEach(nodeType => {
      it(`should handle ${nodeType} type`, () => {
        const dto = new EmbeddingNodeDTO(
          `embedding-${nodeType.toLowerCase()}`,
          `node-${nodeType.toLowerCase()}`,
          JSON.stringify([0.1, 0.2, 0.3]),
          `source text for ${nodeType}`,
          nodeType,
          `src/${nodeType.toLowerCase()}.ts`
        );
        
        const model = new EmbeddingNodeModel(dto);
        
        expect(model.node_type).toBe(nodeType);
      });
    });

    it('should handle custom node types', () => {
      const customType = 'CustomBusinessLogicNode';
      const dto = new EmbeddingNodeDTO(
        'embedding-custom',
        'node-custom',
        JSON.stringify([0.1, 0.2, 0.3]),
        'custom node source',
        customType,
        'src/custom.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.node_type).toBe(customType);
    });
  });

  describe('file path handling', () => {
    it('should handle various file path formats', () => {
      const testCases = [
        'src/index.ts',
        './src/utils/helper.ts',
        '/absolute/path/to/file.ts',
        'src\\windows\\path\\file.ts',
        'src/nested/deeply/nested/file.ts',
        'file.ts'
      ];

      testCases.forEach((filePath, index) => {
        const dto = new EmbeddingNodeDTO(
          `embedding-path-${index}`,
          `node-path-${index}`,
          JSON.stringify([0.1, 0.2, 0.3]),
          'test source',
          'TestNode',
          filePath
        );
        
        const model = new EmbeddingNodeModel(dto);
        
        expect(model.file_path).toBe(filePath);
      });
    });

    it('should handle file paths with special characters', () => {
      const specialPath = 'src/files with spaces/special-chars_123.ts';
      const dto = new EmbeddingNodeDTO(
        'embedding-special-path',
        'node-special-path',
        JSON.stringify([0.1, 0.2, 0.3]),
        'test source',
        'TestNode',
        specialPath
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.file_path).toBe(specialPath);
    });

    it('should handle very long file paths', () => {
      const longPath = 'src/' + 'very-long-directory-name/'.repeat(20) + 'file.ts';
      const dto = new EmbeddingNodeDTO(
        'embedding-long-path',
        'node-long-path',
        JSON.stringify([0.1, 0.2, 0.3]),
        'test source',
        'TestNode',
        longPath
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.file_path).toBe(longPath);
      expect(model.file_path!.length).toBeGreaterThan(400);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(embeddingNodeModel.getTableName()).toBe('embedding_nodes');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new EmbeddingNodeDTO(
        'another-embedding',
        'another-node',
        JSON.stringify([0.1, 0.2]),
        'another source',
        'AnotherNode',
        'another.ts'
      );
      const anotherModel = new EmbeddingNodeModel(anotherDto);
      
      expect(embeddingNodeModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = embeddingNodeModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        node_id: 'TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE',
        embedding: 'TEXT NOT NULL',
        source_text: 'TEXT',
        node_type: 'TEXT',
        file_path: 'TEXT',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should include foreign key constraint for node_id', () => {
      const schema = embeddingNodeModel.getSchema();
      
      expect(schema.node_id).toContain('REFERENCES graph_nodes(id)');
      expect(schema.node_id).toContain('ON DELETE CASCADE');
    });

    it('should mark required fields as NOT NULL', () => {
      const schema = embeddingNodeModel.getSchema();
      
      expect(schema.id).toContain('PRIMARY KEY');
      expect(schema.node_id).toContain('NOT NULL');
      expect(schema.embedding).toContain('NOT NULL');
    });

    it('should allow optional fields to be nullable', () => {
      const schema = embeddingNodeModel.getSchema();
      
      expect(schema.source_text).toBe('TEXT');
      expect(schema.node_type).toBe('TEXT');
      expect(schema.file_path).toBe('TEXT');
    });

    it('should include timestamp fields', () => {
      const schema = embeddingNodeModel.getSchema();
      
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('inheritance from BaseModel', () => {
    it('should inherit getId method', () => {
      expect(embeddingNodeModel.getId()).toBe('embedding-node-1');
    });

    it('should inherit getDto method', () => {
      const dto = embeddingNodeModel.getDto();
      expect(dto).toBe(embeddingNodeDto);
      expect(dto).toBeInstanceOf(EmbeddingNodeDTO);
    });

    it('should maintain DTO reference integrity', () => {
      const dto1 = embeddingNodeModel.getDto();
      const dto2 = embeddingNodeModel.getDto();
      expect(dto1).toBe(dto2);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed embedding JSON gracefully', () => {
      const dtoWithMalformedEmbedding = new EmbeddingNodeDTO(
        'embedding-malformed',
        'node-malformed',
        'invalid-json-string',
        'test source',
        'TestNode',
        'test.ts'
      );
      
      const model = new EmbeddingNodeModel(dtoWithMalformedEmbedding);
      
      // Model should still be created, validation would happen at persistence layer
      expect(model.embedding).toBe('invalid-json-string');
    });

    it('should handle very large embeddings', () => {
      const largeEmbedding = TestDataFactory.createEmbedding(10000);
      const dto = new EmbeddingNodeDTO(
        'embedding-large',
        'node-large',
        JSON.stringify(largeEmbedding),
        'large embedding test',
        'TestNode',
        'large.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      const parsedEmbedding = JSON.parse(model.embedding);
      
      expect(parsedEmbedding).toHaveLength(10000);
    });

    it('should handle empty strings for optional fields', () => {
      const dto = new EmbeddingNodeDTO(
        'embedding-empty',
        'node-empty',
        JSON.stringify([0.1, 0.2, 0.3]),
        '',
        '',
        ''
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.source_text).toBe('');
      expect(model.node_type).toBe('');
      expect(model.file_path).toBe('');
    });

    it('should handle special characters in node_id', () => {
      const specialNodeId = 'node-with-special-chars-!@#$%^&*()';
      const dto = new EmbeddingNodeDTO(
        'embedding-special-node-id',
        specialNodeId,
        JSON.stringify([0.1, 0.2, 0.3]),
        'test source',
        'TestNode',
        'test.ts'
      );
      
      const model = new EmbeddingNodeModel(dto);
      
      expect(model.node_id).toBe(specialNodeId);
    });
  });

  describe('model state consistency', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = embeddingNodeModel.getId();
      const initialNodeId = embeddingNodeModel.node_id;
      const initialEmbedding = embeddingNodeModel.embedding;
      
      // State should remain consistent
      expect(embeddingNodeModel.getId()).toBe(initialId);
      expect(embeddingNodeModel.node_id).toBe(initialNodeId);
      expect(embeddingNodeModel.embedding).toBe(initialEmbedding);
    });

    it('should reflect DTO changes through getDto method', () => {
      const originalSourceText = embeddingNodeModel.getDto().source_text;
      
      // Modify DTO
      embeddingNodeModel.getDto().source_text = 'modified source text';
      
      expect(embeddingNodeModel.getDto().source_text).toBe('modified source text');
      expect(embeddingNodeModel.getDto().source_text).not.toBe(originalSourceText);
    });

    it('should handle DTO property updates through getDto', () => {
      const dto = embeddingNodeModel.getDto();
      const originalNodeType = dto.node_type;
      
      dto.node_type = 'ModifiedNode';
      dto.updated_at = new Date().toISOString();
      
      expect(embeddingNodeModel.getDto().node_type).toBe('ModifiedNode');
      expect(embeddingNodeModel.getDto().node_type).not.toBe(originalNodeType);
    });
  });
});
