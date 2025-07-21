import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { FunctionCommitDTO } from '../models/FunctionCommitDTO';

export class FunctionCommitRepository extends GenericRepository<FunctionCommitDTO> {
  constructor(db: Database) {
    super(db, 'function_commits');
  }
}
