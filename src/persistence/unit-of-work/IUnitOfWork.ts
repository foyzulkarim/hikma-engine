import {
  RepositoryRepository,
  FileRepository,
  CodeNodeRepository,
  IndexingStateRepository,
  GraphNodeRepository,
  GraphEdgeRepository,
  FileImportRepository,
  FileRelationRepository,
  FileCommitRepository,
  FunctionCallRepository,
  FunctionCommitRepository,
} from '../repositories';

export interface IUnitOfWork {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
