/**
 * Python LLM Provider implementation
 * Wraps the existing Python-based LLM RAG service in the provider pattern
 */

import { BaseProvider } from './BaseProvider';
import { LLMProviderConfig, LLMProviderError, LLMProviderErrorType } from './types';
import { SearchResult, RAGResponse, RAGOptions } from '../llm-rag';
import { ensurePythonDependencies } from '../../utils/python-dependency-checker';
import { getConfig } from '../../config';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Python LLM Provider that wraps the existing Python-based LLM RAG implementation
 * Maintains backward compatibility while providing the new provider interface
 */
export class PythonLLMProvider extends BaseProvider {
  readonly name = 'python';
  private _isAvailable: boolean | null = null;
  private _availabilityChecked = false;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.logger.debug('Python LLM Provider initialized', {
      model: config.python?.model,
      maxResults: config.python?.maxResults
    });
  }

  /**
   * Check if the Python provider is available
   * Caches the result to avoid repeated expensive checks
   */
  get isAvailable(): boolean {
    if (!this._availabilityChecked) {
      // Return cached result if already checked
      return this._isAvailable ?? false;
    }
    return this._isAvailable ?? false;
  }

  /**
   * Generate an explanation using the existing Python LLM RAG service
   */
  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse> {
    const logEnd = this.logOperation('generateExplanation', {
      queryLength: query.length,
      resultCount: searchResults.length,
      model: options.model || this.config.python?.model
    });

    try {
      // Validate inputs
      this.validateQuery(query);
      this.validateSearchResults(searchResults);

      // Check if provider is available
      if (!this.isAvailable) {
        throw this.createError(
          'Python provider is not available. Please check Python dependencies.',
          LLMProviderErrorType.PROVIDER_UNAVAILABLE
        );
      }

      // Prepare options with provider-specific defaults
      const ragOptions: RAGOptions = {
        model: options.model || this.config.python?.model || this.getDefaultModel(),
        timeout: options.timeout || this.config.timeout,
        maxResults: options.maxResults || this.config.python?.maxResults || 8
      };

      this.logger.debug('Calling Python RAG service', {
        model: ragOptions.model,
        timeout: ragOptions.timeout,
        maxResults: ragOptions.maxResults
      });

      // Use direct Python execution to avoid recursion through provider manager
      const result = await this.withRetry(
        () => this.executeDirectPythonRAG(query, searchResults, ragOptions),
        'Python RAG explanation'
      );

      // Validate the response
      if (!result) {
        throw this.createError(
          'Python RAG service returned null response',
          LLMProviderErrorType.RESPONSE_FORMAT_ERROR
        );
      }

      // Ensure the response has the expected structure
      const response: RAGResponse = {
        success: result.success,
        explanation: result.explanation,
        error: result.error,
        model: result.model || ragOptions.model || 'unknown',
        device: result.device
      };

      if (!response.success && !response.error) {
        response.error = 'Python RAG service failed without specific error message';
      }

      logEnd();
      
      this.logger.debug('Python RAG explanation completed', {
        success: response.success,
        model: response.model,
        device: response.device,
        explanationLength: response.explanation?.length || 0
      });

      return response;

    } catch (error) {
      logEnd();

      if (error instanceof LLMProviderError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Categorize different types of errors
      let errorType = LLMProviderErrorType.NETWORK_ERROR;
      
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = LLMProviderErrorType.NETWORK_ERROR;
      } else if (errorMessage.includes('Python dependencies') || errorMessage.includes('Python 3 is required')) {
        errorType = LLMProviderErrorType.PROVIDER_UNAVAILABLE;
      } else if (errorMessage.includes('parse') || errorMessage.includes('format')) {
        errorType = LLMProviderErrorType.RESPONSE_FORMAT_ERROR;
      } else if (errorMessage.includes('configuration') || errorMessage.includes('config')) {
        errorType = LLMProviderErrorType.CONFIGURATION_ERROR;
      }

      throw this.createError(
        `Python provider error: ${errorMessage}`,
        errorType,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate the provider's configuration
   */
  async validateConfiguration(): Promise<boolean> {
    const logEnd = this.logOperation('validateConfiguration');

    try {
      // Validate common configuration
      this.validateCommonConfig();

      // Validate Python-specific configuration if provided
      if (this.config.python) {
        if (!this.config.python.model || typeof this.config.python.model !== 'string') {
          throw this.createError(
            'Python model must be a non-empty string',
            LLMProviderErrorType.CONFIGURATION_ERROR
          );
        }

        if (typeof this.config.python.maxResults !== 'number' || this.config.python.maxResults <= 0) {
          throw this.createError(
            'Python maxResults must be a positive number',
            LLMProviderErrorType.CONFIGURATION_ERROR
          );
        }
      }

      // Check Python dependencies availability
      try {
        await ensurePythonDependencies(false, false); // Don't install, just check
        this._isAvailable = true;
        this.logger.info('Python dependencies are available');
      } catch (error) {
        this._isAvailable = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn('Python dependencies not available', { error: errorMessage });
        
        // Configuration is valid, but provider is not available
        // This is not a configuration error, just a runtime availability issue
      }

      this._availabilityChecked = true;
      logEnd();

      this.logger.debug('Python provider configuration validated', {
        isAvailable: this._isAvailable,
        model: this.config.python?.model,
        maxResults: this.config.python?.maxResults
      });

      return true;

    } catch (error) {
      logEnd();
      
      if (error instanceof LLMProviderError) {
        throw error;
      }

      throw this.createError(
        `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`,
        LLMProviderErrorType.CONFIGURATION_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cleanup any resources used by the provider
   */
  async cleanup(): Promise<void> {
    const logEnd = this.logOperation('cleanup');

    try {
      this.logger.info('Cleaning up Python provider resources');
      
      // Reset availability cache
      this._isAvailable = null;
      this._availabilityChecked = false;

      logEnd();
      this.logger.debug('Python provider cleanup completed');

    } catch (error) {
      logEnd();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Error during Python provider cleanup', { error: errorMessage });
      
      // Don't throw errors during cleanup, just log them
    }
  }

  /**
   * Get the default model from configuration or fallback
   */
  private getDefaultModel(): string {
    try {
      return getConfig().getAIConfig().rag.model;
    } catch {
      // Fallback to hardcoded value if config is not available
      return 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
    }
  }

  /**
   * Execute Python RAG directly without going through provider manager
   * This prevents infinite recursion
   */
  private async executeDirectPythonRAG(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse> {
    
    const {
      model = this.getDefaultModel(),
      timeout = this.config.timeout || 300000,
      maxResults = 8
    } = options;

    return new Promise((resolve, reject) => {
      // Resolve Python script path - works for both dev (src/) and built (dist/) versions
      const isBuilt = __dirname.includes('dist');
      const pythonScript = isBuilt 
        ? path.join(__dirname, '..', '..', '..', 'src', 'python', 'llm_rag.py')
        : path.join(__dirname, '..', '..', 'python', 'llm_rag.py');
      
      this.logger.debug('Spawning Python RAG process', { 
        script: pythonScript,
        model 
      });

      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..')
      });

      let stdout = '';
      let stderr = '';
      let hasResolved = false;

      // Handle stdout (main response)
      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Handle stderr (status messages and errors)
      pythonProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        stderr += message + '\n';
        
        // Try to parse status messages
        try {
          const statusMessage = JSON.parse(message);
          if (statusMessage.type === 'status') {
            this.logger.info('Python RAG status', { message: statusMessage.message });
          }
        } catch {
          // Not JSON, treat as regular stderr
          if (message.includes('ERROR') || message.includes('Error')) {
            this.logger.warn('Python RAG stderr', { message });
          } else {
            this.logger.debug('Python RAG stderr', { message });
          }
        }
      });

      // Handle process completion
      pythonProcess.on('close', (code: number) => {
        if (hasResolved) return;
        hasResolved = true;

        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python RAG response: ${error}`));
          }
        } else {
          reject(new Error(`Python RAG process failed with code ${code}: ${stderr}`));
        }
      });

      // Handle process errors
      pythonProcess.on('error', (error: Error) => {
        if (hasResolved) return;
        hasResolved = true;
        reject(error);
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (hasResolved) return;
        hasResolved = true;
        pythonProcess.kill('SIGTERM');
        reject(new Error(`Python RAG process timed out after ${timeout}ms`));
      }, timeout);

      // Send input data
      const inputData = {
        query,
        search_results: searchResults.slice(0, maxResults),
        model,
        timeout
      };

      try {
        pythonProcess.stdin.write(JSON.stringify(inputData) + '\n');
        pythonProcess.stdin.end();
      } catch (error) {
        if (hasResolved) return;
        hasResolved = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Force refresh the availability check
   * Useful for testing or when Python dependencies change
   */
  async refreshAvailability(): Promise<boolean> {
    this._availabilityChecked = false;
    this._isAvailable = null;
    
    try {
      await ensurePythonDependencies(false, false);
      this._isAvailable = true;
    } catch {
      this._isAvailable = false;
    }
    
    this._availabilityChecked = true;
    return this._isAvailable;
  }

  /**
   * Get provider-specific information
   */
  getProviderInfo(): Record<string, any> {
    return {
      name: this.name,
      type: 'local',
      description: 'Local Python-based LLM provider using the existing Python implementation',
      isAvailable: this.isAvailable,
      configuration: {
        model: this.config.python?.model || this.getDefaultModel(),
        maxResults: this.config.python?.maxResults || 8,
        timeout: this.config.timeout
      },
      capabilities: [
        'code-explanation',
        'context-aware-responses',
        'local-processing',
        'no-api-costs'
      ]
    };
  }
}
