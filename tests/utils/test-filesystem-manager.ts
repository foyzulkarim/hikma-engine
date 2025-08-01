/**
 * @file Test File System Manager - Handles test file system operations and cleanup
 */

import fs from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface FileStructure {
  [path: string]: string | FileStructure;
}

export interface TestFileOptions {
  content?: string;
  size?: number;
  extension?: string;
  encoding?: BufferEncoding;
}

export class TestFileSystemManager {
  private tempDirectories: string[] = [];
  private baseTestDir: string;

  constructor() {
    this.baseTestDir = path.join(__dirname, '../temp');
  }

  async initialize(): Promise<void> {
    // Ensure base test directory exists
    await fs.mkdir(this.baseTestDir, { recursive: true });
  }

  async createCleanWorkspace(): Promise<string> {
    const workspaceId = uuidv4();
    const workspacePath = path.join(this.baseTestDir, `workspace-${workspaceId}`);
    
    await fs.mkdir(workspacePath, { recursive: true });
    this.tempDirectories.push(workspacePath);
    
    return workspacePath;
  }

  async createTempDirectory(name?: string): Promise<string> {
    const dirName = name || `temp-${uuidv4()}`;
    const dirPath = path.join(this.baseTestDir, dirName);
    
    await fs.mkdir(dirPath, { recursive: true });
    this.tempDirectories.push(dirPath);
    
    return dirPath;
  }

  async createFileStructure(basePath: string, structure: FileStructure): Promise<void> {
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(basePath, filePath);
      
      if (typeof content === 'string') {
        // It's a file
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');
      } else {
        // It's a directory with nested structure
        await fs.mkdir(fullPath, { recursive: true });
        await this.createFileStructure(fullPath, content);
      }
    }
  }

  async createTestFile(
    basePath: string, 
    fileName: string, 
    options: TestFileOptions = {}
  ): Promise<string> {
    const {
      content = 'Test file content',
      size,
      extension,
      encoding = 'utf8'
    } = options;

    let finalFileName = fileName;
    if (extension && !fileName.endsWith(extension)) {
      finalFileName = `${fileName}${extension}`;
    }

    const filePath = path.join(basePath, finalFileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let fileContent = content;
    if (size && size > content.length) {
      // Pad content to reach desired size
      const padding = 'x'.repeat(size - content.length);
      fileContent = content + padding;
    }

    await fs.writeFile(filePath, fileContent, encoding);
    return filePath;
  }

  async createTestProject(options: { name: string; files: FileStructure }): Promise<string> {
    const projectPath = path.join(this.baseTestDir, `project-${options.name}-${uuidv4()}`);
    
    await this.createFileStructure(projectPath, options.files);
    this.tempDirectories.push(projectPath);
    
    return projectPath;
  }

  async createDefaultTestProject(basePath: string, projectName: string): Promise<string> {
    const projectPath = path.join(basePath, projectName);
    
    // Create a typical TypeScript project structure
    const projectStructure: FileStructure = {
      'package.json': JSON.stringify({
        name: projectName,
        version: '1.0.0',
        main: 'src/index.ts',
        scripts: {
          build: 'tsc',
          test: 'jest'
        },
        dependencies: {
          typescript: '^5.0.0'
        }
      }, null, 2),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: './dist',
          rootDir: './src',
          strict: true
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist']
      }, null, 2),
      'README.md': `# ${projectName}\n\nA test project for hikma-engine testing.`,
      'src': {
        'index.ts': `export * from './main';\nexport * from './utils';`,
        'main.ts': `import { greet } from './utils';\n\nconsole.log(greet('World'));`,
        'utils.ts': `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}`,
        'types.ts': `export interface User {\n  id: string;\n  name: string;\n  email: string;\n}`,
        'services': {
          'user-service.ts': `import { User } from '../types';\n\nexport class UserService {\n  async getUser(id: string): Promise<User | null> {\n    // Mock implementation\n    return null;\n  }\n}`
        }
      },
      'tests': {
        'utils.test.ts': `import { greet } from '../src/utils';\n\ndescribe('greet', () => {\n  it('should greet correctly', () => {\n    expect(greet('Test')).toBe('Hello, Test!');\n  });\n});`
      }
    };

    await this.createFileStructure(projectPath, projectStructure);
    return projectPath;
  }

  async createGitRepository(basePath: string, repoName: string): Promise<string> {
    const repoPath = path.join(basePath, repoName);
    await fs.mkdir(repoPath, { recursive: true });

    // Create .git directory structure
    const gitStructure: FileStructure = {
      '.git': {
        'config': `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false`,
        'HEAD': 'ref: refs/heads/main',
        'refs': {
          'heads': {
            'main': '1234567890abcdef1234567890abcdef12345678'
          }
        },
        'objects': {},
        'hooks': {}
      }
    };

    await this.createFileStructure(repoPath, gitStructure);
    return repoPath;
  }

  async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return await fs.readFile(filePath, encoding);
  }

  async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, encoding);
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(filePath: string): Promise<Stats> {
    return await fs.stat(filePath);
  }

  async listFiles(dirPath: string, recursive: boolean = false): Promise<string[]> {
    const files: string[] = [];
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        const subFiles = await this.listFiles(fullPath, true);
        files.push(...subFiles);
      }
    }
    
    return files;
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(sourcePath, destPath);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async cleanup(): Promise<void> {
    // Clean up all temporary directories created during tests
    for (const dirPath of this.tempDirectories) {
      await this.deleteDirectory(dirPath);
    }
    this.tempDirectories = [];
  }

  async destroy(): Promise<void> {
    await this.cleanup();
    
    // Clean up base test directory if it's empty
    try {
      const entries = await fs.readdir(this.baseTestDir);
      if (entries.length === 0) {
        await fs.rmdir(this.baseTestDir);
      }
    } catch {
      // Ignore errors
    }
  }

  getTempDirectories(): string[] {
    return [...this.tempDirectories];
  }

  getBaseTestDir(): string {
    return this.baseTestDir;
  }
}
