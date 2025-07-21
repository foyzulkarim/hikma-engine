import { IUnitOfWork } from './IUnitOfWork';
import {
  RepositoryRepository,
  FileRepository,
  DirectoryRepository,
  CodeNodeRepository,
  TestNodeRepository,
  PullRequestRepository,
  CommitRepository,
  FunctionRepository,
  IndexingStateRepository,
  GraphNodeRepository,
  GraphEdgeRepository,
  FileImportRepository,
  FileRelationRepository,
  FileCommitRepository,
  FunctionCallRepository,
  FunctionCommitRepository,
} from '../repositories';
import { Database } from 'better-sqlite3';

export class UnitOfWork implements IUnitOfWork {
  private readonly db: Database;
  private repositories: Map<string, any> = new Map();

  constructor(db: Database) {
    this.db = db;
    this.registerRepositories();
  }

  private registerRepositories(): void {
    this.repositories.set(
      RepositoryRepository.name,
      new RepositoryRepository(this.db),
    );
    this.repositories.set(FileRepository.name, new FileRepository(this.db));
    this.repositories.set(
      DirectoryRepository.name,
      new DirectoryRepository(this.db),
    );
    this.repositories.set(
      CodeNodeRepository.name,
      new CodeNodeRepository(this.db),
    );
    this.repositories.set(
      TestNodeRepository.name,
      new TestNodeRepository(this.db),
    );
    this.repositories.set(
      PullRequestRepository.name,
      new PullRequestRepository(this.db),
    );
    this.repositories.set(
      CommitRepository.name,
      new CommitRepository(this.db),
    );
    this.repositories.set(
      FunctionRepository.name,
      new FunctionRepository(this.db),
    );
    this.repositories.set(
      IndexingStateRepository.name,
      new IndexingStateRepository(this.db),
    );
    this.repositories.set(
      GraphNodeRepository.name,
      new GraphNodeRepository(this.db),
    );
    this.repositories.set(
      GraphEdgeRepository.name,
      new GraphEdgeRepository(this.db),
    );
    this.repositories.set(
      FileImportRepository.name,
      new FileImportRepository(this.db),
    );
    this.repositories.set(
      FileRelationRepository.name,
      new FileRelationRepository(this.db),
    );
    this.repositories.set(
      FileCommitRepository.name,
      new FileCommitRepository(this.db),
    );
    this.repositories.set(
      FunctionCallRepository.name,
      new FunctionCallRepository(this.db),
    );
    this.repositories.set(
      FunctionCommitRepository.name,
      new FunctionCommitRepository(this.db),
    );
  }

  public getRepository<T>(repositoryName: string): T {
    const repository = this.repositories.get(repositoryName);

    if (!repository) {
      throw new Error(`Repository ${repositoryName} not found.`);
    }

    return repository as T;
  }

  public async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN');
  }

  public async commit(): Promise<void> {
    this.db.exec('COMMIT');
  }

  public async rollback(): Promise<void> {
    this.db.exec('ROLLBACK');
  }
}
