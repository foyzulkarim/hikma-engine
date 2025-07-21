import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { FileImportDTO } from '../models/FileImportDTO';

export class FileImportRepository extends GenericRepository<FileImportDTO> {
  constructor(db: Database) {
    super(db, 'file_imports');
  }
}
