import { BaseDTO } from './base.dto';

export class FunctionCallDTO extends BaseDTO {
  caller_id: string;
  callee_id: string;

  constructor(id: string, caller_id: string, callee_id: string) {
    super(id);
    this.caller_id = caller_id;
    this.callee_id = callee_id;
  }
}
