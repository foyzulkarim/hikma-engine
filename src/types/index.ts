/**
 * @file Defines the core data structures for nodes and edges in the InsightEngine knowledge graph.
 *       This includes various node types representing code elements, Git history, and other metadata,
 *       as well as edge types defining relationships between these nodes.
 */

export type NodeType = 
  | 'CodeNode'
  | 'FileNode'
  | 'DirectoryNode'
  | 'CommitNode'
  | 'DiscussionNode'
  | 'AnnotationNode'
  | 'TestNode'
  | 'PullRequestNode'
  | 'RepositoryNode'
  | 'FunctionNode';

export type EdgeType = 
  | 'CALLS'
  | 'DEFINED_IN'
  | 'CONTAINS'
  | 'MODIFIED'
  | 'AUTHORED'
  | 'EXPLAINS'
  | 'REFERENCES'
  | 'TESTS'
  | 'TESTED_BY'
  | 'INCLUDES_COMMIT'
  | 'EVOLVED_BY';

/**
 * Base interface for all nodes in the knowledge graph.
 * @property {string} id - A unique identifier for the node.
 * @property {NodeType} type - The specific type of the node.
 * @property {Record<string, any>} properties - A key-value store for node-specific attributes.
 */
export interface BaseNode {
  id: string;
  type: NodeType;
  properties: Record<string, any>;
}

/**
 * Represents a code construct like a function, method, or class.
 */
export interface CodeNode extends BaseNode {
  type: 'CodeNode';
  properties: {
    name: string;
    signature?: string;
    body?: string;
    docstring?: string;
    language: string;
    filePath: string;
    startLine: number;
    endLine: number;
  };
}

/**
 * Represents a source code file.
 */
export interface FileNode extends BaseNode {
  type: 'FileNode';
  properties: {
    filePath: string;
    fileName: string;
    fileExtension: string;
    repoId: string;
    language: string;
    sizeKb: number;
    contentHash: string;
    fileType: 'source' | 'test' | 'config' | 'dev' | 'vendor';
    aiSummary?: string;
    imports?: string[];
    exports?: string[];
  };
}

/**
 * Represents a directory in the file system.
 */
export interface DirectoryNode extends BaseNode {
  type: 'DirectoryNode';
  properties: {
    dirPath: string;
    dirName: string;
    repoId: string;
    aiSummary?: string; // AI-generated summary of the directory's purpose/content
  };
}

/**
 * Represents a Git commit.
 */
export interface CommitNode extends BaseNode {
  type: 'CommitNode';
  properties: {
    hash: string;
    author: string;
    date: string;
    message: string;
    diffSummary?: string;
  };
}

/**
 * Represents a discussion point, such as an issue or pull request comment.
 */
export interface DiscussionNode extends BaseNode {
  type: 'DiscussionNode';
  properties: {
    url: string;
    title: string;
    body: string;
    author: string;
    createdAt: string;
    type: 'pull_request' | 'issue' | 'comment';
  };
}

/**
 * Represents a user-added annotation.
 */
export interface AnnotationNode extends BaseNode {
  type: 'AnnotationNode';
  properties: {
    text: string;
    author: string;
    createdAt: string;
    targetNodeId: string;
  };
}

/**
 * Represents a test method or test case.
 */
export interface TestNode extends BaseNode {
  type: 'TestNode';
  properties: {
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    framework?: string; // e.g., 'jest', 'pytest'
    testBody?: string;
  };
}

/**
 * Represents a Pull Request.
 */
export interface PullRequestNode extends BaseNode {
  type: 'PullRequestNode';
  properties: {
    prId: string;
    title: string;
    author: string;
    createdAt: string;
    mergedAt?: string;
    url: string;
    body?: string;
  };
}

/**
 * Represents a repository.
 */
export interface RepositoryNode extends BaseNode {
  type: 'RepositoryNode';
  properties: {
    repoPath: string;
    repoName: string;
    createdAt: string;
    lastUpdated: string;
  };
}

export interface FunctionNode extends BaseNode {
  type: 'FunctionNode';
  properties: {
     name: string;
     signature: string;
     returnType: string;
     accessLevel: 'public' | 'private' | 'protected';
     fileId: string;
     filePath: string;
     startLine: number;
     endLine: number;
     body: string;
     calledByMethods: string[];
     callsMethods: string[];
     usesExternalMethods: boolean;
     internalCallGraph: string[];
     transitiveCallDepth: number;
   };
}

/**
 * Defines a relationship between two nodes.
 * @property {string} source - The ID of the source node.
 * @property {string} target - The ID of the target node.
 * @property {EdgeType} type - The type of the relationship.
 * @property {Record<string, any>} [properties] - Optional key-value store for edge-specific attributes.
 */
export interface Edge {
  source: string;
  target: string;
  type: EdgeType;
  properties?: Record<string, any>;
}

/**
 * Represents a node with an associated vector embedding.
 */
export interface NodeWithEmbedding extends BaseNode {
  embedding: number[];
}


