import { GenericRepository } from '../repository/GenericRepository';
import { PullRequestDTO } from '../models/PullRequestDTO';

export class PullRequestRepository extends GenericRepository<PullRequestDTO> {
  constructor(db: any) {
    super('pull_requests');
  }
}
