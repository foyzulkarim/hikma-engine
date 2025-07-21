import { SQLiteClient } from './connection';
import {
  RepositoryModel,
  FileModel,
  DirectoryModel,
  CodeNodeModel,
  TestNodeModel,
  PullRequestModel,
  CommitModel,
  FunctionModel,
} from '../models';
import { generateCreateTableCommand } from '../utils/schema-generator';

export function initializeTables(client: SQLiteClient): void {
  const db = client.getDb();

  db.exec(generateCreateTableCommand(new RepositoryModel({} as any)));
  db.exec(generateCreateTableCommand(new DirectoryModel({} as any)));
  db.exec(generateCreateTableCommand(new FileModel({} as any)));
  db.exec(generateCreateTableCommand(new CodeNodeModel({} as any)));
  db.exec(generateCreateTableCommand(new TestNodeModel({} as any)));
  db.exec(generateCreateTableCommand(new PullRequestModel({} as any)));
  db.exec(generateCreateTableCommand(new CommitModel({} as any)));
  db.exec(generateCreateTableCommand(new FunctionModel({} as any)));
  db.exec(generateCreateTableCommand(new IndexingStateModel({} as any)));
  db.exec(generateCreateTableCommand(new GraphNodeModel({} as any)));
  db.exec(generateCreateTableCommand(new GraphEdgeModel({} as any)));
  db.exec(generateCreateTableCommand(new FileImportModel({} as any)));
  db.exec(generateCreateTableCommand(new FileRelationModel({} as any)));
  db.exec(generateCreateTableCommand(new FileCommitModel({} as any)));
  db.exec(generateCreateTableCommand(new FunctionCallModel({} as any)));
  db.exec(generateCreateTableCommand(new FunctionCommitModel({} as any)));
}
