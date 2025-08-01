/**
 * @file Unit tests for BaseModel class
 * Tests common model functionality including DTO management, ID access, and abstract method contracts
 */

import { BaseModel } from './base.model';
import { BaseDTO } from './base.dto';

// Create concrete test implementations for testing abstract base class
class TestDTO extends BaseDTO {
  name: string;
  value: number;

  constructor(id: string, name: string, value: number) {
    super(id);
    this.name = name;
    this.value = value;
  }
}

class TestModel extends BaseModel<TestDTO> {
  getTableName(): string {
    return 'test_table';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      name: 'TEXT NOT NULL',
      value: 'INTEGER',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}

describe('BaseModel', () => {
  let testDto: TestDTO;
  let testModel: TestModel;

  beforeEach(() => {
    testDto = new TestDTO('test-id-123', 'Test Name', 42);
    testModel = new TestModel(testDto);
  });

  describe('constructor', () => {
    it('should initialize with provided DTO', () => {
      expect(testModel).toBeInstanceOf(BaseModel);
      expect(testModel.getDto()).toBe(testDto);
    });

    it('should store DTO reference correctly', () => {
      const dto = testModel.getDto();
      expect(dto.id).toBe('test-id-123');
      expect(dto.name).toBe('Test Name');
      expect(dto.value).toBe(42);
    });
  });

  describe('getDto', () => {
    it('should return the stored DTO instance', () => {
      const retrievedDto = testModel.getDto();
      expect(retrievedDto).toBe(testDto);
      expect(retrievedDto).toBeInstanceOf(TestDTO);
    });

    it('should return DTO with all properties intact', () => {
      const retrievedDto = testModel.getDto();
      expect(retrievedDto.id).toBe('test-id-123');
      expect(retrievedDto.name).toBe('Test Name');
      expect(retrievedDto.value).toBe(42);
      expect(retrievedDto.created_at).toBeDefined();
      expect(retrievedDto.updated_at).toBeDefined();
    });

    it('should maintain DTO reference integrity', () => {
      const dto1 = testModel.getDto();
      const dto2 = testModel.getDto();
      expect(dto1).toBe(dto2); // Same reference
    });
  });

  describe('getId', () => {
    it('should return the ID from the DTO', () => {
      expect(testModel.getId()).toBe('test-id-123');
    });

    it('should return consistent ID across multiple calls', () => {
      const id1 = testModel.getId();
      const id2 = testModel.getId();
      expect(id1).toBe(id2);
      expect(id1).toBe('test-id-123');
    });

    it('should reflect DTO ID changes', () => {
      // Modify DTO ID directly
      testDto.id = 'new-id-456';
      expect(testModel.getId()).toBe('new-id-456');
    });
  });

  describe('abstract method implementations', () => {
    it('should implement getTableName method', () => {
      expect(testModel.getTableName()).toBe('test_table');
    });

    it('should implement getSchema method', () => {
      const schema = testModel.getSchema();
      expect(schema).toEqual({
        id: 'TEXT PRIMARY KEY',
        name: 'TEXT NOT NULL',
        value: 'INTEGER',
        created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
      });
    });

    it('should return schema as object with string values', () => {
      const schema = testModel.getSchema();
      expect(typeof schema).toBe('object');
      Object.values(schema).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('inheritance and polymorphism', () => {
    it('should work with different DTO types', () => {
      class AnotherTestDTO extends BaseDTO {
        description: string;
        
        constructor(id: string, description: string) {
          super(id);
          this.description = description;
        }
      }

      class AnotherTestModel extends BaseModel<AnotherTestDTO> {
        getTableName(): string {
          return 'another_table';
        }

        getSchema(): Record<string, string> {
          return {
            id: 'TEXT PRIMARY KEY',
            description: 'TEXT'
          };
        }
      }

      const anotherDto = new AnotherTestDTO('another-id', 'Another description');
      const anotherModel = new AnotherTestModel(anotherDto);

      expect(anotherModel.getId()).toBe('another-id');
      expect(anotherModel.getDto().description).toBe('Another description');
      expect(anotherModel.getTableName()).toBe('another_table');
    });

    it('should maintain type safety with generic DTO type', () => {
      const dto = testModel.getDto();
      // TypeScript should ensure these properties exist
      expect(dto.name).toBeDefined();
      expect(dto.value).toBeDefined();
      expect(typeof dto.name).toBe('string');
      expect(typeof dto.value).toBe('number');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle DTO with minimal properties', () => {
      const minimalDto = new TestDTO('minimal-id', '', 0);
      const minimalModel = new TestModel(minimalDto);

      expect(minimalModel.getId()).toBe('minimal-id');
      expect(minimalModel.getDto().name).toBe('');
      expect(minimalModel.getDto().value).toBe(0);
    });

    it('should handle DTO with special characters in ID', () => {
      const specialDto = new TestDTO('test-id-with-special-chars-!@#$%', 'Special', 999);
      const specialModel = new TestModel(specialDto);

      expect(specialModel.getId()).toBe('test-id-with-special-chars-!@#$%');
    });

    it('should handle DTO with very long ID', () => {
      const longId = 'a'.repeat(1000);
      const longIdDto = new TestDTO(longId, 'Long ID Test', 123);
      const longIdModel = new TestModel(longIdDto);

      expect(longIdModel.getId()).toBe(longId);
      expect(longIdModel.getId().length).toBe(1000);
    });
  });

  describe('model lifecycle and state management', () => {
    it('should maintain consistent state after creation', () => {
      const initialId = testModel.getId();
      const initialDto = testModel.getDto();
      const initialTableName = testModel.getTableName();
      const initialSchema = testModel.getSchema();

      // State should remain consistent
      expect(testModel.getId()).toBe(initialId);
      expect(testModel.getDto()).toBe(initialDto);
      expect(testModel.getTableName()).toBe(initialTableName);
      expect(testModel.getSchema()).toEqual(initialSchema);
    });

    it('should reflect DTO changes immediately', () => {
      const originalName = testModel.getDto().name;
      
      // Modify DTO
      testModel.getDto().name = 'Modified Name';
      
      expect(testModel.getDto().name).toBe('Modified Name');
      expect(testModel.getDto().name).not.toBe(originalName);
    });

    it('should handle DTO property updates', () => {
      const dto = testModel.getDto();
      const originalValue = dto.value;
      
      dto.value = 999;
      dto.updated_at = new Date().toISOString();
      
      expect(testModel.getDto().value).toBe(999);
      expect(testModel.getDto().value).not.toBe(originalValue);
      expect(testModel.getDto().updated_at).toBeDefined();
    });
  });

  describe('abstract class contract enforcement', () => {
    it('should require getTableName implementation', () => {
      // This test ensures the abstract method contract is enforced
      expect(() => testModel.getTableName()).not.toThrow();
      expect(typeof testModel.getTableName()).toBe('string');
    });

    it('should require getSchema implementation', () => {
      // This test ensures the abstract method contract is enforced
      expect(() => testModel.getSchema()).not.toThrow();
      expect(typeof testModel.getSchema()).toBe('object');
    });

    it('should enforce schema structure', () => {
      const schema = testModel.getSchema();
      expect(schema).toHaveProperty('id');
      expect(typeof schema.id).toBe('string');
    });
  });
});
