/**
 * LLM-based RAG service for generating code explanations
 * Uses Python backend with code-specialized LLMs
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { getLogger } from '../utils/logger';
import { ensurePythonDependencies } from '../utils/python-dependency-checker';
import { getConfig } from '../config';
import { LLMProviderManager } from './llm-providers';

export interface RAGResponse {
  success: boolean;
  explanation?: string;
  error?: string;
  model: string;
  device?: string;
  // Additional metadata for external providers
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  responseId?: string;
  finishReason?: string;
  [key: string]: any; // Allow additional provider-specific metadata
}

export interface SearchResult {
  file_path: string;
  node_type: string;
  similarity: number;
  source_text: string;
  [key: string]: any;
}

// Adapter function to convert EmbeddingSearchResult to SearchResult
export function adaptSearchResults(results: any[]): SearchResult[] {
  return results.map(result => ({
    file_path: result.node?.filePath || result.node?.file_path || 'Unknown',
    node_type: result.node?.nodeType || result.node?.type || 'Unknown', 
    similarity: result.similarity || 0,
    source_text: result.node?.sourceText || result.node?.source_text || '',
    // Preserve original structure for additional data
    ...result
  }));
}

export interface RAGOptions {
  model?: string;
  timeout?: number;
  maxResults?: number;
  maxTokens?: number; // For external providers like OpenAI
}

const DEFAULT_TIMEOUT = 300000; // 5 minutes

// Get the default RAG model from configuration
function getDefaultModel(): string {
  try {
    return getConfig().getAIConfig().rag.model;
  } catch {
    // Fallback to hardcoded value if config is not available
    return 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
  }
}

class LLMRAGService {
  private logger = getLogger('LLMRAGService');
  private activeProcess: ChildProcess | null = null;

  /**
   * Generate an explanation using LLM-based RAG
   * Now delegates to the provider manager for consistency
   */
  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions = {}
  ): Promise<RAGResponse> {
    const operation = this.logger.operation(`RAG explanation for: "${query.substring(0, 50)}..."`);

    try {
      this.logger.info('LLMRAGService delegating to provider manager', {
        query: query.substring(0, 100),
        resultCount: searchResults.length,
        options
      });

      // Delegate to provider manager for consistent behavior
      const result = await providerManager.generateExplanation(query, searchResults, options);
      
      operation();
      return result;

    } catch (error) {
      operation();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('LLMRAGService explanation error', {
        error: errorMessage
      });
      
      // If provider manager fails completely, try direct Python execution as last resort
      if (errorMessage.includes('No healthy providers available') || 
          errorMessage.includes('All providers failed')) {
        
        this.logger.warn('Provider manager has no healthy providers, attempting direct Python execution');
        
        try {
          return await this.executePythonRAGDirect(query, searchResults, options);
        } catch (pythonError) {
          const pythonErrorMessage = pythonError instanceof Error ? pythonError.message : String(pythonError);
          this.logger.error('Direct Python execution also failed', {
            error: pythonErrorMessage
          });
          
          return {
            success: false,
            error: `All RAG methods failed. Provider manager: ${errorMessage}. Direct Python: ${pythonErrorMessage}`,
            model: options.model || getDefaultModel()
          };
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        model: options.model || getDefaultModel()
      };
    }
  }

  /**
   * Direct Python execution as absolute last resort
   * This maintains the original Python execution logic for emergency fallback
   */
  private async executePythonRAGDirect(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions = {}
  ): Promise<RAGResponse> {
    const {
      model = getDefaultModel(),
      timeout = DEFAULT_TIMEOUT,
      maxResults = 8
    } = options;

    try {
      // Only check Python dependencies if the configured provider is python
      try {
        const provider = getConfig().getAIConfig().llmProvider.provider;
        if (provider === 'python') {
          await ensurePythonDependencies(false, false);
        }
      } catch {
        // If config isn't available, skip implicit python deps check
      }
      
      this.logger.info('Starting direct Python RAG execution', {
        query: query.substring(0, 100),
        resultCount: searchResults.length,
        model,
        timeout
      });

      // Prepare search results (limit to avoid token overflow)
      const limitedResults = searchResults.slice(0, maxResults);

      // Execute Python RAG service
      const result = await this.executePythonRAG(query, limitedResults, model, timeout);

      if (result.success) {
        this.logger.info('Direct Python RAG explanation generated successfully', {
          model: result.model,
          device: result.device,
          explanationLength: result.explanation?.length || 0
        });
      } else {
        this.logger.warn('Direct Python RAG explanation failed', {
          error: result.error,
          model: result.model
        });
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a Python dependency error
      if (errorMessage.includes('Python dependencies') || errorMessage.includes('Python 3 is required')) {
        this.logger.error('Python dependencies not available for RAG', { error: errorMessage });
        return {
          success: false,
          error: `RAG feature requires Python dependencies: ${errorMessage}`,
          model
        };
      }
      
      this.logger.error('Direct Python RAG explanation error', {
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage,
        model: model
      };
    }
  }

  /**
   * Execute Python RAG script and handle communication
   */
  private async executePythonRAG(
    query: string,
    searchResults: SearchResult[],
    model: string,
    timeout: number
  ): Promise<RAGResponse> {
    return new Promise((resolve, reject) => {
      // Resolve Python script path - works for both dev (src/) and built (dist/) versions
      const isBuilt = __dirname.includes('dist');
      const pythonScript = isBuilt 
        ? path.join(__dirname, '..', '..', 'src', 'python', 'llm_rag.py')
        : path.join(__dirname, '..', 'python', 'llm_rag.py');
      
      this.logger.debug('Spawning Python RAG process', { 
        script: pythonScript,
        model 
      });

      const pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..')
      });

      this.activeProcess = pythonProcess;

      // Handle stdin errors (like EPIPE)
      pythonProcess.stdin.on('error', (error) => {
        this.logger.warn('Python RAG process stdin error', { error: error.message });
        // Don't throw here, just log the error
      });

      let stdout = '';
      let stderr = '';
      let hasResolved = false;

      // Handle stdout (main response)
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Handle stderr (status messages and errors)
      pythonProcess.stderr.on('data', (data) => {
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
      pythonProcess.on('close', (code) => {
        this.activeProcess = null;
        
        if (hasResolved) return;
        hasResolved = true;

        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            this.logger.error('Failed to parse Python RAG response', { 
              stdout: stdout.substring(0, 500),
              stderr: stderr.substring(0, 500),
              parseError: error instanceof Error ? error.message : String(error)
            });
            reject(new Error(`Failed to parse Python response: ${error}`));
          }
        } else {
          this.logger.error('Python RAG process failed', { 
            code, 
            stderr: stderr.substring(0, 1000) 
          });
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
        }
      });

      // Handle process errors
      pythonProcess.on('error', (error) => {
        this.activeProcess = null;
        
        if (hasResolved) return;
        hasResolved = true;

        this.logger.error('Python RAG process error', { 
          error: error.message 
        });
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        if (hasResolved) return;
        hasResolved = true;

        this.logger.warn('Python RAG process timeout', { timeout });
        
        if (pythonProcess && !pythonProcess.killed) {
          pythonProcess.kill('SIGTERM');
          
          // Force kill after 5 seconds
          setTimeout(() => {
            if (pythonProcess && !pythonProcess.killed) {
              pythonProcess.kill('SIGKILL');
            }
          }, 5000);
        }
        
        reject(new Error(`RAG generation timed out after ${timeout}ms`));
      }, timeout);

      // Send input data to Python process
      const inputData = {
        query,
        search_results: searchResults,
        model
      };

      try {
        const success = pythonProcess.stdin.write(JSON.stringify(inputData));
        if (!success) {
          this.logger.warn('Python RAG process stdin buffer full, waiting for drain');
        }
        pythonProcess.stdin.end();
      } catch (error) {
        clearTimeout(timeoutHandle);
        
        if (hasResolved) return;
        hasResolved = true;

        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to send data to Python RAG process', { 
          error: errorMessage
        });
        reject(new Error(`Failed to send data to Python: ${errorMessage}`));
      }
    });
  }

  /**
   * Cleanup any running processes
   * Now also handles provider manager cleanup
   */
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    // Cleanup active Python process if any
    if (this.activeProcess && !this.activeProcess.killed) {
      this.logger.info('Cleaning up active Python RAG process');
      this.activeProcess.kill('SIGTERM');
      
      // Wait a bit, then force kill if necessary
      const processCleanup = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.activeProcess && !this.activeProcess.killed) {
            this.activeProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.activeProcess) {
          this.activeProcess.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      cleanupPromises.push(processCleanup);
    }

    // Wait for all cleanup operations
    await Promise.allSettled(cleanupPromises);
    this.logger.info('LLMRAGService cleanup completed');
  }
}

