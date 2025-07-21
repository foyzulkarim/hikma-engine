import { NodeWithEmbedding, Edge } from '../../types';
import { DataLoader } from '../data-loader';

export class Indexer {
  private dataLoader: DataLoader;

  constructor(dataLoader: DataLoader) {
    this.dataLoader = dataLoader;
  }

  async index(nodes: NodeWithEmbedding[], edges: Edge[]): Promise<void> {
    await this.dataLoader.load(nodes, edges);
  }
}
