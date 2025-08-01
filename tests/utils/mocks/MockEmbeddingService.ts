/**
 * @file MockEmbeddingService - Mock implementation for embedding service testing
 */

import { jest } from '@jest/globals';
import { BaseNode, NodeWithEmbedding } from '../../../src/types';

export interface MockEmbeddingServiceOptions {
  shouldFailGeneration?: boolean;
  embeddingDimensions?: number;
  modelName?: string;
  batchSize?: number;
  simulateLatency?: boolean;
}

export class MockEmbeddingService {
  private shouldFailGeneration: boolean;
  private embeddingDimensions: number;
  private modelName: string;
  private batchSize: number;
  private simulateLatency: boolean;
  private modelLoaded = false;

  // Mock methods
  public loadModel = jest.fn();
  public embedNodes = jest.fn();
  public embedQuery = jest.fn();
  public calculateSimilarity = jest.fn();
  public findSimilarNodes = jest.fn();
  public getStats = jest.fn();

  // Private methods that might be tested
  public generateEmbedding = jest.fn();
  public processBatch = jest.fn();

  constructor(options: MockEmbeddingServiceOptions = {}) {
    this.shouldFailGeneration = options.shouldFailGeneration ?? false;
    this.embeddingDimensions = options.embeddingDimensions ?? 384;
    this.modelName = options.modelName ?? 'mock-embedding-model';
    this.batchSize = options.batchSize ?? 32;
    this.simulateLatency = options.simulateLatency ?? false;

    this.setupMockImplementations();
  }

  private setupMockImplementations(): void {
    // Use any type for all mock implementations to avoid TypeScript issues
    this.loadModel.mockImplementation(jest.fn());
    this.generateEmbedding.mockImplementation(jest.fn());
    this.embedQuery.mockImplementation(jest.fn());
    this.processBatch.mockImplementation(jest.fn());
    this.embedNodes.mockImplementation(jest.fn());
    this.calculateSimilarity.mockImplementation(jest.fn());
    this.findSimilarNodes.mockImplementation(jest.fn());
    this.getStats.mockImplementation(jest.fn());

    // Set up the actual implementations
    this.setupActualImplementations();
  }

  private setupActualImplementations(): void {
    // Model loading
    (this.loadModel as any).mockImplementation(async () => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock model loading failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(100);
      }
      
      this.modelLoaded = true;
    });

    // Single embedding generation
    (this.generateEmbedding as any).mockImplementation(async (text: string): Promise<number[]> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock embedding generation failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(50);
      }
      
      return this.createDeterministicEmbedding(text);
    });

    // Query embedding
    (this.embedQuery as any).mockImplementation(async (query: string): Promise<number[]> => {
      if (!this.modelLoaded) {
        await (this.loadModel as any)();
      }
      
      return (this.generateEmbedding as any)(query);
    });

    // Batch processing
    (this.processBatch as any).mockImplementation(async (nodes: BaseNode[]): Promise<NodeWithEmbedding[]> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock batch processing failure');
      }
      
      const results: NodeWithEmbedding[] = [];
      
      for (let i = 0; i < nodes.length; i += this.batchSize) {
        const batch = nodes.slice(i, i + this.batchSize);
        
        if (this.simulateLatency) {
          await this.delay(100);
        }
        
        const batchResults = await Promise.all(
          batch.map(async (node) => {
            const text = this.getTextForNode(node);
            const embedding = await (this.generateEmbedding as any)(text);
            
            return {
              ...node,
              embedding,
              sourceText: text
            } as NodeWithEmbedding;
          })
        );
        
        results.push(...batchResults);
      }
      
      return results;
    });

    // Node embedding
    (this.embedNodes as any).mockImplementation(async (nodes: BaseNode[]): Promise<NodeWithEmbedding[]> => {
      if (!this.modelLoaded) {
        await (this.loadModel as any)();
      }
      
      if (nodes.length === 0) {
        return [];
      }
      
      return (this.processBatch as any)(nodes);
    });

    // Similarity calculation
    (this.calculateSimilarity as any).mockImplementation((embedding1: number[], embedding2: number[]): number => {
      if (embedding1.length !== embedding2.length) {
        throw new Error('Embedding vectors must have the same dimensions');
      }
      
      // Calculate cosine similarity
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
      }
      
      const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
      return magnitude === 0 ? 0 : dotProduct / magnitude;
    });

    // Similar nodes finding
    (this.findSimilarNodes as any).mockImplementation((
      queryEmbedding: number[],
      nodes: NodeWithEmbedding[],
      topK: number = 10
    ): Array<{ node: NodeWithEmbedding; similarity: number }> => {
      const similarities = nodes.map((node) => ({
        node,
        similarity: (this.calculateSimilarity as any)(queryEmbedding, node.embedding)
      }));
      
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    });

    // Stats
    (this.getStats as any).mockImplementation(async () => {
      return {
        modelLoaded: this.modelLoaded,
        model: this.modelName,
        dimensions: this.embeddingDimensions
      };
    });
  }

  private createDeterministicEmbedding(text: string): number[] {
    // Create a deterministic embedding based on text content
    const hash = this.simpleHash(text);
    const embedding: number[] = [];
    
    for (let i = 0; i < this.embeddingDimensions; i++) {
      // Use hash and index to create deterministic values
      const value = Math.sin(hash + i) * 0.5;
      embedding.push(value);
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude === 0 ? 0 : val / magnitude);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getTextForNode(node: BaseNode): string {
    // Extract meaningful text from different node types
    switch (node.type) {
      case 'CodeNode':
        return [
          node.properties.name,
          node.properties.signature || '',
          node.properties.docstring || ''
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'FileNode':
        return [
          node.properties.fileName,
          node.properties.aiSummary || '',
          (node.properties.imports || []).join(' '),
          (node.properties.exports || []).join(' ')
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'RepositoryNode':
        return [
          node.properties.repoName,
          node.properties.repoPath
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'CommitNode':
        return [
          node.properties.message,
          node.properties.author,
          node.properties.diffSummary || ''
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'TestNode':
        return [
          node.properties.name,
          node.properties.framework || ''
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'PullRequestNode':
        return [
          node.properties.title,
          node.properties.body || '',
          node.properties.author
        ].filter(part => part.trim() !== '').join(' ');
        
      case 'FunctionNode':
        return [
          node.properties.name,
          node.properties.signature || '',
          node.properties.body || ''
        ].filter(part => part.trim() !== '').join(' ');
        
      default:
        return `${node.type} ${node.id}`;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper methods for testing
  public setModelLoaded(loaded: boolean): void {
    this.modelLoaded = loaded;
  }

  public simulateFailure(shouldFail: boolean = true): void {
    this.shouldFailGeneration = shouldFail;
  }

  public setEmbeddingDimensions(dimensions: number): void {
    this.embeddingDimensions = dimensions;
  }

  public setBatchSize(size: number): void {
    this.batchSize = size;
  }

  public enableLatencySimulation(enabled: boolean = true): void {
    this.simulateLatency = enabled;
  }

  public isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  public getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  public getBatchSize(): number {
    return this.batchSize;
  }

  public resetMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockReset();
      }
    });
    this.modelLoaded = false;
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