// Global service instances
const ragService = new LLMRAGService();
const providerManager = new LLMProviderManager();

// Cleanup on process exit
process.on('exit', () => {
  // Synchronous cleanup only - async operations are not allowed in 'exit' handler
  try {
    if (ragService['activeProcess'] && !ragService['activeProcess'].killed) {
      ragService['activeProcess'].kill('SIGKILL');
    }
  } catch {
    // Ignore cleanup errors on exit
  }
});

// Only register signal handlers if we're not in a CLI context
// CLI commands should handle their own exit logic
const isCLIContext = process.argv.some(arg => 
  arg.includes('hikma-engine') || 
  arg.includes('cli') || 
  arg.includes('main.js') ||
  arg.includes('embed') ||
  arg.includes('search') ||
  arg.includes('rag')
);

// Debug: Log detection result
const logger = getLogger('ProcessSignalSetup');
logger.debug('CLI context detection', { 
  isCLIContext, 
  argv: process.argv,
  willRegisterSignalHandlers: !isCLIContext 
});

if (!isCLIContext) {
  process.on('SIGINT', async () => {
    await Promise.allSettled([
      ragService.cleanup(),
      providerManager.cleanup()
    ]);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await Promise.allSettled([
      ragService.cleanup(),
      providerManager.cleanup()
    ]);
    process.exit(0);
  });
}

