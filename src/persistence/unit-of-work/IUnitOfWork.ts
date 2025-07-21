import {
  RepositoryRepository,
  FileRepository,
  DirectoryRepository,
  CodeNodeRepository,
  TestNodeRepository,
  PullRequestRepository,
  CommitRepository,
  FunctionRepository,
} from '../repositories';

export interface IUnitOfWork {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
