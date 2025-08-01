/**
 * @file Sample test data fixtures for consistent testing
 */

export const sampleRepositories = [
  {
    id: 'repo-1',
    name: 'sample-typescript-repo',
    path: '/test/repos/sample-typescript-repo',
    url: 'https://github.com/test/sample-typescript-repo.git',
  },
  {
    id: 'repo-2',
    name: 'sample-javascript-repo',
    path: '/test/repos/sample-javascript-repo',
    url: 'https://github.com/test/sample-javascript-repo.git',
  },
];

export const sampleFiles = [
  {
    id: 'file-1',
    repository_id: 'repo-1',
    path: 'src/index.ts',
    name: 'index.ts',
    extension: '.ts',
    size: 1024,
    hash: 'abc123def456',
    content: `import { Calculator } from './calculator';

const calc = new Calculator();
console.log('2 + 3 =', calc.add(2, 3));`,
  },
  {
    id: 'file-2',
    repository_id: 'repo-1',
    path: 'src/calculator.ts',
    name: 'calculator.ts',
    extension: '.ts',
    size: 2048,
    hash: 'def456ghi789',
    content: `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}`,
  },
];

export const sampleNodes = [
  {
    id: 'node-1',
    type: 'class',
    name: 'Calculator',
    file_id: 'file-2',
    properties: {
      methods: ['add', 'subtract'],
      isExported: true,
    },
  },
  {
    id: 'node-2',
    type: 'method',
    name: 'add',
    file_id: 'file-2',
    properties: {
      parameters: [
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' },
      ],
      returnType: 'number',
      isPublic: true,
    },
  },
  {
    id: 'node-3',
    type: 'method',
    name: 'subtract',
    file_id: 'file-2',
    properties: {
      parameters: [
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' },
      ],
      returnType: 'number',
      isPublic: true,
    },
  },
];

export const sampleEdges = [
  {
    id: 'edge-1',
    source_id: 'node-1',
    target_id: 'node-2',
    type: 'contains',
    properties: {
      relationship: 'class-method',
    },
  },
  {
    id: 'edge-2',
    source_id: 'node-1',
    target_id: 'node-3',
    type: 'contains',
    properties: {
      relationship: 'class-method',
    },
  },
];

export const sampleEmbeddings = [
  {
    id: 'embedding-1',
    node_id: 'node-1',
    vector: Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1)),
    dimensions: 384,
    model: 'test-embedding-model',
  },
  {
    id: 'embedding-2',
    node_id: 'node-2',
    vector: Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.1)),
    dimensions: 384,
    model: 'test-embedding-model',
  },
];

export const sampleTestData = {
  repositories: sampleRepositories,
  files: sampleFiles,
  nodes: sampleNodes,
  edges: sampleEdges,
  embeddings: sampleEmbeddings,
};
