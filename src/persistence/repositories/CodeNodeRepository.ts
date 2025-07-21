import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { GraphNodeDTO } from '../models/GraphNodeDTO'; // Use GraphNodeDTO instead

export class CodeNodeRepository extends GenericRepository<GraphNodeDTO> {
  constructor(db: Database) {
    super(db, 'code_nodes');
  }
}
