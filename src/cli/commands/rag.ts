import { Command } from 'commander';
import chalk from 'chalk';
import { BaseCommand, GlobalCLIOptions } from './base';
import { EnhancedSearchService, EmbeddingSearchOptions } from '../../modules/enhanced-search-service';
import { adaptSearchResults, generateRAGExplanation } from '../../modules/llm-rag';
import { ensurePythonDependencies, isPythonEnvironmentReady } from '../../utils/python-dependency-checker';
import { displayCommandHeader, displayProgress, displayRAGExplanation, displayResults } from '../ui';

export class RagCommand extends BaseCommand {
  register(): Command {
    return this.program
      .command('rag <query> [project-path]')
      .description('Generate detailed code explanation with RAG (semantic search + LLM)')
      .option('-k, --top-k <number>', 'Number of search results to use', '10')
      .option('--dir <path>', 'Project directory (alternative to positional)')
      .requiredOption('--provider <provider>', 'Provider override for embeddings and LLM: python|server|local|transformers')
      .option('--server-url <url>', 'Server URL (required for server provider)')
      .option('-m, --model <name>', 'Model override (deprecated: use --embedding-model and --llm-model instead)')
      .option('--embedding-model <name>', 'Embedding model name for search')
      .option('--llm-model <name>', 'LLM model name for explanation generation')
      .option('--max-tokens <number>', 'Maximum tokens for LLM completion (for OpenAI-compatible providers)', '1500')
      .option('--install-python-deps', 'Automatically install Python dependencies if missing')
      .action(async (query: string, projectPath: string | undefined, options: any) => {
        try {
          if (!query || query.trim().length === 0) {
            throw new Error('RAG query cannot be empty');
          }

          const topK = parseInt(options.topK);
          if (isNaN(topK) || topK < 1 || topK > 100) {
            throw new Error('top-k must be a number between 1 and 100');
          }
          
          let maxTokens: number | undefined = undefined;
          if (options.maxTokens !== undefined) {
            const parsed = parseInt(options.maxTokens);
            if (isNaN(parsed) || parsed < 256 || parsed > 32768) {
              throw new Error('--max-tokens must be a number between 256 and 32768');
            }
            maxTokens = parsed;
          }

          // Validate provider-specific requirements
          if (options.provider === 'server' && !options.serverUrl) {
            throw new Error('Server provider requires --server-url');
          }

          const resolvedPath = this.resolveProjectRoot(projectPath, options.dir);
          const config = this.initConfigAndLogger(resolvedPath);

          const globalOpts: GlobalCLIOptions = {
            dir: options.dir,
            provider: options.provider,
            serverUrl: options.serverUrl,
            model: options.model,
            embeddingModel: options.embeddingModel,
            llmModel: options.llmModel,
            installPythonDeps: !!options.installPythonDeps,
          };
          
          // Apply explicit CLI configuration
          const explicitConfig = this.buildExplicitConfig(globalOpts);
          config.updateConfig(explicitConfig);

          displayCommandHeader('RAG Explanation', `Query: "${query}" in ${resolvedPath}`);

          // Initialize search service
          const searchService = new EnhancedSearchService(config);
          displayProgress('Initializing search service...');
          await searchService.initialize();

          // Perform semantic search first
          const searchOptions: EmbeddingSearchOptions = {
            limit: topK,
          };
          displayProgress('Performing semantic search...');
          const results = await searchService.semanticSearch(query, searchOptions);
          displayResults(results, 'Top Results for RAG');

          // If chosen provider is python, ensure deps
          const llmProvider = config.getAIConfig().llmProvider.provider;
          if (llmProvider === 'python') {
            if (globalOpts.installPythonDeps) {
              try {
                await ensurePythonDependencies(true, true);
              } catch (depError) {
                console.log(chalk.yellow('⚠️  Failed to install Python dependencies automatically:'), depError instanceof Error ? depError.message : String(depError));
                console.log(chalk.blue('💡 Try running: npm run setup-python'));
                throw depError;
              }
            } else {
              const ready = await isPythonEnvironmentReady();
              if (!ready) {
                console.log(chalk.yellow('⚠️  Python dependencies are not available for RAG feature'));
                console.log(chalk.blue('💡 Run with --install-python-deps to install automatically, or:'));
                console.log(chalk.cyan('   npm run setup-python'));
                throw new Error('Python dependencies required for RAG feature');
              }
            }
          }

          const adapted = adaptSearchResults(results);
          displayProgress('Generating explanation with LLM...');
          const ragResponse = await generateRAGExplanation(query, adapted, { model: options.model, maxTokens });
          displayRAGExplanation(query, ragResponse);
          
          // Exit successfully to prevent hanging
          await this.exitSuccess();
        } catch (error) {
          this.handleError(error, 'RAG failed');
        }
      });
  }
}


