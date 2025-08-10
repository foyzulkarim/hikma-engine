import { Command } from 'commander';
import { BaseCommand, GlobalCLIOptions } from './base';
import { EnhancedSearchService, EmbeddingSearchOptions } from '../../modules/enhanced-search-service';
import { displayCommandHeader, displayProgress, displayResults } from '../ui';

export class SearchCommand extends BaseCommand {
  register(): Command {
    return this.program
      .command('search <query> [project-path]')
      .description('Perform semantic search using vector embeddings')
      .option('-l, --limit <number>', 'Maximum number of results', '10')
      .option('-s, --min-similarity <number>', 'Minimum similarity threshold (0-1)', '0.1')
      .option('--dir <path>', 'Project directory (alternative to positional)')
      .requiredOption('--provider <provider>', 'Provider override for embeddings: python|server|local|transformers')
      .option('--server-url <url>', 'Server URL (required for server provider)')
      .option('-m, --model <name>', 'Model override (deprecated: use --embedding-model instead)')
      .option('--embedding-model <name>', 'Embedding model name')
      .option('--install-python-deps', 'Automatically install Python dependencies if missing')
      .action(async (query: string, projectPath: string | undefined, options: any) => {
        try {
          if (!query || query.trim().length === 0) {
            throw new Error('Search query cannot be empty');
          }

          const limit = parseInt(options.limit);
          if (isNaN(limit) || limit < 1 || limit > 100) {
            throw new Error('Limit must be a number between 1 and 100');
          }

          const similarity = parseFloat(options.minSimilarity);
          if (isNaN(similarity) || similarity < 0 || similarity > 1) {
            throw new Error('Similarity threshold must be a number between 0 and 1');
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
            installPythonDeps: !!options.installPythonDeps,
          };
          
          // Apply explicit CLI configuration
          const explicitConfig = this.buildExplicitConfig(globalOpts);
          config.updateConfig(explicitConfig);

          const searchService = new EnhancedSearchService(config);
          displayCommandHeader('Semantic Search', `Searching for: "${query}" in ${resolvedPath}`);
          displayProgress('Initializing search service...');
          await searchService.initialize();

          const searchOptions: EmbeddingSearchOptions = {
            limit,
            minSimilarity: similarity,
          };

          displayProgress('Performing semantic search...');
          const results = await searchService.semanticSearch(query, searchOptions);

          displayResults(results, 'Search Results');
          
          // Exit successfully to prevent hanging
          await this.exitSuccess();
        } catch (error) {
          this.handleError(error, 'Search failed');
        }
      });
  }
}


