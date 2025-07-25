import { BaseModel } from './base.model';
import { EmbeddingNodeDTO } from './EmbeddingNodeDTO';

export class EmbeddingNodeModel extends BaseModel<EmbeddingNodeDTO> {
  id: string;
  node_id: string;
  embedding: string;
  source_text: string | null;
  node_type: string | null;
  file_path: string | null;

  constructor(dto: EmbeddingNodeDTO) {
    super(dto);
    this.id = dto.id;
    this.node_id = dto.node_id;
    this.embedding = dto.embedding;
    this.source_text = dto.source_text;
    this.node_type = dto.node_type;
    this.file_path = dto.file_path;
  }

  getTableName(): string {
    return 'embedding_nodes';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      node_id: 'TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE',
      embedding: 'TEXT NOT NULL',
      source_text: 'TEXT',
      node_type: 'TEXT',
      file_path: 'TEXT',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
  }
}
