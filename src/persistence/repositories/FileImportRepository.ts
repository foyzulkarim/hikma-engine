import { GenericRepository } from '../repository/GenericRepository';
import { FileImportDTO } from '../models/FileImportDTO';

export class FileImportRepository extends GenericRepository<FileImportDTO> {
  constructor(db: any) {
    super('file_imports');
  }
}
