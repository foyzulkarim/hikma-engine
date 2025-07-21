import { BaseDTO } from './base.dto';

export class FunctionCallDTO extends BaseDTO {
  caller_id: string;
  callee_id: string;
}
