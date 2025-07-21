import { GitAnalyzer } from '../../modules/git-analyzer';
import { ConfigManager } from '../../config';
import { FileNode, CommitNode, PullRequestNode, Edge } from '../../types';

export class GitExtractor {
  private gitAnalyzer: GitAnalyzer;

  constructor(projectRoot: string, config: ConfigManager) {
    this.gitAnalyzer = new GitAnalyzer(projectRoot, config);
  }

  async extract(
    fileNodes: FileNode[],
    lastCommitHash: string | null,
  ): Promise<{
    nodes: (CommitNode | PullRequestNode)[];
    edges: Edge[];
  }> {
    await this.gitAnalyzer.analyzeRepo(fileNodes, lastCommitHash);
    return {
      nodes: this.gitAnalyzer.getNodes(),
      edges: this.gitAnalyzer.getEdges(),
    };
  }
}
