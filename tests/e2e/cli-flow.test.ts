import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper function to run CLI commands
function runCLICommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const command = 'node';
    const cliPath = path.join(__dirname, '../../dist/cli/graph-query.js');
    
    // Check if dist exists, if not use ts-node
    let finalArgs: string[];
    if (fs.existsSync(cliPath)) {
      finalArgs = [cliPath, ...args];
    } else {
      finalArgs = ['-r', 'ts-node/register', path.join(__dirname, '../../src/cli/graph-query.ts'), ...args];
    }

    const process = child_process.spawn(command, finalArgs, {
      cwd: cwd || path.join(__dirname, '../..'),
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

describe('CLI Flow - End-to-End Tests', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeAll(() => {
    // Create temporary directory for test data
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CLI Help and Version', () => {
    test('should display help when --help is provided', async () => {
      const result = await runCLICommand(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
    });

    test('should display help when no command is provided', async () => {
      const result = await runCLICommand([]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
    });

    test('should display stats command help', async () => {
      const result = await runCLICommand(['stats', '--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('stats');
    });
  });

  describe('CLI Stats Command', () => {
    test('should show stats for empty database', async () => {
      const result = await runCLICommand(['stats', '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Repositories');
      expect(result.stdout).toContain('Files');
      expect(result.stdout).toContain('Functions');
    });

    test('should handle non-existent database gracefully', async () => {
      const nonExistentDb = path.join(tempDir, 'nonexistent.db');
      const result = await runCLICommand(['stats', '--db', nonExistentDb]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Database');
    });
  });

  describe('CLI Search Command', () => {
    test('should search with empty results', async () => {
      const result = await runCLICommand(['search', 'nonexistent', '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No results');
    });

    test('should handle search with provider options', async () => {
      const result = await runCLICommand([
        'search', 
        'test', 
        '--db', tempDbPath,
        '--provider', 'openai',
        '--limit', '5'
      ]);
      
      expect(result.exitCode).toBe(0);
      // Should either show results or no results message
      expect(result.stdout).toMatch(/No results|Found \d+ results/);
    });
  });

  describe('CLI Index Command', () => {
    test('should handle indexing non-existent directory', async () => {
      const nonExistentDir = path.join(tempDir, 'nonexistent-repo');
      const result = await runCLICommand(['index', nonExistentDir, '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Directory');
    });

    test('should handle indexing empty directory', async () => {
      const emptyDir = path.join(tempDir, 'empty-repo');
      fs.mkdirSync(emptyDir, { recursive: true });
      
      const result = await runCLICommand(['index', emptyDir, '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Indexed');
    });

    test('should handle indexing with language filter', async () => {
      const testDir = path.join(tempDir, 'test-repo');
      fs.mkdirSync(testDir, { recursive: true });
      
      // Create a simple JavaScript file
      const jsFile = path.join(testDir, 'test.js');
      fs.writeFileSync(jsFile, 'console.log("hello world");');
      
      const result = await runCLICommand([
        'index', 
        testDir, 
        '--db', tempDbPath,
        '--languages', 'javascript'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Indexed');
    });
  });

  describe('CLI Chain Command', () => {
    test('should handle chain command with no data', async () => {
      const result = await runCLICommand(['chain', 'test-function', '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No call chain');
    });

    test('should handle chain command with invalid function', async () => {
      const result = await runCLICommand(['chain', 'nonexistent-function', '--db', tempDbPath]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No call chain');
    });
  });

  describe('CLI Error Handling', () => {
    test('should handle invalid command', async () => {
      const result = await runCLICommand(['invalid-command']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command');
    });

    test('should handle missing required arguments', async () => {
      const result = await runCLICommand(['index']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing required argument');
    });

    test('should handle invalid provider option', async () => {
      const result = await runCLICommand([
        'search', 
        'test', 
        '--db', tempDbPath,
        '--provider', 'invalid-provider'
      ]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid provider');
    });
  });

  describe('CLI Integration Flow', () => {
    test('should complete full workflow: index -> search -> stats', async () => {
      const testDir = path.join(tempDir, 'integration-repo');
      fs.mkdirSync(testDir, { recursive: true });
      
      // Create test files
      const jsFile = path.join(testDir, 'main.js');
      fs.writeFileSync(jsFile, `
        function hello() {
          console.log("Hello, world!");
        }
        
        function world() {
          hello();
        }
        
        world();
      `);
      
      // Step 1: Index the repository
      const indexResult = await runCLICommand([
        'index', 
        testDir, 
        '--db', tempDbPath,
        '--languages', 'javascript'
      ]);
      
      expect(indexResult.exitCode).toBe(0);
      expect(indexResult.stdout).toContain('Indexed');
      
      // Step 2: Search for functions
      const searchResult = await runCLICommand([
        'search', 
        'hello', 
        '--db', tempDbPath,
        '--type', 'function'
      ]);
      
      expect(searchResult.exitCode).toBe(0);
      expect(searchResult.stdout).toContain('hello');
      
      // Step 3: Check stats
      const statsResult = await runCLICommand(['stats', '--db', tempDbPath]);
      
      expect(statsResult.exitCode).toBe(0);
      expect(statsResult.stdout).toContain('Repositories: 1');
      expect(statsResult.stdout).toContain('Files: 1');
      expect(statsResult.stdout).toContain('Functions: 2');
    });
  });
});