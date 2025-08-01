/**
 * @file Test Repository Manager - Manages test Git repositories for E2E tests
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TestFileSystemManager, FileStructure } from './test-filesystem-manager';

export interface GitRepoConfig {
  name: string;
  files: FileStructure;
  commits?: CommitConfig[];
  branches?: string[];
}

export interface CommitConfig {
  message: string;
  author: string;
  email: string;
  files: string[];
}

export class TestRepositoryManager {
  private fsManager: TestFileSystemManager;
  private repositories: string[] = [];
  private baseRepoDir: string;

  constructor() {
    this.fsManager = new TestFileSystemManager();
    this.baseRepoDir = path.join(__dirname, '../temp/repositories');
  }

  async initialize(): Promise<void> {
    await this.fsManager.initialize();
    await fs.mkdir(this.baseRepoDir, { recursive: true });
  }

  async createCleanRepositories(): Promise<void> {
    // Clean up existing repositories
    await this.cleanup();
  }

  async createTestRepository(config: GitRepoConfig): Promise<string> {
    const repoId = uuidv4();
    const repoPath = path.join(this.baseRepoDir, `${config.name}-${repoId}`);
    
    // Create repository directory
    await fs.mkdir(repoPath, { recursive: true });
    this.repositories.push(repoPath);

    // Create file structure
    await this.fsManager.createFileStructure(repoPath, config.files);

    // Initialize Git repository
    await this.initializeGitRepo(repoPath);

    // Create branches if specified
    if (config.branches) {
      for (const branch of config.branches) {
        await this.createBranch(repoPath, branch);
      }
    }

    // Create commits if specified
    if (config.commits) {
      for (const commit of config.commits) {
        await this.createCommit(repoPath, commit);
      }
    }

    return repoPath;
  }

  async createSimpleTypeScriptRepo(): Promise<string> {
    const config: GitRepoConfig = {
      name: 'simple-typescript',
      files: {
        'package.json': JSON.stringify({
          name: 'simple-typescript-repo',
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
            strict: true,
            esModuleInterop: true
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist', 'tests']
        }, null, 2),
        'README.md': '# Simple TypeScript Repository\n\nA test repository for hikma-engine testing.',
        'src': {
          'index.ts': `import { Calculator } from './calculator';\nimport { Logger } from './utils/logger';\n\nconst calc = new Calculator();\nconst logger = new Logger();\n\nlogger.info('Starting application');\nconsole.log('2 + 3 =', calc.add(2, 3));\nconsole.log('5 * 4 =', calc.multiply(5, 4));`,
          'calculator.ts': `export class Calculator {\n  add(a: number, b: number): number {\n    return a + b;\n  }\n\n  subtract(a: number, b: number): number {\n    return a - b;\n  }\n\n  multiply(a: number, b: number): number {\n    return a * b;\n  }\n\n  divide(a: number, b: number): number {\n    if (b === 0) {\n      throw new Error('Division by zero');\n    }\n    return a / b;\n  }\n}`,
          'types.ts': `export interface User {\n  id: string;\n  name: string;\n  email: string;\n  createdAt: Date;\n}\n\nexport interface Product {\n  id: string;\n  name: string;\n  price: number;\n  category: string;\n}\n\nexport type Status = 'active' | 'inactive' | 'pending';`,
          'utils': {
            'logger.ts': `export class Logger {\n  private prefix: string;\n\n  constructor(prefix: string = '[APP]') {\n    this.prefix = prefix;\n  }\n\n  info(message: string): void {\n    console.log(\`\${this.prefix} INFO: \${message}\`);\n  }\n\n  warn(message: string): void {\n    console.warn(\`\${this.prefix} WARN: \${message}\`);\n  }\n\n  error(message: string): void {\n    console.error(\`\${this.prefix} ERROR: \${message}\`);\n  }\n}`,
            'helpers.ts': `import { User, Status } from '../types';\n\nexport function formatUserName(user: User): string {\n  return \`\${user.name} <\${user.email}>\`;\n}\n\nexport function isValidStatus(status: string): status is Status {\n  return ['active', 'inactive', 'pending'].includes(status);\n}\n\nexport function generateId(): string {\n  return Math.random().toString(36).substr(2, 9);\n}`
          },
          'services': {
            'user-service.ts': `import { User } from '../types';\nimport { Logger } from '../utils/logger';\n\nexport class UserService {\n  private logger: Logger;\n  private users: Map<string, User> = new Map();\n\n  constructor() {\n    this.logger = new Logger('[UserService]');\n  }\n\n  async createUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {\n    const user: User = {\n      id: Math.random().toString(36).substr(2, 9),\n      ...userData,\n      createdAt: new Date()\n    };\n\n    this.users.set(user.id, user);\n    this.logger.info(\`Created user: \${user.name}\`);\n    \n    return user;\n  }\n\n  async getUser(id: string): Promise<User | null> {\n    return this.users.get(id) || null;\n  }\n\n  async getAllUsers(): Promise<User[]> {\n    return Array.from(this.users.values());\n  }\n\n  async deleteUser(id: string): Promise<boolean> {\n    const deleted = this.users.delete(id);\n    if (deleted) {\n      this.logger.info(\`Deleted user: \${id}\`);\n    }\n    return deleted;\n  }\n}`
          }
        },
        'tests': {
          'calculator.test.ts': `import { Calculator } from '../src/calculator';\n\ndescribe('Calculator', () => {\n  let calculator: Calculator;\n\n  beforeEach(() => {\n    calculator = new Calculator();\n  });\n\n  describe('add', () => {\n    it('should add two positive numbers', () => {\n      expect(calculator.add(2, 3)).toBe(5);\n    });\n\n    it('should add negative numbers', () => {\n      expect(calculator.add(-2, -3)).toBe(-5);\n    });\n  });\n\n  describe('divide', () => {\n    it('should divide numbers correctly', () => {\n      expect(calculator.divide(10, 2)).toBe(5);\n    });\n\n    it('should throw error when dividing by zero', () => {\n      expect(() => calculator.divide(10, 0)).toThrow('Division by zero');\n    });\n  });\n});`
        }
      },
      commits: [
        {
          message: 'Initial commit',
          author: 'Test Author',
          email: 'test@example.com',
          files: ['package.json', 'tsconfig.json', 'README.md']
        },
        {
          message: 'Add calculator and basic structure',
          author: 'Test Author',
          email: 'test@example.com',
          files: ['src/index.ts', 'src/calculator.ts', 'src/types.ts']
        },
        {
          message: 'Add utilities and services',
          author: 'Test Author',
          email: 'test@example.com',
          files: ['src/utils/logger.ts', 'src/utils/helpers.ts', 'src/services/user-service.ts']
        },
        {
          message: 'Add tests',
          author: 'Test Author',
          email: 'test@example.com',
          files: ['tests/calculator.test.ts']
        }
      ],
      branches: ['main', 'feature/new-feature', 'bugfix/fix-division']
    };

    return await this.createTestRepository(config);
  }

  async createComplexJavaScriptRepo(): Promise<string> {
    const config: GitRepoConfig = {
      name: 'complex-javascript',
      files: {
        'package.json': JSON.stringify({
          name: 'complex-javascript-repo',
          version: '2.1.0',
          main: 'index.js',
          scripts: {
            start: 'node index.js',
            test: 'jest',
            lint: 'eslint .',
            build: 'webpack --mode production'
          },
          dependencies: {
            express: '^4.18.0',
            lodash: '^4.17.21',
            axios: '^1.0.0'
          },
          devDependencies: {
            jest: '^29.0.0',
            eslint: '^8.0.0',
            webpack: '^5.0.0'
          }
        }, null, 2),
        'README.md': '# Complex JavaScript Repository\n\nA more complex test repository with multiple modules and dependencies.',
        'index.js': `const express = require('express');\nconst { UserController } = require('./src/controllers/user-controller');\nconst { DatabaseService } = require('./src/services/database-service');\n\nconst app = express();\nconst port = process.env.PORT || 3000;\n\napp.use(express.json());\n\nconst userController = new UserController();\napp.use('/api/users', userController.getRouter());\n\napp.listen(port, () => {\n  console.log(\`Server running on port \${port}\`);\n});`,
        'src': {
          'controllers': {
            'user-controller.js': `const express = require('express');\nconst { UserService } = require('../services/user-service');\n\nclass UserController {\n  constructor() {\n    this.userService = new UserService();\n    this.router = express.Router();\n    this.setupRoutes();\n  }\n\n  setupRoutes() {\n    this.router.get('/', this.getAllUsers.bind(this));\n    this.router.get('/:id', this.getUser.bind(this));\n    this.router.post('/', this.createUser.bind(this));\n    this.router.put('/:id', this.updateUser.bind(this));\n    this.router.delete('/:id', this.deleteUser.bind(this));\n  }\n\n  async getAllUsers(req, res) {\n    try {\n      const users = await this.userService.getAllUsers();\n      res.json(users);\n    } catch (error) {\n      res.status(500).json({ error: error.message });\n    }\n  }\n\n  async getUser(req, res) {\n    try {\n      const user = await this.userService.getUser(req.params.id);\n      if (!user) {\n        return res.status(404).json({ error: 'User not found' });\n      }\n      res.json(user);\n    } catch (error) {\n      res.status(500).json({ error: error.message });\n    }\n  }\n\n  async createUser(req, res) {\n    try {\n      const user = await this.userService.createUser(req.body);\n      res.status(201).json(user);\n    } catch (error) {\n      res.status(400).json({ error: error.message });\n    }\n  }\n\n  async updateUser(req, res) {\n    try {\n      const user = await this.userService.updateUser(req.params.id, req.body);\n      if (!user) {\n        return res.status(404).json({ error: 'User not found' });\n      }\n      res.json(user);\n    } catch (error) {\n      res.status(400).json({ error: error.message });\n    }\n  }\n\n  async deleteUser(req, res) {\n    try {\n      const deleted = await this.userService.deleteUser(req.params.id);\n      if (!deleted) {\n        return res.status(404).json({ error: 'User not found' });\n      }\n      res.status(204).send();\n    } catch (error) {\n      res.status(500).json({ error: error.message });\n    }\n  }\n\n  getRouter() {\n    return this.router;\n  }\n}\n\nmodule.exports = { UserController };`
          },
          'services': {
            'user-service.js': `const { DatabaseService } = require('./database-service');\nconst { ValidationService } = require('./validation-service');\n\nclass UserService {\n  constructor() {\n    this.db = new DatabaseService();\n    this.validator = new ValidationService();\n  }\n\n  async getAllUsers() {\n    return await this.db.findAll('users');\n  }\n\n  async getUser(id) {\n    this.validator.validateId(id);\n    return await this.db.findById('users', id);\n  }\n\n  async createUser(userData) {\n    this.validator.validateUserData(userData);\n    const user = {\n      id: this.generateId(),\n      ...userData,\n      createdAt: new Date().toISOString(),\n      updatedAt: new Date().toISOString()\n    };\n    return await this.db.create('users', user);\n  }\n\n  async updateUser(id, userData) {\n    this.validator.validateId(id);\n    this.validator.validateUserData(userData, false);\n    const updatedUser = {\n      ...userData,\n      updatedAt: new Date().toISOString()\n    };\n    return await this.db.update('users', id, updatedUser);\n  }\n\n  async deleteUser(id) {\n    this.validator.validateId(id);\n    return await this.db.delete('users', id);\n  }\n\n  generateId() {\n    return Math.random().toString(36).substr(2, 9);\n  }\n}\n\nmodule.exports = { UserService };`,
            'database-service.js': `class DatabaseService {\n  constructor() {\n    this.data = new Map();\n    this.initialize();\n  }\n\n  initialize() {\n    // Initialize with some mock data\n    this.data.set('users', new Map());\n  }\n\n  async findAll(table) {\n    const tableData = this.data.get(table);\n    if (!tableData) {\n      throw new Error(\`Table \${table} not found\`);\n    }\n    return Array.from(tableData.values());\n  }\n\n  async findById(table, id) {\n    const tableData = this.data.get(table);\n    if (!tableData) {\n      throw new Error(\`Table \${table} not found\`);\n    }\n    return tableData.get(id) || null;\n  }\n\n  async create(table, record) {\n    const tableData = this.data.get(table);\n    if (!tableData) {\n      throw new Error(\`Table \${table} not found\`);\n    }\n    tableData.set(record.id, record);\n    return record;\n  }\n\n  async update(table, id, updates) {\n    const tableData = this.data.get(table);\n    if (!tableData) {\n      throw new Error(\`Table \${table} not found\`);\n    }\n    const existing = tableData.get(id);\n    if (!existing) {\n      return null;\n    }\n    const updated = { ...existing, ...updates };\n    tableData.set(id, updated);\n    return updated;\n  }\n\n  async delete(table, id) {\n    const tableData = this.data.get(table);\n    if (!tableData) {\n      throw new Error(\`Table \${table} not found\`);\n    }\n    return tableData.delete(id);\n  }\n}\n\nmodule.exports = { DatabaseService };`,
            'validation-service.js': `class ValidationService {\n  validateId(id) {\n    if (!id || typeof id !== 'string') {\n      throw new Error('Invalid ID provided');\n    }\n  }\n\n  validateUserData(userData, requireAll = true) {\n    if (!userData || typeof userData !== 'object') {\n      throw new Error('Invalid user data provided');\n    }\n\n    if (requireAll) {\n      if (!userData.name || typeof userData.name !== 'string') {\n        throw new Error('Name is required and must be a string');\n      }\n      if (!userData.email || typeof userData.email !== 'string') {\n        throw new Error('Email is required and must be a string');\n      }\n    }\n\n    if (userData.email && !this.isValidEmail(userData.email)) {\n      throw new Error('Invalid email format');\n    }\n  }\n\n  isValidEmail(email) {\n    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n    return emailRegex.test(email);\n  }\n}\n\nmodule.exports = { ValidationService };`
          },
          'utils': {
            'logger.js': `class Logger {\n  constructor(prefix = '[APP]') {\n    this.prefix = prefix;\n  }\n\n  info(message) {\n    console.log(\`\${this.prefix} INFO: \${message}\`);\n  }\n\n  warn(message) {\n    console.warn(\`\${this.prefix} WARN: \${message}\`);\n  }\n\n  error(message) {\n    console.error(\`\${this.prefix} ERROR: \${message}\`);\n  }\n\n  debug(message) {\n    if (process.env.NODE_ENV === 'development') {\n      console.log(\`\${this.prefix} DEBUG: \${message}\`);\n    }\n  }\n}\n\nmodule.exports = { Logger };`,
            'helpers.js': `const _ = require('lodash');\n\nfunction formatResponse(data, message = 'Success') {\n  return {\n    success: true,\n    message,\n    data,\n    timestamp: new Date().toISOString()\n  };\n}\n\nfunction formatError(error, statusCode = 500) {\n  return {\n    success: false,\n    error: error.message || 'Internal server error',\n    statusCode,\n    timestamp: new Date().toISOString()\n  };\n}\n\nfunction sanitizeUser(user) {\n  return _.omit(user, ['password', 'internalId']);\n}\n\nfunction generateRandomString(length = 10) {\n  return Math.random().toString(36).substring(2, length + 2);\n}\n\nmodule.exports = {\n  formatResponse,\n  formatError,\n  sanitizeUser,\n  generateRandomString\n};`
          }
        }
      }
    };

    return await this.createTestRepository(config);
  }

  private async initializeGitRepo(repoPath: string): Promise<void> {
    // Create basic .git structure
    const gitDir = path.join(repoPath, '.git');
    await fs.mkdir(gitDir, { recursive: true });

    // Create basic git files
    await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(gitDir, 'config'), `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[user]
	name = Test Author
	email = test@example.com
`);

    // Create refs directory
    const refsDir = path.join(gitDir, 'refs', 'heads');
    await fs.mkdir(refsDir, { recursive: true });
    
    // Create main branch ref
    await fs.writeFile(path.join(refsDir, 'main'), '1234567890abcdef1234567890abcdef12345678\n');

    // Create objects directory
    await fs.mkdir(path.join(gitDir, 'objects'), { recursive: true });
    await fs.mkdir(path.join(gitDir, 'hooks'), { recursive: true });
  }

  private async createBranch(repoPath: string, branchName: string): Promise<void> {
    const branchRef = path.join(repoPath, '.git', 'refs', 'heads', branchName);
    await fs.writeFile(branchRef, '1234567890abcdef1234567890abcdef12345678\n');
  }

  private async createCommit(repoPath: string, commit: CommitConfig): Promise<void> {
    // This is a simplified mock commit creation
    // In a real implementation, you would use a Git library
    const commitHash = this.generateCommitHash(commit.message);
    
    // Update the main branch ref
    const mainRef = path.join(repoPath, '.git', 'refs', 'heads', 'main');
    await fs.writeFile(mainRef, `${commitHash}\n`);
  }

  private generateCommitHash(message: string): string {
    // Generate a deterministic hash based on the commit message
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(40, '0');
  }

  async cleanup(): Promise<void> {
    // Clean up all test repositories
    for (const repoPath of this.repositories) {
      await this.fsManager.deleteDirectory(repoPath);
    }
    this.repositories = [];
  }

  async destroy(): Promise<void> {
    await this.cleanup();
    await this.fsManager.destroy();
    
    // Clean up base repository directory if empty
    try {
      const entries = await fs.readdir(this.baseRepoDir);
      if (entries.length === 0) {
        await fs.rmdir(this.baseRepoDir);
      }
    } catch {
      // Ignore errors
    }
  }

  getRepositories(): string[] {
    return [...this.repositories];
  }
}
