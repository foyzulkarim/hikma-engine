import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { FileMetadata } from '../../modules/file-scanner';
import { RepositoryNode, FileNode } from '../../types';

export class NodeCreator {
  createRepositoryNode(projectRoot: string): RepositoryNode {
    const repoId = uuidv4();
    const repoName = path.basename(projectRoot);
    const now = new Date().toISOString();
    return {
      id: repoId,
      type: 'RepositoryNode',
      properties: {
        repoPath: projectRoot,
        repoName,
        createdAt: now,
        lastUpdated: now,
      },
    };
  }

  createFileNodes(
    metadataList: FileMetadata[],
    repoId: string,
  ): FileNode[] {
    return metadataList.map((meta) => ({
      id: uuidv4(),
      type: 'FileNode',
      properties: {
        filePath: meta.path,
        fileName: meta.name,
        fileExtension: meta.extension,
        repoId,
        language: meta.language,
        sizeKb: meta.sizeKb,
        contentHash: meta.contentHash,
        fileType: meta.fileType,
      },
    }));
  }
}
