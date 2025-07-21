import { Database } from 'better-sqlite3';
import { SQLiteClient } from './connection';

export interface DatabaseStats {
  totalFiles: number;
  totalCodeNodes: number;
  totalCommits: number;
  totalTestNodes: number;
  totalPullRequests: number;
  totalFunctions: number;
  lastIndexed: string | null;
  indexingDuration: number | null;
  dbSizeKb: number;
}

export async function getDatabaseStats(db: Database): Promise<DatabaseStats> {
  try {
    const [
      fileCount,
      codeCount,
      commitCount,
      testCount,
      prCount,
      functionCount,
    ] = await Promise.all([
      (db.prepare('SELECT COUNT(*) as count FROM files').get() as {
        count: number;
      } | undefined)?.count || 0,
      (db.prepare('SELECT COUNT(*) as count FROM code_nodes').get() as {
        count: number;
      } | undefined)?.count || 0,
      (db.prepare('SELECT COUNT(*) as count FROM commits').get() as {
        count: number;
      } | undefined)?.count || 0,
      (db.prepare('SELECT COUNT(*) as count FROM test_nodes').get() as {
        count: number;
      } | undefined)?.count || 0,
      (db.prepare('SELECT COUNT(*) as count FROM pull_requests').get() as {
        count: number;
      } | undefined)?.count || 0,
      (db.prepare('SELECT COUNT(*) as count FROM functions').get() as {
        count: number;
      } | undefined)?.count || 0,
    ]);

    // Get last indexed information
    const lastIndexedResult = db
      .prepare('SELECT value FROM indexing_state WHERE key = ?')
      .get('last_indexed_commit') as { value: string } | undefined;
    const lastIndexed = lastIndexedResult?.value || null;

    // Get indexing duration (placeholder for now)
    const indexingDuration = null;

    // Calculate database size
    const dbPath = (db as any).name;
    let dbSizeKb = 0;
    try {
      const stats = require('fs').statSync(dbPath);
      dbSizeKb = Math.round(stats.size / 1024);
    } catch (error) {
      // Database size unavailable
    }

    return {
      totalFiles: fileCount,
      totalCodeNodes: codeCount,
      totalCommits: commitCount,
      totalTestNodes: testCount,
      totalPullRequests: prCount,
      totalFunctions: functionCount,
      lastIndexed,
      indexingDuration,
      dbSizeKb,
    };
  } catch (error) {
    throw new Error(`Failed to get database stats: ${error}`);
  }
}

export async function getEnhancedGraphStats(
  client: SQLiteClient,
): Promise<{
  nodeCount: number;
  edgeCount: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  repoBreakdown: Record<string, number>;
  fileLanguages: Record<string, number>;
  functionComplexity: {
    avgLoc: number;
    maxLoc: number;
    totalFunctions: number;
  };
}> {
  const db = client.getDb();
  const nodeCount =
    (db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get() as {
      count: number;
    } | undefined)?.count || 0;
  const edgeCount =
    (db.prepare('SELECT COUNT(*) as count FROM graph_edges').get() as {
      count: number;
    } | undefined)?.count || 0;
  const nodeTypeResults = db
    .prepare('SELECT node_type, COUNT(*) as count FROM graph_nodes GROUP BY node_type')
    .all() as Array<{ node_type: string; count: number }>;
  const nodeTypes: Record<string, number> = {};
  nodeTypeResults.forEach((row) => {
    nodeTypes[row.node_type] = row.count;
  });
  const edgeTypeResults = db
    .prepare('SELECT edge_type, COUNT(*) as count FROM graph_edges GROUP BY edge_type')
    .all() as Array<{ edge_type: string; count: number }>;
  const edgeTypes: Record<string, number> = {};
  edgeTypeResults.forEach((row) => {
    edgeTypes[row.edge_type] = row.count;
  });
  const repoResults = db
    .prepare(
      'SELECT repo_id, COUNT(*) as count FROM graph_nodes WHERE repo_id IS NOT NULL GROUP BY repo_id',
    )
    .all() as Array<{ repo_id: string; count: number }>;
  const repoBreakdown: Record<string, number> = {};
  repoResults.forEach((row) => {
    repoBreakdown[row.repo_id] = row.count;
  });
  const langResults = db
    .prepare(
      `
    SELECT JSON_EXTRACT(properties, '$.language') as language, COUNT(*) as count
    FROM graph_nodes
    WHERE node_type = 'File' AND JSON_EXTRACT(properties, '$.language') IS NOT NULL
    GROUP BY JSON_EXTRACT(properties, '$.language')
  `,
    )
    .all() as Array<{ language: string; count: number }>;
  const fileLanguages: Record<string, number> = {};
  langResults.forEach((row) => {
    fileLanguages[row.language] = row.count;
  });
  const funcStats = db
    .prepare(
      `
    SELECT
      AVG(JSON_EXTRACT(properties, '$.loc')) as avg_loc,
      MAX(JSON_EXTRACT(properties, '$.loc')) as max_loc,
      COUNT(*) as total_functions
    FROM graph_nodes
    WHERE node_type IN ('Function', 'ArrowFunction')
  `,
    )
    .get() as
    | { avg_loc: number; max_loc: number; total_functions: number }
    | undefined;

  const functionComplexity = {
    avgLoc: funcStats?.avg_loc || 0,
    maxLoc: funcStats?.max_loc || 0,
    totalFunctions: funcStats?.total_functions || 0,
  };

  return {
    nodeCount,
    edgeCount,
    nodeTypes,
    edgeTypes,
    repoBreakdown,
    fileLanguages,
    functionComplexity,
  };
}
