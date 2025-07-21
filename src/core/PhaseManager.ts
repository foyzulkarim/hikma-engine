import { ConfigManager } from '../config';
import { Logger, getLogger } from '../utils/logger';
import { PhaseRepository } from '../persistence/PhaseRepository';
import { SQLiteClient } from '../persistence/db/connection';
import { initializeTables } from '../persistence/db/schema';
import {
  FileDiscovery,
  AstExtractor,
  GitExtractor,
  SummaryExtractor,
  EmbeddingExtractor,
  IndexingStrategy,
  NodeCreator,
} from './indexing';
import { RepositoryDTO, FileDTO } from '../persistence/models';
import { FileMetadata } from '../modules/file-scanner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface PhaseManagerOptions {
  runPhases?: number[]; // [1, 2] - only run specific phases
  fromPhase?: number; // 3 - start from phase N
  forcePhases?: number[]; // [2] - force re-run specific phases
  inspectPhase?: number; // Show phase data and exit
  showStatus?: boolean; // Show all phase statuses
  skipAISummary?: boolean;
  skipEmbeddings?: boolean;
  dryRun?: boolean;
}

export interface PhaseResult {
  phase: number;
  name: string;
  duration: number;
  itemsProcessed: number;
  fromCache: boolean;
}

export interface IndexingResult {
  totalNodes: number;
  totalEdges: number;
  processedFiles: number;
  isIncremental: boolean;
  duration: number;
  phases: PhaseResult[];
  errors: string[];
}

/**
 * Manages the phase-by-phase execution of the indexing pipeline
 */
export class PhaseManager {
  private projectRoot: string;
  private config: ConfigManager;
  private logger: Logger;
  private sqliteClient!: SQLiteClient; // Definite assignment assertion
  private phaseRepo!: PhaseRepository; // Definite assignment assertion
  private errors: string[] = [];

