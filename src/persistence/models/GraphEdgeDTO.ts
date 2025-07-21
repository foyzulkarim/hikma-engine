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
}
