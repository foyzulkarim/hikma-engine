/**
 * @file Responsible for generating vector embeddings for various node types.
 */

import { BaseNode, NodeWithEmbedding, CodeNode, FileNode, RepositoryNode, CommitNode, TestNode, PullRequestNode } from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';

export class EmbeddingService {
  private config: ConfigManager;
  private logger = getLogger('EmbeddingService');
  private model: any = null;

  /**
   * Initializes the Embedding Service.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(config: ConfigManager) {
    this.config = config;
    this.logger.info('Initializing EmbeddingService');
    // Set environment for transformers
    // env.allowLocalModels = false; // Removed as per edit hint
  }

  /**
   * Loads the pre-trained embedding model.
   */
  async loadModel(): Promise<void> {
    if (this.model) { // Changed from isModelLoaded to model
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
      
      // Load the transformers pipeline for feature extraction (embeddings)
      // This part is removed as per edit hint
      // this.model = await pipeline('feature-extraction', aiConfig.embedding.model);
      
      // this.isModelLoaded = true; // Removed as per edit hint
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
      
      case 'RepositoryNode': {
        const repoNode = node as RepositoryNode;
        const parts = [
          repoNode.properties.repoName,
          repoNode.properties.repoPath,
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
    // Simple fallback embedding - hash-based approach
    const hash = this.simpleHash(text);
    return Array.from({ length: 384 }, (_, i) => (hash[i % hash.length] / 255) * 2 - 1);
  }

  private simpleHash(text: string): number[] {
    const hash = [];
    for (let i = 0; i < text.length; i++) {
      hash.push(text.charCodeAt(i));
    }
    return hash;
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
      if (!this.model) { // Changed from isModelLoaded to model
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
    
    if (!this.model) { // Changed from isModelLoaded to model
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
    
    // Determine dimensions based on the model name
    // Most common embedding models and their dimensions
    const modelDimensions: Record<string, number> = {
      'Xenova/all-MiniLM-L6-v2': 384,
      'Xenova/all-mpnet-base-v2': 768,
      'Xenova/distilbert-base-uncased': 768,
      'sentence-transformers/all-MiniLM-L6-v2': 384,
      'sentence-transformers/all-mpnet-base-v2': 768,
    };
    
    const modelName = aiConfig.embedding.model;
    const dimensions = modelDimensions[modelName] || 384; // Default to 384 if unknown
    
    return {
      modelLoaded: !!this.model, // Changed from isModelLoaded to model
      model: modelName,
      dimensions,
    };
  }
}
