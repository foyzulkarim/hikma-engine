import { BaseModel } from './base.model';
import { FunctionCallDTO } from './FunctionCallDTO';

export class FunctionCallModel extends BaseModel<FunctionCallDTO> {
  constructor(dto: FunctionCallDTO) {
    super(dto);
  }
}
