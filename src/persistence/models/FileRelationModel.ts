import { BaseModel } from './base.model';
import { FileRelationDTO } from './FileRelationDTO';

export class FileRelationModel extends BaseModel<FileRelationDTO> {
  constructor(dto: FileRelationDTO) {
    super(dto);
  }
}
