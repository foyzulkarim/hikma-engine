import { BaseDTO } from '../models/base.dto';

export interface IRepository<T extends BaseDTO> {
  add(dto: T): Promise<T>;
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  remove(id: string): Promise<void>;
  search(criteria: Partial<T>): Promise<T[]>;
}
