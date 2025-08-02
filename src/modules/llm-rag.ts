/**
 * LLM-based RAG service for generating code explanations
 * Uses Python backend with code-specialized LLMs
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { getLogger } from '../utils/logger';
import { ensurePythonDependencies } from '../utils/python-dependency-checker';

export interface RAGResponse {
  success: boolean;
  explanation?: string;
  error?: string;
  model: string;
  device?: string;
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
}

const DEFAULT_MODEL = 'Qwen/Qwen2.5-Coder-3B-Instruct';
const DEFAULT_TIMEOUT = 300000; // 5 minutes

class LLMRAGService {
  private logger = getLogger('LLMRAGService');
  private activeProcess: ChildProcess | null = null;

  /**
   * Generate an explanation using LLM-based RAG
   */
  async generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions = {}
  ): Promise<RAGResponse> {
    const {
      model = DEFAULT_MODEL,
      timeout = DEFAULT_TIMEOUT,
      maxResults = 8
    } = options;

    const operation = this.logger.operation(`RAG explanation for: "${query.substring(0, 50)}..."`);

    try {
      // Check Python dependencies before starting
      await ensurePythonDependencies(false, false);
      this.logger.info('Starting RAG explanation generation', {
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
        this.logger.info('RAG explanation generated successfully', {
          model: result.model,
          device: result.device,
          explanationLength: result.explanation?.length || 0
        });
      } else {
        this.logger.warn('RAG explanation failed', {
          error: result.error,
          model: result.model
        });
      }

      operation();
      return result;

    } catch (error) {
      operation();
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
      
      this.logger.error('RAG explanation error', {
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
   */
  async cleanup(): Promise<void> {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.logger.info('Cleaning up active Python RAG process');
      this.activeProcess.kill('SIGTERM');
      
      // Wait a bit, then force kill if necessary
      setTimeout(() => {
        if (this.activeProcess && !this.activeProcess.killed) {
          this.activeProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
}

// Global service instance
const ragService = new LLMRAGService();

// Cleanup on process exit
process.on('exit', () => {
  ragService.cleanup().catch(() => {
    // Ignore cleanup errors on exit
  });
});

process.on('SIGINT', async () => {
  await ragService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await ragService.cleanup();
  process.exit(0);
});

/**
 * Generate an explanation for search results using LLM-based RAG
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
  return ragService.generateExplanation(query, searchResults, options);
}

/**
 * Cleanup RAG service resources
 */
export async function cleanupRAGService(): Promise<void> {
  return ragService.cleanup();
}
