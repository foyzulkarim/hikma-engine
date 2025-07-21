import { GenericRepository } from '../repository/GenericRepository';
import { Database } from 'better-sqlite3';
import { GraphEdgeDTO } from '../models/GraphEdgeDTO';

export class GraphEdgeRepository extends GenericRepository<GraphEdgeDTO> {
  constructor(db: Database) {
    super(db, 'graph_edges');
  }
}
