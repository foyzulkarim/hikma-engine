import { BaseDTO } from './base.dto';

export class FileCommitDTO extends BaseDTO {
  file_id: string;
  commit_id: string;
}
