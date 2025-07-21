import { BaseModel } from './base.model';
import { IndexingStateDTO } from './IndexingStateDTO';

export class IndexingStateModel extends BaseModel<IndexingStateDTO> {
  constructor(dto: IndexingStateDTO) {
    super(dto);
  }
}
