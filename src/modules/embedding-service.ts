/**
 * @file Responsible for generating vector embeddings for various node types.
 */

import {
  BaseNode,
  NodeWithEmbedding,
  CodeNode,
  FileNode,
  RepositoryNode,
  CommitNode,
  TestNode,
  PullRequestNode,
  FunctionNode,
} from '../types';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import { pipeline, env } from '@xenova/transformers';
import { getCodeEmbedding } from './embedding-py';

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
    if (this.model) {
      this.logger.debug('Model already loaded, skipping');
      return;
    }

    const operation = this.logger.operation('Loading embedding model');

    try {
      const aiConfig = this.config.getAIConfig();
      this.logger.info('Loading embedding model', {
        model: aiConfig.embedding.model,
        batchSize: aiConfig.embedding.batchSize,
        provider: aiConfig.embedding.provider,
        endpoint: aiConfig.embedding.localEndpoint,
      });

      if (aiConfig.embedding.provider === 'local') {
        // Test connection to LM Studio
        await this.testLMStudioConnection();
        this.model = {
          provider: 'local',
          endpoint: aiConfig.embedding.localEndpoint,
        };
      } else if (aiConfig.embedding.provider === 'transformers') {
        // Configure transformers.js to use local models if needed
        env.allowRemoteModels = true;
        env.allowLocalModels = true;

        // Load the transformers pipeline for feature extraction (embeddings)
        this.logger.info('Loading transformers.js embedding model', {
          model: aiConfig.embedding.model,
        });
        this.model = await pipeline(
          'feature-extraction',
          aiConfig.embedding.model
        );
        this.logger.info('Transformers.js embedding model loaded successfully');
      } else if (aiConfig.embedding.provider === 'python') {
        // For Python provider, we don't pre-load the model
        // The Python script handles model loading
        this.logger.info('Using Python embedding provider', {
          model: aiConfig.embedding.model,
        });
        this.model = {
          provider: 'python',
          model: aiConfig.embedding.model,
        };
        this.logger.info('Python embedding provider configured successfully');
      } else {
        throw new Error(
          `Unsupported embedding provider: ${aiConfig.embedding.provider}. Supported providers: 'local', 'transformers', 'python'`
        );
      }

      this.logger.info('Embedding model loaded successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to load embedding model', {
        error: getErrorMessage(error),
      });
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
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      case 'FileNode': {
        const fileNode = node as FileNode;
        const parts = [
          fileNode.properties.fileName,
          fileNode.properties.aiSummary || '',
          (fileNode.properties.imports || []).join(' '),
          (fileNode.properties.exports || []).join(' '),
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      case 'RepositoryNode': {
        const repoNode = node as RepositoryNode;
        const parts = [
          repoNode.properties.repoName,
          repoNode.properties.repoPath,
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      case 'CommitNode': {
        const commitNode = node as CommitNode;
        const parts = [
          commitNode.properties.message,
          commitNode.properties.author,
          commitNode.properties.diffSummary || '',
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      case 'TestNode': {
        const testNode = node as TestNode;
        const parts = [
          testNode.properties.name,
          testNode.properties.framework || '',
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      case 'PullRequestNode': {
        const prNode = node as PullRequestNode;
        const parts = [
          prNode.properties.title,
          prNode.properties.body || '',
          prNode.properties.author,
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      // FunctionNode
      case 'FunctionNode': {
        const functionNode = node as FunctionNode;
        const parts = [
          functionNode.properties.name,
          functionNode.properties.signature || '',
          functionNode.properties.body || '',
        ].filter((part) => part.trim() !== '');

        return parts.join(' ');
      }

      default:
        this.logger.warn(`Unknown node type for text extraction:`, node);
        return `${node.type} ${node.id}`;
    }
  }

  /**
   * Generates a vector embedding for a given text.
   * @param {string} text - The text to embed.
   * @param {boolean} isQuery - Whether this text is a search query (requires special prompt for some models).
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  private async generateEmbedding(text: string, isQuery: boolean = false): Promise<number[]> {
    const aiConfig = this.config.getAIConfig();

    if (
      aiConfig.embedding.provider === 'local' &&
      this.model &&
      typeof this.model === 'object' &&
      'provider' in this.model &&
      this.model.provider === 'local'
    ) {
      return await this.generateLMStudioEmbedding(text);
    } else if (
      aiConfig.embedding.provider === 'transformers' &&
      this.model &&
      typeof this.model === 'function'
    ) {
      return await this.generateTransformersEmbedding(text, isQuery);
    } else if (
      aiConfig.embedding.provider === 'python' &&
      this.model &&
      typeof this.model === 'object' &&
      'provider' in this.model &&
      this.model.provider === 'python'
    ) {
      return await this.generatePythonEmbedding(text, isQuery);
    } else {
      // Simple fallback embedding - hash-based approach
      this.logger.warn('Using fallback hash-based embedding generation', {
        provider: aiConfig.embedding.provider,
        modelType: typeof this.model,
        modelLoaded: !!this.model,
      });
      const hash = this.simpleHash(text);
      // Use the correct dimensions for the configured model
      const stats = await this.getStats();
      const dimensions = stats.dimensions;
      return Array.from(
        { length: dimensions },
        (_, i) => (hash[i % hash.length] / 255) * 2 - 1
      );
    }
  }

  private simpleHash(text: string): number[] {
    const hash = [];
    for (let i = 0; i < text.length; i++) {
      hash.push(text.charCodeAt(i));
    }
    return hash;
  }

  /**
   * Tests connection to LM Studio server.
   */
  private async testLMStudioConnection(): Promise<void> {
    const aiConfig = this.config.getAIConfig();
    const endpoint = aiConfig.embedding.localEndpoint;

    if (!endpoint) {
      throw new Error('LM Studio endpoint not configured');
    }

    try {
      this.logger.debug('Testing LM Studio connection', { endpoint });

      // Test with a simple health check or models endpoint
      const response = await fetch(`${endpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(
          `LM Studio server responded with status: ${response.status}`
        );
      }

      const result = await response.json();

      // Check if any models are loaded
      if (!result.data || result.data.length === 0) {
        this.logger.warn(
          'LM Studio server is running but no models are loaded',
          { endpoint }
        );
        this.logger.info(
          'Please load an embedding model in LM Studio before proceeding'
        );
      } else {
        this.logger.info('LM Studio connection successful', {
          endpoint,
          modelsLoaded: result.data.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to connect to LM Studio', {
        endpoint,
        error: getErrorMessage(error),
      });
      throw new Error(
        `Cannot connect to LM Studio at ${endpoint}: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Generates embedding using transformers.js pipeline.
   * @param {string} text - The text to generate an embedding for.
   * @param {boolean} isQuery - Whether this text is a search query.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  private async generateTransformersEmbedding(text: string, isQuery: boolean = false): Promise<number[]> {
    try {
      const aiConfig = this.config.getAIConfig();
      
      // Apply query prompt for specific models that require it
      let processedText = text;
      if (isQuery && aiConfig.embedding.model === 'mixedbread-ai/mxbai-embed-large-v1') {
        processedText = `Represent this sentence for searching relevant passages: ${text}`;
      }

      this.logger.debug('Generating embedding via transformers.js', {
        textLength: processedText.length,
        isQuery,
        hasPrompt: processedText !== text,
      });

      // Generate embedding using the loaded pipeline
      // Use 'cls' pooling for mixedbread-ai model as recommended in their docs
      const poolingStrategy = aiConfig.embedding.model === 'mixedbread-ai/mxbai-embed-large-v1' ? 'cls' : 'mean';
      const result = await (this.model as any)(processedText, {
        pooling: poolingStrategy,
        normalize: true,
      });

      // Extract the embedding vector from the result
      let embedding: number[];
      if (result.data) {
        embedding = Array.from(result.data);
      } else if (Array.isArray(result)) {
        embedding = result;
      } else {
        throw new Error('Unexpected embedding result format');
      }

      this.logger.debug('Transformers.js embedding generated successfully', {
        embeddingLength: embedding.length,
      });

      return embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding via transformers.js', {
        error: getErrorMessage(error),
        textLength: text.length,
      });
      throw new Error(
        `Transformers.js embedding generation failed: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Generates embedding using Python script.
   * @param {string} text - The text to generate an embedding for.
   * @param {boolean} isQuery - Whether this text is a search query.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  private async generatePythonEmbedding(text: string, isQuery: boolean = false): Promise<number[]> {
    try {
      this.logger.debug('Generating embedding via Python script', {
        textLength: text.length,
        isQuery,
      });

      const embedding = await getCodeEmbedding(text, isQuery);

      this.logger.debug('Python embedding generated successfully', {
        embeddingLength: embedding.length,
      });

      return embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding via Python script', {
        error: getErrorMessage(error),
        textLength: text.length,
      });
      throw new Error(
        `Python embedding generation failed: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Generates embedding using LM Studio server.
   * @param {string} text - The text to generate an embedding for.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  private async generateLMStudioEmbedding(text: string): Promise<number[]> {
    const aiConfig = this.config.getAIConfig();
    const endpoint = aiConfig.embedding.localEndpoint;

    if (!endpoint) {
      throw new Error('LM Studio endpoint not configured');
    }

    try {
      this.logger.debug('Generating embedding via LM Studio', {
        endpoint,
        textLength: text.length,
      });

      const response = await fetch(`${endpoint}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: aiConfig.embedding.model || 'default',
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('LM Studio API error', {
          endpoint,
          status: response.status,
          error: errorText,
        });

        // Provide helpful error message for common issues
        if (response.status === 404 && errorText.includes('No models loaded')) {
          throw new Error(
            'No embedding model loaded in LM Studio. Please load an embedding model (e.g., nomic-ai/nomic-embed-text-v1.5) in LM Studio first.'
          );
        }

        throw new Error(
          `LM Studio API error (${response.status}): ${errorText}`
        );
      }

      const result = await response.json();

      if (
        !result.data ||
        !Array.isArray(result.data) ||
        result.data.length === 0
      ) {
        throw new Error('Invalid response format from LM Studio');
      }

      const embedding = result.data[0].embedding;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding format from LM Studio');
      }

      this.logger.debug('LM Studio embedding generated successfully', {
        dimensions: embedding.length,
        textLength: text.length,
      });

      return embedding;
    } catch (error) {
      this.logger.error('Failed to generate LM Studio embedding', {
        endpoint,
        error: getErrorMessage(error),
      });
      throw error;
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
      this.logger.info(
        `Processing embedding batch ${
          Math.floor(i / batchSize) + 1
        }/${Math.ceil(nodes.length / batchSize)}`
      );

      const batchPromises = batch.map(async (node) => {
        const text = this.getTextForNode(node);
        const embedding = await this.generateEmbedding(text);

        return {
          ...node,
          embedding,
          sourceText: text,
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
    const operation = this.logger.operation(
      `Generating embeddings for ${nodes.length} nodes`
    );

    try {
      this.logger.info(
        `Starting embedding generation for ${nodes.length} nodes`
      );

      if (nodes.length === 0) {
        this.logger.info('No nodes to embed');
        operation();
        return [];
      }

      // Ensure model is loaded
      if (!this.model) {
        await this.loadModel();
      }

      // Process nodes in batches
      const nodesWithEmbeddings = await this.processBatch(nodes);

      // Validate embeddings
      const validEmbeddings = nodesWithEmbeddings.filter(
        (node) => node.embedding && node.embedding.length > 0
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
      this.logger.error('Embedding generation failed', {
        error: getErrorMessage(error),
      });
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
    this.logger.debug('Generating embedding for query', {
      queryLength: query.length,
    });

    if (!this.model) {
      await this.loadModel();
    }

    return await this.generateEmbedding(query, true);
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
  ): Array<{ node: NodeWithEmbedding; similarity: number }> {
    const similarities = nodes.map((node) => ({
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
   * Generates an embedding for a search query.
   * @param {string} query - The search query text.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    return await this.generateEmbedding(query, true);
  }

  /**
   * Generates an embedding for document content.
   * @param {string} text - The document text.
   * @returns {Promise<number[]>} The generated embedding vector.
   */
  async generateDocumentEmbedding(text: string): Promise<number[]> {
    return await this.generateEmbedding(text, false);
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
      'mixedbread-ai/mxbai-embed-large-v1': 1024,
      'jinaai/jina-embeddings-v2-base-code': 768,
    };

    const modelName = aiConfig.embedding.model;
    const dimensions = modelDimensions[modelName] || 384; // Default to 384 if unknown

    return {
      modelLoaded: !!this.model,
      model: modelName,
      dimensions,
    };
  }
}
