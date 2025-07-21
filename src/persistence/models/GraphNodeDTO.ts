import { BaseDTO } from './base.dto';

export class GraphNodeDTO extends BaseDTO {
  business_key: string;
  node_type: string;
  properties: string;
  repo_id?: string;
  commit_sha?: string;
  file_path?: string;
  line?: number;
  col?: number;
  signature_hash?: string;
  labels?: string;

  constructor(
    id: string,
    business_key: string,
    node_type: string,
    properties: string,
    options: Partial<Pick<GraphNodeDTO, 'repo_id' | 'commit_sha' | 'file_path' | 'line' | 'col' | 'signature_hash' | 'labels'>> = {}
  ) {
    super(id);
    this.business_key = business_key;
    this.node_type = node_type;
    this.properties = properties;
    Object.assign(this, options);
  }
}
