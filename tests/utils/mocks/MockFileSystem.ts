/**
 * @file MockFileSystem - Mock implementation for file system operations
 */

import { jest } from '@jest/globals';
import * as path from 'path';

export interface FileStructure {
  [path: string]: string | FileStructure;
}

export interface MockFileSystemOptions {
  shouldFailOperations?: boolean;
  initialFiles?: FileStructure;
  permissions?: Record<string, boolean>;
}

export interface MockStats {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtime: Date;
  ctime: Date;
  atime: Date;
  mode: number;
}

export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  private permissions: Map<string, boolean> = new Map();
  private shouldFailOperations: boolean;

  // Mock methods
  public readFile = jest.fn();
  public writeFile = jest.fn();
  public appendFile = jest.fn();
  public mkdir = jest.fn();
  public rmdir = jest.fn();
  public readdir = jest.fn();
  public stat = jest.fn();
  public lstat = jest.fn();
  public access = jest.fn();
  public exists = jest.fn();
  public unlink = jest.fn();
  public copyFile = jest.fn();
  public rename = jest.fn();
  public realpath = jest.fn();
  public watch = jest.fn();

  constructor(options: MockFileSystemOptions = {}) {
    this.shouldFailOperations = options.shouldFailOperations ?? false;
    
    if (options.initialFiles) {
      this.loadFileStructure(options.initialFiles);
    }
    
    if (options.permissions) {
      Object.entries(options.permissions).forEach(([filePath, hasPermission]) => {
        this.permissions.set(filePath, hasPermission);
      });
    }

    this.setupMockImplementations();
  }

  private setupMockImplementations(): void {
    // Use any type for all mock implementations to avoid TypeScript issues
    this.readFile.mockImplementation(jest.fn());
    this.writeFile.mockImplementation(jest.fn());
    this.appendFile.mockImplementation(jest.fn());
    this.mkdir.mockImplementation(jest.fn());
    this.rmdir.mockImplementation(jest.fn());
    this.readdir.mockImplementation(jest.fn());
    this.stat.mockImplementation(jest.fn());
    this.lstat.mockImplementation(jest.fn());
    this.access.mockImplementation(jest.fn());
    this.exists.mockImplementation(jest.fn());
    this.unlink.mockImplementation(jest.fn());
    this.copyFile.mockImplementation(jest.fn());
    this.rename.mockImplementation(jest.fn());
    this.realpath.mockImplementation(jest.fn());
    this.watch.mockImplementation(jest.fn());

    // Set up the actual implementations
    this.setupActualImplementations();
  }

  private setupActualImplementations(): void {
    // File reading operations
    (this.readFile as any).mockImplementation(async (filePath: string, encoding?: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock file read failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      
      if (!this.files.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
        error.code = 'ENOENT';
        error.errno = -2;
        error.path = filePath;
        throw error;
      }
      
      const content = this.files.get(normalizedPath)!;
      return encoding === 'utf8' || encoding === undefined ? content : Buffer.from(content);
    });

    // File writing operations
    (this.writeFile as any).mockImplementation(async (filePath: string, data: string | Buffer) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock file write failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      const content = typeof data === 'string' ? data : data.toString();
      
      // Ensure directory exists
      const dir = path.dirname(normalizedPath);
      this.directories.add(dir);
      
      this.files.set(normalizedPath, content);
    });

    (this.appendFile as any).mockImplementation(async (filePath: string, data: string | Buffer) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock file append failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      const content = typeof data === 'string' ? data : data.toString();
      const existing = this.files.get(normalizedPath) || '';
      
      this.files.set(normalizedPath, existing + content);
    });

    // Directory operations
    (this.mkdir as any).mockImplementation(async (dirPath: string, options?: any) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock mkdir failure: ${dirPath}`);
      }
      
      const normalizedPath = path.normalize(dirPath);
      
      if (options?.recursive) {
        // Create all parent directories
        const parts = normalizedPath.split(path.sep);
        let currentPath = '';
        
        for (const part of parts) {
          if (part) {
            currentPath = path.join(currentPath, part);
            this.directories.add(currentPath);
          }
        }
      } else {
        // Check if parent directory exists
        const parent = path.dirname(normalizedPath);
        if (parent !== '.' && !this.directories.has(parent)) {
          const error = new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`) as any;
          error.code = 'ENOENT';
          throw error;
        }
        this.directories.add(normalizedPath);
      }
    });

    (this.rmdir as any).mockImplementation(async (dirPath: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock rmdir failure: ${dirPath}`);
      }
      
      const normalizedPath = path.normalize(dirPath);
      
      if (!this.directories.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, rmdir '${dirPath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      // Check if directory is empty
      const hasFiles = Array.from(this.files.keys()).some(filePath => 
        filePath.startsWith(normalizedPath + path.sep)
      );
      const hasSubdirs = Array.from(this.directories).some(dir => 
        dir !== normalizedPath && dir.startsWith(normalizedPath + path.sep)
      );
      
      if (hasFiles || hasSubdirs) {
        const error = new Error(`ENOTEMPTY: directory not empty, rmdir '${dirPath}'`) as any;
        error.code = 'ENOTEMPTY';
        throw error;
      }
      
      this.directories.delete(normalizedPath);
    });

    (this.readdir as any).mockImplementation(async (dirPath: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock readdir failure: ${dirPath}`);
      }
      
      const normalizedPath = path.normalize(dirPath);
      
      if (!this.directories.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      const entries: string[] = [];
      
      // Find files in this directory
      for (const filePath of this.files.keys()) {
        const dir = path.dirname(filePath);
        if (dir === normalizedPath) {
          entries.push(path.basename(filePath));
        }
      }
      
      // Find subdirectories
      for (const dir of this.directories) {
        const parent = path.dirname(dir);
        if (parent === normalizedPath) {
          entries.push(path.basename(dir));
        }
      }
      
      return entries.sort();
    });

    // File/directory information
    (this.stat as any).mockImplementation(async (filePath: string): Promise<MockStats> => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock stat failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      const isFile = this.files.has(normalizedPath);
      const isDirectory = this.directories.has(normalizedPath);
      
      if (!isFile && !isDirectory) {
        const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      const now = new Date();
      const size = isFile ? this.files.get(normalizedPath)!.length : 0;
      
      return {
        isFile: () => isFile,
        isDirectory: () => isDirectory,
        size,
        mtime: now,
        ctime: now,
        atime: now,
        mode: isFile ? 0o644 : 0o755
      };
    });

    (this.lstat as any).mockImplementation(this.stat);

    // Access and existence checks
    (this.access as any).mockImplementation(async (filePath: string, mode?: number) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock access failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      const exists = this.files.has(normalizedPath) || this.directories.has(normalizedPath);
      
      if (!exists) {
        const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      // Check permissions if specified
      const hasPermission = this.permissions.get(normalizedPath);
      if (hasPermission === false) {
        const error = new Error(`EACCES: permission denied, access '${filePath}'`) as any;
        error.code = 'EACCES';
        throw error;
      }
    });

    (this.exists as any).mockImplementation(async (filePath: string) => {
      const normalizedPath = path.normalize(filePath);
      return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
    });

    // File operations
    (this.unlink as any).mockImplementation(async (filePath: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock unlink failure: ${filePath}`);
      }
      
      const normalizedPath = path.normalize(filePath);
      
      if (!this.files.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${filePath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      this.files.delete(normalizedPath);
    });

    (this.copyFile as any).mockImplementation(async (src: string, dest: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock copyFile failure: ${src} -> ${dest}`);
      }
      
      const normalizedSrc = path.normalize(src);
      const normalizedDest = path.normalize(dest);
      
      if (!this.files.has(normalizedSrc)) {
        const error = new Error(`ENOENT: no such file or directory, open '${src}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
      
      const content = this.files.get(normalizedSrc)!;
      this.files.set(normalizedDest, content);
    });

    (this.rename as any).mockImplementation(async (oldPath: string, newPath: string) => {
      if (this.shouldFailOperations) {
        throw new Error(`Mock rename failure: ${oldPath} -> ${newPath}`);
      }
      
      const normalizedOld = path.normalize(oldPath);
      const normalizedNew = path.normalize(newPath);
      
      if (this.files.has(normalizedOld)) {
        const content = this.files.get(normalizedOld)!;
        this.files.delete(normalizedOld);
        this.files.set(normalizedNew, content);
      } else if (this.directories.has(normalizedOld)) {
        this.directories.delete(normalizedOld);
        this.directories.add(normalizedNew);
      } else {
        const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`) as any;
        error.code = 'ENOENT';
        throw error;
      }
    });

    (this.realpath as any).mockImplementation(async (filePath: string) => {
      return path.resolve(filePath);
    });

    (this.watch as any).mockImplementation((filePath: string, options?: any) => {
      // Return a mock watcher
      return {
        close: jest.fn(),
        on: jest.fn(),
        emit: jest.fn()
      };
    });
  }

  // Helper methods for testing
  public createFile(filePath: string, content: string): void {
    const normalizedPath = path.normalize(filePath);
    const dir = path.dirname(normalizedPath);
    
    // Ensure directory exists
    this.directories.add(dir);
    this.files.set(normalizedPath, content);
  }

  public createDirectory(dirPath: string): void {
    const normalizedPath = path.normalize(dirPath);
    this.directories.add(normalizedPath);
  }

  public loadFileStructure(structure: FileStructure, basePath: string = ''): void {
    for (const [name, content] of Object.entries(structure)) {
      const fullPath = path.join(basePath, name);
      
      if (typeof content === 'string') {
        this.createFile(fullPath, content);
      } else {
        this.createDirectory(fullPath);
        this.loadFileStructure(content, fullPath);
      }
    }
  }

  public getFileContent(filePath: string): string | undefined {
    const normalizedPath = path.normalize(filePath);
    return this.files.get(normalizedPath);
  }

  public hasFile(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    return this.files.has(normalizedPath);
  }

  public hasDirectory(dirPath: string): boolean {
    const normalizedPath = path.normalize(dirPath);
    return this.directories.has(normalizedPath);
  }

  public setPermission(filePath: string, hasPermission: boolean): void {
    const normalizedPath = path.normalize(filePath);
    this.permissions.set(normalizedPath, hasPermission);
  }

  public simulateFailure(shouldFail: boolean = true): void {
    this.shouldFailOperations = shouldFail;
  }

  public clear(): void {
    this.files.clear();
    this.directories.clear();
    this.permissions.clear();
    this.directories.add('.'); // Always have current directory
  }

  public getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }

  public getAllDirectories(): string[] {
    return Array.from(this.directories);
  }

  public resetMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockReset();
      }
    });
    this.setupMockImplementations();
  }

  public clearMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockClear();
      }
    });
  }
}
