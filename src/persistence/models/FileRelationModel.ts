import { BaseModel } from './base.model';
import { FileRelationDTO } from './FileRelationDTO';

export class FileRelationModel extends BaseModel<FileRelationDTO> {
  constructor(dto: FileRelationDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'file_relations';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      file_id: 'TEXT NOT NULL',
      related_file_id: 'TEXT NOT NULL',
      relation_type: 'TEXT NOT NULL',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'FOREIGN KEY (file_id)': 'REFERENCES files(id) ON DELETE CASCADE',
      'FOREIGN KEY (related_file_id)': 'REFERENCES files(id) ON DELETE CASCADE'
    };
  }
}