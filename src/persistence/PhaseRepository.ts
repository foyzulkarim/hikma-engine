import { Database } from 'better-sqlite3';
import { GenericRepository } from './repository/GenericRepository';
import {
  RepositoryDTO,
  FileDTO,
  PhaseStatusDTO,
  GraphNodeDTO,
  GraphEdgeDTO,
  EmbeddingNodeDTO
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
  private graphEdgeRepo: GenericRepository<GraphEdgeDTO>;
  private embeddingNodeRepo: GenericRepository<EmbeddingNodeDTO>;

  constructor(db: Database) {
    this.db = db;
    this.repositoryRepo = new GenericRepository(db, 'repositories');
    this.fileRepo = new GenericRepository(db, 'files');
    this.phaseStatusRepo = new GenericRepository(db, 'phase_status');
    this.graphNodeRepo = new GenericRepository(db, 'graph_nodes');
    this.graphEdgeRepo = new GenericRepository(db, 'graph_edges');
    this.embeddingNodeRepo = new GenericRepository(db, 'embedding_nodes');
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
    astEdges?: any[];
  }): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Convert AST nodes to GraphNodeDTOs
      const graphNodeDTOs = data.astNodes.map(node => this.convertAstNodeToGraphNodeDTO(node, data.repoId));

      // Save AST nodes as graph nodes in batch
      if (graphNodeDTOs.length > 0) {
        this.graphNodeRepo.batchAdd(graphNodeDTOs);
      }

      // Convert AST edges to GraphEdgeDTOs and save them
      if (data.astEdges && data.astEdges.length > 0) {
        const graphEdgeDTOs = data.astEdges.map(edge => this.convertAstEdgeToGraphEdgeDTO(edge));
        this.graphEdgeRepo.batchAdd(graphEdgeDTOs);
      }
    });

    transaction();
  }

  async loadPhase2Data(repoId: string): Promise<{
    astNodes: GraphNodeDTO[];
    astEdges: GraphEdgeDTO[];
  }> {
    const astNodes = await this.graphNodeRepo.search({
      repo_id: repoId
    });

    // Load edges by finding all edges where source or target nodes belong to this repo
    const nodeIds = astNodes.map(node => node.id);
    const astEdges: GraphEdgeDTO[] = [];

    if (nodeIds.length > 0) {
      // This is a simplified approach - in practice you might want to optimize this query
      const allEdges = await this.graphEdgeRepo.getAll();
      astEdges.push(...allEdges.filter(edge =>
        nodeIds.includes(edge.source_id) || nodeIds.includes(edge.target_id)
      ));
    }

    return { astNodes, astEdges };
  }

  private convertAstNodeToGraphNodeDTO(astNode: any, repoId: string): GraphNodeDTO {
    // Extract key properties for easier querying
    const properties = astNode.properties || {};
    // Ensure all IDs are strings
    const nodeId = typeof astNode.id === 'string' ? astNode.id : String(astNode.id);
    const nodeType = typeof astNode.type === 'string' ? astNode.type : String(astNode.type);

    return new GraphNodeDTO(
      nodeId,
      nodeId, // business_key same as id for AST nodes
      nodeType,
      JSON.stringify(properties), // Store all properties as JSON
      {
        repo_id: repoId,
        file_path: properties?.filePath ? String(properties.filePath) : undefined,
        line: typeof properties?.startLine === 'number' ? properties.startLine : undefined,
        col: typeof properties?.startColumn === 'number' ? properties.startColumn : 0,
        signature_hash: this.generateSignatureHash(properties?.signature || properties?.name || nodeId)
      }
    );
  }

  private generateSignatureHash(signature: string): string {
    // Simple hash for signature - could be made more sophisticated
    return require('crypto').createHash('md5').update(signature).digest('hex');
  }

  private convertAstEdgeToGraphEdgeDTO(astEdge: any): GraphEdgeDTO {
    // Ensure all IDs are strings
    const edgeId = typeof astEdge.id === 'string' ? astEdge.id : String(astEdge.id || `edge_${Date.now()}_${Math.random()}`);
    const sourceId = typeof astEdge.source === 'string' ? astEdge.source : String(astEdge.source);
    const targetId = typeof astEdge.target === 'string' ? astEdge.target : String(astEdge.target);
    const edgeType = typeof astEdge.type === 'string' ? astEdge.type : String(astEdge.type);

    return new GraphEdgeDTO(
      edgeId,
      sourceId,
      targetId,
      sourceId, // business_key same as source for AST edges
      targetId, // business_key same as target for AST edges
      edgeType,
      {
        properties: astEdge.properties ? JSON.stringify(astEdge.properties) : undefined,
        line: typeof astEdge.line === 'number' ? astEdge.line : undefined,
        col: typeof astEdge.col === 'number' ? astEdge.col : undefined,
        dynamic: Boolean(astEdge.dynamic)
      }
    );
  }

  // ============================================================================
  // PHASE 3: ENRICHMENT PERSISTENCE  
  // ============================================================================

  async persistPhase4Data(data: {
    repoId: string;
    finalNodes: any[];
    finalEdges: any[];
  }): Promise<void> {
    const transaction = this.db.transaction(() => {
      const graphNodeDTOs = [];
      const embeddingNodeDTOs = [];

      for (const node of data.finalNodes) {
        // Create GraphNodeDTO without embedding
        const { embedding, ...nodeWithoutEmbedding } = node;
        const graphNodeDTO = this.convertAstNodeToGraphNodeDTO(nodeWithoutEmbedding, data.repoId);
        graphNodeDTOs.push(graphNodeDTO);

        // If embedding exists, create EmbeddingNodeDTO with metadata
        if (embedding) {
          // Extract source text and metadata from the node
          const sourceText = node.sourceText;
          const properties = node.properties || {};

          const embeddingNodeDTO = new EmbeddingNodeDTO(
            node.id, // Use node ID as the ID for the embedding record
            node.id,
            JSON.stringify(embedding), // Serialize embedding array to JSON string
            sourceText, // The text that was embedded
            node.type, // Node type (e.g., 'CodeNode')
            properties.filePath || null, // File path            
          );
          embeddingNodeDTOs.push(embeddingNodeDTO);
        }
      }

      console.log(`[DEBUG] About to persist ${graphNodeDTOs.length} graph nodes and ${embeddingNodeDTOs.length} embedding nodes`);

      if (graphNodeDTOs.length > 0) {
        this.graphNodeRepo.batchAdd(graphNodeDTOs);
      }

      if (embeddingNodeDTOs.length > 0) {
        console.log(`[DEBUG] Persisting ${embeddingNodeDTOs.length} embedding nodes`);
        this.embeddingNodeRepo.batchAdd(embeddingNodeDTOs);
        console.log(`[DEBUG] Successfully persisted embedding nodes`);
      }

      const graphEdgeDTOs = data.finalEdges.map(edge => this.convertAstEdgeToGraphEdgeDTO(edge));
      if (graphEdgeDTOs.length > 0) {
        this.graphEdgeRepo.batchAdd(graphEdgeDTOs);
      }
    });

    transaction();
  }

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
