import { BaseModel } from './base.model';
import { FileDTO } from './FileDTO';

export class FileModel extends BaseModel<FileDTO> {
  getTableName(): string {
    return 'files';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      repo_id: 'TEXT NOT NULL',
      file_path: 'TEXT NOT NULL',
      file_name: 'TEXT NOT NULL',
      file_extension: 'TEXT',
      language: 'TEXT',
      size_kb: 'REAL',
      content_hash: 'TEXT',
      file_type: "TEXT CHECK (file_type IN ('source', 'test', 'config', 'dev', 'vendor'))",
      ai_summary: 'TEXT',
      imports: 'TEXT', // JSON array
      exports: 'TEXT', // JSON array
      content_embedding: 'BLOB', // Vector embedding
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'FOREIGN KEY (repo_id)': 'REFERENCES repositories(id) ON DELETE CASCADE'
    };
  }
}