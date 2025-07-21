import { GenericRepository } from '../repository/GenericRepository';
import { FileCommitDTO } from '../models/FileCommitDTO';

export class FileCommitRepository extends GenericRepository<FileCommitDTO> {
  constructor(db: any) {
    super('file_commits');
  }
}
