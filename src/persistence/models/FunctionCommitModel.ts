import { BaseModel } from './base.model';
import { FunctionCommitDTO } from './FunctionCommitDTO';

export class FunctionCommitModel extends BaseModel<FunctionCommitDTO> {
  constructor(dto: FunctionCommitDTO) {
    super(dto);
  }
}
