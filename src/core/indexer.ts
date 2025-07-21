import {
  FileDiscovery,
  AstExtractor,
  GitExtractor,
  SummaryExtractor,
  EmbeddingExtractor,
  DataPersister,
  IndexingStrategy,
  NodeCreator,
} from './indexing';
import { ConfigManager } from '../config';
import { Logger, getLogger } from '../utils/logger';
import { getErrorMessage, logError } from '../utils/error-handling';
import { NodeWithEmbedding, Edge, FileNode } from '../types';

export interface IndexingResult {
  totalNodes: number;
  totalEdges: number;
  processedFiles: number;
  isIncremental: boolean;
  duration: number;
  errors: string[];
}

export interface IndexingOptions {
  forceFullIndex?: boolean;
  skipAISummary?: boolean;
  skipEmbeddings?: boolean;
  dryRun?: boolean;
}

export class Indexer {
  private projectRoot: string;
  private config: ConfigManager;
  private logger: Logger;
  private errors: string[] = [];

  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.logger = getLogger('Indexer');
  }

  async run(options: IndexingOptions = {}): Promise<IndexingResult> {
    const startTime = Date.now();
    this.logger.info('Starting hikma-engine indexing pipeline', {
      projectRoot: this.projectRoot,
      options,
    });

    try {
      const strategy = new IndexingStrategy(
        this.projectRoot,
        this.config,
        this.logger,
      );
      const indexingStrategy = await strategy.determine(
        options.forceFullIndex || false,
      );

      const fileDiscovery = new FileDiscovery(this.projectRoot, this.config);
      const filesToProcess = await fileDiscovery.discoverFiles(
        indexingStrategy.changedFiles,
      );

      const nodeCreator = new NodeCreator();
      const repoNode = nodeCreator.createRepositoryNode(this.projectRoot);
      const fileNodes: FileNode[] = nodeCreator.createFileNodes(
        filesToProcess,
        repoNode.id,
      );

      const pathToIdMap = new Map<string, string>();
      fileNodes.forEach((node) => {
        pathToIdMap.set(node.properties.filePath, node.id);
      });

      const astExtractor = new AstExtractor(
        this.projectRoot,
        this.config,
        repoNode.id,
      );
      const { nodes: astNodes, edges: astEdges } = await astExtractor.extract(
        filesToProcess,
        pathToIdMap,
      );

      const nodesToSummarize = [...fileNodes, ...astNodes];
      const summaryExtractor = new SummaryExtractor(this.config);
      const nodesWithSummaries = options.skipAISummary
        ? nodesToSummarize
        : await summaryExtractor.extract(nodesToSummarize);

      const gitExtractor = new GitExtractor(this.projectRoot, this.config);
      const { nodes: gitNodes, edges: gitEdges } = await gitExtractor.extract(
        fileNodes,
        indexingStrategy.lastCommitHash,
      );

      const allNodes = [repoNode, ...nodesWithSummaries, ...gitNodes];
      const allEdges = [...astEdges, ...gitEdges];

      const embeddingExtractor = new EmbeddingExtractor(this.config);
      const nodesWithEmbeddings = options.skipEmbeddings
        ? (allNodes.map((node) => ({
            ...node,
            embedding: [],
          })) as NodeWithEmbedding[])
        : await embeddingExtractor.extract(allNodes);

      if (!options.dryRun) {
        const dataPersister = new DataPersister(this.config);
        await dataPersister.persist(nodesWithEmbeddings, allEdges);
        await strategy.update(indexingStrategy.currentCommitHash);
      }

      const result = this.createResult(
        startTime,
        allNodes.length,
        allEdges.length,
        filesToProcess.length,
        indexingStrategy.isIncremental,
      );
      this.logger.info('Indexing pipeline completed successfully', result);
      return result;
    } catch (error) {
      logError(this.logger, 'Indexing pipeline failed', error);
      this.errors.push(getErrorMessage(error));
      throw error;
    }
  }

  private createResult(
    startTime: number,
    totalNodes: number,
    totalEdges: number,
    processedFiles: number,
    isIncremental: boolean,
  ): IndexingResult {
    return {
      totalNodes,
      totalEdges,
      processedFiles,
      isIncremental,
      duration: Date.now() - startTime,
      errors: [...this.errors],
    };
  }
}
