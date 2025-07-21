import { DataLoader } from '../../modules/data-loader';
import { ConfigManager } from '../../config';
import { NodeWithEmbedding, Edge } from '../../types';

export class DataPersister {
  private dataLoader: DataLoader;

  constructor(config: ConfigManager) {
    const dbConfig = config.getDatabaseConfig();
    this.dataLoader = new DataLoader(dbConfig.sqlite.path, config);
  }

  async persist(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    await this.dataLoader.load(nodes, edges);
  }
}
