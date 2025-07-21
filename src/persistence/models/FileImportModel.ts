import { BaseModel } from './base.model';
import { FileImportDTO } from './FileImportDTO';

export class FileImportModel extends BaseModel<FileImportDTO> {
  constructor(dto: FileImportDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'file_imports';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      file_id: 'TEXT NOT NULL',
      imported_file_id: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'FOREIGN KEY (file_id)': 'REFERENCES files(id) ON DELETE CASCADE',
      'FOREIGN KEY (imported_file_id)': 'REFERENCES files(id) ON DELETE CASCADE'
    };
  }
}