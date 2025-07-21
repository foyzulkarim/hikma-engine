import { BaseModel } from './base.model';
import { FunctionCallDTO } from './FunctionCallDTO';

export class FunctionCallModel extends BaseModel<FunctionCallDTO> {
  constructor(dto: FunctionCallDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'function_calls';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      caller_id: 'TEXT NOT NULL',
      callee_id: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}