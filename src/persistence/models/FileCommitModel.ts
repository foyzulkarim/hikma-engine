import { BaseModel } from './base.model';
import { FileCommitDTO } from './FileCommitDTO';

export class FileCommitModel extends BaseModel<FileCommitDTO> {
  constructor(dto: FileCommitDTO) {
    super(dto);
  }
}
