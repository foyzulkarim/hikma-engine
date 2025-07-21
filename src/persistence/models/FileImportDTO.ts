import { BaseDTO } from './base.dto';

export class FileImportDTO extends BaseDTO {
  file_id: string;
  imported_file_id: string;

  constructor(id: string, file_id: string, imported_file_id: string) {
    super(id);
    this.file_id = file_id;
    this.imported_file_id = imported_file_id;
  }
}
