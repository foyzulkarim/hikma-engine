import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { IndexingStateDTO } from '../models/IndexingStateDTO';

export class IndexingStateRepository extends GenericRepository<IndexingStateDTO> {
  constructor(db: Database) {
    super(db, 'indexing_state');
  }
}
