import { GenericRepository } from '../repository/GenericRepository';
import { CommitDTO } from '../models/CommitDTO';

export class CommitRepository extends GenericRepository<CommitDTO> {
  constructor(db: any) {
    super('commits');
  }
}
