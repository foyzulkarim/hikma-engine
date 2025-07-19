/**
 * Enhanced graph node and edge types based on comprehensive schema
 */

// Enhanced Node Types
export type EnhancedNodeType = 
  | 'Repository'
  | 'Commit'
  | 'Directory' 
  | 'File'
  | 'Module'
  | 'Function'
  | 'ArrowFunction'
  | 'Class'
  | 'Variable'
  | 'Import'
  | 'Export'
  | 'TestCase';

// Enhanced Edge Types  
export type EnhancedEdgeType =
  | 'CONTAINS'
  | 'HAS_COMMIT'
  | 'TOUCHED'
  | 'DECLARES'
  | 'IMPORTS'
  | 'EXPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'READS'
  | 'WRITES'
  | 'RETURNS'
  | 'THROWS'
  | 'TESTED_BY'
  | 'COVERS';

// Base Enhanced Node
export interface EnhancedBaseNode {
  id: string;
  businessKey: string;
  type: EnhancedNodeType;
  properties: Record<string, any>;
  // Cross-cutting properties
  repoId?: string;
  commitSha?: string;
  filePath?: string;
  line?: number;
  col?: number;
  signatureHash?: string;
  labels?: string[];
}

// Enhanced Edge
export interface EnhancedEdge {
  id: string;
  source: string;
  target: string;
  sourceBusinessKey: string;
  targetBusinessKey: string;
  type: EnhancedEdgeType;
  properties?: Record<string, any>;
  // Common edge properties
  line?: number;
  col?: number;
  dynamic?: boolean;
}

// Specific Node Types
export interface RepositoryNode extends EnhancedBaseNode {
  type: 'Repository';
  businessKey: string; // owner/name
  properties: {
    url: string;
    cloneUrl?: string;
    defaultBranch: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface CommitNode extends EnhancedBaseNode {
  type: 'Commit';
  businessKey: string; // sha
  properties: {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
    isMerge: boolean;
  };
}

export interface DirectoryNode extends EnhancedBaseNode {
  type: 'Directory';
  businessKey: string; // repoId@rev:dirPath
  properties: {
    path: string;
    depth: number;
  };
}

export interface EnhancedFileNode extends EnhancedBaseNode {
  type: 'File';
  businessKey: string; // repoId@rev:path
  properties: {
    path: string;
    ext: string;
    language: string;
    size: number;
    loc: number;
    hash: string;
  };
}

export interface ModuleNode extends EnhancedBaseNode {
  type: 'Module';
  businessKey: string; // resolvedModuleName
  properties: {
    name: string;
    isBuiltin: boolean;
    isExternal: boolean;
    version?: string;
  };
}

export interface EnhancedFunctionNode extends EnhancedBaseNode {
  type: 'Function' | 'ArrowFunction';
  businessKey: string; // fileId#name#line
  properties: {
    name: string;
    async: boolean;
    generator: boolean;
    params: string[];
    returnType?: string;
    loc: number;
    startLine: number;
    endLine: number;
    body: string;
    docstring?: string;
  };
}

export interface ClassNode extends EnhancedBaseNode {
  type: 'Class';
  businessKey: string; // fileId#ClassName
  properties: {
    name: string;
    isAbstract: boolean;
    extends?: string;
    implements?: string[];
    decorators?: string[];
    startLine: number;
    endLine: number;
  };
}

export interface VariableNode extends EnhancedBaseNode {
  type: 'Variable';
  businessKey: string; // fileId#name#line
  properties: {
    name: string;
    kind: 'const' | 'let' | 'var';
    typeAnnotation?: string;
    valueSnippet?: string;
    isExported: boolean;
    scope: 'global' | 'function' | 'block';
  };
}

export interface ImportNode extends EnhancedBaseNode {
  type: 'Import';
  businessKey: string; // fileId#line
  properties: {
    isDefault: boolean;
    isNamespace: boolean;
    sourceModule: string;
    importedNames: string[];
    localNames: string[];
  };
}

export interface ExportNode extends EnhancedBaseNode {
  type: 'Export';
  businessKey: string; // fileId#exportedName
  properties: {
    name: string;
    type: 'default' | 'named' | 'namespace';
    isReExport: boolean;
    sourceModule?: string;
  };
}

export interface TestCaseNode extends EnhancedBaseNode {
  type: 'TestCase';
  businessKey: string; // fileId#describe#it
  properties: {
    title: string;
    suite?: string;
    status: 'pass' | 'fail' | 'skip' | 'todo';
    framework: string;
    startLine: number;
    endLine: number;
  };
}

// Union type for all enhanced nodes
export type EnhancedNode = 
  | RepositoryNode
  | CommitNode
  | DirectoryNode
  | EnhancedFileNode
  | ModuleNode
  | EnhancedFunctionNode
  | ClassNode
  | VariableNode
  | ImportNode
  | ExportNode
  | TestCaseNode;

// Business Key Generators
export class BusinessKeyGenerator {
  static repository(owner: string, name: string): string {
    return `${owner}/${name}`;
  }

  static commit(sha: string): string {
    return sha;
  }

  static directory(repoId: string, commitSha: string, dirPath: string): string {
    return `${repoId}@${commitSha}:${dirPath}`;
  }

  static file(repoId: string, commitSha: string, filePath: string): string {
    return `${repoId}@${commitSha}:${filePath}`;
  }

  static function(fileId: string, functionName: string, startLine: number): string {
    return `${fileId}#${functionName}#${startLine}`;
  }

  static variable(fileId: string, varName: string, line: number): string {
    return `${fileId}#${varName}#${line}`;
  }

  static class(fileId: string, className: string): string {
    return `${fileId}#${className}`;
  }

  static import(fileId: string, line: number): string {
    return `${fileId}#import#${line}`;
  }

  static export(fileId: string, exportName: string): string {
    return `${fileId}#${exportName}`;
  }

  static testCase(fileId: string, suite: string, testName: string): string {
    return `${fileId}#${suite}#${testName}`;
  }

  static module(moduleName: string): string {
    return moduleName;
  }
}
