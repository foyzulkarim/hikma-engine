import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test utilities for Hikma Engine tests
 */

export interface TestFile {
  path: string;
  content: string;
  language: string;
}

export interface TestRepository {
  name: string;
  files: TestFile[];
}

/**
 * Creates a temporary directory for testing
 */
export function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hikma-test-'));
}

/**
 * Creates a test repository with sample files
 */
export function createTestRepository(repoName: string = 'test-repo'): string {
  const tempDir = createTempDirectory();
  const repoDir = path.join(tempDir, repoName);
  fs.mkdirSync(repoDir, { recursive: true });
  
  return repoDir;
}

/**
 * Creates a test file with given content
 */
export function createTestFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Creates a JavaScript test file with common patterns
 */
export function createJavaScriptFile(filePath: string, functions: string[] = []): void {
  const content = functions.map(fn => 
    `function ${fn}() {
  console.log('${fn} called');
}

export { ${fn} };`
  ).join('\n\n');
  
  createTestFile(filePath, content);
}

/**
 * Creates a Python test file with common patterns
 */
export function createPythonFile(filePath: string, functions: string[] = []): void {
  const content = functions.map(fn => 
    `def ${fn}():
    print("${fn} called")
    return True`
  ).join('\n\n');
  
  createTestFile(filePath, content);
}

/**
 * Creates a TypeScript test file with common patterns
 */
export function createTypeScriptFile(filePath: string, functions: string[] = []): void {
  const content = functions.map(fn => 
    `export function ${fn}(): void {
  console.log('${fn} called');
}`
  ).join('\n\n');
  
  createTestFile(filePath, content);
}

/**
 * Creates a sample repository with mixed file types
 */
export function createSampleRepository(): { repoPath: string; files: string[] } {
  const repoPath = createTestRepository('sample-project');
  const files: string[] = [];
  
  // Create package.json
  const packageJson = path.join(repoPath, 'package.json');
  createTestFile(packageJson, JSON.stringify({
    name: 'sample-project',
    version: '1.0.0',
    main: 'index.js'
  }, null, 2));
  files.push(packageJson);
  
  // Create JavaScript files
  const jsFile1 = path.join(repoPath, 'src', 'utils.js');
  createJavaScriptFile(jsFile1, ['formatDate', 'validateEmail', 'generateId']);
  files.push(jsFile1);
  
  const jsFile2 = path.join(repoPath, 'src', 'api.js');
  createJavaScriptFile(jsFile2, ['fetchData', 'postData', 'handleError']);
  files.push(jsFile2);
  
  // Create TypeScript files
  const tsFile = path.join(repoPath, 'src', 'types.ts');
  createTypeScriptFile(tsFile, ['User', 'Product', 'Order']);
  files.push(tsFile);
  
  // Create Python files
  const pyFile = path.join(repoPath, 'scripts', 'data_processor.py');
  createPythonFile(pyFile, ['process_data', 'validate_data', 'export_results']);
  files.push(pyFile);
  
  return { repoPath, files };
}

/**
 * Creates a temporary database file
 */
export function createTempDatabase(): string {
  const tempDir = createTempDirectory();
  return path.join(tempDir, 'test.db');
}

/**
 * Cleans up a temporary directory
 */
export function cleanupTempDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Waits for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a unique test ID
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a mock OpenAI response
 */
export function createMockOpenAIResponse(content: string): any {
  return {
    choices: [
      {
        message: {
          content: content
        }
      }
    ]
  };
}

/**
 * Validates a file path exists and is readable
 */
export function validateFilePath(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Gets the file extension from a file path
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * Determines the programming language from file extension
 */
export function getLanguageFromExtension(extension: string): string {
  const languageMap: { [key: string]: string } = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.m': 'objective-c',
    '.mm': 'objective-c',
  };
  
  return languageMap[extension.toLowerCase()] || 'unknown';
}

/**
 * Creates a mock function call chain
 */
export function createMockCallChain(): any[] {
  return [
    {
      caller: 'main',
      callee: 'processData',
      file: 'src/main.js',
      line: 10,
      column: 5
    },
    {
      caller: 'processData',
      callee: 'validateInput',
      file: 'src/utils.js',
      line: 25,
      column: 12
    },
    {
      caller: 'validateInput',
      callee: 'isValidEmail',
      file: 'src/validation.js',
      line: 8,
      column: 3
    }
  ];
}

/**
 * Creates a mock search result
 */
export function createMockSearchResult(): any {
  return {
    query: 'user authentication',
    results: [
      {
        type: 'function',
        name: 'authenticateUser',
        file: 'src/auth.js',
        line: 15,
        snippet: 'function authenticateUser(email, password) { ... }',
        score: 0.95
      },
      {
        type: 'class',
        name: 'AuthService',
        file: 'src/services/auth.js',
        line: 5,
        snippet: 'class AuthService { ... }',
        score: 0.87
      }
    ]
  };
}