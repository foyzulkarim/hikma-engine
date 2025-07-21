import { BaseDTO } from './base.dto';

export class FileDTO extends BaseDTO {
  repo_id: string;
  file_path: string;
  file_name: string;
  file_extension?: string;
  language?: string;
  size_kb?: number;
  content_hash?: string;
  file_type?: 'source' | 'test' | 'config' | 'dev' | 'vendor';
  ai_summary?: string;
  imports?: string; // JSON string
  exports?: string; // JSON string

  constructor(
    id: string,
    repo_id: string,
    file_path: string,
    file_name: string,
    options: Partial<Omit<FileDTO, 'id' | 'repo_id' | 'file_path' | 'file_name'>> = {}
  ) {
    super(id);
    this.repo_id = repo_id;
    this.file_path = file_path;
    this.file_name = file_name;
    Object.assign(this, options);
  }
}