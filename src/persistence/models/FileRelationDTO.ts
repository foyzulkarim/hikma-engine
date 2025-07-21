import { BaseDTO } from './base.dto';

export class FileRelationDTO extends BaseDTO {
  file_id: string;
  related_file_id: string;
  relation_type: string;
}
