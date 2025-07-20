/**
 * @file Core indexer that orchestrates the entire hikma-engine pipeline.
 *       Manages the workflow of file discovery, parsing, analysis, and persistence
 *       with support for incremental indexing and comprehensive error handling.
 */

import { FileScanner } from '../modules/file-scanner';
import { AstParser } from '../modules/ast-parser';
import { GitAnalyzer } from '../modules/git-analyzer';
import { SummaryGenerator } from '../modules/summary-generator';
import { EmbeddingService } from '../modules/embedding-service';
import { DataLoader } from '../modules/data-loader';
import {
  NodeWithEmbedding,
  Edge,
  FileNode,
  DirectoryNode,
  RepositoryNode,
  CodeNode,
  TestNode,
  FunctionNode,
  CommitNode,
  PullRequestNode,
} from '../types';
import { ConfigManager } from '../config';
import { Logger, getLogger } from '../utils/logger';
import { getErrorMessage, logError } from '../utils/error-handling';
import { v4 as uuidv4 } from 'uuid';
import { FileMetadata } from '../modules/file-scanner';
import * as path from 'path';

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

/**
 * Core indexer class that orchestrates the entire knowledge graph building process.
 */
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

  /**
   * Executes the complete indexing pipeline.
   */
  async run(options: IndexingOptions = {}): Promise<IndexingResult> {
    const startTime = Date.now();
    this.logger.info('Starting hikma-engine indexing pipeline', {
      projectRoot: this.projectRoot,
      options,
    });

    try {
      // Phase 0: Initialize and determine indexing strategy
      this.logger.info('Phase 0: Determining indexing strategy...');
      const indexingStrategy = await this.determineIndexingStrategy(options);
      this.logger.info('Indexing strategy determined', indexingStrategy);

      // Phase 1: File Discovery
      this.logger.info('Phase 1: Starting file discovery...');
      const filesToProcess = await this.discoverFiles(indexingStrategy);
      this.logger.info(`Found ${filesToProcess.length} files to process`);

      // Create repository node
      const repoNode = await this.createRepositoryNode();
      this.logger.info(`Created repository node: ${repoNode.id}`);
      const fileNodes: FileNode[] = await this.createFileNodes(
        filesToProcess,
        repoNode.id
      );
      this.logger.info(`Created ${fileNodes.length} file nodes`);

      // Phase 2: AST Parsing and Structure Extraction
      const pathToIdMap = new Map<string, string>();
      fileNodes.forEach((node) => {
        pathToIdMap.set(node.properties.filePath, node.id);
      });
      const { nodes: astNodes, edges: astEdges } =
        await this.parseAndExtractStructure(
          filesToProcess,
          pathToIdMap,
          repoNode.id
        );
      this.logger.info(
        `Extracted ${astNodes.length} nodes and ${astEdges.length} edges from AST parsing`
      );

      // temp: print the ast nodes
      //console.log('fileNodes', fileNodes.filter(node => node.type === 'FileNode'));

      // Phase 3: AI Summary Generation (optional)
      // const nodesWithSummaries = options.skipAISummary
      //   ? astNodes
      //   : await this.generateAISummaries(astNodes);
      const nodesWithSummaries = astNodes;
      this.logger.info('AI summary generation completed');

      // temp: print the nodes with summaries
      // nodesWithSummaries.forEach(node => {
      //   this.logger.info(`Node with summary: ${node.id}`, { node });
      // });

      // Phase 4: Git Analysis
      const { nodes: gitNodes, edges: gitEdges } = await this.analyzeGitHistory(
        fileNodes.filter((n) => n.type === 'FileNode') as FileNode[],
        indexingStrategy.lastCommitHash
      );
      this.logger.info(
        `Analyzed Git history: ${gitNodes.length} nodes, ${gitEdges.length} edges`
      );
      // // temp: print the git nodes
      // gitNodes.forEach(node => {
      //   this.logger.info(`Git node: ${node.id}`, { node });
      // });
      // gitEdges.forEach(edge => {
      //   this.logger.info(`Git edge: ${edge.source} -> ${edge.target}`, { edge });
      // });

      // Phase 5: Combine all nodes and edges
      const allNodes = [
        repoNode,
        ...fileNodes,
        ...nodesWithSummaries,
        ...gitNodes,
      ];
      const allEdges = [...astEdges, ...gitEdges];
      this.logger.info(
        `Total nodes: ${allNodes.length}, Total edges: ${allEdges.length}`
      );

      // Phase 6: Embedding Generation (optional)
      // const nodesWithEmbeddings = options.skipEmbeddings
      //   ? (allNodes.map((node) => ({
      //       ...node,
      //       embedding: [],
      //     })) as NodeWithEmbedding[])
      //   : await this.generateEmbeddings(allNodes);
      const nodesWithEmbeddings = allNodes.map((node) => ({
        ...node,
        embedding: [],
      })) as NodeWithEmbedding[];
      this.logger.info(
        `Generated embeddings for ${nodesWithEmbeddings.length} nodes`
      );

      // Phase 7: Data Persistence (skip if dry run)
      if (!options.dryRun) {
        await this.persistData(nodesWithEmbeddings, allEdges);
        await this.updateIndexingState(indexingStrategy.currentCommitHash);
        this.logger.info('Data persistence completed');
      } else {
        this.logger.info('Dry run mode: skipping data persistence');
      }

      const result = this.createResult(
        startTime,
        allNodes.length,
        allEdges.length,
        filesToProcess.length,
        indexingStrategy.isIncremental
      );
      this.logger.info('Indexing pipeline completed successfully', result);
      return result;
    } catch (error) {
      logError(this.logger, 'Indexing pipeline failed', error);
      this.errors.push(getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Determines the indexing strategy (full vs incremental).
   */
  private async determineIndexingStrategy(options: IndexingOptions): Promise<{
    isIncremental: boolean;
    lastCommitHash: string | null;
    currentCommitHash: string | null;
    changedFiles: string[];
  }> {
    this.logger.info('Creating GitAnalyzer...');
    const gitAnalyzer = new GitAnalyzer(this.projectRoot, this.config);
    this.logger.info('GitAnalyzer created successfully');
    try {
      this.logger.info('Getting current commit hash...');
      const currentCommitHash = await gitAnalyzer.getCurrentCommitHash();
      this.logger.info('Current commit hash retrieved', { currentCommitHash });

      if (options.forceFullIndex) {
        this.logger.info('Force full index requested');
        return {
          isIncremental: false,
          lastCommitHash: null,
          currentCommitHash,
          changedFiles: [],
        };
      }

      this.logger.info('Getting last indexed commit...');
      const lastCommitHash = await gitAnalyzer.getLastIndexedCommit();
      this.logger.info('Last indexed commit retrieved', { lastCommitHash });

      if (!lastCommitHash || !currentCommitHash) {
        this.logger.info('No previous index found, using full indexing');
        return {
          isIncremental: false,
          lastCommitHash: null,
          currentCommitHash,
          changedFiles: [],
        };
      }

      if (lastCommitHash === currentCommitHash) {
        this.logger.info('No new commits since last indexing');
        return {
          isIncremental: true,
          lastCommitHash,
          currentCommitHash,
          changedFiles: [],
        };
      }

      const changedFiles = await gitAnalyzer.getChangedFiles(
        lastCommitHash,
        currentCommitHash
      );

      return {
        isIncremental: true,
        lastCommitHash,
        currentCommitHash,
        changedFiles,
      };
    } catch (error) {
      this.logger.warn(
        'Failed to determine incremental strategy, falling back to full index',
        { error: getErrorMessage(error) }
      );
      return {
        isIncremental: false,
        lastCommitHash: null,
        currentCommitHash: null,
        changedFiles: [],
      };
    }
  }

  /**
   * Discovers files to be processed based on the indexing strategy.
   */
  private async discoverFiles(strategy: {
    changedFiles: string[];
  }): Promise<FileMetadata[]> {
    const fileScanner = new FileScanner(this.projectRoot, this.config);
    const indexingConfig = this.config.getIndexingConfig();

    return await fileScanner.findAllFiles(
      indexingConfig.filePatterns,
      strategy.changedFiles.length > 0 ? strategy.changedFiles : undefined
    );
  }

  /**
   * Parses files and extracts structural information.
   */
  private async parseAndExtractStructure(
    files: FileMetadata[],
    pathToIdMap: Map<string, string>,
    repoId: string
  ): Promise<{
    nodes: (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[];
    edges: Edge[];
  }> {
    const astParser = new AstParser(this.projectRoot, this.config, repoId);
    this.logger.info(`Parsing ${files.length} files`);
    await astParser.parseFiles(
      files.map((f) => f.path),
      pathToIdMap
    );
    this.logger.info(
      `Parsed ${astParser.getNodes().length} nodes and ${
        astParser.getEdges().length
      } edges from AST parsing`
    );

    return {
      nodes: astParser.getNodes(),
      edges: astParser.getEdges(),
    };
  }

  /**
   * Generates AI summaries for file and directory nodes.
   */
  private async generateAISummaries(
    nodes: (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[]
  ): Promise<
    (CodeNode | FileNode | DirectoryNode | TestNode | FunctionNode)[]
  > {
    const summaryGenerator = new SummaryGenerator(this.config);
    await summaryGenerator.loadModel();

    const fileNodes = nodes.filter((n) => n.type === 'FileNode') as FileNode[];
    const directoryNodes = nodes.filter(
      (n) => n.type === 'DirectoryNode'
    ) as DirectoryNode[];
    const otherNodes = nodes.filter(
      (n) => n.type !== 'FileNode' && n.type !== 'DirectoryNode'
    );

    const [summarizedFileNodes, summarizedDirectoryNodes] = await Promise.all([
      summaryGenerator.summarizeFileNodes(fileNodes),
      summaryGenerator.summarizeDirectoryNodes(directoryNodes),
    ]);

    const nodesWithSummaries = [
      ...otherNodes,
      ...summarizedFileNodes,
      ...summarizedDirectoryNodes,
    ];
    nodesWithSummaries.forEach((node) => {
      this.logger.info(`Node with summary: ${node.id}`, { node });
    });

    return nodesWithSummaries;
  }

  /**
   * Analyzes Git history and extracts commit information.
   */
  private async analyzeGitHistory(
    fileNodes: FileNode[],
    lastCommitHash: string | null
  ): Promise<{
    nodes: (CommitNode | PullRequestNode)[];
    edges: Edge[];
  }> {
    const gitAnalyzer = new GitAnalyzer(this.projectRoot, this.config);
    await gitAnalyzer.analyzeRepo(fileNodes, lastCommitHash);

    return {
      nodes: gitAnalyzer.getNodes(),
      edges: gitAnalyzer.getEdges(),
    };
  }

  /**
   * Generates vector embeddings for all nodes.
   */
  private async generateEmbeddings(
    nodes: (
      | CodeNode
      | FileNode
      | DirectoryNode
      | RepositoryNode
      | TestNode
      | FunctionNode
      | CommitNode
      | PullRequestNode
    )[]
  ): Promise<NodeWithEmbedding[]> {
    const embeddingService = new EmbeddingService(this.config);
    await embeddingService.loadModel();

    return await embeddingService.embedNodes(nodes);
  }

  /**
   * Persists data to the unified SQLite database.
   */
  private async persistData(
    nodes: NodeWithEmbedding[],
    edges: Edge[]
  ): Promise<void> {
    const dbConfig = this.config.getDatabaseConfig();
    const dataLoader = new DataLoader(dbConfig.sqlite.path, this.config);

    await dataLoader.load(nodes, edges);
  }

  /**
   * Updates the indexing state with the current commit hash.
   */
  private async updateIndexingState(
    currentCommitHash: string | null
  ): Promise<void> {
    if (currentCommitHash) {
      const gitAnalyzer = new GitAnalyzer(this.projectRoot, this.config);
      await gitAnalyzer.setLastIndexedCommit(currentCommitHash);
    }
  }

  /**
   * Creates the indexing result object.
   */
  private createResult(
    startTime: number,
    totalNodes: number,
    totalEdges: number,
    processedFiles: number,
    isIncremental: boolean
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

  /**
   * Gets the current indexing statistics.
   */
  async getIndexingStats(): Promise<{
    lastIndexedAt: Date | null;
    lastCommitHash: string | null;
    totalNodes: number;
    totalEdges: number;
  }> {
    try {
      const gitAnalyzer = new GitAnalyzer(this.projectRoot, this.config);
      const lastCommitHash = await gitAnalyzer.getLastIndexedCommit();

      // TODO: Get actual stats from databases
      return {
        lastIndexedAt: null, // TODO: Implement
        lastCommitHash,
        totalNodes: 0, // TODO: Implement
        totalEdges: 0, // TODO: Implement
      };
    } catch (error) {
      logError(this.logger, 'Failed to get indexing stats', error);
      throw error;
    }
  }

  private async createRepositoryNode(): Promise<RepositoryNode> {
    const repoId = uuidv4();
    const repoName = path.basename(this.projectRoot);
    const now = new Date().toISOString();
    return {
      id: repoId,
      type: 'RepositoryNode',
      properties: {
        repoPath: this.projectRoot,
        repoName,
        createdAt: now,
        lastUpdated: now,
      },
    };
  }

  private async createFileNodes(
    metadataList: FileMetadata[],
    repoId: string
  ): Promise<FileNode[]> {
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
