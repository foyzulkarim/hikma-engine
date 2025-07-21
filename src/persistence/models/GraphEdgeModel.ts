import { BaseModel } from './base.model';
import { GraphEdgeDTO } from './GraphEdgeDTO';

export class GraphEdgeModel extends BaseModel<GraphEdgeDTO> {
  constructor(dto: GraphEdgeDTO) {
    super(dto);
  }
}
