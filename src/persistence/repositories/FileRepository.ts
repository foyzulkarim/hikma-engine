import { GenericRepository } from '../repository/GenericRepository';
import { FileDTO } from '../models/FileDTO';
import { Database } from 'better-sqlite3';

export class FileRepository extends GenericRepository<FileDTO> {
  constructor(db: Database) {
    super(db, 'files');
  }
}
