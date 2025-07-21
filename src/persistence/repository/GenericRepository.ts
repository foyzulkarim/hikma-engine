import { IRepository } from './IRepository';
import { BaseDTO } from '../models/base.dto';
import { SQLiteClient } from '../db/sqlite-client';

export class GenericRepository<T extends BaseDTO> implements IRepository<T> {
  private readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  async add(dto: T): Promise<T> {
    const db = await SQLiteClient.getInstance();
    const columns = Object.keys(dto).join(', ');
    const placeholders = Object.keys(dto).map(() => '?').join(', ');
    const values = Object.values(dto);
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    await db.run(sql, values);
    return dto;
  }

  async get(id: string): Promise<T | null> {
    const db = await SQLiteClient.getInstance();
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await db.get(sql, [id]);
    return row as T | null;
  }

  async getAll(): Promise<T[]> {
    const db = await SQLiteClient.getInstance();
    const sql = `SELECT * FROM ${this.tableName}`;
    const rows = await db.all(sql);
    return rows as T[];
  }

  async remove(id: string): Promise<void> {
    const db = await SQLiteClient.getInstance();
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    await db.run(sql, [id]);
  }

  async search(criteria: Partial<T>): Promise<T[]> {
    const db = await SQLiteClient.getInstance();
    const whereClauses = Object.keys(criteria)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    const values = Object.values(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClauses}`;
    const rows = await db.all(sql, values);
    return rows as T[];
  }
}
