import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { FileCommitDTO } from '../models/FileCommitDTO';

export class FileCommitRepository extends GenericRepository<FileCommitDTO> {
  constructor(db: Database) {
    super(db, 'file_commits');
  }
}
