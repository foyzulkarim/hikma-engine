import { SummaryGenerator } from '../../modules/summary-generator';
import { ConfigManager } from '../../config';
import { CodeNode, FileNode, DirectoryNode, TestNode, FunctionNode } from '../../types';

export class SummaryExtractor {
  private summaryGenerator: SummaryGenerator;

  constructor(config: ConfigManager) {
    this.summaryGenerator = new SummaryGenerator(config);
  }

  async extract(
    nodes: (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[],
  ): Promise<
    (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[]
  > {
    await this.summaryGenerator.loadModel();

    const fileNodes = nodes.filter((n) => n.type === 'FileNode') as FileNode[];
    const directoryNodes = nodes.filter(
      (n) => n.type === 'DirectoryNode',
    ) as DirectoryNode[];
    const otherNodes = nodes.filter(
      (n) => n.type !== 'FileNode' && n.type !== 'DirectoryNode',
    );

    const [summarizedFileNodes, summarizedDirectoryNodes] = await Promise.all([
      this.summaryGenerator.summarizeFileNodes(fileNodes),
      this.summaryGenerator.summarizeDirectoryNodes(directoryNodes),
    ]);

    return [
      ...otherNodes,
      ...summarizedFileNodes,
      ...summarizedDirectoryNodes,
    ];
  }
}
