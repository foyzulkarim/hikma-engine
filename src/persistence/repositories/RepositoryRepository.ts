import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { RepositoryDTO } from '../models/RepositoryDTO';

export class RepositoryRepository extends GenericRepository<RepositoryDTO> {
  constructor(db: Database) {
    super(db, 'repositories');
  }
}
