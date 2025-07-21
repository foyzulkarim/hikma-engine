import { GitAnalyzer } from '../../modules/git-analyzer';
import { ConfigManager } from '../../config';
import { Logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error-handling';

export class IndexingStrategy {
  private gitAnalyzer: GitAnalyzer;
  private logger: Logger;

  constructor(projectRoot: string, config: ConfigManager, logger: Logger) {
    this.gitAnalyzer = new GitAnalyzer(projectRoot, config);
    this.logger = logger;
  }

  async determine(forceFullIndex: boolean): Promise<{
    isIncremental: boolean;
    lastCommitHash: string | null;
    currentCommitHash: string | null;
    changedFiles: string[];
  }> {
    try {
      const currentCommitHash = await this.gitAnalyzer.getCurrentCommitHash();

      if (forceFullIndex) {
        this.logger.info('Force full index requested');
        return {
          isIncremental: false,
          lastCommitHash: null,
          currentCommitHash,
          changedFiles: [],
        };
      }

      const lastCommitHash = await this.gitAnalyzer.getLastIndexedCommit();

      if (!lastCommitHash || !currentCommitHash) {
        this.logger.info('No previous index found, using full indexing');
        return {
          isIncremental: false,
          lastCommitHash: null,
          currentCommitHash,
          changedFiles: [],
        };
      }

      if (lastCommitHash === currentCommitHash) {
        this.logger.info('No new commits since last indexing');
        return {
          isIncremental: true,
          lastCommitHash,
          currentCommitHash,
          changedFiles: [],
        };
      }

      const changedFiles = await this.gitAnalyzer.getChangedFiles(
        lastCommitHash,
        currentCommitHash,
      );

      return {
        isIncremental: true,
        lastCommitHash,
        currentCommitHash,
        changedFiles,
      };
    } catch (error) {
      this.logger.warn(
        'Failed to determine incremental strategy, falling back to full index',
        { error: getErrorMessage(error) },
      );
      return {
        isIncremental: false,
        lastCommitHash: null,
        currentCommitHash: null,
        changedFiles: [],
      };
    }
  }

  async update(currentCommitHash: string | null): Promise<void> {
    if (currentCommitHash) {
      await this.gitAnalyzer.setLastIndexedCommit(currentCommitHash);
    }
  }
}
