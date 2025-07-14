/**
 * @file Generates vector embeddings for all node types using pre-trained transformer models.
 *       These embeddings enable semantic similarity searches and clustering of code elements.
 */

import { BaseNode, NodeWithEmbedding, CodeNode, FileNode, DirectoryNode, CommitNode, TestNode, PullRequestNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage, getErrorStack, logError } from '../utils/error-handling';
// import { pipeline, env } from '@xenova/transformers';

/**
 * Generates vector embeddings for knowledge graph nodes.
 */
export class EmbeddingService {
  private config: ConfigManager;
  private logger = getLogger('EmbeddingService');
  private model: any; // Placeholder for the embedding model
  private isModelLoaded = false;

  /**
   * Initializes the Embedding Service.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(config: ConfigManager) {
    this.config = config;
    this.logger.info('Initializing EmbeddingService');
  }

  /**
   * Loads the pre-trained embedding model.
   */
  async loadModel(): Promise<void> {
    if (this.isModelLoaded) {
      this.logger.debug('Model already loaded, skipping');
      return;
    }

    const operation = this.logger.operation('Loading embedding model');
    
    try {
      const aiConfig = this.config.getAIConfig();
      this.logger.info('Loading embedding model', { 
        model: aiConfig.embedding.model,
        batchSize: aiConfig.embedding.batchSize 
      });
      
      // TODO: Implement actual model loading
      // Example for @xenova/transformers:
      // env.allowLocalModels = false;
      // this.model = await pipeline('feature-extraction', aiConfig.embedding.model);
      
      // Mock implementation for now
      this.model = {
        model: aiConfig.embedding.model,
        batchSize: aiConfig.embedding.batchSize,
        dimensions: 384, // Typical for all-MiniLM-L6-v2
      };
      
      this.isModelLoaded = true;
      this.logger.info('Embedding model loaded successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to load embedding model', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Extracts meaningful text content from a node for embedding generation.
   * @param {BaseNode} node - The node to extract text from.
   * @returns {string} The extracted text content.
   */
  private getTextForNode(node: BaseNode): string {
    switch (node.type) {
      case 'CodeNode': {
        const codeNode = node as CodeNode;
        const parts = [
          codeNode.properties.name,
          codeNode.properties.signature || '',
          codeNode.properties.docstring || '',
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      case 'FileNode': {
        const fileNode = node as FileNode;
        const parts = [
          fileNode.properties.fileName,
          fileNode.properties.aiSummary || '',
          (fileNode.properties.imports || []).join(' '),
          (fileNode.properties.exports || []).join(' '),
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      case 'DirectoryNode': {
        const dirNode = node as DirectoryNode;
        const parts = [
          dirNode.properties.dirName,
          dirNode.properties.aiSummary || '',
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      case 'CommitNode': {
        const commitNode = node as CommitNode;
        const parts = [
          commitNode.properties.message,
          commitNode.properties.author,
          commitNode.properties.diffSummary || '',
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      case 'TestNode': {
        const testNode = node as TestNode;
        const parts = [
          testNode.properties.name,
          testNode.properties.framework || '',
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      case 'PullRequestNode': {
        const prNode = node as PullRequestNode;
        const parts = [
          prNode.properties.title,
          prNode.properties.body || '',
          prNode.properties.author,
        ].filter(part => part.trim() !== '');
        
        return parts.join(' ');
      }
      
      default:
        this.logger.warn(`Unknown node type for text extraction: ${node.type}`);
        return `${node.type} ${node.id}`;
    }
  }

  /**
   * Generates a vector embedding for a given text.
   * @param {string} text - The text to embed.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isModelLoaded) {
      await this.loadModel();
    }

    try {
      // TODO: Implement actual embedding generation
      // Example for @xenova/transformers:
      // const result = await this.model(text);
      // return Array.from(result.data);

      // Mock implementation - generate a random embedding vector
      const dimensions = this.model.dimensions || 384;
      const embedding = Array.from({ length: dimensions }, () => Math.random() - 0.5);
      
      // Normalize the vector (optional but often beneficial)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
      
    } catch (error) {
      this.logger.warn('Failed to generate embedding, using zero vector', { error: getErrorMessage(error) });
      const dimensions = this.model?.dimensions || 384;
      return new Array(dimensions).fill(0);
    }
  }

  /**
   * Processes nodes in batches to generate embeddings efficiently.
   * @param {BaseNode[]} nodes - Array of nodes to embed.
   * @returns {Promise<NodeWithEmbedding[]>} Array of nodes with embeddings.
   */
  private async processBatch(nodes: BaseNode[]): Promise<NodeWithEmbedding[]> {
    const aiConfig = this.config.getAIConfig();
    const batchSize = aiConfig.embedding.batchSize;
    const results: NodeWithEmbedding[] = [];
    
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      this.logger.debug(`Processing embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nodes.length / batchSize)}`);
      
      const batchPromises = batch.map(async (node) => {
        const text = this.getTextForNode(node);
        const embedding = await this.generateEmbedding(text);
        
        return {
          ...node,
          embedding,
        } as NodeWithEmbedding;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Generates embeddings for all provided nodes.
   * @param {BaseNode[]} nodes - Array of nodes to generate embeddings for.
   * @returns {Promise<NodeWithEmbedding[]>} Array of nodes with embeddings attached.
   */
  async embedNodes(nodes: BaseNode[]): Promise<NodeWithEmbedding[]> {
    const operation = this.logger.operation(`Generating embeddings for ${nodes.length} nodes`);
    
    try {
      this.logger.info(`Starting embedding generation for ${nodes.length} nodes`);
      
      if (nodes.length === 0) {
        this.logger.info('No nodes to embed');
        operation();
        return [];
      }

      // Ensure model is loaded
      if (!this.isModelLoaded) {
        await this.loadModel();
      }

      // Process nodes in batches
      const nodesWithEmbeddings = await this.processBatch(nodes);
      
      // Validate embeddings
      const validEmbeddings = nodesWithEmbeddings.filter(node => 
        node.embedding && node.embedding.length > 0
      );
      
      if (validEmbeddings.length !== nodesWithEmbeddings.length) {
        this.logger.warn(`Some embeddings failed to generate`, {
          total: nodesWithEmbeddings.length,
          valid: validEmbeddings.length,
          failed: nodesWithEmbeddings.length - validEmbeddings.length,
        });
      }
      
      this.logger.info('Embedding generation completed', {
        totalNodes: nodes.length,
        successfulEmbeddings: validEmbeddings.length,
        embeddingDimensions: validEmbeddings[0]?.embedding?.length || 0,
        nodeTypes: this.getNodeTypeStats(validEmbeddings),
      });
      
      operation();
      return validEmbeddings;
      
    } catch (error) {
      this.logger.error('Embedding generation failed', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Generates an embedding for a single text query (useful for search).
   * @param {string} query - The query text to embed.
   * @returns {Promise<number[]>} The embedding vector for the query.
   */
  async embedQuery(query: string): Promise<number[]> {
    this.logger.debug('Generating embedding for query', { queryLength: query.length });
    
    if (!this.isModelLoaded) {
      await this.loadModel();
    }
    
    return await this.generateEmbedding(query);
  }

  /**
   * Calculates cosine similarity between two embedding vectors.
   * @param {number[]} embedding1 - First embedding vector.
   * @param {number[]} embedding2 - Second embedding vector.
   * @returns {number} Cosine similarity score between -1 and 1.
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embedding vectors must have the same dimensions');
    }
    
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
  }

  /**
   * Finds the most similar nodes to a query embedding.
   * @param {number[]} queryEmbedding - The query embedding vector.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   * @param {number} topK - Number of top similar nodes to return.
   * @returns {Array<{node: NodeWithEmbedding, similarity: number}>} Top similar nodes with similarity scores.
   */
  findSimilarNodes(
    queryEmbedding: number[], 
    nodes: NodeWithEmbedding[], 
    topK: number = 10
  ): Array<{node: NodeWithEmbedding, similarity: number}> {
    const similarities = nodes.map(node => ({
      node,
      similarity: this.calculateSimilarity(queryEmbedding, node.embedding),
    }));
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Gets statistics about the embedded nodes by type.
   * @param {NodeWithEmbedding[]} nodes - Array of nodes with embeddings.
   * @returns {Record<string, number>} Node type statistics.
   */
  private getNodeTypeStats(nodes: NodeWithEmbedding[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const node of nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Gets embedding service statistics.
   * @returns {Promise<{modelLoaded: boolean, model: string, dimensions: number}>}
   */
  async getStats(): Promise<{
    modelLoaded: boolean;
    model: string;
    dimensions: number;
  }> {
    const aiConfig = this.config.getAIConfig();
    
    return {
      modelLoaded: this.isModelLoaded,
      model: aiConfig.embedding.model,
      dimensions: this.model?.dimensions || 0,
    };
  }
}
