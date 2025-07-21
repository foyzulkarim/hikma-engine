import { SQLiteClient } from './connection';
import { storeVector, vectorSearch, semanticSearch } from './vector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Vector Operations', () => {
  let sqliteClient: SQLiteClient;
  let testDbPath: string;

  beforeAll(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-hikma-${Date.now()}.db`);
  });

  beforeEach(async () => {
    sqliteClient = new SQLiteClient(testDbPath);
    await sqliteClient.connect();
  });

  afterEach(async () => {
    if (sqliteClient) {
      sqliteClient.disconnect();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('storeVector', () => {
    it('should store a vector successfully', async () => {
      const db = sqliteClient.getDb();
      db.exec('CREATE TABLE test (id TEXT, embedding BLOB)');
      await storeVector(sqliteClient, 'test', 'embedding', '1', [1, 2, 3]);
      const row = db.prepare('SELECT * FROM test WHERE id = ?').get('1') as any;
      expect(row).toBeDefined();
      expect(row.embedding).toBeInstanceOf(Buffer);
    });
  });

  describe('vectorSearch', () => {
    it('should perform a vector search successfully', async () => {
      const db = sqliteClient.getDb();
      db.exec('CREATE TABLE test (id TEXT, embedding BLOB)');
      await storeVector(sqliteClient, 'test', 'embedding', '1', [1, 2, 3]);
      await storeVector(sqliteClient, 'test', 'embedding', '2', [4, 5, 6]);
      const results = await vectorSearch(sqliteClient, 'test', 'embedding', [1, 2, 3]);
      expect(results).toHaveLength(2);
    });
  });

  describe('semanticSearch', () => {
    it('should perform a semantic search successfully', async () => {
      const db = sqliteClient.getDb();
      db.exec('CREATE TABLE files (id TEXT, content_embedding BLOB)');
      db.exec('CREATE TABLE functions (id TEXT, signature_embedding BLOB)');
      db.exec('CREATE TABLE commits (id TEXT, message_embedding BLOB)');
      db.exec('CREATE TABLE pull_requests (id TEXT, title_embedding BLOB)');
      const results = await semanticSearch(sqliteClient, [1, 2, 3]);
      expect(results).toBeDefined();
    });
  });
});
