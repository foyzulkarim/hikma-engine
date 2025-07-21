import { GenericRepository } from '../repository/GenericRepository';
import { FileDTO } from '../models/FileDTO';

export class FileRepository extends GenericRepository<FileDTO> {
  constructor(db: any) {
    super('files');
  }
}
