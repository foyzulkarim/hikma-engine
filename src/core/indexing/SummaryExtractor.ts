import { SummaryGenerator } from '../../modules/summary-generator';
import { ConfigManager } from '../../config';
import { CodeNode, FileNode, TestNode, FunctionNode } from '../../types';

export class SummaryExtractor {
  private summaryGenerator: SummaryGenerator;

  constructor(config: ConfigManager) {
    this.summaryGenerator = new SummaryGenerator(config);
  }

  async extract(
    nodes: (CodeNode | FileNode | TestNode | FunctionNode)[],
  ): Promise<
    (CodeNode | FileNode | TestNode | FunctionNode)[]
  > {
    await this.summaryGenerator.loadModel();

    const fileNodes = nodes.filter((n) => n.type === 'FileNode') as FileNode[];
    const otherNodes = nodes.filter((n) => n.type !== 'FileNode');

    const summarizedFileNodes = await this.summaryGenerator.summarizeFileNodes(fileNodes);

    return [
      ...otherNodes,
      ...summarizedFileNodes,
    ];
  }
}
