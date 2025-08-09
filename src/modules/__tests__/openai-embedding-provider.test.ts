/**
 * @file Tests for OpenAI-compatible embedding provider functionality
 */

import { ConfigManager } from '../src/config';

// Mock fetch for testing
global.fetch = jest.fn();

// Mock the embedding service methods we need to test
class MockEmbeddingService {
  private config: any;
  private logger: any;
  private modelLoaded = false;
  private currentProvider = '';
  private currentModel = '';

  constructor(configManager: ConfigManager) {
    this.config = configManager.getAIConfig();
    this.logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  }

  async loadModel(): Promise<void> {
    const provider = this.config.embedding.provider;
    
    if (provider === 'openai') {
      if (!this.config.embedding.openai?.apiUrl) {
        throw new Error('OpenAI embedding provider requires apiUrl configuration');
      }
      if (!this.config.embedding.openai?.model) {
        throw new Error('OpenAI embedding provider requires model configuration');
      }
      this.currentProvider = 'openai';
      this.currentModel = this.config.embedding.openai.model;
    }
    
    this.modelLoaded = true;
  }

  async getStats() {
    return {
      modelLoaded: this.modelLoaded,
      model: this.currentModel,
      provider: this.currentProvider
    };
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded');
    }

    if (this.currentProvider === 'openai') {
      return this.generateOpenAIEmbedding(text);
    }

    throw new Error(`Unsupported provider: ${this.currentProvider}`);
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const config = this.config.embedding.openai;
    const url = `${config.apiUrl}/v1/embeddings`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: text,
        model: config.model,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid response format from OpenAI API');
    }
    
    return data.data[0].embedding;
  }
}

describe('OpenAI Embedding Provider', () => {
  let configManager: ConfigManager;
  let embeddingService: MockEmbeddingService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env.HIKMA_EMBEDDING_PROVIDER;
    delete process.env.HIKMA_EMBEDDING_OPENAI_API_URL;
    delete process.env.HIKMA_EMBEDDING_OPENAI_API_KEY;
    delete process.env.HIKMA_EMBEDDING_OPENAI_MODEL;

    // Mock fetch
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  afterEach(() => {
    // Clear all OpenAI embedding environment variables
    delete process.env.HIKMA_EMBEDDING_PROVIDER;
    delete process.env.HIKMA_EMBEDDING_OPENAI_API_URL;
    delete process.env.HIKMA_EMBEDDING_OPENAI_API_KEY;
    delete process.env.HIKMA_EMBEDDING_OPENAI_MODEL;
    
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should load OpenAI embedding provider configuration from environment variables', () => {
      // Set environment variables
      process.env.HIKMA_EMBEDDING_PROVIDER = 'openai';
      process.env.HIKMA_EMBEDDING_OPENAI_API_URL = 'http://localhost:11434';
      process.env.HIKMA_EMBEDDING_OPENAI_MODEL = 'nomic-embed-text';
      process.env.HIKMA_EMBEDDING_OPENAI_API_KEY = 'test-key';

      configManager = new ConfigManager('/test/project');
      const aiConfig = configManager.getAIConfig();

      expect(aiConfig.embedding.provider).toBe('openai');
      expect(aiConfig.embedding.openai).toEqual({
        apiUrl: 'http://localhost:11434',
        model: 'nomic-embed-text',
        apiKey: 'test-key',
      });
    });

    it('should create OpenAI config with custom URL and default model', () => {
      process.env.HIKMA_EMBEDDING_OPENAI_API_URL = 'http://custom:8080';

      configManager = new ConfigManager('/test/project');
      const aiConfig = configManager.getAIConfig();

      expect(aiConfig.embedding.openai?.apiUrl).toBe('http://custom:8080');
      expect(aiConfig.embedding.openai?.model).toBe('nomic-embed-text');
    });
  });

  describe('Model Loading', () => {
    beforeEach(() => {
      process.env.HIKMA_EMBEDDING_PROVIDER = 'openai';
      process.env.HIKMA_EMBEDDING_OPENAI_API_URL = 'http://localhost:11434';
      process.env.HIKMA_EMBEDDING_OPENAI_MODEL = 'nomic-embed-text';
      
      configManager = new ConfigManager('/test/project');
      embeddingService = new MockEmbeddingService(configManager);
    });

    it('should load OpenAI embedding model configuration', async () => {
      await embeddingService.loadModel();
      
      const stats = await embeddingService.getStats();
      expect(stats.modelLoaded).toBe(true);
      expect(stats.model).toBe('nomic-embed-text');
    });

    it('should throw error when OpenAI config is missing required fields', async () => {
      // Clear all OpenAI config to ensure no defaults are set
      delete process.env.HIKMA_EMBEDDING_OPENAI_API_URL;
      delete process.env.HIKMA_EMBEDDING_OPENAI_MODEL;
      delete process.env.HIKMA_EMBEDDING_OPENAI_API_KEY;
      
      configManager = new ConfigManager('/test/project');
      
      // Manually override the config to remove defaults
      const aiConfig = configManager.getAIConfig();
      delete aiConfig.embedding.openai;
      
      embeddingService = new MockEmbeddingService(configManager);

      await expect(embeddingService.loadModel()).rejects.toThrow(
        'OpenAI embedding provider requires apiUrl configuration'
      );
    });
  });

  describe('Embedding Generation', () => {
    beforeEach(() => {
      process.env.HIKMA_EMBEDDING_PROVIDER = 'openai';
      process.env.HIKMA_EMBEDDING_OPENAI_API_URL = 'http://localhost:11434';
      process.env.HIKMA_EMBEDDING_OPENAI_MODEL = 'nomic-embed-text';
      
      configManager = new ConfigManager('/test/project');
      embeddingService = new MockEmbeddingService(configManager);
    });

    it('should generate embeddings using OpenAI API', async () => {
      // Clear API key to test without authorization header
      delete process.env.HIKMA_EMBEDDING_OPENAI_API_KEY;
      
      configManager = new ConfigManager('/test/project');
      embeddingService = new MockEmbeddingService(configManager);
      
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }]
        })
      } as Response);

      await embeddingService.loadModel();
      const result = await embeddingService.embedQuery('test query');

      expect(result).toEqual(mockEmbedding);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: 'test query',
            model: 'nomic-embed-text',
          }),
        })
      );
    });

    it('should include API key in headers when provided', async () => {
      process.env.HIKMA_EMBEDDING_OPENAI_API_KEY = 'test-api-key';
      
      configManager = new ConfigManager('/test/project');
      embeddingService = new MockEmbeddingService(configManager);
      
      const mockEmbedding = [0.1, 0.2, 0.3];
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }]
        })
      } as Response);

      await embeddingService.loadModel();
      await embeddingService.embedQuery('test query');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/embeddings',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      } as Response);

      await embeddingService.loadModel();
      
      await expect(embeddingService.embedQuery('test query')).rejects.toThrow(
        'OpenAI API error (500): Internal Server Error'
      );
    });

    it('should handle invalid response format', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }) // Empty data array
      } as Response);

      await embeddingService.loadModel();
      
      await expect(embeddingService.embedQuery('test query')).rejects.toThrow(
        'Invalid response format from OpenAI API'
      );
    });
  });
});