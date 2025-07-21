import { BaseModel } from './base.model';
import { RepositoryDTO } from './RepositoryDTO';

export class RepositoryModel extends BaseModel<RepositoryDTO> {
  getTableName(): string {
    return 'repositories';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      repo_path: 'TEXT NOT NULL',
      repo_name: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}