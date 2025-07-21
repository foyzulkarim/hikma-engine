import { BaseDTO } from './base.dto';

export class GraphEdgeDTO extends BaseDTO {
  source_id: string;
  target_id: string;
  source_business_key: string;
  target_business_key: string;
  edge_type: string;
  properties?: string;
  line?: number;
  col?: number;
  dynamic?: boolean;

  constructor(
    id: string,
    source_id: string,
    target_id: string,
    source_business_key: string,
    target_business_key: string,
    edge_type: string,
    options: Partial<Pick<GraphEdgeDTO, 'properties' | 'line' | 'col' | 'dynamic'>> = {}
  ) {
    super(id);
    this.source_id = source_id;
    this.target_id = target_id;
    this.source_business_key = source_business_key;
    this.target_business_key = target_business_key;
    this.edge_type = edge_type;
    Object.assign(this, options);
  }
}
