import { GenericRepository } from '../repository/GenericRepository';
import { RepositoryDTO } from '../models/RepositoryDTO';

export class RepositoryRepository extends GenericRepository<RepositoryDTO> {
  constructor(db: any) {
    super('repositories');
  }
}
