import { ConfigManager } from '../config';
import { Logger, getLogger } from '../utils/logger';
import { getErrorMessage, logError } from '../utils/error-handling';
import { PhaseManager, PhaseManagerOptions, IndexingResult } from './PhaseManager';

export interface IndexingOptions {
  forceFullIndex?: boolean;
  skipAISummary?: boolean;
  skipEmbeddings?: boolean;
  dryRun?: boolean;
  
  // New phase-specific options
  runPhases?: number[];
  fromPhase?: number;
  forcePhases?: number[];
  inspectPhase?: number;
  showStatus?: boolean;
}

export class Indexer {
  private projectRoot: string;
  private config: ConfigManager;
  private logger: Logger;
  private phaseManager: PhaseManager;
  private errors: string[] = [];

  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.logger = getLogger('Indexer');
    this.phaseManager = new PhaseManager(projectRoot, config);
  }

  async run(options: IndexingOptions = {}): Promise<IndexingResult> {
    const startTime = Date.now();
    this.logger.info('Starting hikma-engine indexing pipeline', {
      projectRoot: this.projectRoot,
      options,
      startTime,
    });

    try {
      // Initialize phase manager
      await this.phaseManager.initialize();
      
      // Convert indexing options to phase manager options
      const phaseOptions: PhaseManagerOptions = {
        runPhases: options.runPhases,
        fromPhase: options.fromPhase,
        forcePhases: options.forcePhases,
        inspectPhase: options.inspectPhase,
        showStatus: options.showStatus,
        skipAISummary: options.skipAISummary,
        skipEmbeddings: options.skipEmbeddings,
        dryRun: options.dryRun
      };
      
      // Execute phases
      const result = await this.phaseManager.executePhases(phaseOptions);
      
      // Create a sanitized result for logging, removing the verbose 'data' field
      const resultForLogging = {
        ...result,
        phases: result.phases.map(({ data, ...phase }) => phase),
      };

      this.logger.info(
        'Indexing pipeline completed successfully',
        resultForLogging
      );
      return result;
    } catch (error) {
      logError(this.logger, 'Indexing pipeline failed', error);
      this.errors.push(getErrorMessage(error));
      throw error;
    } finally {
      await this.phaseManager.cleanup();
    }
  }

  private createResult(
    startTime: number,
    totalNodes: number,
    totalEdges: number,
    processedFiles: number,
    isIncremental: boolean,
  ): IndexingResult {
    return {
      totalNodes,
      totalEdges,
      processedFiles,
      isIncremental,
      duration: Date.now() - startTime,
      phases: [],
      errors: [...this.errors],
    };
  }
}
