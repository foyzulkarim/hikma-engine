import { AstParser } from '../../modules/ast-parser';
import { ConfigManager } from '../../config';
import { FileMetadata } from '../../modules/file-scanner';
import { CodeNode, FileNode, DirectoryNode, TestNode, FunctionNode, Edge } from '../../types';

export class AstExtractor {
  private astParser: AstParser;

  constructor(projectRoot: string, config: ConfigManager, repoId: string) {
    this.astParser = new AstParser(projectRoot, config, repoId);
  }

  async extract(
    files: FileMetadata[],
    pathToIdMap: Map<string, string>,
  ): Promise<{
    nodes: (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[];
    edges: Edge[];
  }> {
    await this.astParser.parseFiles(
      files.map((f) => f.path),
      pathToIdMap,
    );
    return {
      nodes: this.astParser.getNodes(),
      edges: this.astParser.getEdges(),
    };
  }
}
