import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager, initializeConfig } from '../../config';
import { initializeLogger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error-handling';

export type ProviderChoice = 'python' | 'server' | 'local' | 'transformers';

export interface GlobalCLIOptions {
  dir?: string;
  provider: ProviderChoice;
  serverUrl?: string;
  model?: string; // Deprecated: use embeddingModel and llmModel instead
  embeddingModel?: string;
  llmModel?: string;
  installPythonDeps?: boolean;
}

export abstract class BaseCommand {
  protected readonly program: Command;

  constructor(program: Command) {
    this.program = program;
  }

  protected resolveProjectRoot(projectPath?: string, dirFlag?: string): string {
    const candidate = dirFlag ? dirFlag : projectPath || process.cwd();
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Project path does not exist: ${resolved}`);
    }
    return resolved;
  }

  protected initConfigAndLogger(projectRoot: string): ConfigManager {
    const config = new ConfigManager(projectRoot);
    initializeConfig(projectRoot);
    const loggingConfig = config.getLoggingConfig();
    initializeLogger({
      level: loggingConfig.level,
      enableConsole: loggingConfig.enableConsole,
      enableFile: loggingConfig.enableFile,
      logFilePath: loggingConfig.logFilePath,
    });
    return config;
  }

  protected buildExplicitConfig(opts: GlobalCLIOptions): any {
    // Build configuration entirely from CLI arguments - no .env dependencies
    const embeddingModel = opts.embeddingModel || opts.model || this.getDefaultEmbeddingModel(opts.provider);
    const llmModel = opts.llmModel || opts.model || this.getDefaultLLMModel(opts.provider);
    const serverUrl = opts.serverUrl || this.getDefaultServerUrl(opts.provider);

    return {
      ai: {
        embedding: {
          provider: opts.provider,
          model: embeddingModel,
          batchSize: 32, // Default batch size for embedding processing
          server: opts.provider === 'server' ? {
            apiUrl: serverUrl,
            model: embeddingModel
          } : undefined
        },
        summary: {
          model: llmModel,
          maxTokens: 256
        },
        rag: {
          model: llmModel
        },
        llmProvider: {
          provider: opts.provider,
          server: opts.provider === 'server' ? {
            apiUrl: opts.provider === 'server' && serverUrl.includes('chat/completions') 
              ? serverUrl 
              : `${serverUrl}/v1/chat/completions`,
            apiKey: 'not-needed',
            model: llmModel
          } : undefined,
          python: opts.provider === 'python' ? {
            model: llmModel
          } : undefined
        }
      }
    };
  }

  private getDefaultEmbeddingModel(provider: ProviderChoice): string {
    switch (provider) {
      case 'server': return 'text-embedding-ada-002';
      case 'python': return 'mixedbread-ai/mxbai-embed-large-v1';
      case 'local': return 'all-MiniLM-L6-v2';
      case 'transformers': return 'sentence-transformers/all-MiniLM-L6-v2';
      default: return 'mixedbread-ai/mxbai-embed-large-v1';
    }
  }

  private getDefaultLLMModel(provider: ProviderChoice): string {
    switch (provider) {
      case 'server': return 'gpt-3.5-turbo';
      case 'python': return 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
      default: return 'Qwen/Qwen2.5-Coder-1.5B-Instruct';
    }
  }

  private getDefaultServerUrl(provider: ProviderChoice): string {
    return provider === 'server' ? 'http://localhost:1234' : '';
  }

  protected handleError(error: unknown, context: string): never {
    console.error(chalk.red(`❌ ${context}: ${getErrorMessage(error)}`));
    if (process.env.NODE_ENV === 'development' && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }

  protected async exitSuccess(): Promise<void> {
    // Ensure the process exits after successful command completion
    // This is needed because some modules register global event listeners
    // and timers that can prevent the process from exiting naturally
    
    try {
      console.log('🧹 Cleaning up services...');
      // Import and cleanup RAG service (this also cleans up the provider manager)
      const { cleanupRAGService } = await import('../../modules/llm-rag');
      await cleanupRAGService();
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('⚠️ Cleanup error:', error instanceof Error ? error.message : String(error));
    }
    
    // Add a small delay to ensure cleanup is fully processed
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }
}