/**
 * Generate an explanation for search results using LLM-based RAG
 * Uses the configurable provider system with intelligent fallback
 * 
 * @param query - The original search query
 * @param searchResults - Array of search results to explain
 * @param options - Optional configuration
 * @returns Promise resolving to RAG response
 */
export async function generateRAGExplanation(
  query: string,
  searchResults: SearchResult[],
  options: RAGOptions = {}
): Promise<RAGResponse> {
  const logger = getLogger('generateRAGExplanation');
  const operation = logger.operation(`RAG explanation for: "${query.substring(0, 50)}..."`);
  
  try {
    // Use the provider manager for all requests
    logger.debug('Generating explanation with provider manager', {
      queryLength: query.length,
      resultCount: searchResults.length,
      options
    });
    
    const result = await providerManager.generateExplanation(query, searchResults, options);
    
    operation();
    logger.info('RAG explanation completed successfully', {
      provider: result.provider || 'unknown',
      explanationLength: result.explanation?.length || 0,
      success: result.success
    });
    
    return result;
    
  } catch (error) {
    operation();
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('RAG explanation failed', {
      error: errorMessage,
      queryLength: query.length,
      resultCount: searchResults.length
    });
    
    // Return a properly formatted error response
    return {
      success: false,
      error: `RAG explanation failed: ${errorMessage}`,
      model: options.model || 'unknown',
      provider: 'error'
    };
  }
}

/**
 * Cleanup RAG service resources
 * Cleans up both the provider manager and legacy Python service
 * Ensures proper shutdown coordination
 */
export async function cleanupRAGService(): Promise<void> {
  const logger = getLogger('cleanupRAGService');
  logger.info('Starting RAG service cleanup');

  try {
    // Cleanup both provider manager and legacy service in parallel
    await Promise.allSettled([
      providerManager.cleanup(),
      ragService.cleanup()
    ]);

    logger.info('RAG service cleanup completed successfully');
  } catch (error) {
    logger.error('Error during RAG service cleanup', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't throw - cleanup should be best effort
  }
}
