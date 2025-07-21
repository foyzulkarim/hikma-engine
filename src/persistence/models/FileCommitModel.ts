import { BaseModel } from './base.model';
import { FileCommitDTO } from './FileCommitDTO';

export class FileCommitModel extends BaseModel<FileCommitDTO> {
  constructor(dto: FileCommitDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'file_commits';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      file_id: 'TEXT NOT NULL',
      commit_id: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'FOREIGN KEY (file_id)': 'REFERENCES files(id) ON DELETE CASCADE',
      'FOREIGN KEY (commit_id)': 'REFERENCES commits(id) ON DELETE CASCADE'
    };
  }
}
