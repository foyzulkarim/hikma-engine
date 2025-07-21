import { Database } from 'better-sqlite3';
import { GenericRepository } from './repository/GenericRepository';
import { 
  RepositoryDTO, 
  FileDTO, 
  PhaseStatusDTO,
  GraphNodeDTO 
} from './models';

/**
 * Phase-specific repository that handles persistence for each indexing phase
 */
export class PhaseRepository {
  private db: Database;
  private repositoryRepo: GenericRepository<RepositoryDTO>;
  private fileRepo: GenericRepository<FileDTO>;
  private phaseStatusRepo: GenericRepository<PhaseStatusDTO>;
  private graphNodeRepo: GenericRepository<GraphNodeDTO>;

  constructor(db: Database) {
    this.db = db;
    this.repositoryRepo = new GenericRepository(db, 'repositories');
    this.fileRepo = new GenericRepository(db, 'files');
    this.phaseStatusRepo = new GenericRepository(db, 'phase_status');
    this.graphNodeRepo = new GenericRepository(db, 'graph_nodes');
  }

  // ============================================================================
  // PHASE STATUS MANAGEMENT
  // ============================================================================

  async isPhaseComplete(repoId: string, phaseName: string): Promise<boolean> {
    const status = await this.phaseStatusRepo.search({ 
      repo_id: repoId, 
      phase_name: phaseName 
    });
    return status.length > 0 && status[0].status === 'completed';
  }

  async markPhaseStarted(repoId: string, phaseName: string, commitHash?: string): Promise<void> {
    const phaseId = `${repoId}-${phaseName}`;
    const phaseStatus = new PhaseStatusDTO(phaseId, repoId, phaseName, 'running');
    phaseStatus.started_at = new Date().toISOString();
    if (commitHash) phaseStatus.commit_hash = commitHash;
    
    await this.phaseStatusRepo.add(phaseStatus);
  }

  async markPhaseCompleted(repoId: string, phaseName: string, stats?: any): Promise<void> {
    const phaseId = `${repoId}-${phaseName}`;
    const existing = await this.phaseStatusRepo.get(phaseId);
    
    if (existing) {
      existing.status = 'completed';
      existing.completed_at = new Date().toISOString();
      if (stats) existing.stats = JSON.stringify(stats);
      await this.phaseStatusRepo.add(existing);
    }
  }

  async markPhaseFailed(repoId: string, phaseName: string, error: string): Promise<void> {
    const phaseId = `${repoId}-${phaseName}`;
    const existing = await this.phaseStatusRepo.get(phaseId);
    
    if (existing) {
      existing.status = 'failed';
      existing.stats = JSON.stringify({ error });
      await this.phaseStatusRepo.add(existing);
    }
  }

  async getPhaseStatuses(repoId: string): Promise<PhaseStatusDTO[]> {
    return await this.phaseStatusRepo.search({ repo_id: repoId });
  }

  // ============================================================================
  // PHASE 1: DATA DISCOVERY PERSISTENCE
  // ============================================================================

  async persistPhase1Data(data: {
    repository: RepositoryDTO;
    files: FileDTO[];
  }): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Save repository
      this.repositoryRepo.add(data.repository);
      
      // Save files in batch
      if (data.files.length > 0) {
        this.fileRepo.batchAdd(data.files);
      }
    });
    
    transaction();
  }

  async loadPhase1Data(repoId: string): Promise<{
    repository: RepositoryDTO | null;
    files: FileDTO[];
  }> {
    const repository = await this.repositoryRepo.get(repoId);
    const files = await this.fileRepo.search({ repo_id: repoId });
    
    return { repository, files };
  }

  // ============================================================================
  // PHASE 2: STRUCTURE EXTRACTION PERSISTENCE
  // ============================================================================
  
  async persistPhase2Data(data: {
    repoId: string;
    astNodes: any[];
  }): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Convert AST nodes to GraphNodeDTOs
      const graphNodeDTOs = data.astNodes.map(node => this.convertAstNodeToGraphNodeDTO(node, data.repoId));
      
      // Save AST nodes as graph nodes in batch
      if (graphNodeDTOs.length > 0) {
        this.graphNodeRepo.batchAdd(graphNodeDTOs);
      }
    });
    
    transaction();
  }

  async loadPhase2Data(repoId: string): Promise<{
    astNodes: GraphNodeDTO[];
  }> {
    const astNodes = await this.graphNodeRepo.search({ 
      repo_id: repoId,
      node_type: 'FunctionNode'
    });
    
    return { astNodes };
  }

  private convertAstNodeToGraphNodeDTO(astNode: any, repoId: string): GraphNodeDTO {
    // Extract key properties for easier querying
    const properties = astNode.properties;
    
    return new GraphNodeDTO(
      astNode.id,
      astNode.id, // business_key same as id for AST nodes
      astNode.type,
      JSON.stringify(properties), // Store all properties as JSON
      {
        repo_id: repoId,
        file_path: properties.filePath,
        line: properties.startLine,
        col: properties.startColumn || 0,
        signature_hash: this.generateSignatureHash(properties.signature || properties.name)
      }
    );
  }

  private generateSignatureHash(signature: string): string {
    // Simple hash for signature - could be made more sophisticated
    return require('crypto').createHash('md5').update(signature).digest('hex');
  }

  // ============================================================================
  // PHASE 3: ENRICHMENT PERSISTENCE  
  // ============================================================================
  
  // TODO: Add methods for AI summaries, embeddings, etc.

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async clearPhaseData(repoId: string, phaseName: string): Promise<void> {
    // Implementation depends on which phase data to clear
    // This allows for re-running specific phases
  }

  async getPhaseStats(repoId: string): Promise<Record<string, any>> {
    const statuses = await this.getPhaseStatuses(repoId);
    const stats: Record<string, any> = {};
    
    for (const status of statuses) {
      stats[status.phase_name] = {
        status: status.status,
        started_at: status.started_at,
        completed_at: status.completed_at,
        stats: status.stats ? JSON.parse(status.stats) : null
      };
    }
    
    return stats;
  }
}
