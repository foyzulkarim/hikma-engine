import { GenericRepository } from '../repository/GenericRepository';
import { TestNodeDTO } from '../models/TestNodeDTO';

export class TestNodeRepository extends GenericRepository<TestNodeDTO> {
  constructor(db: any) {
    super('test_nodes');
  }
}
