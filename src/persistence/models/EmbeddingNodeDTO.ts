import { BaseDTO } from './base.dto';

export class EmbeddingNodeDTO extends BaseDTO {
  node_id: string;
  embedding: string;
  source_text: string | null;
  node_type: string | null;
  file_path: string | null;

  constructor(
    id: string, 
    node_id: string, 
    embedding: string, 
    source_text: string | null, 
    node_type: string | null, 
    file_path: string | null = null, 
  ) {
    super(id);
    this.node_id = node_id;
    this.embedding = embedding;
    this.source_text = source_text;
    this.node_type = node_type;
    this.file_path = file_path;    
  }
}