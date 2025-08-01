/**
 * @file IRepository.test.ts - Unit tests for IRepository interface compliance
 */

import { IRepository } from './IRepository';
import { BaseDTO } from '../models/base.dto';

// Test DTO implementation for testing interface compliance
class TestDTO extends BaseDTO {
  name: string;
  value: number;
  active: boolean;

  constructor(id: string, name: string, value: number = 0, active: boolean = true) {
    super(id);
    this.name = name;
    this.value = value;
    this.active = active;
  }
}

// Mock implementation of IRepository for testing interface compliance
class MockRepository implements IRepository<TestDTO> {
  private data: Map<string, TestDTO> = new Map();

  async add(dto: TestDTO): Promise<TestDTO> {
    this.data.set(dto.id, dto);
    return dto;
  }

  async get(id: string): Promise<TestDTO | null> {
    return this.data.get(id) || null;
  }

  async getAll(): Promise<TestDTO[]> {
    return Array.from(this.data.values());
  }

  async remove(id: string): Promise<void> {
    this.data.delete(id);
  }

  async search(criteria: Partial<TestDTO>): Promise<TestDTO[]> {
    const results: TestDTO[] = [];
    for (const dto of this.data.values()) {
      let matches = true;
      for (const [key, value] of Object.entries(criteria)) {
        if (dto[key as keyof TestDTO] !== value) {
          matches = false;
          break;
        }
      }
      if (matches) {
        results.push(dto);
      }
    }
    return results;
  }
}

