import { BaseModel } from './base.model';
import { GraphEdgeDTO } from './GraphEdgeDTO';

export class GraphEdgeModel extends BaseModel<GraphEdgeDTO> {
  constructor(dto: GraphEdgeDTO) {
    super(dto);
  }

  getTableName(): string {
    return 'graph_edges';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      source_id: 'TEXT NOT NULL',
      target_id: 'TEXT NOT NULL',
      source_business_key: 'TEXT NOT NULL',
      target_business_key: 'TEXT NOT NULL',
      edge_type: 'TEXT NOT NULL',
      properties: 'TEXT',
      line: 'INTEGER',
      col: 'INTEGER',
      dynamic: 'BOOLEAN DEFAULT FALSE',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}