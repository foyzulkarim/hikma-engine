import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { FunctionCallDTO } from '../models/FunctionCallDTO';

export class FunctionCallRepository extends GenericRepository<FunctionCallDTO> {
  constructor(db: Database) {
    super(db, 'function_calls');
  }
}
