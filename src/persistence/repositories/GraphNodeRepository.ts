import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { GraphNodeDTO } from '../models/GraphNodeDTO';

export class GraphNodeRepository extends GenericRepository<GraphNodeDTO> {
  constructor(db: Database) {
    super(db, 'graph_nodes');
  }
}