describe('IRepository Interface Compliance', () => {
  let repository: IRepository<TestDTO>;
  let testDto: TestDTO;

  beforeEach(() => {
    repository = new MockRepository();
    testDto = new TestDTO('test-1', 'Test Item', 42, true);
  });

  describe('Interface Contract', () => {
    it('should implement all required methods', () => {
      expect(typeof repository.add).toBe('function');
      expect(typeof repository.get).toBe('function');
      expect(typeof repository.getAll).toBe('function');
      expect(typeof repository.remove).toBe('function');
      expect(typeof repository.search).toBe('function');
    });

    it('should have correct method signatures', () => {
      // Test that methods return promises
      expect(repository.add(testDto)).toBeInstanceOf(Promise);
      expect(repository.get('test-1')).toBeInstanceOf(Promise);
      expect(repository.getAll()).toBeInstanceOf(Promise);
      expect(repository.remove('test-1')).toBeInstanceOf(Promise);
      expect(repository.search({})).toBeInstanceOf(Promise);
    });
  });

  describe('add method', () => {
    it('should add a DTO and return it', async () => {
      const result = await repository.add(testDto);
      
      expect(result).toEqual(testDto);
      expect(result.id).toBe('test-1');
      expect(result.name).toBe('Test Item');
      expect(result.value).toBe(42);
      expect(result.active).toBe(true);
    });

    it('should handle DTOs with all BaseDTO properties', async () => {
      const result = await repository.add(testDto);
      
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should accept DTOs extending BaseDTO', async () => {
      const customDto = new TestDTO('custom-1', 'Custom Item', 100, false);
      const result = await repository.add(customDto);
      
      expect(result).toEqual(customDto);
      expect(result.name).toBe('Custom Item');
      expect(result.value).toBe(100);
      expect(result.active).toBe(false);
    });
  });

  describe('get method', () => {
    beforeEach(async () => {
      await repository.add(testDto);
    });

    it('should retrieve a DTO by id', async () => {
      const result = await repository.get('test-1');
      
      expect(result).toEqual(testDto);
      expect(result?.id).toBe('test-1');
    });

    it('should return null for non-existent id', async () => {
      const result = await repository.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should handle empty string id', async () => {
      const result = await repository.get('');
      
      expect(result).toBeNull();
    });
  });

  describe('getAll method', () => {
    it('should return empty array when no data exists', async () => {
      const result = await repository.getAll();
      
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return all DTOs', async () => {
      const dto1 = new TestDTO('test-1', 'Item 1', 10);
      const dto2 = new TestDTO('test-2', 'Item 2', 20);
      
      await repository.add(dto1);
      await repository.add(dto2);
      
      const result = await repository.getAll();
      
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(dto1);
      expect(result).toContainEqual(dto2);
    });

    it('should return array of correct type', async () => {
      await repository.add(testDto);
      const result = await repository.getAll();
      
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBeInstanceOf(TestDTO);
    });
  });

  describe('remove method', () => {
    beforeEach(async () => {
      await repository.add(testDto);
    });

    it('should remove a DTO by id', async () => {
      await repository.remove('test-1');
      const result = await repository.get('test-1');
      
      expect(result).toBeNull();
    });

    it('should not throw error for non-existent id', async () => {
      await expect(repository.remove('non-existent')).resolves.toBeUndefined();
    });

    it('should return void', async () => {
      const result = await repository.remove('test-1');
      
      expect(result).toBeUndefined();
    });
  });

  describe('search method', () => {
    beforeEach(async () => {
      const dto1 = new TestDTO('test-1', 'Active Item', 10, true);
      const dto2 = new TestDTO('test-2', 'Inactive Item', 20, false);
      const dto3 = new TestDTO('test-3', 'Another Active', 10, true);
      
      await repository.add(dto1);
      await repository.add(dto2);
      await repository.add(dto3);
    });

    it('should return all items for empty criteria', async () => {
      const result = await repository.search({});
      
      expect(result).toHaveLength(3);
    });

    it('should search by single property', async () => {
      const result = await repository.search({ active: true });
      
      expect(result).toHaveLength(2);
      expect(result.every(dto => dto.active === true)).toBe(true);
    });

    it('should search by multiple properties', async () => {
      const result = await repository.search({ value: 10, active: true });
      
      expect(result).toHaveLength(2);
      expect(result.every(dto => dto.value === 10 && dto.active === true)).toBe(true);
    });

    it('should return empty array for no matches', async () => {
      const result = await repository.search({ name: 'Non-existent' });
      
      expect(result).toEqual([]);
    });

    it('should handle partial matching criteria', async () => {
      const result = await repository.search({ id: 'test-1' });
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-1');
    });

    it('should return array of correct type', async () => {
      const result = await repository.search({ active: true });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.every(item => item instanceof TestDTO)).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should enforce BaseDTO constraint', () => {
      // This test ensures TypeScript compilation enforces the constraint
      // The repository should only accept DTOs that extend BaseDTO
      const validDto = new TestDTO('valid', 'Valid DTO');
      
      // This should compile without issues
      expect(() => repository.add(validDto)).not.toThrow();
    });

    it('should maintain type information in return values', async () => {
      await repository.add(testDto);
      
      const retrieved = await repository.get('test-1');
      const all = await repository.getAll();
      const searched = await repository.search({ name: 'Test Item' });
      
      // TypeScript should infer correct types
      if (retrieved) {
        expect(retrieved.name).toBeDefined(); // TestDTO property
        expect(retrieved.id).toBeDefined(); // BaseDTO property
      }
      
      if (all.length > 0) {
        expect(all[0].name).toBeDefined();
        expect(all[0].id).toBeDefined();
      }
      
      if (searched.length > 0) {
        expect(searched[0].name).toBeDefined();
        expect(searched[0].id).toBeDefined();
      }
    });
  });

  describe('Async Behavior', () => {
    it('should handle concurrent operations', async () => {
      const dto1 = new TestDTO('concurrent-1', 'Item 1');
      const dto2 = new TestDTO('concurrent-2', 'Item 2');
      
      // Execute operations concurrently
      const [result1, result2] = await Promise.all([
        repository.add(dto1),
        repository.add(dto2)
      ]);
      
      expect(result1).toEqual(dto1);
      expect(result2).toEqual(dto2);
      
      const all = await repository.getAll();
      expect(all).toHaveLength(2);
    });

    it('should maintain consistency across async operations', async () => {
      const dto = new TestDTO('async-test', 'Async Item');
      
      await repository.add(dto);
      const retrieved = await repository.get('async-test');
      await repository.remove('async-test');
      const afterRemoval = await repository.get('async-test');
      
      expect(retrieved).toEqual(dto);
      expect(afterRemoval).toBeNull();
    });
  });
});
