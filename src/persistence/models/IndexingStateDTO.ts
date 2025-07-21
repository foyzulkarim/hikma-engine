import { BaseDTO } from './base.dto';

export class IndexingStateDTO extends BaseDTO {
  key: string;
  value: string;

  constructor(id: string, key: string, value: string) {
    super(id);
    this.key = key;
    this.value = value;
  }
}
