/**
 * @file Unit tests for GraphNodeModel class
 * Tests graph node model functionality including schema definition, node properties, and relationships
 */

import { GraphNodeModel } from './GraphNodeModel';
import { GraphNodeDTO } from './GraphNodeDTO';

describe('GraphNodeModel', () => {
  let graphNodeDto: GraphNodeDTO;
  let graphNodeModel: GraphNodeModel;

  beforeEach(() => {
    graphNodeDto = new GraphNodeDTO(
      'node-123',
      'function:calculateSum',
      'function',
      JSON.stringify({
        name: 'calculateSum',
        parameters: ['a: number', 'b: number'],
        returnType: 'number',
        visibility: 'public'
      }),
      {
        repo_id: 'repo-456',
        commit_sha: 'abc123def456',
        file_path: 'src/utils/math.ts',
        line: 15,
        col: 5, // Use non-zero value to avoid null conversion
        signature_hash: 'sig_hash_123',
        labels: JSON.stringify(['utility', 'math', 'pure'])
      }
    );
    graphNodeModel = new GraphNodeModel(graphNodeDto);
  });

  describe('constructor', () => {
    it('should initialize with provided GraphNodeDTO', () => {
      expect(graphNodeModel).toBeInstanceOf(GraphNodeModel);
      expect(graphNodeModel.getDto()).toBe(graphNodeDto);
    });

    it('should inherit from BaseModel', () => {
      expect(graphNodeModel.getId()).toBe('node-123');
      expect(graphNodeModel.getDto()).toBeInstanceOf(GraphNodeDTO);
    });

    it('should require DTO parameter in constructor', () => {
      const dto = new GraphNodeDTO('test-node', 'test:key', 'test', '{}');
      const model = new GraphNodeModel(dto);
      
      expect(model.getDto()).toBe(dto);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(graphNodeModel.getTableName()).toBe('graph_nodes');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new GraphNodeDTO('node-789', 'class:Button', 'class', '{}');
      const anotherModel = new GraphNodeModel(anotherDto);
      
      expect(graphNodeModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = graphNodeModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        business_key: 'TEXT NOT NULL',
        node_type: 'TEXT NOT NULL',
        properties: 'TEXT NOT NULL',
        repo_id: 'TEXT',
        commit_sha: 'TEXT',
        file_path: 'TEXT',
        line: 'INTEGER',
        col: 'INTEGER',
        signature_hash: 'TEXT',
        labels: 'TEXT',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should include primary key constraint', () => {
      const schema = graphNodeModel.getSchema();
      expect(schema.id).toBe('TEXT PRIMARY KEY');
    });

    it('should include NOT NULL constraints for required fields', () => {
      const schema = graphNodeModel.getSchema();
      expect(schema.business_key).toBe('TEXT NOT NULL');
      expect(schema.node_type).toBe('TEXT NOT NULL');
      expect(schema.properties).toBe('TEXT NOT NULL');
    });

    it('should include optional fields without NOT NULL', () => {
      const schema = graphNodeModel.getSchema();
      expect(schema.repo_id).toBe('TEXT');
      expect(schema.commit_sha).toBe('TEXT');
      expect(schema.file_path).toBe('TEXT');
      expect(schema.signature_hash).toBe('TEXT');
      expect(schema.labels).toBe('TEXT');
    });

    it('should include INTEGER type for position fields', () => {
      const schema = graphNodeModel.getSchema();
      expect(schema.line).toBe('INTEGER');
      expect(schema.col).toBe('INTEGER');
    });

    it('should include timestamp fields with defaults', () => {
      const schema = graphNodeModel.getSchema();
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('data validation and node types', () => {
    it('should handle function nodes', () => {
      const functionDto = new GraphNodeDTO(
        'func-node',
        'function:processData',
        'function',
        JSON.stringify({
          name: 'processData',
          parameters: ['data: any[]'],
          returnType: 'ProcessedData',
          async: true
        })
      );
      const functionModel = new GraphNodeModel(functionDto);

      expect(functionModel.getDto().node_type).toBe('function');
      expect(functionModel.getDto().business_key).toBe('function:processData');
      
      const properties = JSON.parse(functionModel.getDto().properties);
      expect(properties.name).toBe('processData');
      expect(properties.async).toBe(true);
    });

    it('should handle class nodes', () => {
      const classDto = new GraphNodeDTO(
        'class-node',
        'class:UserService',
        'class',
        JSON.stringify({
          name: 'UserService',
          extends: 'BaseService',
          implements: ['IUserService'],
          abstract: false
        })
      );
      const classModel = new GraphNodeModel(classDto);

      expect(classModel.getDto().node_type).toBe('class');
      expect(classModel.getDto().business_key).toBe('class:UserService');
      
      const properties = JSON.parse(classModel.getDto().properties);
      expect(properties.name).toBe('UserService');
      expect(properties.extends).toBe('BaseService');
      expect(properties.implements).toEqual(['IUserService']);
    });

    it('should handle interface nodes', () => {
      const interfaceDto = new GraphNodeDTO(
        'interface-node',
        'interface:IRepository',
        'interface',
        JSON.stringify({
          name: 'IRepository',
          methods: ['save', 'find', 'delete'],
          generic: true
        })
      );
      const interfaceModel = new GraphNodeModel(interfaceDto);

      expect(interfaceModel.getDto().node_type).toBe('interface');
      expect(interfaceModel.getDto().business_key).toBe('interface:IRepository');
      
      const properties = JSON.parse(interfaceModel.getDto().properties);
      expect(properties.methods).toEqual(['save', 'find', 'delete']);
      expect(properties.generic).toBe(true);
    });

    it('should handle variable nodes', () => {
      const variableDto = new GraphNodeDTO(
        'var-node',
        'variable:CONFIG',
        'variable',
        JSON.stringify({
          name: 'CONFIG',
          type: 'AppConfig',
          const: true,
          exported: true
        })
      );
      const variableModel = new GraphNodeModel(variableDto);

      expect(variableModel.getDto().node_type).toBe('variable');
      expect(variableModel.getDto().business_key).toBe('variable:CONFIG');
      
      const properties = JSON.parse(variableModel.getDto().properties);
      expect(properties.const).toBe(true);
      expect(properties.exported).toBe(true);
    });

    it('should handle import/export nodes', () => {
      const importDto = new GraphNodeDTO(
        'import-node',
        'import:lodash',
        'import',
        JSON.stringify({
          module: 'lodash',
          imported: ['map', 'filter', 'reduce'],
          default: false
        })
      );
      const importModel = new GraphNodeModel(importDto);

      expect(importModel.getDto().node_type).toBe('import');
      expect(importModel.getDto().business_key).toBe('import:lodash');
      
      const properties = JSON.parse(importModel.getDto().properties);
      expect(properties.module).toBe('lodash');
      expect(properties.imported).toEqual(['map', 'filter', 'reduce']);
    });
  });

  describe('location and context information', () => {
    it('should handle complete location information', () => {
      expect(graphNodeModel.getDto().repo_id).toBe('repo-456');
      expect(graphNodeModel.getDto().commit_sha).toBe('abc123def456');
      expect(graphNodeModel.getDto().file_path).toBe('src/utils/math.ts');
      expect(graphNodeModel.getDto().line).toBe(15);
      expect(graphNodeModel.getDto().col).toBe(5);
    });

    it('should handle nodes without location information', () => {
      const minimalDto = new GraphNodeDTO(
        'minimal-node',
        'minimal:key',
        'minimal',
        '{}'
      );
      const minimalModel = new GraphNodeModel(minimalDto);

      expect(minimalModel.getDto().repo_id).toBeNull();
      expect(minimalModel.getDto().commit_sha).toBeNull();
      expect(minimalModel.getDto().file_path).toBeNull();
      expect(minimalModel.getDto().line).toBeNull();
      expect(minimalModel.getDto().col).toBeNull();
    });

    it('should handle partial location information', () => {
      const partialDto = new GraphNodeDTO(
        'partial-node',
        'partial:key',
        'partial',
        '{}',
        {
          repo_id: 'repo-123',
          file_path: 'src/partial.ts'
          // line, col, commit_sha not provided
        }
      );
      const partialModel = new GraphNodeModel(partialDto);

      expect(partialModel.getDto().repo_id).toBe('repo-123');
      expect(partialModel.getDto().file_path).toBe('src/partial.ts');
      expect(partialModel.getDto().commit_sha).toBeNull();
      expect(partialModel.getDto().line).toBeNull();
      expect(partialModel.getDto().col).toBeNull();
    });

    it('should handle various line and column positions', () => {
      const positions = [
        { line: 1, col: 1 },
        { line: 100, col: 25 },
        { line: 1000, col: 150 },
        { line: 2, col: 2 }
      ];

      positions.forEach((pos, index) => {
        const dto = new GraphNodeDTO(
          `pos-node-${index}`,
          `pos:key${index}`,
          'position',
          '{}',
          { line: pos.line, col: pos.col }
        );
        const model = new GraphNodeModel(dto);

        expect(model.getDto().line).toBe(pos.line);
        expect(model.getDto().col).toBe(pos.col);
      });
    });
  });

  describe('signature and labeling', () => {
    it('should handle signature hash for node identification', () => {
      expect(graphNodeModel.getDto().signature_hash).toBe('sig_hash_123');
    });

    it('should handle labels as JSON array', () => {
      const labels = JSON.parse(graphNodeModel.getDto().labels!);
      expect(labels).toEqual(['utility', 'math', 'pure']);
    });

    it('should handle nodes without signature hash', () => {
      const noSigDto = new GraphNodeDTO('no-sig', 'no:sig', 'test', '{}');
      const noSigModel = new GraphNodeModel(noSigDto);

      expect(noSigModel.getDto().signature_hash).toBeNull();
    });

    it('should handle nodes without labels', () => {
      const noLabelsDto = new GraphNodeDTO('no-labels', 'no:labels', 'test', '{}');
      const noLabelsModel = new GraphNodeModel(noLabelsDto);

      expect(noLabelsModel.getDto().labels).toBeNull();
    });

    it('should handle various label configurations', () => {
      const labelConfigs = [
        ['single'],
        ['multiple', 'labels', 'here'],
        ['category:function', 'visibility:public', 'async:true'],
        []
      ];

      labelConfigs.forEach((labels, index) => {
        const dto = new GraphNodeDTO(
          `label-node-${index}`,
          `label:key${index}`,
          'labeled',
          '{}',
          { labels: JSON.stringify(labels) }
        );
        const model = new GraphNodeModel(dto);

        if (labels.length > 0) {
          expect(JSON.parse(model.getDto().labels!)).toEqual(labels);
        } else {
          expect(model.getDto().labels).toBe('[]');
        }
      });
    });
  });

  describe('properties and metadata', () => {
    it('should handle complex properties as JSON', () => {
      const complexProperties = {
        name: 'ComplexFunction',
        parameters: [
          { name: 'input', type: 'ComplexType', optional: false },
          { name: 'options', type: 'Options', optional: true }
        ],
        returnType: 'Promise<Result>',
        decorators: ['@async', '@validate'],
        metadata: {
          complexity: 'high',
          performance: 'optimized'
        }
      };

      const complexDto = new GraphNodeDTO(
        'complex-node',
        'complex:function',
        'function',
        JSON.stringify(complexProperties)
      );
      const complexModel = new GraphNodeModel(complexDto);

      const retrievedProperties = JSON.parse(complexModel.getDto().properties);
      expect(retrievedProperties).toEqual(complexProperties);
      expect(retrievedProperties.metadata.complexity).toBe('high');
      expect(retrievedProperties.parameters).toHaveLength(2);
    });

    it('should handle empty properties object', () => {
      const emptyDto = new GraphNodeDTO('empty-node', 'empty:key', 'empty', '{}');
      const emptyModel = new GraphNodeModel(emptyDto);

      const properties = JSON.parse(emptyModel.getDto().properties);
      expect(properties).toEqual({});
    });

    it('should handle properties with various data types', () => {
      const mixedProperties = {
        stringProp: 'string value',
        numberProp: 42,
        booleanProp: true,
        arrayProp: [1, 2, 3],
        objectProp: { nested: 'value' },
        nullProp: null
      };

      const mixedDto = new GraphNodeDTO(
        'mixed-node',
        'mixed:key',
        'mixed',
        JSON.stringify(mixedProperties)
      );
      const mixedModel = new GraphNodeModel(mixedDto);

      const retrievedProperties = JSON.parse(mixedModel.getDto().properties);
      expect(retrievedProperties).toEqual(mixedProperties);
      expect(retrievedProperties.stringProp).toBe('string value');
      expect(retrievedProperties.numberProp).toBe(42);
      expect(retrievedProperties.booleanProp).toBe(true);
      expect(retrievedProperties.arrayProp).toEqual([1, 2, 3]);
      expect(retrievedProperties.nullProp).toBeNull();
    });
  });

  describe('model property access', () => {
    it('should provide access to all node properties', () => {
      const dto = graphNodeModel.getDto();
      
      expect(dto.id).toBe('node-123');
      expect(dto.business_key).toBe('function:calculateSum');
      expect(dto.node_type).toBe('function');
      expect(dto.repo_id).toBe('repo-456');
      expect(dto.commit_sha).toBe('abc123def456');
      expect(dto.file_path).toBe('src/utils/math.ts');
      expect(dto.line).toBe(15);
      expect(dto.col).toBe(5);
      expect(dto.signature_hash).toBe('sig_hash_123');
    });

    it('should provide access to timestamps', () => {
      const dto = graphNodeModel.getDto();
      expect(dto.created_at).toBeDefined();
      expect(dto.updated_at).toBeDefined();
      expect(typeof dto.created_at).toBe('string');
      expect(typeof dto.updated_at).toBe('string');
    });

    it('should allow property modifications through DTO', () => {
      const dto = graphNodeModel.getDto();
      
      dto.node_type = 'modified_function';
      dto.business_key = 'modified:key';
      dto.line = 25;
      dto.col = 10;

      expect(graphNodeModel.getDto().node_type).toBe('modified_function');
      expect(graphNodeModel.getDto().business_key).toBe('modified:key');
      expect(graphNodeModel.getDto().line).toBe(25);
      expect(graphNodeModel.getDto().col).toBe(10);
    });
  });

  describe('model lifecycle and state management', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = graphNodeModel.getId();
      const initialBusinessKey = graphNodeModel.getDto().business_key;
      const initialNodeType = graphNodeModel.getDto().node_type;
      const initialTableName = graphNodeModel.getTableName();

      // State should remain consistent
      expect(graphNodeModel.getId()).toBe(initialId);
      expect(graphNodeModel.getDto().business_key).toBe(initialBusinessKey);
      expect(graphNodeModel.getDto().node_type).toBe(initialNodeType);
      expect(graphNodeModel.getTableName()).toBe(initialTableName);
    });

    it('should reflect DTO changes immediately', () => {
      const originalBusinessKey = graphNodeModel.getDto().business_key;
      const originalLine = graphNodeModel.getDto().line;

      // Modify DTO
      graphNodeModel.getDto().business_key = 'modified:business:key';
      graphNodeModel.getDto().line = 100;

      expect(graphNodeModel.getDto().business_key).toBe('modified:business:key');
      expect(graphNodeModel.getDto().line).toBe(100);
      expect(graphNodeModel.getDto().business_key).not.toBe(originalBusinessKey);
      expect(graphNodeModel.getDto().line).not.toBe(originalLine);
    });

    it('should handle complex state updates', () => {
      const dto = graphNodeModel.getDto();
      
      // Update multiple properties
      dto.node_type = 'updated_type';
      dto.properties = JSON.stringify({ updated: true, version: 2 });
      dto.labels = JSON.stringify(['updated', 'version2']);
      dto.signature_hash = 'new_signature_hash';
      dto.updated_at = new Date().toISOString();

      expect(graphNodeModel.getDto().node_type).toBe('updated_type');
      expect(JSON.parse(graphNodeModel.getDto().properties)).toEqual({ updated: true, version: 2 });
      expect(JSON.parse(graphNodeModel.getDto().labels!)).toEqual(['updated', 'version2']);
      expect(graphNodeModel.getDto().signature_hash).toBe('new_signature_hash');
    });
  });

  describe('serialization and data transfer', () => {
    it('should be JSON serializable', () => {
      const dto = graphNodeModel.getDto();
      const jsonString = JSON.stringify(dto);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe(dto.id);
      expect(parsed.business_key).toBe(dto.business_key);
      expect(parsed.node_type).toBe(dto.node_type);
      expect(parsed.properties).toBe(dto.properties);
      expect(parsed.repo_id).toBe(dto.repo_id);
      expect(parsed.file_path).toBe(dto.file_path);
    });

    it('should preserve all properties during serialization', () => {
      const dto = graphNodeModel.getDto();
      const serialized = JSON.stringify(dto);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual({
        id: dto.id,
        business_key: dto.business_key,
        node_type: dto.node_type,
        properties: dto.properties,
        repo_id: dto.repo_id,
        commit_sha: dto.commit_sha,
        file_path: dto.file_path,
        line: dto.line,
        col: dto.col,
        signature_hash: dto.signature_hash,
        labels: dto.labels,
        created_at: dto.created_at,
        updated_at: dto.updated_at
      });
    });

    it('should handle serialization with null optional fields', () => {
      const minimalDto = new GraphNodeDTO('min-node', 'min:key', 'minimal', '{}');
      const minimalModel = new GraphNodeModel(minimalDto);
      
      const serialized = JSON.stringify(minimalModel.getDto());
      const deserialized = JSON.parse(serialized);

      expect(deserialized.id).toBe('min-node');
      expect(deserialized.business_key).toBe('min:key');
      expect(deserialized.node_type).toBe('minimal');
      expect(deserialized.properties).toBe('{}');
      expect(deserialized.repo_id).toBeNull();
      expect(deserialized.commit_sha).toBeNull();
      expect(deserialized.file_path).toBeNull();
      expect(deserialized.line).toBeNull();
      expect(deserialized.col).toBeNull();
      expect(deserialized.signature_hash).toBeNull();
      expect(deserialized.labels).toBeNull();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle nodes with very long business keys', () => {
      const longKey = 'very:long:business:key:' + 'segment:'.repeat(50) + 'end';
      const dto = new GraphNodeDTO('long-key-node', longKey, 'test', '{}');
      const model = new GraphNodeModel(dto);

      expect(model.getDto().business_key).toBe(longKey);
      expect(model.getDto().business_key.length).toBeGreaterThan(200);
    });

    it('should handle nodes with special characters in business keys', () => {
      const specialKey = 'special:key-with_underscores.and.dots/and/slashes@and@symbols';
      const dto = new GraphNodeDTO('special-key-node', specialKey, 'test', '{}');
      const model = new GraphNodeModel(dto);

      expect(model.getDto().business_key).toBe(specialKey);
    });

    it('should handle nodes with Unicode characters', () => {
      const unicodeKey = 'unicode:函数:calculateSum:测试';
      const unicodeProperties = JSON.stringify({
        name: '计算函数',
        description: 'This function calculates 求和 🧮'
      });
      
      const dto = new GraphNodeDTO('unicode-node', unicodeKey, 'function', unicodeProperties);
      const model = new GraphNodeModel(dto);

      expect(model.getDto().business_key).toBe(unicodeKey);
      const properties = JSON.parse(model.getDto().properties);
      expect(properties.name).toBe('计算函数');
      expect(properties.description).toBe('This function calculates 求和 🧮');
    });

    it('should handle very large properties objects', () => {
      const largeProperties = {
        name: 'LargeFunction',
        parameters: Array.from({ length: 100 }, (_, i) => ({
          name: `param${i}`,
          type: `Type${i}`,
          description: `Parameter ${i} description`.repeat(10)
        })),
        metadata: {
          complexity: 'very_high',
          lines: 1000,
          dependencies: Array.from({ length: 50 }, (_, i) => `dependency${i}`)
        }
      };

      const dto = new GraphNodeDTO('large-node', 'large:key', 'function', JSON.stringify(largeProperties));
      const model = new GraphNodeModel(dto);

      const retrievedProperties = JSON.parse(model.getDto().properties);
      expect(retrievedProperties.parameters).toHaveLength(100);
      expect(retrievedProperties.metadata.dependencies).toHaveLength(50);
    });
  });

  describe('schema validation and database constraints', () => {
    it('should define schema that enforces data integrity', () => {
      const schema = graphNodeModel.getSchema();

      // Primary key constraint
      expect(schema.id).toContain('PRIMARY KEY');

      // NOT NULL constraints for required fields
      expect(schema.business_key).toContain('NOT NULL');
      expect(schema.node_type).toContain('NOT NULL');
      expect(schema.properties).toContain('NOT NULL');

      // Optional fields should not have NOT NULL
      expect(schema.repo_id).not.toContain('NOT NULL');
      expect(schema.commit_sha).not.toContain('NOT NULL');
      expect(schema.file_path).not.toContain('NOT NULL');
    });

    it('should have schema compatible with SQLite', () => {
      const schema = graphNodeModel.getSchema();

      // Check SQLite data types
      expect(schema.id).toContain('TEXT');
      expect(schema.business_key).toContain('TEXT');
      expect(schema.node_type).toContain('TEXT');
      expect(schema.properties).toContain('TEXT');
      expect(schema.line).toContain('INTEGER');
      expect(schema.col).toContain('INTEGER');
      expect(schema.created_at).toContain('DATETIME');
      expect(schema.updated_at).toContain('DATETIME');
    });

    it('should define all required columns', () => {
      const schema = graphNodeModel.getSchema();
      const requiredColumns = [
        'id', 'business_key', 'node_type', 'properties', 'repo_id',
        'commit_sha', 'file_path', 'line', 'col', 'signature_hash',
        'labels', 'created_at', 'updated_at'
      ];

      requiredColumns.forEach(column => {
        expect(schema).toHaveProperty(column);
        expect(typeof schema[column]).toBe('string');
      });
    });
  });

  describe('business key and node identification', () => {
    it('should support hierarchical business keys', () => {
      const hierarchicalKeys = [
        'namespace:module:class:method',
        'project:package:interface:property',
        'file:function:parameter',
        'module:export:default'
      ];

      hierarchicalKeys.forEach((key, index) => {
        const dto = new GraphNodeDTO(`hier-${index}`, key, 'hierarchical', '{}');
        const model = new GraphNodeModel(dto);

        expect(model.getDto().business_key).toBe(key);
        expect(model.getDto().business_key.split(':')).toHaveLength(key.split(':').length);
      });
    });

    it('should support different node type categories', () => {
      const nodeTypes = [
        'function', 'class', 'interface', 'type', 'variable',
        'import', 'export', 'module', 'namespace', 'enum',
        'decorator', 'annotation', 'comment', 'literal'
      ];

      nodeTypes.forEach((type, index) => {
        const dto = new GraphNodeDTO(`type-${index}`, `${type}:test`, type, '{}');
        const model = new GraphNodeModel(dto);

        expect(model.getDto().node_type).toBe(type);
        expect(model.getDto().business_key).toBe(`${type}:test`);
      });
    });
  });
});
