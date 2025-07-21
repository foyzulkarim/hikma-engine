import { GenericRepository } from '../repository/GenericRepository';
import { FunctionDTO } from '../models/FunctionDTO';

export class FunctionRepository extends GenericRepository<FunctionDTO> {
  constructor(db: any) {
    super('functions');
  }
}
