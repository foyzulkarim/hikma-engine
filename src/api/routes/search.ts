/**
 * @file Search routes for all search endpoint types.
 *       Defines routes for semantic, structural, git, hybrid, and comprehensive search.
 */

import { Router } from 'express';
import { SearchController } from '../controllers/search-controller';
import { ConfigManager } from '../../config';
import {
  validateSemanticSearch,
  validateStructuralSearch,
  validateGitSearch,
  validateHybridSearch,
  validateComprehensiveSearch,
  asyncErrorHandler,
} from '../middleware';

/**
 * Creates the search router with all search endpoints.
 */
export function createSearchRouter(config: ConfigManager): Router {
  const router = Router();
  const searchController = new SearchController(config);

  // Initialize the search controller
  searchController.initialize().catch(error => {
    console.error('Failed to initialize search controller:', error);
  });

  /**
   * Task 4: Semantic search endpoint
   * GET /api/v1/search/semantic
   * 
   * Query Parameters:
   * - q: string (required) - Search query
   * - limit: number (optional, default: 10) - Maximum results
   * - nodeTypes: string[] (optional) - Filter by node types (comma-separated)
   * - minSimilarity: number (optional, default: 0.1) - Minimum similarity threshold
   * - includeMetadata: boolean (optional, default: true) - Include metadata in results
   */
  router.get(
    '/semantic',
    validateSemanticSearch,
    asyncErrorHandler(searchController.semanticSearch.bind(searchController))
  );

  /**
   * Task 5: Structural search endpoint
   * GET /api/v1/search/structure
   * 
   * Query Parameters:
   * - q: string (required) - Search query
   * - language: string (optional) - Programming language filter
   * - type: string (optional) - Code element type (function, class, interface, variable)
   * - filePath: string (optional) - File path pattern
   * - limit: number (optional, default: 10) - Maximum results
   */
  router.get(
    '/structure',
    validateStructuralSearch,
    asyncErrorHandler(searchController.structuralSearch.bind(searchController))
  );

  /**
   * Task 6: Git history search endpoint
   * GET /api/v1/search/git
   * 
   * Query Parameters:
   * - q: string (required) - Search query
   * - author: string (optional) - Author filter
   * - dateFrom: string (optional) - Start date (ISO format)
   * - dateTo: string (optional) - End date (ISO format)
   * - limit: number (optional, default: 10) - Maximum results
   */
  router.get(
    '/git',
    validateGitSearch,
    asyncErrorHandler(searchController.gitSearch.bind(searchController))
  );

  /**
   * Task 7: Hybrid search endpoint
   * GET /api/v1/search/hybrid
   * 
   * Query Parameters:
   * - q: string (required) - Search query
   * - filters: string (optional) - JSON string of metadata filters
   * - weights: string (optional) - JSON string of search dimension weights
   * - limit: number (optional, default: 10) - Maximum results
   */
  router.get(
    '/hybrid',
    validateHybridSearch,
    asyncErrorHandler(searchController.hybridSearch.bind(searchController))
  );

  /**
   * Task 8: Comprehensive search endpoint
   * GET /api/v1/search/comprehensive
   * 
   * Query Parameters:
   * - q: string (required) - Search query
   * - limit: number (optional, default: 20) - Maximum results
   * - includeTypes: string[] (optional) - Node types to include (comma-separated)
   */
  router.get(
    '/comprehensive',
    validateComprehensiveSearch,
    asyncErrorHandler(searchController.comprehensiveSearch.bind(searchController))
  );

  /**
   * Search statistics endpoint
   * GET /api/v1/search/stats
   */
  router.get('/stats', asyncErrorHandler(async (req, res) => {
    // Get cache statistics
    const cacheStats = (searchController as any).cacheService.getStats();
    
    res.json({
      success: true,
      data: {
        cache: cacheStats,
        endpoints: {
          semantic: '/api/v1/search/semantic',
          structural: '/api/v1/search/structure',
          git: '/api/v1/search/git',
          hybrid: '/api/v1/search/hybrid',
          comprehensive: '/api/v1/search/comprehensive',
        },
        supportedNodeTypes: [
          'CodeNode',
          'FileNode',
          'CommitNode',
          'TestNode',
          'PullRequestNode',
        ],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context?.requestId || 'unknown',
      },
    });
  }));

  return router;
}
