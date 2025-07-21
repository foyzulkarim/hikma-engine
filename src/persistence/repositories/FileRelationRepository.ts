import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { FileRelationDTO } from '../models/FileRelationDTO';

export class FileRelationRepository extends GenericRepository<FileRelationDTO> {
  constructor(db: Database) {
    super(db, 'file_relations');
  }
}
