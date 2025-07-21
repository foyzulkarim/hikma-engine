import { GenericRepository } from '../repository/GenericRepository';
import { FileRelationDTO } from '../models/FileRelationDTO';

export class FileRelationRepository extends GenericRepository<FileRelationDTO> {
  constructor(db: any) {
    super('file_relations');
  }
}
