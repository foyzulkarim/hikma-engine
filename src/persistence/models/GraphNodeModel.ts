import { BaseModel } from './base.model';
import { GraphNodeDTO } from './GraphNodeDTO';

export class GraphNodeModel extends BaseModel<GraphNodeDTO> {
  constructor(dto: GraphNodeDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'graph_nodes';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      business_key: 'TEXT NOT NULL',
      node_type: 'TEXT NOT NULL',
      properties: 'TEXT NOT NULL',
      repo_id: 'TEXT',
      commit_sha: 'TEXT',
      file_path: 'TEXT',
      line: 'INTEGER',
      col: 'INTEGER',
      signature_hash: 'TEXT',
      labels: 'TEXT',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}