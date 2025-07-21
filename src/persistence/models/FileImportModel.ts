import { BaseModel } from './base.model';
import { FileImportDTO } from './FileImportDTO';

export class FileImportModel extends BaseModel<FileImportDTO> {
  constructor(dto: FileImportDTO) {
    super(dto);
  }
}
