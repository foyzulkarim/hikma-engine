import { GenericRepository } from '../repository/GenericRepository';
import { GraphNodeDTO } from '../models/GraphNodeDTO';

export class GraphNodeRepository extends GenericRepository<GraphNodeDTO> {
  constructor(db: any) {
    super('graph_nodes');
  }
}
