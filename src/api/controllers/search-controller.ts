/**
 * @file Search controllers for all search endpoint types.
 *       Handles semantic, structural, git, hybrid, and comprehensive search requests.
 */

import { Request, Response, NextFunction } from 'express';
import { SearchService, SearchOptions, MetadataFilters } from '../../modules/search-service';
import { SQLiteClient } from '../../persistence/db-clients';
import { ConfigManager } from '../../config';
import { InMemoryCacheService } from '../services/cache-service';
import { ResultEnhancerService, EnhancedSearchResult } from '../services/result-enhancer';
import { formatResponse } from '../utils/response-formatter';
import { getLogger } from '../../utils/logger';
import { NodeType } from '../../types';
import { 
  handleSearchError, 
  handleCacheError
} from '../middleware/error-handling';
import { 
  ValidationError,
  APIErrors
} from '../errors/api-errors';
import { errorMonitoringService } from '../services/error-monitoring';

const logger = getLogger('SearchController');

/**
 * Search controller class handling all search endpoints.
 */
export class SearchController {
  private searchService: SearchService;
  private cacheService: InMemoryCacheService;
  private resultEnhancer: ResultEnhancerService;
  private sqliteClient: SQLiteClient;

  constructor(config: ConfigManager) {
    this.searchService = new SearchService(config);
    this.cacheService = new InMemoryCacheService({
      maxSize: 500,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
    });
    
    const dbConfig = config.getDatabaseConfig();
    this.sqliteClient = new SQLiteClient(dbConfig.sqlite.path);
    this.sqliteClient.connect();
    
    this.resultEnhancer = new ResultEnhancerService(this.sqliteClient);
  }

  /**
   * Initialize the search service.
   */
  async initialize(): Promise<void> {
    await this.searchService.initialize();
  }

