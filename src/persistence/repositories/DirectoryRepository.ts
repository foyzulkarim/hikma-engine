import { GenericRepository } from '../repository/GenericRepository';
import { DirectoryDTO } from '../models/DirectoryDTO';

export class DirectoryRepository extends GenericRepository<DirectoryDTO> {
  constructor(db: any) {
    super('directories');
  }
}
