import { BaseDTO } from './base.dto';

export abstract class BaseModel<T extends BaseDTO> {
  protected dto: T;

  constructor(dto: T) {
    this.dto = dto;
  }

  public getDto(): T {
    return this.dto;
  }

  public getId(): string {
    return this.dto.id;
  }

  // Override this in subclasses to define table name
  abstract getTableName(): string;

  // Override this in subclasses to define schema
  abstract getSchema(): Record<string, string>;
}