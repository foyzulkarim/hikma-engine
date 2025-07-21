import { GenericRepository } from '../repository/GenericRepository';
import { IndexingStateDTO } from '../models/IndexingStateDTO';

export class IndexingStateRepository extends GenericRepository<IndexingStateDTO> {
  constructor(db: any) {
    super('indexing_state');
  }
}
