import { SQLiteClient } from '../persistence/db/connection';
import { getLogger } from './logger';
import { getErrorMessage } from './error-handling';

/**
 * In-memory graph structure for efficient graph queries and analysis
 */
export interface GraphNode {
  id: string;
  businessKey: string;
  nodeType: string;
  properties: Record<string, any>;
  repoId?: string;
  filePath?: string;
  line?: number;
  col?: number;
  signatureHash?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceBusinessKey: string;
  targetBusinessKey: string;
  edgeType: string;
  properties?: Record<string, any>;
  line?: number;
  col?: number;
  dynamic?: boolean;
}

export interface InMemoryGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  adjacencyList: Map<string, GraphEdge[]>;
  reverseAdjacencyList: Map<string, GraphEdge[]>;
  nodesByType: Map<string, GraphNode[]>;
  edgesByType: Map<string, GraphEdge[]>;
}

/**
 * Service for loading and querying graph data in memory
 */
export class InMemoryGraphService {
  private logger = getLogger('InMemoryGraphService');
  private graph: InMemoryGraph | null = null;
  private sqliteClient: SQLiteClient;

  constructor(sqliteClient: SQLiteClient) {
    this.sqliteClient = sqliteClient;
  }

  /**
   * Load the entire graph dataset into memory
   */
  async loadGraph(): Promise<void> {
    const operation = this.logger.operation('Loading graph into memory');
    
    try {
      this.logger.info('Starting in-memory graph loading');
      
      // Load all nodes and edges from SQLite
      const rawNodes = this.sqliteClient.all('SELECT * FROM graph_nodes');
      const rawEdges = this.sqliteClient.all('SELECT * FROM graph_edges');
      
      this.logger.info(`Loaded ${rawNodes.length} nodes and ${rawEdges.length} edges from database`);
      
      // Convert to typed structures
      const nodes = new Map<string, GraphNode>();
      const nodesByType = new Map<string, GraphNode[]>();
      
      for (const rawNode of rawNodes) {
        const node: GraphNode = {
          id: rawNode.id,
          businessKey: rawNode.business_key,
          nodeType: rawNode.node_type,
          properties: rawNode.properties ? JSON.parse(rawNode.properties) : {},
          repoId: rawNode.repo_id,
          filePath: rawNode.file_path,
          line: rawNode.line,
          col: rawNode.col,
          signatureHash: rawNode.signature_hash
        };
        
        nodes.set(node.id, node);
        
        // Group by type
        if (!nodesByType.has(node.nodeType)) {
          nodesByType.set(node.nodeType, []);
        }
        nodesByType.get(node.nodeType)!.push(node);
      }
      
      const edges: GraphEdge[] = [];
      const edgesByType = new Map<string, GraphEdge[]>();
      const adjacencyList = new Map<string, GraphEdge[]>();
      const reverseAdjacencyList = new Map<string, GraphEdge[]>();
      
      for (const rawEdge of rawEdges) {
        const edge: GraphEdge = {
          id: rawEdge.id,
          sourceId: rawEdge.source_id,
          targetId: rawEdge.target_id,
          sourceBusinessKey: rawEdge.source_business_key,
          targetBusinessKey: rawEdge.target_business_key,
          edgeType: rawEdge.edge_type,
          properties: rawEdge.properties ? JSON.parse(rawEdge.properties) : {},
          line: rawEdge.line,
          col: rawEdge.col,
          dynamic: rawEdge.dynamic
        };
        
        edges.push(edge);
        
        // Group by type
        if (!edgesByType.has(edge.edgeType)) {
          edgesByType.set(edge.edgeType, []);
        }
        edgesByType.get(edge.edgeType)!.push(edge);
        
        // Build adjacency lists
        if (!adjacencyList.has(edge.sourceId)) {
          adjacencyList.set(edge.sourceId, []);
        }
        adjacencyList.get(edge.sourceId)!.push(edge);
        
        if (!reverseAdjacencyList.has(edge.targetId)) {
          reverseAdjacencyList.set(edge.targetId, []);
        }
        reverseAdjacencyList.get(edge.targetId)!.push(edge);
      }
      
      this.graph = {
        nodes,
        edges,
        adjacencyList,
        reverseAdjacencyList,
        nodesByType,
        edgesByType
      };
      
      this.logger.info('In-memory graph loaded successfully', {
        nodeCount: nodes.size,
        edgeCount: edges.length,
        nodeTypes: Array.from(nodesByType.keys()),
        edgeTypes: Array.from(edgesByType.keys())
      });
      
      operation();
    } catch (error) {
      this.logger.error('Failed to load graph into memory', { error: getErrorMessage(error) });
      operation();
      throw error;
    }
  }

