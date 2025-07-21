import { GenericRepository } from '../repository/GenericRepository';
import { FunctionCallDTO } from '../models/FunctionCallDTO';

export class FunctionCallRepository extends GenericRepository<FunctionCallDTO> {
  constructor(db: any) {
    super('function_calls');
  }
}
