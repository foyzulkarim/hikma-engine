import { BaseDTO } from './base.dto';

export class GraphNodeDTO extends BaseDTO {
  business_key: string;
  node_type: string;
  properties: string;
  repo_id: string | null;
  commit_sha: string | null;
  file_path: string | null;
  line: number | null;
  col: number | null;
  signature_hash: string | null;
  labels: string | null;

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
    
    // Always assign all fields to ensure consistent SQL column count
    this.repo_id = options.repo_id || null;
    this.commit_sha = options.commit_sha || null;
    this.file_path = options.file_path || null;
    this.line = options.line || null;
    this.col = options.col || null;
    this.signature_hash = options.signature_hash || null;
    this.labels = options.labels || null;
  }
}
