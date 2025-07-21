import { BaseDTO } from './base.dto';

export class FunctionCommitDTO extends BaseDTO {
  function_id: string;
  commit_id: string;

  constructor(id: string, function_id: string, commit_id: string) {
    super(id);
    this.function_id = function_id;
    this.commit_id = commit_id;
  }
}
