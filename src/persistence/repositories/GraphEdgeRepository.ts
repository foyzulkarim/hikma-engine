import { GenericRepository } from '../repository/GenericRepository';
import { GraphEdgeDTO } from '../models/GraphEdgeDTO';

export class GraphEdgeRepository extends GenericRepository<GraphEdgeDTO> {
  constructor(db: any) {
    super('graph_edges');
  }
}
