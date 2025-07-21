import { SQLiteClient } from './connection';
import { ConfigManager } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLiteClient', () => {
  let sqliteClient: SQLiteClient;
  let testDbPath: string;
  let config: ConfigManager;

  beforeAll(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `test-hikma-${Date.now()}.db`);
    config = new ConfigManager(process.cwd());
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

  describe('Connection and Initialization', () => {
    it('should connect to SQLite database successfully', async () => {
      expect(sqliteClient.getDb()).toBeDefined();
    });
  });
});