  /**
   * Task 4: Semantic search endpoint.
   * GET /api/v1/search/semantic
   */
  async semanticSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        q: query,
        limit = '10',
        nodeTypes,
        minSimilarity = '0.1',
        includeMetadata = 'true'
      } = req.query;

      // Validate required parameters
      if (!query || typeof query !== 'string') {
        throw ValidationError.required('q', req.context?.requestId);
      }

      if (query.length > 500) {
        throw ValidationError.invalid('q', query, 'maximum 500 characters', req.context?.requestId);
      }

      // Parse and validate parameters
      const searchOptions: SearchOptions = {
        limit: Math.min(parseInt(limit as string, 10) || 10, 100),
        minSimilarity: Math.max(0, Math.min(1, parseFloat(minSimilarity as string) || 0.1)),
        includeMetadata: includeMetadata === 'true',
      };

      // Parse node types if provided
      if (nodeTypes && typeof nodeTypes === 'string') {
        const validNodeTypes: NodeType[] = ['CodeNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'TestNode', 'PullRequestNode'];
        const requestedTypes = nodeTypes.split(',').map(t => t.trim()) as NodeType[];
        searchOptions.nodeTypes = requestedTypes.filter(t => validNodeTypes.includes(t));
      }

      // Check cache first
      const cacheKey = this.cacheService.generateSearchKey('semantic', query, searchOptions);
      let cachedResult: EnhancedSearchResult[] | null = null;
      
      try {
        cachedResult = this.cacheService.get<EnhancedSearchResult[]>(cacheKey);
      } catch (error) {
        // Log cache error but don't fail the request
        logger.warn('Cache retrieval failed', {
          error: error instanceof Error ? error.message : String(error),
          requestId: req.context?.requestId,
        });
      }
      
      if (cachedResult) {
        logger.info('Semantic search cache hit', {
          query: query.substring(0, 50),
          resultCount: cachedResult.length,
          requestId: req.context?.requestId,
        });

        // Update performance metrics for cache hit
        errorMonitoringService.updatePerformanceMetrics(Date.now() - startTime, false);

        res.json(formatResponse.success(req, {
          results: cachedResult,
          totalResults: cachedResult.length,
          cached: true,
        }, startTime));
        return;
      }

      // Perform search
      logger.info('Performing semantic search', {
        query: query.substring(0, 50),
        options: searchOptions,
        requestId: req.context?.requestId,
      });

      let searchResults;
      try {
        searchResults = await this.searchService.semanticSearch(query, searchOptions);
      } catch (error) {
        throw handleSearchError(error, 'semantic', query, req.context?.requestId);
      }

      // Enhance results with context and metadata
      let enhancedResults;
      try {
        enhancedResults = await this.resultEnhancer.enhanceResults(searchResults, {
          includeContext: true,
          includeSyntaxHighlighting: false, // Keep it simple for now
          includeRelatedFiles: false,
          contextLines: 3,
        }, query);
      } catch (error) {
        logger.warn('Result enhancement failed, returning basic results', {
          error: error instanceof Error ? error.message : String(error),
          requestId: req.context?.requestId,
        });
        enhancedResults = searchResults as EnhancedSearchResult[];
      }

      // Cache the results
      try {
        this.cacheService.set(cacheKey, enhancedResults, 5 * 60 * 1000); // 5 minutes
      } catch (error) {
        // Log cache error but don't fail the request
        logger.warn('Cache storage failed', {
          error: error instanceof Error ? error.message : String(error),
          requestId: req.context?.requestId,
        });
      }

      const processingTime = Date.now() - startTime;

      // Record slow query if needed
      if (processingTime > 2000) { // 2 seconds threshold
        errorMonitoringService.recordSlowQuery(
          query,
          processingTime,
          '/api/v1/search/semantic',
          req.context?.requestId
        );
      }

      // Update performance metrics
      errorMonitoringService.updatePerformanceMetrics(processingTime, false);

      logger.info('Semantic search completed', {
        query: query.substring(0, 50),
        resultCount: enhancedResults.length,
        processingTime,
        requestId: req.context?.requestId,
      });

      res.json(formatResponse.success(req, {
        results: enhancedResults,
        totalResults: enhancedResults.length,
        cached: false,
      }, startTime));

    } catch (error) {
      logger.error('Semantic search failed', {
        query: req.query.q,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.context?.requestId,
      });

      next(error);
    }
  }

  /**
   * Task 5: Structural search endpoint.
   * GET /api/v1/search/structure
   */
  async structuralSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        q: query,
        language,
        type: elementType,
        filePath,
        limit = '10'
      } = req.query;

      // Validate required parameters
      if (!query || typeof query !== 'string') {
        res.status(400).json(formatResponse.error(
          req,
          'VALIDATION_ERROR',
          'Query parameter "q" is required',
          { field: 'q', value: query }
        ));
        return;
      }

      const searchLimit = Math.min(parseInt(limit as string, 10) || 10, 100);

      // Check cache first
      const cacheKey = this.cacheService.generateSearchKey('structural', query, {
        language,
        elementType,
        filePath,
        limit: searchLimit,
      });
      const cachedResult = this.cacheService.get<EnhancedSearchResult[]>(cacheKey);
      
      if (cachedResult) {
        logger.info('Structural search cache hit', {
          query: query.substring(0, 50),
          resultCount: cachedResult.length,
          requestId: req.context?.requestId,
        });

        res.json(formatResponse.success(req, {
          results: cachedResult,
          totalResults: cachedResult.length,
          cached: true,
        }, startTime));
        return;
      }

      // Perform structural search using existing searchCodeByText method
      logger.info('Performing structural search', {
        query: query.substring(0, 50),
        language,
        elementType,
        filePath,
        requestId: req.context?.requestId,
      });

      // Use the existing searchCodeByText method with language filter
      const searchResults = await (this.searchService as any).searchCodeByText(query, {
        limit: searchLimit * 2, // Get more results for filtering
        language: language as string,
      });

      // Apply additional filters
      let filteredResults = searchResults;

      // Filter by file path if specified
      if (filePath && typeof filePath === 'string') {
        filteredResults = filteredResults.filter((result: any) => 
          result.node.properties.filePath?.includes(filePath)
        );
      }

      // Filter by element type if specified
      if (elementType && typeof elementType === 'string') {
        filteredResults = filteredResults.filter((result: any) => {
          const name = result.node.properties.name?.toLowerCase() || '';
          const signature = result.node.properties.signature?.toLowerCase() || '';
          
          switch (elementType.toLowerCase()) {
            case 'function':
              return signature.includes('function') || signature.includes('def ') || signature.includes('func ');
            case 'class':
              return signature.includes('class ') || name.includes('class');
            case 'interface':
              return signature.includes('interface ');
            case 'variable':
              return signature.includes('const ') || signature.includes('let ') || signature.includes('var ');
            default:
              return true;
          }
        });
      }

      // Limit final results
      filteredResults = filteredResults.slice(0, searchLimit);

      // Enhance results with AST metadata and context
      const enhancedResults = await this.resultEnhancer.enhanceResults(filteredResults, {
        includeContext: true,
        includeSyntaxHighlighting: true, // Include syntax highlighting for code
        includeRelatedFiles: true,
        contextLines: 5, // More context for structural search
      });

      // Cache the results
      this.cacheService.set(cacheKey, enhancedResults, 10 * 60 * 1000); // 10 minutes (structural search is more stable)

      logger.info('Structural search completed', {
        query: query.substring(0, 50),
        resultCount: enhancedResults.length,
        processingTime: Date.now() - startTime,
        requestId: req.context?.requestId,
      });

      res.json(formatResponse.success(req, {
        results: enhancedResults,
        totalResults: enhancedResults.length,
        cached: false,
        filters: {
          language,
          elementType,
          filePath,
        },
      }, startTime));

    } catch (error) {
      logger.error('Structural search failed', {
        query: req.query.q,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.context?.requestId,
      });

      next(error);
    }
  }

  /**
   * Task 6: Git history search endpoint.
   * GET /api/v1/search/git
   */
  async gitSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        q: query,
        author,
        dateFrom,
        dateTo,
        limit = '10'
      } = req.query;

      // Validate required parameters
      if (!query || typeof query !== 'string') {
        res.status(400).json(formatResponse.error(
          req,
          'VALIDATION_ERROR',
          'Query parameter "q" is required',
          { field: 'q', value: query }
        ));
        return;
      }

      const searchLimit = Math.min(parseInt(limit as string, 10) || 10, 100);

      // Validate date range if provided
      let dateRange: { start: string; end: string } | undefined;
      if (dateFrom || dateTo) {
        try {
          const start = dateFrom ? new Date(dateFrom as string).toISOString() : new Date('1970-01-01').toISOString();
          const end = dateTo ? new Date(dateTo as string).toISOString() : new Date().toISOString();
          dateRange = { start, end };
        } catch (error) {
          res.status(400).json(formatResponse.error(
            req,
            'VALIDATION_ERROR',
            'Invalid date format. Use ISO date format (YYYY-MM-DD)',
            { dateFrom, dateTo }
          ));
          return;
        }
      }

      // Check cache first
      const cacheKey = this.cacheService.generateSearchKey('git', query, {
        author,
        dateRange,
        limit: searchLimit,
      });
      const cachedResult = this.cacheService.get<EnhancedSearchResult[]>(cacheKey);
      
      if (cachedResult) {
        logger.info('Git search cache hit', {
          query: query.substring(0, 50),
          resultCount: cachedResult.length,
          requestId: req.context?.requestId,
        });

        res.json(formatResponse.success(req, {
          results: cachedResult,
          totalResults: cachedResult.length,
          cached: true,
        }, startTime));
        return;
      }

      // Perform git search using existing searchCommits method
      logger.info('Performing git search', {
        query: query.substring(0, 50),
        author,
        dateRange,
        requestId: req.context?.requestId,
      });

      const searchResults = await this.searchService.searchCommits(
        query,
        author as string,
        dateRange,
        { limit: searchLimit }
      );

      // Enhance results with commit metadata and diff summaries
      const enhancedResults = await this.resultEnhancer.enhanceResults(searchResults, {
        includeContext: true,
        includeSyntaxHighlighting: false,
        includeRelatedFiles: true,
        contextLines: 0, // No code context for commits
      });

      // Add git-specific enhancements
      const gitEnhancedResults = await Promise.all(
        enhancedResults.map(async result => {
          if (result.node.type === 'CommitNode') {
            // Get affected files for this commit
            const affectedFiles = await this.getCommitAffectedFiles(result.node.id);
            
            return {
              ...result,
              context: {
                ...result.context,
                affectedFiles,
              },
              metadata: {
                ...result.metadata,
                commitHash: result.node.properties.hash,
                commitDate: result.node.properties.date,
                diffSummary: result.node.properties.diffSummary,
              },
            };
          }
          return result;
        })
      );

      // Cache the results
      this.cacheService.set(cacheKey, gitEnhancedResults, 15 * 60 * 1000); // 15 minutes (git history is stable)

      logger.info('Git search completed', {
        query: query.substring(0, 50),
        resultCount: gitEnhancedResults.length,
        processingTime: Date.now() - startTime,
        requestId: req.context?.requestId,
      });

      res.json(formatResponse.success(req, {
        results: gitEnhancedResults,
        totalResults: gitEnhancedResults.length,
        cached: false,
        filters: {
          author,
          dateFrom,
          dateTo,
        },
      }, startTime));

    } catch (error) {
      logger.error('Git search failed', {
        query: req.query.q,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.context?.requestId,
      });

      next(error);
    }
  }

  /**
   * Task 7: Hybrid search endpoint.
   * GET /api/v1/search/hybrid
   */
  async hybridSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        q: query,
        filters: filtersParam,
        limit = '10',
        weights: weightsParam
      } = req.query;

      // Validate required parameters
      if (!query || typeof query !== 'string') {
        res.status(400).json(formatResponse.error(
          req,
          'VALIDATION_ERROR',
          'Query parameter "q" is required',
          { field: 'q', value: query }
        ));
        return;
      }

      const searchLimit = Math.min(parseInt(limit as string, 10) || 10, 100);

      // Parse filters if provided
      let metadataFilters: MetadataFilters = {};
      if (filtersParam && typeof filtersParam === 'string') {
        try {
          metadataFilters = JSON.parse(filtersParam);
        } catch (error) {
          res.status(400).json(formatResponse.error(
            req,
            'VALIDATION_ERROR',
            'Invalid filters format. Must be valid JSON',
            { filters: filtersParam }
          ));
          return;
        }
      }

      // Parse weights if provided
      let searchWeights = { semantic: 0.4, structural: 0.3, temporal: 0.3 };
      if (weightsParam && typeof weightsParam === 'string') {
        try {
          const weights = JSON.parse(weightsParam);
          if (weights.semantic !== undefined) searchWeights.semantic = Math.max(0, Math.min(1, weights.semantic));
          if (weights.structural !== undefined) searchWeights.structural = Math.max(0, Math.min(1, weights.structural));
          if (weights.temporal !== undefined) searchWeights.temporal = Math.max(0, Math.min(1, weights.temporal));
          
          // Normalize weights to sum to 1
          const total = searchWeights.semantic + searchWeights.structural + searchWeights.temporal;
          if (total > 0) {
            searchWeights.semantic /= total;
            searchWeights.structural /= total;
            searchWeights.temporal /= total;
          }
        } catch (error) {
          res.status(400).json(formatResponse.error(
            req,
            'VALIDATION_ERROR',
            'Invalid weights format. Must be valid JSON with numeric values',
            { weights: weightsParam }
          ));
          return;
        }
      }

      // Check cache first
      const cacheKey = this.cacheService.generateSearchKey('hybrid', query, {
        filters: metadataFilters,
        weights: searchWeights,
        limit: searchLimit,
      });
      const cachedResult = this.cacheService.get<EnhancedSearchResult[]>(cacheKey);
      
      if (cachedResult) {
        logger.info('Hybrid search cache hit', {
          query: query.substring(0, 50),
          resultCount: cachedResult.length,
          requestId: req.context?.requestId,
        });

        res.json(formatResponse.success(req, {
          results: cachedResult,
          totalResults: cachedResult.length,
          cached: true,
          weights: searchWeights,
        }, startTime));
        return;
      }

      // Perform hybrid search using existing hybridSearch method
      logger.info('Performing hybrid search', {
        query: query.substring(0, 50),
        filters: metadataFilters,
        weights: searchWeights,
        requestId: req.context?.requestId,
      });

      const searchResults = await this.searchService.hybridSearch(
        query,
        metadataFilters,
        { limit: searchLimit }
      );

      // Enhance results with comprehensive context
      const enhancedResults = await this.resultEnhancer.enhanceResults(searchResults, {
        includeContext: true,
        includeSyntaxHighlighting: true,
        includeRelatedFiles: true,
        contextLines: 3,
      });

      // Add search dimension indicators to results
      const hybridEnhancedResults = enhancedResults.map(result => ({
        ...result,
        metadata: {
          ...result.metadata,
          searchDimensions: this.identifySearchDimensions(result, query),
          hybridScore: result.similarity,
        },
      }));

      // Cache the results
      this.cacheService.set(cacheKey, hybridEnhancedResults, 8 * 60 * 1000); // 8 minutes

      logger.info('Hybrid search completed', {
        query: query.substring(0, 50),
        resultCount: hybridEnhancedResults.length,
        processingTime: Date.now() - startTime,
        requestId: req.context?.requestId,
      });

      res.json(formatResponse.success(req, {
        results: hybridEnhancedResults,
        totalResults: hybridEnhancedResults.length,
        cached: false,
        weights: searchWeights,
        filters: metadataFilters,
      }, startTime));

    } catch (error) {
      logger.error('Hybrid search failed', {
        query: req.query.q,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.context?.requestId,
      });

      next(error);
    }
  }

  /**
   * Task 8: Comprehensive search endpoint.
   * GET /api/v1/search/comprehensive
   */
  async comprehensiveSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        q: query,
        limit = '20',
        includeTypes
      } = req.query;

      // Validate required parameters
      if (!query || typeof query !== 'string') {
        res.status(400).json(formatResponse.error(
          req,
          'VALIDATION_ERROR',
          'Query parameter "q" is required',
          { field: 'q', value: query }
        ));
        return;
      }

      const searchLimit = Math.min(parseInt(limit as string, 10) || 20, 100);

      // Parse include types if provided
      let nodeTypes: NodeType[] | undefined;
      if (includeTypes && typeof includeTypes === 'string') {
        const validNodeTypes: NodeType[] = ['CodeNode', 'FileNode', 'DirectoryNode', 'CommitNode', 'TestNode', 'PullRequestNode'];
        const requestedTypes = includeTypes.split(',').map(t => t.trim()) as NodeType[];
        nodeTypes = requestedTypes.filter(t => validNodeTypes.includes(t));
      }

      // Check cache first
      const cacheKey = this.cacheService.generateSearchKey('comprehensive', query, {
        limit: searchLimit,
        includeTypes: nodeTypes,
      });
      const cachedResult = this.cacheService.get<any>(cacheKey);
      
      if (cachedResult) {
        logger.info('Comprehensive search cache hit', {
          query: query.substring(0, 50),
          resultCount: cachedResult.results.length,
          requestId: req.context?.requestId,
        });

        res.json(formatResponse.success(req, cachedResult, startTime));
        return;
      }

      // Perform comprehensive search using existing method
      logger.info('Performing comprehensive search', {
        query: query.substring(0, 50),
        limit: searchLimit,
        includeTypes: nodeTypes,
        requestId: req.context?.requestId,
      });

      const searchResults = await this.searchService.comprehensiveSearch(query, {
        limit: searchLimit,
        nodeTypes,
      });

      // Enhance results with full context
      const enhancedResults = await this.resultEnhancer.enhanceResults(searchResults, {
        includeContext: true,
        includeSyntaxHighlighting: true,
        includeRelatedFiles: true,
        contextLines: 3,
      });

      // Generate facets from results
      const facets = this.generateFacets(enhancedResults);

      // Generate search suggestions
      const suggestions = this.generateSuggestions(query, enhancedResults);

      // Categorize results by type and search dimension
      const categories = this.categorizeResults(enhancedResults);

      const comprehensiveResponse = {
        results: enhancedResults,
        facets,
        suggestions,
        categories,
        totalResults: enhancedResults.length,
        cached: false,
      };

      // Cache the results
      this.cacheService.set(cacheKey, comprehensiveResponse, 10 * 60 * 1000); // 10 minutes

      logger.info('Comprehensive search completed', {
        query: query.substring(0, 50),
        resultCount: enhancedResults.length,
        facetCount: Object.keys(facets).length,
        suggestionCount: suggestions.length,
        processingTime: Date.now() - startTime,
        requestId: req.context?.requestId,
      });

      res.json(formatResponse.success(req, comprehensiveResponse, startTime));

    } catch (error) {
      logger.error('Comprehensive search failed', {
        query: req.query.q,
        error: error instanceof Error ? error.message : String(error),
        requestId: req.context?.requestId,
      });

      next(error);
    }
  }

  /**
   * Helper method to identify which search dimensions matched for a result.
   */
  private identifySearchDimensions(result: EnhancedSearchResult, query: string): string[] {
    const dimensions: string[] = [];
    const queryLower = query.toLowerCase();
    
    // Check semantic dimension (name/signature match)
    if (result.node.properties.name?.toLowerCase().includes(queryLower) ||
        result.node.properties.signature?.toLowerCase().includes(queryLower)) {
      dimensions.push('semantic');
    }
    
    // Check structural dimension (code structure)
    if (result.node.type === 'CodeNode') {
      dimensions.push('structural');
    }
    
    // Check temporal dimension (recent commits)
    if (result.node.type === 'CommitNode' || result.metadata?.lastModified) {
      dimensions.push('temporal');
    }
    
    return dimensions;
  }

  /**
   * Generate facets from search results.
   */
  private generateFacets(results: EnhancedSearchResult[]): Record<string, Array<{ name: string; count: number }>> {
    const facets: Record<string, Map<string, number>> = {
      languages: new Map(),
      nodeTypes: new Map(),
      fileTypes: new Map(),
      authors: new Map(),
    };

    results.forEach(result => {
      // Language facet
      if (result.metadata?.language) {
        facets.languages.set(
          result.metadata.language,
          (facets.languages.get(result.metadata.language) || 0) + 1
        );
      }

      // Node type facet
      facets.nodeTypes.set(
        result.node.type,
        (facets.nodeTypes.get(result.node.type) || 0) + 1
      );

      // File type facet
      if (result.context?.filePath) {
        const ext = result.context.filePath.split('.').pop() || 'unknown';
        facets.fileTypes.set(ext, (facets.fileTypes.get(ext) || 0) + 1);
      }

      // Author facet
      if (result.metadata?.author) {
        facets.authors.set(
          result.metadata.author,
          (facets.authors.get(result.metadata.author) || 0) + 1
        );
      }
    });

    // Convert maps to arrays and sort by count
    const formattedFacets: Record<string, Array<{ name: string; count: number }>> = {};
    
    Object.entries(facets).forEach(([key, map]) => {
      formattedFacets[key] = Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Limit to top 10
    });

    return formattedFacets;
  }

  /**
   * Generate search suggestions based on results.
   */
  private generateSuggestions(query: string, results: EnhancedSearchResult[]): string[] {
    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // Extract suggestions from top results
    results.slice(0, 5).forEach(result => {
      const name = result.node.properties.name;
      if (name && name.toLowerCase() !== queryLower) {
        suggestions.add(name);
      }

      // Add language-specific suggestions
      if (result.metadata?.language) {
        suggestions.add(`${query} in ${result.metadata.language}`);
      }

      // Add file-based suggestions
      if (result.context?.fileName) {
        const baseName = result.context.fileName.split('.')[0];
        if (baseName.toLowerCase() !== queryLower) {
          suggestions.add(baseName);
        }
      }
    });

    return Array.from(suggestions).slice(0, 5);
  }

  /**
   * Categorize results by type and search dimension.
   */
  private categorizeResults(results: EnhancedSearchResult[]): Record<string, EnhancedSearchResult[]> {
    const categories: Record<string, EnhancedSearchResult[]> = {
      code: [],
      files: [],
      commits: [],
      tests: [],
      other: [],
    };

    results.forEach(result => {
      switch (result.node.type) {
        case 'CodeNode':
          categories.code.push(result);
          break;
        case 'FileNode':
          categories.files.push(result);
          break;
        case 'CommitNode':
          categories.commits.push(result);
          break;
        case 'TestNode':
          categories.tests.push(result);
          break;
        default:
          categories.other.push(result);
      }
    });

    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });

    return categories;
  }

  /**
   * Helper method to get affected files for a commit.
   */
  private async getCommitAffectedFiles(commitId: string): Promise<string[]> {
    try {
      const files = this.sqliteClient.all(`
        SELECT f.file_path 
        FROM file_commits fc
        JOIN files f ON fc.file_id = f.file_id
        WHERE fc.commit_id = ?
        LIMIT 20
      `, [commitId]);

      return files.map((f: any) => f.file_path);
    } catch (error) {
      logger.debug('Failed to get affected files for commit', {
        commitId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

/**
 * Create and export search controller instance.
 */
export function createSearchController(config: ConfigManager): SearchController {
  return new SearchController(config);
}
