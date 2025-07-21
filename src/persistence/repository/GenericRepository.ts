import { IRepository } from './IRepository';
import { BaseDTO } from '../models/base.dto';
import { Database } from 'better-sqlite3';

export class GenericRepository<T extends BaseDTO> implements IRepository<T> {
  protected readonly db: Database;
  protected readonly tableName: string;

  constructor(db: Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async add(dto: T): Promise<T> {
    const columns = Object.keys(dto).join(', ');
    const placeholders = Object.keys(dto).map(() => '?').join(', ');
    const values = Object.values(dto);
    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
    return dto;
  }

  async get(id: string): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = this.db.prepare(sql).get(id);
    return row as T | null;
  }

  async getAll(): Promise<T[]> {
    const sql = `SELECT * FROM ${this.tableName}`;
    const rows = this.db.prepare(sql).all();
    return rows as T[];
  }

  async remove(id: string): Promise<void> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    this.db.prepare(sql).run(id);
  }

  async search(criteria: Partial<T>): Promise<T[]> {
    if (Object.keys(criteria).length === 0) {
      return this.getAll();
    }
    
    const whereClauses = Object.keys(criteria)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    const values = Object.values(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClauses}`;
    const rows = this.db.prepare(sql).all(...values);
    return rows as T[];
  }

  async batchAdd(dtos: T[]): Promise<T[]> {
    if (dtos.length === 0) return [];
    
    const columns = Object.keys(dtos[0]).join(', ');
    const placeholders = Object.keys(dtos[0]).map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    
    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((items: T[]) => {
      for (const item of items) {
        stmt.run(...Object.values(item));
      }
    });
    
    insertMany(dtos);
    return dtos;
  }

  async count(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const result = this.db.prepare(sql).get() as { count: number };
    return result.count;
  }
}
