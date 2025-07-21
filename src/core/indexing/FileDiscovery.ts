import { FileScanner, FileMetadata } from '../../modules/file-scanner';
import { ConfigManager } from '../../config';

export class FileDiscovery {
  private fileScanner: FileScanner;
  private config: ConfigManager;

  constructor(projectRoot: string, config: ConfigManager) {
    this.fileScanner = new FileScanner(projectRoot, config);
    this.config = config;
  }

  async discoverFiles(changedFiles?: string[]): Promise<FileMetadata[]> {
    const indexingConfig = this.config.getIndexingConfig();
    return await this.fileScanner.findAllFiles(
      indexingConfig.filePatterns,
      changedFiles,
    );
  }
}
