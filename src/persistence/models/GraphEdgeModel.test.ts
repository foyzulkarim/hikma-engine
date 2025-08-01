/**
 * @file Unit tests for GraphEdgeModel class
 * Tests graph edge model functionality including schema definition, relationships, and edge properties
 */

import { GraphEdgeModel } from './GraphEdgeModel';
import { GraphEdgeDTO } from './GraphEdgeDTO';

describe('GraphEdgeModel', () => {
  let graphEdgeDto: GraphEdgeDTO;
  let graphEdgeModel: GraphEdgeModel;

  beforeEach(() => {
    graphEdgeDto = new GraphEdgeDTO(
      'edge-123',
      'node-source-456',
      'node-target-789',
      'function:calculateSum',
      'function:displayResult',
      'calls',
      {
        properties: JSON.stringify({
          callType: 'direct',
          parameters: ['result'],
          async: false
        }),
        line: 25,
        col: 8,
        dynamic: false
      }
    );
    graphEdgeModel = new GraphEdgeModel(graphEdgeDto);
  });

  describe('constructor', () => {
    it('should initialize with provided GdgeDTO', () => {
      expect(graphEdgeModel).toBeInstanceOf(GraphEdgeModel);
      expect(graphEdgeModel.getDto()).toBe(graphEdgeDto);
    });

    it('should inherit from BaseModel', () => {
      expect(graphEdgeModel.getId()).toBe('edge-123');
      expect(graphEdgeModel.getDto()).toBeInstanceOf(GraphEdgeDTO);
    });

    it('should require DTO parameter in constructor', () => {
      const dto = new GraphEdgeDTO('test-edge', 'src', 'tgt', 'src:key', 'tgt:key', 'test');
      const model = new GraphEdgeModel(dto);
      
      expect(model.getDto()).toBe(dto);
    });
  });

  describe('getTableName', () => {
    it('should return correct table name', () => {
      expect(graphEdgeModel.getTableName()).toBe('graph_edges');
    });

    it('should return consistent table name across instances', () => {
      const anotherDto = new GraphEdgeDTO('edge-456', 'src2', 'tgt2', 'src:key2', 'tgt:key2', 'extends');
      const anotherModel = new GraphEdgeModel(anotherDto);
      
      expect(graphEdgeModel.getTableName()).toBe(anotherModel.getTableName());
    });
  });

  describe('getSchema', () => {
    it('should return correct schema definition', () => {
      const schema = graphEdgeModel.getSchema();
      
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        source_id: 'TEXT NOT NULL',
        target_id: 'TEXT NOT NULL',
        source_business_key: 'TEXT NOT NULL',
        target_business_key: 'TEXT NOT NULL',
        edge_type: 'TEXT NOT NULL',
        properties: 'TEXT',
        line: 'INTEGER',
        col: 'INTEGER',
        dynamic: 'BOOLEAN DEFAULT FALSE',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should include primary key constraint', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.id).toBe('TEXT PRIMARY KEY');
    });

    it('should include NOT NULL constraints for required fields', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.source_id).toBe('TEXT NOT NULL');
      expect(schema.target_id).toBe('TEXT NOT NULL');
      expect(schema.source_business_key).toBe('TEXT NOT NULL');
      expect(schema.target_business_key).toBe('TEXT NOT NULL');
      expect(schema.edge_type).toBe('TEXT NOT NULL');
    });

    it('should include optional fields without NOT NULL', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.properties).toBe('TEXT');
      expect(schema.line).toBe('INTEGER');
      expect(schema.col).toBe('INTEGER');
    });

    it('should include BOOLEAN type with default for dynamic field', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.dynamic).toBe('BOOLEAN DEFAULT FALSE');
    });

    it('should include timestamp fields with defaults', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.created_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
      expect(schema.updated_at).toBe('DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('edge relationships and types', () => {
    it('should handle function call relationships', () => {
      const callDto = new GraphEdgeDTO(
        'call-edge',
        'func-a',
        'func-b',
        'function:processData',
        'function:validateData',
        'calls'
      );
      const callModel = new GraphEdgeModel(callDto);

      expect(callModel.getDto().edge_type).toBe('calls');
      expect(callModel.getDto().source_business_key).toBe('function:processData');
      expect(callModel.getDto().target_business_key).toBe('function:validateData');
    });

    it('should handle inheritance relationships', () => {
      const extendsDto = new GraphEdgeDTO(
        'extends-edge',
        'child-class',
        'parent-class',
        'class:ChildService',
        'class:BaseService',
        'extends'
      );
      const extendsModel = new GraphEdgeModel(extendsDto);

      expect(extendsModel.getDto().edge_type).toBe('extends');
      expect(extendsModel.getDto().source_business_key).toBe('class:ChildService');
      expect(extendsModel.getDto().target_business_key).toBe('class:BaseService');
    });

    it('should handle implementation relationships', () => {
      const implementsDto = new GraphEdgeDTO(
        'implements-edge',
        'concrete-class',
        'interface',
        'class:UserService',
        'interface:IUserService',
        'implements'
      );
      const implementsModel = new GraphEdgeModel(implementsDto);

      expect(implementsModel.getDto().edge_type).toBe('implements');
      expect(implementsModel.getDto().source_business_key).toBe('class:UserService');
      expect(implementsModel.getDto().target_business_key).toBe('interface:IUserService');
    });

    it('should handle import relationships', () => {
      const importDto = new GraphEdgeDTO(
        'import-edge',
        'importing-file',
        'imported-module',
        'file:src/service.ts',
        'module:lodash',
        'imports'
      );
      const importModel = new GraphEdgeModel(importDto);

      expect(importModel.getDto().edge_type).toBe('imports');
      expect(importModel.getDto().source_business_key).toBe('file:src/service.ts');
      expect(importModel.getDto().target_business_key).toBe('module:lodash');
    });

    it('should handle dependency relationships', () => {
      const dependsDto = new GraphEdgeDTO(
        'depends-edge',
        'dependent-module',
        'dependency-module',
        'module:auth',
        'module:crypto',
        'depends_on'
      );
      const dependsModel = new GraphEdgeModel(dependsDto);

      expect(dependsModel.getDto().edge_type).toBe('depends_on');
      expect(dependsModel.getDto().source_business_key).toBe('module:auth');
      expect(dependsModel.getDto().target_business_key).toBe('module:crypto');
    });

    it('should handle type relationships', () => {
      const typeDto = new GraphEdgeDTO(
        'type-edge',
        'variable',
        'type-def',
        'variable:user',
        'type:User',
        'has_type'
      );
      const typeModel = new GraphEdgeModel(typeDto);

      expect(typeModel.getDto().edge_type).toBe('has_type');
      expect(typeModel.getDto().source_business_key).toBe('variable:user');
      expect(typeModel.getDto().target_business_key).toBe('type:User');
    });
  });

  describe('edge properties and metadata', () => {
    it('should handle complex edge properties', () => {
      const complexProperties = {
        callType: 'async',
        parameters: [
          { name: 'data', type: 'UserData' },
          { name: 'options', type: 'ProcessOptions', optional: true }
        ],
        returnType: 'Promise<ProcessResult>',
        errorHandling: true,
        middleware: ['auth', 'validation']
      };

      const complexDto = new GraphEdgeDTO(
        'complex-edge',
        'src',
        'tgt',
        'src:key',
        'tgt:key',
        'calls',
        { properties: JSON.stringify(complexProperties) }
      );
      const complexModel = new GraphEdgeModel(complexDto);

      const retrievedProperties = JSON.parse(complexModel.getDto().properties!);
      expect(retrievedProperties).toEqual(complexProperties);
      expect(retrievedProperties.callType).toBe('async');
      expect(retrievedProperties.parameters).toHaveLength(2);
      expect(retrievedProperties.middleware).toEqual(['auth', 'validation']);
    });

    it('should handle edges without properties', () => {
      const simpleDto = new GraphEdgeDTO('simple-edge', 'src', 'tgt', 'src:key', 'tgt:key', 'simple');
      const simpleModel = new GraphEdgeModel(simpleDto);

      expect(simpleModel.getDto().properties).toBeUndefined();
    });

    it('should handle empty properties object', () => {
      const emptyDto = new GraphEdgeDTO(
        'empty-edge',
        'src',
        'tgt',
        'src:key',
        'tgt:key',
        'empty',
        { properties: '{}' }
      );
      const emptyModel = new GraphEdgeModel(emptyDto);

      expect(emptyModel.getDto().properties).toBe('{}');
      expect(JSON.parse(emptyModel.getDto().properties!)).toEqual({});
    });

    it('should handle properties with various data types', () => {
      const mixedProperties = {
        stringProp: 'value',
        numberProp: 42,
        booleanProp: true,
        arrayProp: ['a', 'b', 'c'],
        objectProp: { nested: 'data' },
        nullProp: null
      };

      const mixedDto = new GraphEdgeDTO(
        'mixed-edge',
        'src',
        'tgt',
        'src:key',
        'tgt:key',
        'mixed',
        { properties: JSON.stringify(mixedProperties) }
      );
      const mixedModel = new GraphEdgeModel(mixedDto);

      const retrievedProperties = JSON.parse(mixedModel.getDto().properties!);
      expect(retrievedProperties).toEqual(mixedProperties);
      expect(retrievedProperties.stringProp).toBe('value');
      expect(retrievedProperties.numberProp).toBe(42);
      expect(retrievedProperties.booleanProp).toBe(true);
      expect(retrievedProperties.arrayProp).toEqual(['a', 'b', 'c']);
      expect(retrievedProperties.nullProp).toBeNull();
    });
  });

  describe('location and context information', () => {
    it('should handle complete location information', () => {
      expect(graphEdgeModel.getDto().line).toBe(25);
      expect(graphEdgeModel.getDto().col).toBe(8);
    });

    it('should handle edges without location information', () => {
      const noLocationDto = new GraphEdgeDTO('no-loc', 'src', 'tgt', 'src:key', 'tgt:key', 'test');
      const noLocationModel = new GraphEdgeModel(noLocationDto);

      expect(noLocationModel.getDto().line).toBeUndefined();
      expect(noLocationModel.getDto().col).toBeUndefined();
    });

    it('should handle various line and column positions', () => {
      const positions = [
        { line: 1, col: 0 },
        { line: 100, col: 25 },
        { line: 1000, col: 150 },
        { line: 0, col: 0 }
      ];

      positions.forEach((pos, index) => {
        const dto = new GraphEdgeDTO(
          `pos-edge-${index}`,
          'src',
          'tgt',
          'src:key',
          'tgt:key',
          'positioned',
          { line: pos.line, col: pos.col }
        );
        const model = new GraphEdgeModel(dto);

        expect(model.getDto().line).toBe(pos.line);
        expect(model.getDto().col).toBe(pos.col);
      });
    });

    it('should handle dynamic edge flag', () => {
      expect(graphEdgeModel.getDto().dynamic).toBe(false);
    });

    it('should handle dynamic edges', () => {
      const dynamicDto = new GraphEdgeDTO(
        'dynamic-edge',
        'src',
        'tgt',
        'src:key',
        'tgt:key',
        'dynamic_call',
        { dynamic: true }
      );
      const dynamicModel = new GraphEdgeModel(dynamicDto);

      expect(dynamicModel.getDto().dynamic).toBe(true);
    });

    it('should handle edges without dynamic flag (default false)', () => {
      const defaultDto = new GraphEdgeDTO('default-edge', 'src', 'tgt', 'src:key', 'tgt:key', 'default');
      const defaultModel = new GraphEdgeModel(defaultDto);

      expect(defaultModel.getDto().dynamic).toBeUndefined();
    });
  });

  describe('model property access', () => {
    it('should provide access to all edge properties', () => {
      const dto = graphEdgeModel.getDto();
      
      expect(dto.id).toBe('edge-123');
      expect(dto.source_id).toBe('node-source-456');
      expect(dto.target_id).toBe('node-target-789');
      expect(dto.source_business_key).toBe('function:calculateSum');
      expect(dto.target_business_key).toBe('function:displayResult');
      expect(dto.edge_type).toBe('calls');
      expect(dto.line).toBe(25);
      expect(dto.col).toBe(8);
      expect(dto.dynamic).toBe(false);
    });

    it('should provide access to properties as JSON', () => {
      const dto = graphEdgeModel.getDto();
      expect(dto.properties).toBeDefined();
      
      const properties = JSON.parse(dto.properties!);
      expect(properties.callType).toBe('direct');
      expect(properties.parameters).toEqual(['result']);
      expect(properties.async).toBe(false);
    });

    it('should provide access to timestamps', () => {
      const dto = graphEdgeModel.getDto();
      expect(dto.created_at).toBeDefined();
      expect(dto.updated_at).toBeDefined();
      expect(typeof dto.created_at).toBe('string');
      expect(typeof dto.updated_at).toBe('string');
    });

    it('should allow property modifications through DTO', () => {
      const dto = graphEdgeModel.getDto();
      
      dto.edge_type = 'modified_calls';
      dto.line = 50;
      dto.col = 15;
      dto.dynamic = true;

      expect(graphEdgeModel.getDto().edge_type).toBe('modified_calls');
      expect(graphEdgeModel.getDto().line).toBe(50);
      expect(graphEdgeModel.getDto().col).toBe(15);
      expect(graphEdgeModel.getDto().dynamic).toBe(true);
    });
  });

  describe('model lifecycle and state management', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = graphEdgeModel.getId();
      const initialSourceId = graphEdgeModel.getDto().source_id;
      const initialTargetId = graphEdgeModel.getDto().target_id;
      const initialEdgeType = graphEdgeModel.getDto().edge_type;
      const initialTableName = graphEdgeModel.getTableName();

      // State should remain consistent
      expect(graphEdgeModel.getId()).toBe(initialId);
      expect(graphEdgeModel.getDto().source_id).toBe(initialSourceId);
      expect(graphEdgeModel.getDto().target_id).toBe(initialTargetId);
      expect(graphEdgeModel.getDto().edge_type).toBe(initialEdgeType);
      expect(graphEdgeModel.getTableName()).toBe(initialTableName);
    });

    it('should reflect DTO changes immediately', () => {
      const originalEdgeType = graphEdgeModel.getDto().edge_type;
      const originalLine = graphEdgeModel.getDto().line;

      // Modify DTO
      graphEdgeModel.getDto().edge_type = 'modified_relationship';
      graphEdgeModel.getDto().line = 100;

      expect(graphEdgeModel.getDto().edge_type).toBe('modified_relationship');
      expect(graphEdgeModel.getDto().line).toBe(100);
      expect(graphEdgeModel.getDto().edge_type).not.toBe(originalEdgeType);
      expect(graphEdgeModel.getDto().line).not.toBe(originalLine);
    });

    it('should handle complex state updates', () => {
      const dto = graphEdgeModel.getDto();
      
      // Update multiple properties
      dto.edge_type = 'updated_type';
      dto.properties = JSON.stringify({ updated: true, version: 2 });
      dto.dynamic = true;
      dto.updated_at = new Date().toISOString();

      expect(graphEdgeModel.getDto().edge_type).toBe('updated_type');
      expect(JSON.parse(graphEdgeModel.getDto().properties!)).toEqual({ updated: true, version: 2 });
      expect(graphEdgeModel.getDto().dynamic).toBe(true);
    });
  });

  describe('serialization and data transfer', () => {
    it('should be JSON serializable', () => {
      const dto = graphEdgeModel.getDto();
      const jsonString = JSON.stringify(dto);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe(dto.id);
      expect(parsed.source_id).toBe(dto.source_id);
      expect(parsed.target_id).toBe(dto.target_id);
      expect(parsed.source_business_key).toBe(dto.source_business_key);
      expect(parsed.target_business_key).toBe(dto.target_business_key);
      expect(parsed.edge_type).toBe(dto.edge_type);
    });

    it('should preserve all properties during serialization', () => {
      const dto = graphEdgeModel.getDto();
      const serialized = JSON.stringify(dto);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual({
        id: dto.id,
        source_id: dto.source_id,
        target_id: dto.target_id,
        source_business_key: dto.source_business_key,
        target_business_key: dto.target_business_key,
        edge_type: dto.edge_type,
        properties: dto.properties,
        line: dto.line,
        col: dto.col,
        dynamic: dto.dynamic,
        created_at: dto.created_at,
        updated_at: dto.updated_at
      });
    });

    it('should handle serialization with undefined optional fields', () => {
      const minimalDto = new GraphEdgeDTO('min-edge', 'src', 'tgt', 'src:key', 'tgt:key', 'minimal');
      const minimalModel = new GraphEdgeModel(minimalDto);
      
      const serialized = JSON.stringify(minimalModel.getDto());
      const deserialized = JSON.parse(serialized);

      expect(deserialized.id).toBe('min-edge');
      expect(deserialized.source_id).toBe('src');
      expect(deserialized.target_id).toBe('tgt');
      expect(deserialized.source_business_key).toBe('src:key');
      expect(deserialized.target_business_key).toBe('tgt:key');
      expect(deserialized.edge_type).toBe('minimal');
      expect(deserialized.properties).toBeUndefined();
      expect(deserialized.line).toBeUndefined();
      expect(deserialized.col).toBeUndefined();
      expect(deserialized.dynamic).toBeUndefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle edges with very long business keys', () => {
      const longSourceKey = 'very:long:source:business:key:' + 'segment:'.repeat(30) + 'end';
      const longTargetKey = 'very:long:target:business:key:' + 'segment:'.repeat(30) + 'end';
      
      const dto = new GraphEdgeDTO('long-key-edge', 'src', 'tgt', longSourceKey, longTargetKey, 'test');
      const model = new GraphEdgeModel(dto);

      expect(model.getDto().source_business_key).toBe(longSourceKey);
      expect(model.getDto().target_business_key).toBe(longTargetKey);
      expect(model.getDto().source_business_key.length).toBeGreaterThan(200);
      expect(model.getDto().target_business_key.length).toBeGreaterThan(200);
    });

    it('should handle edges with special characters in business keys', () => {
      const specialSourceKey = 'special:source-key_with.dots/and/slashes@and@symbols';
      const specialTargetKey = 'special:target-key_with.dots/and/slashes@and@symbols';
      
      const dto = new GraphEdgeDTO('special-key-edge', 'src', 'tgt', specialSourceKey, specialTargetKey, 'test');
      const model = new GraphEdgeModel(dto);

      expect(model.getDto().source_business_key).toBe(specialSourceKey);
      expect(model.getDto().target_business_key).toBe(specialTargetKey);
    });

    it('should handle edges with Unicode characters', () => {
      const unicodeSourceKey = 'unicode:源函数:calculateSum';
      const unicodeTargetKey = 'unicode:目标函数:displayResult';
      const unicodeProperties = JSON.stringify({
        description: 'This edge represents 调用关系 🔗',
        type: '函数调用'
      });
      
      const dto = new GraphEdgeDTO(
        'unicode-edge',
        'src',
        'tgt',
        unicodeSourceKey,
        unicodeTargetKey,
        'calls',
        { properties: unicodeProperties }
      );
      const model = new GraphEdgeModel(dto);

      expect(model.getDto().source_business_key).toBe(unicodeSourceKey);
      expect(model.getDto().target_business_key).toBe(unicodeTargetKey);
      
      const properties = JSON.parse(model.getDto().properties!);
      expect(properties.description).toBe('This edge represents 调用关系 🔗');
      expect(properties.type).toBe('函数调用');
    });

    it('should handle very large properties objects', () => {
      const largeProperties = {
        callType: 'complex',
        parameters: Array.from({ length: 50 }, (_, i) => ({
          name: `param${i}`,
          type: `Type${i}`,
          description: `Parameter ${i} description`.repeat(5)
        })),
        metadata: {
          complexity: 'very_high',
          dependencies: Array.from({ length: 25 }, (_, i) => `dependency${i}`),
          annotations: Array.from({ length: 10 }, (_, i) => `@annotation${i}`)
        }
      };

      const dto = new GraphEdgeDTO(
        'large-edge',
        'src',
        'tgt',
        'src:key',
        'tgt:key',
        'complex',
        { properties: JSON.stringify(largeProperties) }
      );
      const model = new GraphEdgeModel(dto);

      const retrievedProperties = JSON.parse(model.getDto().properties!);
      expect(retrievedProperties.parameters).toHaveLength(50);
      expect(retrievedProperties.metadata.dependencies).toHaveLength(25);
      expect(retrievedProperties.metadata.annotations).toHaveLength(10);
    });
  });

  describe('schema validation and database constraints', () => {
    it('should define schema that enforces data integrity', () => {
      const schema = graphEdgeModel.getSchema();

      // Primary key constraint
      expect(schema.id).toContain('PRIMARY KEY');

      // NOT NULL constraints for required fields
      expect(schema.source_id).toContain('NOT NULL');
      expect(schema.target_id).toContain('NOT NULL');
      expect(schema.source_business_key).toContain('NOT NULL');
      expect(schema.target_business_key).toContain('NOT NULL');
      expect(schema.edge_type).toContain('NOT NULL');

      // Optional fields should not have NOT NULL
      expect(schema.properties).not.toContain('NOT NULL');
      expect(schema.line).not.toContain('NOT NULL');
      expect(schema.col).not.toContain('NOT NULL');
    });

    it('should have schema compatible with SQLite', () => {
      const schema = graphEdgeModel.getSchema();

      // Check SQLite data types
      expect(schema.id).toContain('TEXT');
      expect(schema.source_id).toContain('TEXT');
      expect(schema.target_id).toContain('TEXT');
      expect(schema.source_business_key).toContain('TEXT');
      expect(schema.target_business_key).toContain('TEXT');
      expect(schema.edge_type).toContain('TEXT');
      expect(schema.properties).toContain('TEXT');
      expect(schema.line).toContain('INTEGER');
      expect(schema.col).toContain('INTEGER');
      expect(schema.dynamic).toContain('BOOLEAN');
      expect(schema.created_at).toContain('DATETIME');
      expect(schema.updated_at).toContain('DATETIME');
    });

    it('should define all required columns', () => {
      const schema = graphEdgeModel.getSchema();
      const requiredColumns = [
        'id', 'source_id', 'target_id', 'source_business_key', 'target_business_key',
        'edge_type', 'properties', 'line', 'col', 'dynamic', 'created_at', 'updated_at'
      ];

      requiredColumns.forEach(column => {
        expect(schema).toHaveProperty(column);
        expect(typeof schema[column]).toBe('string');
      });
    });

    it('should include default value for dynamic field', () => {
      const schema = graphEdgeModel.getSchema();
      expect(schema.dynamic).toContain('DEFAULT FALSE');
    });
  });

  describe('edge type categories and relationships', () => {
    it('should support various edge type categories', () => {
      const edgeTypes = [
        'calls', 'extends', 'implements', 'imports', 'exports',
        'depends_on', 'has_type', 'contains', 'references', 'overrides',
        'decorates', 'annotates', 'throws', 'catches', 'returns'
      ];

      edgeTypes.forEach((type, index) => {
        const dto = new GraphEdgeDTO(`edge-${index}`, 'src', 'tgt', 'src:key', 'tgt:key', type);
        const model = new GraphEdgeModel(dto);

        expect(model.getDto().edge_type).toBe(type);
      });
    });

    it('should support bidirectional relationship identification', () => {
      const sourceDto = new GraphEdgeDTO('edge-a-b', 'node-a', 'node-b', 'a:key', 'b:key', 'calls');
      const targetDto = new GraphEdgeDTO('edge-b-a', 'node-b', 'node-a', 'b:key', 'a:key', 'called_by');
      
      const sourceModel = new GraphEdgeModel(sourceDto);
      const targetModel = new GraphEdgeModel(targetDto);

      expect(sourceModel.getDto().source_id).toBe('node-a');
      expect(sourceModel.getDto().target_id).toBe('node-b');
      expect(targetModel.getDto().source_id).toBe('node-b');
      expect(targetModel.getDto().target_id).toBe('node-a');
    });

    it('should handle self-referencing edges', () => {
      const selfDto = new GraphEdgeDTO('self-edge', 'node-self', 'node-self', 'self:key', 'self:key', 'recursive_call');
      const selfModel = new GraphEdgeModel(selfDto);

      expect(selfModel.getDto().source_id).toBe('node-self');
      expect(selfModel.getDto().target_id).toBe('node-self');
      expect(selfModel.getDto().source_business_key).toBe('self:key');
      expect(selfModel.getDto().target_business_key).toBe('self:key');
      expect(selfModel.getDto().edge_type).toBe('recursive_call');
    });
  });
});
