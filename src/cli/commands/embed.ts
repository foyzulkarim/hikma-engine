import { Command } from 'commander';
import chalk from 'chalk';
import { BaseCommand, GlobalCLIOptions } from './base';
import { Indexer, IndexingOptions } from '../../core/indexer';
import { displayCommandHeader, displayProgress, displaySuccess } from '../ui';

export class EmbedCommand extends BaseCommand {
  register(): Command {
    return this.program
      .command('embed [project-path]')
      .alias('index')
      .description('Embed a codebase to build/update the knowledge graph')
      .option('-f, --force-full', 'Force full indexing (ignore incremental updates)')
      .option('--skip-embeddings', 'Skip vector embedding generation')
      .option('--dir <path>', 'Project directory (alternative to positional)')
      .requiredOption('--provider <provider>', 'Provider override for embeddings: python|server|local|transformers')
      .option('--server-url <url>', 'Server URL (required for server provider)')
      .option('-m, --model <name>', 'Embedding model name override (deprecated: use --embedding-model instead)')
      .option('--embedding-model <name>', 'Embedding model name')
      .option('--install-python-deps', 'Automatically install Python dependencies if missing')
      .action(async (projectPath: string | undefined, options: any) => {
        try {
          // Validate provider-specific requirements
          if (options.provider === 'server' && !options.serverUrl) {
            throw new Error('Server provider requires --server-url');
          }

          const globalOpts: GlobalCLIOptions = {
            dir: options.dir,
            provider: options.provider,
            serverUrl: options.serverUrl,
            model: options.model,
            embeddingModel: options.embeddingModel,
            installPythonDeps: !!options.installPythonDeps,
          };

          const resolvedPath = this.resolveProjectRoot(projectPath, options.dir);
          const config = this.initConfigAndLogger(resolvedPath);
          
          // Apply explicit CLI configuration
          const explicitConfig = this.buildExplicitConfig(globalOpts);
          config.updateConfig(explicitConfig);

          displayCommandHeader('Hikma Engine Embed', `Embedding project: ${resolvedPath}`);

          const indexingOptions: IndexingOptions = {
            forceFullIndex: options.forceFull,
            skipEmbeddings: options.skipEmbeddings,
          };

          displayProgress('Starting embedding pipeline...');
          const indexer = new Indexer(resolvedPath, config);
          const result = await indexer.run(indexingOptions);

          const metrics = {
            Mode: result.isIncremental ? 'Incremental' : 'Full',
            'Files processed': result.processedFiles,
            'Nodes created': result.totalNodes,
            'Edges created': result.totalEdges,
            Duration: `${result.duration}ms`,
          };

          displaySuccess('Embedding completed successfully!', metrics);

          if (result.errors.length > 0) {
            console.log(chalk.yellow(`\nWarnings/Errors: ${result.errors.length}`));
            result.errors.forEach((error) =>
              console.log(chalk.yellow(`  - ${error}`))
            );
          }
          
          // Exit successfully to prevent hanging
          await this.exitSuccess();
        } catch (error) {
          this.handleError(error, 'Embed failed');
        }
      });
  }
}


