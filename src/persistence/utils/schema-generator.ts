import { BaseModel } from '../models/base.model';
import { BaseDTO } from '../models/base.dto';

export function generateCreateTableCommand<T extends BaseDTO>(model: BaseModel<T>): string {
  const tableName = model.getTableName();
  const schema = model.getSchema();
  
  const columns: string[] = [];
  const constraints: string[] = [];
  
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith('FOREIGN KEY') || key.startsWith('UNIQUE') || key.startsWith('CHECK')) {
      constraints.push(`${key} ${value}`);
    } else {
      columns.push(`${key} ${value}`);
    }
  }
  
  const allDefinitions = [...columns, ...constraints];
  
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
    ${allDefinitions.join(',\n    ')}
  )`;
}

export function generateIndexes(tableName: string, indexes: Record<string, string[]>): string[] {
  const indexCommands: string[] = [];
  
  for (const [indexName, columns] of Object.entries(indexes)) {
    const fullIndexName = `idx_${tableName}_${indexName}`;
    const columnList = columns.join(', ');
    indexCommands.push(
      `CREATE INDEX IF NOT EXISTS ${fullIndexName} ON ${tableName}(${columnList})`
    );
  }
  
  return indexCommands;
}