  /**
   * Get the loaded graph (throws if not loaded)
   */
  getGraph(): InMemoryGraph {
    if (!this.graph) {
      throw new Error('Graph not loaded. Call loadGraph() first.');
    }
    return this.graph;
  }

  /**
   * Check if graph is loaded
   */
  isLoaded(): boolean {
    return this.graph !== null;
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(nodeType: string): GraphNode[] {
    const graph = this.getGraph();
    return graph.nodesByType.get(nodeType) || [];
  }

  /**
   * Get all edges of a specific type
   */
  getEdgesByType(edgeType: string): GraphEdge[] {
    const graph = this.getGraph();
    return graph.edgesByType.get(edgeType) || [];
  }

  /**
   * Get outgoing edges from a node
   */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const graph = this.getGraph();
    return graph.adjacencyList.get(nodeId) || [];
  }

  /**
   * Get incoming edges to a node
   */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    const graph = this.getGraph();
    return graph.reverseAdjacencyList.get(nodeId) || [];
  }

  /**
   * Find all function calls from a specific function
   */
  getFunctionCalls(functionId: string): GraphNode[] {
    const callEdges = this.getOutgoingEdges(functionId)
      .filter(edge => edge.edgeType === 'CALLS');
    
    const graph = this.getGraph();
    return callEdges
      .map(edge => graph.nodes.get(edge.targetId))
      .filter(node => node !== undefined) as GraphNode[];
  }

  /**
   * Find all functions that call a specific function
   */
  getFunctionCallers(functionId: string): GraphNode[] {
    const callEdges = this.getIncomingEdges(functionId)
      .filter(edge => edge.edgeType === 'CALLS');
    
    const graph = this.getGraph();
    return callEdges
      .map(edge => graph.nodes.get(edge.sourceId))
      .filter(node => node !== undefined) as GraphNode[];
  }

  /**
   * Find call chain between two functions using BFS
   */
  findCallChain(fromFunctionId: string, toFunctionId: string, maxDepth: number = 10): GraphNode[] | null {
    const graph = this.getGraph();
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromFunctionId, path: [fromFunctionId] }];
    
    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      
      if (path.length > maxDepth) continue;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      if (nodeId === toFunctionId) {
        return path.map(id => graph.nodes.get(id)!).filter(node => node !== undefined);
      }
      
      const callEdges = this.getOutgoingEdges(nodeId)
        .filter(edge => edge.edgeType === 'CALLS');
      
      for (const edge of callEdges) {
        if (!visited.has(edge.targetId)) {
          queue.push({
            nodeId: edge.targetId,
            path: [...path, edge.targetId]
          });
        }
      }
    }
    
    return null;
  }

  /**
   * Find all functions in a specific file
   */
  getFunctionsInFile(filePath: string): GraphNode[] {
    const graph = this.getGraph();
    const functions = graph.nodesByType.get('FunctionNode') || [];
    return functions.filter(func => func.filePath === filePath);
  }

  /**
   * Find files that import/depend on a specific file
   */
  getFileDependents(filePath: string): GraphNode[] {
    const graph = this.getGraph();
    const fileNodes = graph.nodesByType.get('FileNode') || [];
    const targetFile = fileNodes.find(file => file.filePath === filePath);
    
    if (!targetFile) return [];
    
    const importEdges = this.getIncomingEdges(targetFile.id)
      .filter(edge => edge.edgeType === 'IMPORTS');
    
    return importEdges
      .map(edge => graph.nodes.get(edge.sourceId))
      .filter(node => node !== undefined) as GraphNode[];
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
  } {
    const graph = this.getGraph();
    
    const nodeTypes: Record<string, number> = {};
    for (const [type, nodes] of graph.nodesByType) {
      nodeTypes[type] = nodes.length;
    }
    
    const edgeTypes: Record<string, number> = {};
    for (const [type, edges] of graph.edgesByType) {
      edgeTypes[type] = edges.length;
    }
    
    return {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      nodeTypes,
      edgeTypes
    };
  }

  /**
   * Search nodes by properties
   */
  searchNodes(predicate: (node: GraphNode) => boolean): GraphNode[] {
    const graph = this.getGraph();
    return Array.from(graph.nodes.values()).filter(predicate);
  }

  /**
   * Search edges by properties
   */
  searchEdges(predicate: (edge: GraphEdge) => boolean): GraphEdge[] {
    const graph = this.getGraph();
    return graph.edges.filter(predicate);
  }
}