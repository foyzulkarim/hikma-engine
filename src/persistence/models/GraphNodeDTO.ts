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
}
