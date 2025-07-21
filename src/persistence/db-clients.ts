// Compatibility layer for old db-clients imports
// This provides the old interface using the new SQLiteClient

import { SQLiteClient as NewSQLiteClient } from './db/connection';

/**
 * Legacy SQLiteClient wrapper that provides backward compatibility
 * while using the new architecture underneath
 */
export class SQLiteClient extends NewSQLiteClient {
  // Add any legacy methods that are still needed
  
  // Batch operations for backward compatibility
  async batchInsertFiles(files: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    this.transaction(() => {
      for (const file of files) {
        try {
          this.run(
            `INSERT OR REPLACE INTO files (id, repo_id, file_path, file_name, file_extension, language, size_kb, content_hash, file_type, ai_summary, imports, exports, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              file.id,
              file.repoId,
              file.filePath,
              file.fileName,
              file.fileExtension || null,
              file.language || null,
              file.sizeKb || null,
              file.contentHash || null,
              file.fileType || null,
              file.aiSummary || null,
              file.imports ? JSON.stringify(file.imports) : null,
              file.exports ? JSON.stringify(file.exports) : null
            ]
          );
          success++;
        } catch (error) {
          failed++;
          errors.push(`Failed to insert file ${file.id}: ${error}`);
        }
      }
    });
    
    return { success, failed, errors };
  }
  
  // Add other batch methods as needed
  async batchInsertRepositories(repos: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    this.transaction(() => {
      for (const repo of repos) {
        try {
          this.run(
            `INSERT OR REPLACE INTO repositories (id, repo_path, repo_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [repo.id, repo.repoPath, repo.repoName, repo.createdAt || new Date().toISOString(), repo.lastUpdated || new Date().toISOString()]
          );
          success++;
        } catch (error) {
          failed++;
          errors.push(`Failed to insert repository ${repo.id}: ${error}`);
        }
      }
    });
    
    return { success, failed, errors };
  }
  
  // Add other legacy methods as needed for compatibility
  async batchInsertCodeNodes(nodes: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertTestNodes(nodes: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertFunctions(funcs: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertCommits(commits: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertPullRequests(prs: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertEnhancedGraphNodes(nodes: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async batchInsertEnhancedGraphEdges(edges: any[]): Promise<{success: number, failed: number, errors: string[]}> {
    return { success: 0, failed: 0, errors: [] }; // Stub for now
  }
  
  async getEnhancedGraphStats(): Promise<any> {
    return {
      nodeCount: 0,
      edgeCount: 0,
      nodeTypes: {},
      edgeTypes: {},
      repoBreakdown: {},
      fileLanguages: {},
      functionComplexity: { avgLoc: 0, maxLoc: 0, totalFunctions: 0 }
    };
  }
  
  // Override getIndexingStats to include missing properties
  async getIndexingStats(): Promise<{
    totalFiles: number;
    totalCodeNodes: number;
    totalCommits: number;
    totalTestNodes: number;
    totalPullRequests: number;
    lastIndexed: string | null;
  }> {
    const baseStats = await super.getIndexingStats();
    return {
      ...baseStats,
      totalCodeNodes: 0, // TODO: Implement when we have code nodes
      totalTestNodes: 0, // TODO: Implement when we have test nodes
      totalPullRequests: 0, // TODO: Implement when we have pull requests
    };
  }
}

// Re-export other commonly used items
export * from './db/vector';
export * from './db/stats';
