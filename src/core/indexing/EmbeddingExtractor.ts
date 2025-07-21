import { EmbeddingService } from '../../modules/embedding-service';
import { ConfigManager } from '../../config';
import {
  NodeWithEmbedding,
  CodeNode,
  FileNode,
  RepositoryNode,
  TestNode,
  FunctionNode,
  CommitNode,
  PullRequestNode,
} from '../../types';

export class EmbeddingExtractor {
  private embeddingService: EmbeddingService;

  constructor(config: ConfigManager) {
    this.embeddingService = new EmbeddingService(config);
  }

  async extract(
    nodes: (
      | CodeNode
      | FileNode
      | RepositoryNode
      | TestNode
      | FunctionNode
      | CommitNode
      | PullRequestNode
    )[],
  ): Promise<NodeWithEmbedding[]> {
    await this.embeddingService.loadModel();
    return await this.embeddingService.embedNodes(nodes);
  }
}
