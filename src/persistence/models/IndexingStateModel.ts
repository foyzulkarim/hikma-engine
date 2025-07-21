import { BaseModel } from './base.model';
import { IndexingStateDTO } from './IndexingStateDTO';

export class IndexingStateModel extends BaseModel<IndexingStateDTO> {
  constructor(dto: IndexingStateDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'indexing_state';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      key: 'TEXT NOT NULL',
      value: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}