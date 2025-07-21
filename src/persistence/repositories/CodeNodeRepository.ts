import { GenericRepository } from '../repository/GenericRepository';
import { CodeNodeDTO } from '../models/CodeNodeDTO';

export class CodeNodeRepository extends GenericRepository<CodeNodeDTO> {
  constructor(db: any) {
    super('code_nodes');
  }
}
