/**
 * @file API response types and interfaces.
 *       Defines standardized response structures for all API endpoints.
 */

/**
 * Standard metadata included in all API responses.
 */
export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  processingTime?: number;
  path?: string;
  method?: string;
}

/**
 * Pagination metadata for paginated responses.
 */
export interface PaginationMetadata {
  currentPage: number;
  totalPages?: number;
  pageSize: number;
  totalResults?: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage?: number;
  previousPage?: number;
  offset?: number;
}

/**
 * Base API response structure.
 */
export interface BaseAPIResponse {
  success: boolean;
  meta: ResponseMetadata & {
    pagination?: PaginationMetadata;
  };
}

/**
 * Successful API response with data.
 */
export interface SuccessAPIResponse<T = any> extends BaseAPIResponse {
  success: true;
  data: T;
}

/**
 * Error API response structure.
 */
export interface ErrorAPIResponse extends BaseAPIResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string; // Only in development
  };
}

/**
 * Union type for all possible API responses.
 */
export type APIResponse<T = any> = SuccessAPIResponse<T> | ErrorAPIResponse;

/**
 * Search result item interface.
 */
export interface SearchResultItem {
  id: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'file' | 'commit' | 'module';
  title: string;
  snippet: string;
  filePath?: string;
  lineNumbers?: {
    start: number;
    end: number;
  };
  similarity: number;
  rank: number;
  metadata: {
    language?: string;
    author?: string;
    lastModified?: string;
    fileSize?: number;
    commitHash?: string;
    branch?: string;
  };
  context?: {
    beforeLines?: string[];
    afterLines?: string[];
    relatedFiles?: string[];
    dependencies?: string[];
  };
  highlights?: {
    title?: { start: number; end: number }[];
    snippet?: { start: number; end: number }[];
  };
}

/**
 * Search facets for result categorization.
 */
export interface SearchFacets {
  languages: Array<{ name: string; count: number }>;
  authors: Array<{ name: string; count: number }>;
  fileTypes: Array<{ name: string; count: number }>;
  frameworks: Array<{ name: string; count: number }>;
}

/**
 * Search suggestions for query enhancement.
 */
export interface SearchSuggestions {
  queryCorrections?: string[];
  relatedQueries?: string[];
  autoComplete?: string[];
}

/**
 * Performance metrics for search operations.
 */
export interface SearchPerformance {
  searchTime: number;
  indexTime?: number;
  totalTime: number;
  resultsProcessed: number;
  cacheHit: boolean;
}

/**
 * Search response data structure.
 */
export interface SearchResponseData {
  results: SearchResultItem[];
  facets?: SearchFacets;
  suggestions?: SearchSuggestions;
  performance: SearchPerformance;
  query: {
    original: string;
    processed?: string;
    filters?: Record<string, any>;
  };
}

/**
 * Health check response data.
 */
export interface HealthCheckData {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    memory: {
      status: 'healthy' | 'unhealthy';
      usage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
      };
      percentage: number;
    };
    cache?: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      hitRate?: number;
      error?: string;
    };
  };
}

/**
 * API information response data.
 */
export interface APIInfoData {
  name: string;
  version: string;
  description: string;
  endpoints: {
    health: string;
    api: string;
    search?: {
      semantic: string;
      structural: string;
      git: string;
      hybrid: string;
      comprehensive: string;
    };
  };
  features: string[];
  limits: {
    maxResults: number;
    maxQueryLength: number;
    rateLimits: {
      requests: number;
      window: string;
    };
  };
}

/**
 * Semantic search specific response data.
 */
export interface SemanticSearchData extends SearchResponseData {
  embedding?: {
    model: string;
    dimensions: number;
    similarity: 'cosine' | 'euclidean' | 'manhattan';
  };
}

/**
 * Structural search specific response data.
 */
export interface StructuralSearchData extends SearchResponseData {
  ast?: {
    parser: string;
    nodeTypes: string[];
    matchedPatterns: string[];
  };
}

/**
 * Git search specific response data.
 */
export interface GitSearchData extends SearchResponseData {
  repository?: {
    name: string;
    branch: string;
    lastCommit: string;
    totalCommits: number;
  };
}

/**
 * Hybrid search specific response data.
 */
export interface HybridSearchData extends SearchResponseData {
  weights: {
    semantic: number;
    structural: number;
    temporal: number;
  };
  dimensions: {
    semantic: { results: number; score: number };
    structural: { results: number; score: number };
    temporal: { results: number; score: number };
  };
}

/**
 * Comprehensive search specific response data.
 */
export interface ComprehensiveSearchData extends SearchResponseData {
  searchTypes: Array<{
    type: 'semantic' | 'structural' | 'git' | 'metadata';
    results: number;
    averageScore: number;
    processingTime: number;
  }>;
}

/**
 * Cache information for debugging.
 */
export interface CacheInfo {
  hit: boolean;
  key?: string;
  ttl?: number;
  size?: number;
  createdAt?: string;
}

/**
 * Extended response metadata with additional debugging information.
 */
export interface ExtendedResponseMetadata extends ResponseMetadata {
  cache?: CacheInfo;
  performance?: {
    dbQueryTime?: number;
    processingTime?: number;
    serializationTime?: number;
  };
  debug?: {
    queryPlan?: string;
    indexesUsed?: string[];
    warnings?: string[];
  };
} 
