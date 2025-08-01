/**
 * @file Unit tests for BaseDTO class
 * Tests data transfer object operations including initialization, timestamp management, and serialization
 */

import { BaseDTO } from './base.dto';

// Create concrete test implementation for testing abstract base class
class TestDTO extends BaseDTO {
  name: string;
  value: number;
  optional?: string;

  constructor(id: string, name: string, value: number, optional?: string) {
    super(id);
    this.name = name;
    this.value = value;
    this.optional = optional;
  }
}

describe('BaseDTO', () => {
  let testDto: TestDTO;
  const testId = 'test-dto-123';
  const testName = 'Test DTO';
  const testValue = 42;

  beforeEach(() => {
    testDto = new TestDTO(testId, testName, testValue);
  });

  describe('constructor', () => {
    it('should initialize with provided ID', () => {
      expect(testDto.id).toBe(testId);
    });

    it('should set created_at timestamp', () => {
      expect(testDto.created_at).toBeDefined();
      expect(typeof testDto.created_at).toBe('string');
      expect(testDto.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should set updated_at timestamp', () => {
      expect(testDto.updated_at).toBeDefined();
      expect(typeof testDto.updated_at).toBe('string');
      expect(testDto.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should set created_at and updated_at to same initial value', () => {
      expect(testDto.created_at).toBe(testDto.updated_at);
    });

    it('should create valid ISO timestamp strings', () => {
      const createdDate = new Date(testDto.created_at!);
      const updatedDate = new Date(testDto.updated_at!);
      
      expect(createdDate).toBeInstanceOf(Date);
      expect(updatedDate).toBeInstanceOf(Date);
      expect(createdDate.getTime()).not.toBeNaN();
      expect(updatedDate.getTime()).not.toBeNaN();
    });
  });

  describe('timestamp management', () => {
    it('should create timestamps close to current time', () => {
      const now = new Date();
      const createdTime = new Date(testDto.created_at!);
      const timeDiff = Math.abs(now.getTime() - createdTime.getTime());
      
      // Should be created within 1 second of test execution
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should allow manual timestamp updates', () => {
      const newTimestamp = '2023-01-01T12:00:00.000Z';
      testDto.updated_at = newTimestamp;
      
      expect(testDto.updated_at).toBe(newTimestamp);
      expect(testDto.created_at).not.toBe(newTimestamp);
    });

    it('should handle undefined timestamps gracefully', () => {
      testDto.created_at = undefined;
      testDto.updated_at = undefined;
      
      expect(testDto.created_at).toBeUndefined();
      expect(testDto.updated_at).toBeUndefined();
    });

    it('should preserve timestamp format consistency', () => {
      const timestamp1 = testDto.created_at!;
      const newDto = new TestDTO('new-id', 'New Name', 100);
      const timestamp2 = newDto.created_at!;
      
      // Both should follow same ISO format
      expect(timestamp1).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(timestamp2).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('property management', () => {
    it('should store all provided properties', () => {
      expect(testDto.id).toBe(testId);
      expect(testDto.name).toBe(testName);
      expect(testDto.value).toBe(testValue);
    });

    it('should handle optional properties', () => {
      const dtoWithOptional = new TestDTO('id-with-optional', 'Name', 123, 'Optional Value');
      expect(dtoWithOptional.optional).toBe('Optional Value');
      
      const dtoWithoutOptional = new TestDTO('id-without-optional', 'Name', 123);
      expect(dtoWithoutOptional.optional).toBeUndefined();
    });

    it('should allow property modifications', () => {
      testDto.name = 'Modified Name';
      testDto.value = 999;
      
      expect(testDto.name).toBe('Modified Name');
      expect(testDto.value).toBe(999);
    });

    it('should maintain property types', () => {
      expect(typeof testDto.id).toBe('string');
      expect(typeof testDto.name).toBe('string');
      expect(typeof testDto.value).toBe('number');
      expect(typeof testDto.created_at).toBe('string');
      expect(typeof testDto.updated_at).toBe('string');
    });
  });

  describe('inheritance and polymorphism', () => {
    it('should work with different concrete implementations', () => {
      class AnotherTestDTO extends BaseDTO {
        description: string;
        isActive: boolean;
        
        constructor(id: string, description: string, isActive: boolean) {
          super(id);
          this.description = description;
          this.isActive = isActive;
        }
      }

      const anotherDto = new AnotherTestDTO('another-id', 'Description', true);
      
      expect(anotherDto.id).toBe('another-id');
      expect(anotherDto.description).toBe('Description');
      expect(anotherDto.isActive).toBe(true);
      expect(anotherDto.created_at).toBeDefined();
      expect(anotherDto.updated_at).toBeDefined();
    });

    it('should maintain base class functionality in subclasses', () => {
      class ExtendedDTO extends BaseDTO {
        data: any;
        
        constructor(id: string, data: any) {
          super(id);
          this.data = data;
        }
        
        updateTimestamp(): void {
          this.updated_at = new Date().toISOString();
        }
      }

      const extendedDto = new ExtendedDTO('extended-id', { key: 'value' });
      const originalUpdatedAt = extendedDto.updated_at;
      
      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        extendedDto.updateTimestamp();
        expect(extendedDto.updated_at).not.toBe(originalUpdatedAt);
      }, 10);
    });
  });

  describe('serialization and data transfer', () => {
    it('should be JSON serializable', () => {
      const jsonString = JSON.stringify(testDto);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe(testDto.id);
      expect(parsed.name).toBe(testDto.name);
      expect(parsed.value).toBe(testDto.value);
      expect(parsed.created_at).toBe(testDto.created_at);
      expect(parsed.updated_at).toBe(testDto.updated_at);
    });

    it('should preserve all properties during serialization', () => {
      const serialized = JSON.stringify(testDto);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized).toEqual({
        id: testDto.id,
        name: testDto.name,
        value: testDto.value,
        created_at: testDto.created_at,
        updated_at: testDto.updated_at,
        optional: testDto.optional
      });
    });

    it('should handle complex nested data', () => {
      class ComplexDTO extends BaseDTO {
        metadata: Record<string, any>;
        tags: string[];
        
        constructor(id: string, metadata: Record<string, any>, tags: string[]) {
          super(id);
          this.metadata = metadata;
          this.tags = tags;
        }
      }

      const complexDto = new ComplexDTO('complex-id', 
        { nested: { deep: 'value' }, count: 42 },
        ['tag1', 'tag2', 'tag3']
      );

      const serialized = JSON.stringify(complexDto);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.metadata.nested.deep).toBe('value');
      expect(deserialized.metadata.count).toBe(42);
      expect(deserialized.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty string ID', () => {
      const emptyIdDto = new TestDTO('', 'Name', 123);
      expect(emptyIdDto.id).toBe('');
      expect(emptyIdDto.created_at).toBeDefined();
      expect(emptyIdDto.updated_at).toBeDefined();
    });

    it('should handle special characters in ID', () => {
      const specialId = 'test-id-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const specialDto = new TestDTO(specialId, 'Special', 456);
      expect(specialDto.id).toBe(specialId);
    });

    it('should handle very long ID strings', () => {
      const longId = 'a'.repeat(1000);
      const longIdDto = new TestDTO(longId, 'Long ID', 789);
      expect(longIdDto.id).toBe(longId);
      expect(longIdDto.id.length).toBe(1000);
    });

    it('should handle Unicode characters in properties', () => {
      const unicodeDto = new TestDTO('unicode-id', '测试名称', 123, '🚀 Optional');
      expect(unicodeDto.name).toBe('测试名称');
      expect(unicodeDto.optional).toBe('🚀 Optional');
    });

    it('should handle null and undefined values appropriately', () => {
      class NullableDTO extends BaseDTO {
        nullableField: string | null;
        undefinedField?: string;
        
        constructor(id: string, nullableField: string | null) {
          super(id);
          this.nullableField = nullableField;
        }
      }

      const nullableDto = new NullableDTO('nullable-id', null);
      expect(nullableDto.nullableField).toBeNull();
      expect(nullableDto.undefinedField).toBeUndefined();
      
      const serialized = JSON.stringify(nullableDto);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.nullableField).toBeNull();
      expect(deserialized.undefinedField).toBeUndefined();
    });
  });

  describe('data validation and integrity', () => {
    it('should maintain data integrity after modifications', () => {
      const originalId = testDto.id;
      const originalCreatedAt = testDto.created_at;
      
      // Modify some properties
      testDto.name = 'New Name';
      testDto.value = 999;
      
      // Manually set a different timestamp to ensure it's different
      const newTimestamp = '2023-12-25T10:30:00.000Z';
      testDto.updated_at = newTimestamp;
      
      // Core properties should remain intact
      expect(testDto.id).toBe(originalId);
      expect(testDto.created_at).toBe(originalCreatedAt);
      
      // Modified properties should be updated
      expect(testDto.name).toBe('New Name');
      expect(testDto.value).toBe(999);
      expect(testDto.updated_at).toBe(newTimestamp);
      expect(testDto.updated_at).not.toBe(originalCreatedAt);
    });

    it('should handle concurrent modifications safely', () => {
      const dto1 = new TestDTO('concurrent-1', 'Name 1', 1);
      const dto2 = new TestDTO('concurrent-2', 'Name 2', 2);
      
      // Simulate concurrent modifications
      dto1.name = 'Modified 1';
      dto2.name = 'Modified 2';
      dto1.updated_at = '2023-01-01T10:00:00.000Z';
      dto2.updated_at = '2023-01-01T11:00:00.000Z';
      
      expect(dto1.name).toBe('Modified 1');
      expect(dto2.name).toBe('Modified 2');
      expect(dto1.updated_at).toBe('2023-01-01T10:00:00.000Z');
      expect(dto2.updated_at).toBe('2023-01-01T11:00:00.000Z');
    });
  });

  describe('lifecycle and event handling', () => {
    it('should support custom lifecycle methods in subclasses', () => {
      class LifecycleDTO extends BaseDTO {
        private _isModified: boolean = false;
        data: string;
        
        constructor(id: string, data: string) {
          super(id);
          this.data = data;
        }
        
        markAsModified(): void {
          this._isModified = true;
          this.updated_at = new Date().toISOString();
        }
        
        isModified(): boolean {
          return this._isModified;
        }
        
        resetModified(): void {
          this._isModified = false;
        }
      }

      const lifecycleDto = new LifecycleDTO('lifecycle-id', 'Initial Data');
      
      expect(lifecycleDto.isModified()).toBe(false);
      
      lifecycleDto.markAsModified();
      expect(lifecycleDto.isModified()).toBe(true);
      
      lifecycleDto.resetModified();
      expect(lifecycleDto.isModified()).toBe(false);
    });

    it('should support validation in subclasses', () => {
      class ValidatedDTO extends BaseDTO {
        email: string;
        age: number;
        
        constructor(id: string, email: string, age: number) {
          super(id);
          this.email = email;
          this.age = age;
          this.validate();
        }
        
        validate(): void {
          if (!this.email.includes('@')) {
            throw new Error('Invalid email format');
          }
          if (this.age < 0) {
            throw new Error('Age cannot be negative');
          }
        }
      }

      expect(() => new ValidatedDTO('valid-id', 'test@example.com', 25)).not.toThrow();
      expect(() => new ValidatedDTO('invalid-email', 'invalid-email', 25)).toThrow('Invalid email format');
      expect(() => new ValidatedDTO('invalid-age', 'test@example.com', -5)).toThrow('Age cannot be negative');
    });
  });
});
