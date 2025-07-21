import { BaseModel } from './base.model';
import { GraphNodeDTO } from './GraphNodeDTO';

export class GraphNodeModel extends BaseModel<GraphNodeDTO> {
  constructor(dto: GraphNodeDTO) {
    super(dto);
  }
}
