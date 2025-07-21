import { BaseDTO } from './base.dto';

export class FileImportDTO extends BaseDTO {
  file_id: string;
  imported_file_id: string;
}
