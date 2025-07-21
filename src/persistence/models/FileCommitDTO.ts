import { BaseDTO } from './base.dto';

export class FileCommitDTO extends BaseDTO {
  file_id: string;
  commit_id: string;

  constructor(id: string, file_id: string, commit_id: string) {
    super(id);
    this.file_id = file_id;
    this.commit_id = commit_id;
  }
}