  constructor(projectRoot: string, config: ConfigManager) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.logger = getLogger('PhaseManager');
  }

  async initialize(): Promise<void> {
    // Initialize database connection
    const dbConfig = this.config.getDatabaseConfig();
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
    await this.sqliteClient.connect();

    // Initialize schema
    initializeTables(this.sqliteClient);

    // Initialize phase repository
    this.phaseRepo = new PhaseRepository(this.sqliteClient.getDb());

    this.logger.info('PhaseManager initialized successfully');
  }

  async executePhases(
    options: PhaseManagerOptions = {}
  ): Promise<IndexingResult> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];

    try {
      // Handle special commands first
      if (options.showStatus) {
        await this.showPhaseStatus();
        return this.createEmptyResult();
      }

      if (options.inspectPhase) {
        await this.inspectPhase(options.inspectPhase);
        return this.createEmptyResult();
      }

      // Determine indexing strategy
      const strategy = new IndexingStrategy(
        this.projectRoot,
        this.config,
        this.logger
      );
      const indexingStrategy = await strategy.determine(false); // TODO: Add force option
      const repoId = this.getRepoId();

      // Ensure repository record exists before any phase operations
      await this.ensureRepositoryExists(repoId);

      // Execute phases based on options
      const phasesToRun = this.determinePhasesToRun(options);

      let phase1Data: any = null;
      let phase2Data: any = null;
      let phase3Data: any = null;

      for (const phaseNum of phasesToRun) {
        const phaseResult = await this.executePhase(phaseNum, {
          repoId,
          indexingStrategy,
          phase1Data,
          phase2Data,
          phase3Data,
          options,
        });

        phases.push(phaseResult);

        // Store phase data for next phases
        if (phaseNum === 1) phase1Data = phaseResult.data;
        if (phaseNum === 2) phase2Data = phaseResult.data;
        if (phaseNum === 3) phase3Data = phaseResult.data;
      }

      return {
        totalNodes: 0, // TODO: Calculate from phase data
        totalEdges: 0, // TODO: Calculate from phase data
        processedFiles: phase1Data?.files?.length || 0,
        isIncremental: indexingStrategy.isIncremental,
        duration: Date.now() - startTime,
        phases,
        errors: [...this.errors],
      };
    } catch (error) {
      this.logger.error('Phase execution failed', { error });
      throw error;
    }
  }

  private async executePhase(
    phaseNum: number,
    context: any
  ): Promise<PhaseResult & { data?: any }> {
    const startTime = Date.now();
    const phaseName = this.getPhaseNameByNumber(phaseNum);

    this.logger.info(`=== Phase ${phaseNum}: ${phaseName} ===`);

    try {
      // Check if phase should be skipped
      const shouldForce = context.options.forcePhases?.includes(phaseNum);
      const isComplete = await this.phaseRepo.isPhaseComplete(
        context.repoId,
        phaseName
      );

      if (isComplete && !shouldForce) {
        this.logger.info(
          `Phase ${phaseNum} already complete, loading from database`
        );
        const data = await this.loadPhaseData(phaseNum, context.repoId);
        return {
          phase: phaseNum,
          name: phaseName,
          duration: Date.now() - startTime,
          itemsProcessed: this.getItemCount(data),
          fromCache: true,
          data,
        };
      }

      // Mark phase as started
      await this.phaseRepo.markPhaseStarted(
        context.repoId,
        phaseName,
        context.indexingStrategy.currentCommitHash
      );

      // Execute the actual phase
      const data = await this.executePhaseLogic(phaseNum, context);

      // Persist phase data
      if (!context.options.dryRun) {
        await this.persistPhaseData(phaseNum, context.repoId, data);
        await this.phaseRepo.markPhaseCompleted(context.repoId, phaseName, {
          itemsProcessed: this.getItemCount(data),
        });
      }

      this.logger.info(`Phase ${phaseNum} completed successfully`, {
        itemsProcessed: this.getItemCount(data),
        duration: Date.now() - startTime,
      });

      return {
        phase: phaseNum,
        name: phaseName,
        duration: Date.now() - startTime,
        itemsProcessed: this.getItemCount(data),
        fromCache: false,
        data,
      };
    } catch (error) {
      await this.phaseRepo.markPhaseFailed(
        context.repoId,
        phaseName,
        (error as Error).message
      );
      throw error;
    }
  }

  private async executePhaseLogic(
    phaseNum: number,
    context: any
  ): Promise<any> {
    switch (phaseNum) {
      case 1:
        return await this.executePhase1(context);
      case 2:
        return await this.executePhase2(context);
      case 3:
        return await this.executePhase3(context);
      case 4:
        return await this.executePhase4(context);
      default:
        throw new Error(`Unknown phase: ${phaseNum}`);
    }
  }

  private async executePhase1(context: any): Promise<any> {
    // Phase 1: Data Discovery
    const fileDiscovery = new FileDiscovery(this.projectRoot, this.config);
    const filesToProcess = await fileDiscovery.discoverFiles(
      context.indexingStrategy.changedFiles
    );

    const nodeCreator = new NodeCreator();
    const repoNode = nodeCreator.createRepositoryNode(this.projectRoot);
    const fileNodes = nodeCreator.createFileNodes(filesToProcess, context.repoId); // Use consistent repo ID

    // Convert to DTOs
    const repositoryDTO = new RepositoryDTO(
      context.repoId, // Use consistent repo ID
      repoNode.properties.repoPath,
      repoNode.properties.repoName
    );

    const fileDTOs = fileNodes.map(
      (node) =>
        new FileDTO(
          node.id,
          node.properties.repoId,
          node.properties.filePath,
          node.properties.fileName,
          {
            file_extension: node.properties.fileExtension,
            language: node.properties.language,
            size_kb: node.properties.sizeKb,
            content_hash: node.properties.contentHash,
            file_type: node.properties.fileType as 'source' | 'test' | 'config' | 'dev' | 'vendor' | undefined,
          }
        )
    );

    return {
      repository: repositoryDTO,
      files: fileDTOs,
      originalFileMetadata: filesToProcess,
    };
  }

  private async executePhase2(context: any): Promise<any> {
    // Phase 2: AST Parsing and Structure Extraction
    const astExtractor = new AstExtractor(
      this.projectRoot,
      this.config,
      context.phase1Data.repository.id
    );

    const pathToIdMap = new Map<string, string>();
    context.phase1Data.files.forEach((file: FileDTO) => {
      pathToIdMap.set(file.file_path, file.id);
    });

    const { nodes: astNodes, edges: astEdges } = await astExtractor.extract(
      context.phase1Data.originalFileMetadata,
      pathToIdMap
    );

    return {
      astNodes,
      astEdges,
    };
  }

  private async executePhase3(context: any): Promise<any> {
    // Phase 3: AI Summary Generation
    if (context.options.skipAISummary) {
      return { summaries: [] };
    }

    const summaryExtractor = new SummaryExtractor(this.config);
    const nodesToSummarize = [
      ...context.phase1Data.files,
      ...context.phase2Data.astNodes,
    ];

    const nodesWithSummaries = await summaryExtractor.extract(nodesToSummarize);

    return {
      summaries: nodesWithSummaries,
    };
  }

  private async executePhase4(context: any): Promise<any> {
    // Phase 4: Final Assembly and Vector Embeddings
    // TODO: Implement final assembly logic
    return {
      finalNodes: [],
      finalEdges: [],
    };
  }

  private async persistPhaseData(
    phaseNum: number,
    repoId: string,
    data: any
  ): Promise<void> {
    switch (phaseNum) {
      case 1:
        await this.phaseRepo.persistPhase1Data(data);
        break;
      case 2:
        await this.phaseRepo.persistPhase2Data({
          repoId,
          astNodes: data.astNodes || []
        });
        break;
      // TODO: Add other phases
    }
  }

  private async loadPhaseData(phaseNum: number, repoId: string): Promise<any> {
    switch (phaseNum) {
      case 1:
        return await this.phaseRepo.loadPhase1Data(repoId);
      case 2:
        return await this.phaseRepo.loadPhase2Data(repoId);
      // TODO: Add other phases
      default:
        return null;
    }
  }

  private determinePhasesToRun(options: PhaseManagerOptions): number[] {
    if (options.runPhases) {
      return options.runPhases;
    }

    if (options.fromPhase) {
      return [
        options.fromPhase,
        options.fromPhase + 1,
        options.fromPhase + 2,
        options.fromPhase + 3,
      ].filter((p) => p <= 4);
    }

    return [1, 2, 3, 4]; // All phases by default
  }

  private getPhaseNameByNumber(phaseNum: number): string {
    const names: Record<number, string> = {
      1: 'data_discovery',
      2: 'structure_extraction',
      3: 'ai_enrichment',
      4: 'final_assembly',
    };
    return names[phaseNum] || `phase_${phaseNum}`;
  }

  private getItemCount(data: any): number {
    if (!data) return 0;
    if (data.files) return data.files.length;
    if (data.astNodes) return data.astNodes.length;
    if (data.summaries) return data.summaries.length;
    return 0;
  }

  private getRepoId(): string {
    // Generate consistent repo ID based on project path
    const crypto = require('crypto');
    const normalizedPath = path.resolve(this.projectRoot);
    return crypto.createHash('sha256').update(normalizedPath).digest('hex').substring(0, 16);
  }

  private async ensureRepositoryExists(repoId: string): Promise<void> {
    try {
      // Check if repository already exists
      const existingRepo = await this.phaseRepo.loadPhase1Data(repoId);
      if (existingRepo.repository) {
        this.logger.debug('Repository record already exists', { repoId });
        return;
      }

      // Create repository record
      const nodeCreator = new NodeCreator();
      const repoNode = nodeCreator.createRepositoryNode(this.projectRoot);
      
      const repositoryDTO = new RepositoryDTO(
        repoId, // Use consistent repo ID
        repoNode.properties.repoPath,
        repoNode.properties.repoName
      );

      // Persist repository record
      await this.phaseRepo.persistPhase1Data({
        repository: repositoryDTO,
        files: []
      });

      this.logger.debug('Repository record created', { repoId, repoPath: repositoryDTO.repo_path });
    } catch (error) {
      this.logger.warn('Failed to ensure repository exists, will create during Phase 1', { 
        error: (error as Error).message 
      });
      // Don't throw - Phase 1 will handle repository creation
    }
  }

  private async showPhaseStatus(): Promise<void> {
    const repoId = this.getRepoId();
    const statuses = await this.phaseRepo.getPhaseStatuses(repoId);

    console.log('\n=== Phase Status ===');
    console.table(
      statuses.map((s) => ({
        Phase: s.phase_name,
        Status: s.status,
        'Started At': s.started_at,
        'Completed At': s.completed_at,
        'Commit Hash': s.commit_hash?.substring(0, 8),
      }))
    );
  }

  private async inspectPhase(phaseNum: number): Promise<void> {
    const repoId = this.getRepoId();
    const data = await this.loadPhaseData(phaseNum, repoId);

    console.log(`\n=== Phase ${phaseNum} Data ===`);
    console.log(JSON.stringify(data, null, 2));
  }

  private createEmptyResult(): IndexingResult {
    return {
      totalNodes: 0,
      totalEdges: 0,
      processedFiles: 0,
      isIncremental: false,
      duration: 0,
      phases: [],
      errors: [],
    };
  }

  async cleanup(): Promise<void> {
    if (this.sqliteClient) {
      this.sqliteClient.disconnect();
    }
  }
}
