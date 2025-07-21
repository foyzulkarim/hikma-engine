import { GenericRepository } from '../repository/GenericRepository';
import { FunctionCommitDTO } from '../models/FunctionCommitDTO';

export class FunctionCommitRepository extends GenericRepository<FunctionCommitDTO> {
  constructor(db: any) {
    super('function_commits');
  }
}
