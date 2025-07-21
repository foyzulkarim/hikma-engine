import { BaseModel } from './base.model';
import { FunctionCommitDTO } from './FunctionCommitDTO';

export class FunctionCommitModel extends BaseModel<FunctionCommitDTO> {
  constructor(dto: FunctionCommitDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'function_commits';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      function_id: 'TEXT NOT NULL',
      commit_id: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}