import { SQLiteClient } from './connection';
import {
  RepositoryModel,
  FileModel,
  PhaseStatusModel,
  GraphNodeModel,
} from '../models';
import { generateCreateTableCommand, generateIndexes } from '../utils/schema-generator';

export function initializeTables(client: SQLiteClient): void {
  const db = client.getDb();

  // Create core tables
  db.exec(generateCreateTableCommand(new RepositoryModel(new (class extends Object {})() as any)));
  db.exec(generateCreateTableCommand(new FileModel(new (class extends Object {})() as any)));
  db.exec(generateCreateTableCommand(new PhaseStatusModel(new (class extends Object {})() as any)));
  db.exec(generateCreateTableCommand(new GraphNodeModel(new (class extends Object {})() as any)));
  
  // Create indexes for performance
  const repositoryIndexes = generateIndexes('repositories', {
    'path': ['repo_path'],
    'name': ['repo_name']
  });
  
  const fileIndexes = generateIndexes('files', {
    'repo_id': ['repo_id'],
    'path': ['file_path'],
    'type': ['file_type'],
    'language': ['language'],
    'hash': ['content_hash']
  });
  
  const graphNodeIndexes = generateIndexes('graph_nodes', {
    'repo_type': ['repo_id', 'node_type'],
    'file_path': ['file_path'],
    'business_key': ['business_key'],
    'signature': ['signature_hash']
  });
  
  const phaseIndexes = generateIndexes('phase_status', {
    'repo_phase': ['repo_id', 'phase_name'],
    'status': ['status']
  });
  
  [...repositoryIndexes, ...fileIndexes, ...graphNodeIndexes, ...phaseIndexes].forEach(indexSql => {
    db.exec(indexSql);
  });
}
