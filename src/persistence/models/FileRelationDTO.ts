import { BaseDTO } from './base.dto';

export class FileRelationDTO extends BaseDTO {
  file_id: string;
  related_file_id: string;
  relation_type: string;

  constructor(id: string, file_id: string, related_file_id: string, relation_type: string) {
    super(id);
    this.file_id = file_id;
    this.related_file_id = related_file_id;
    this.relation_type = relation_type;
  }
}
