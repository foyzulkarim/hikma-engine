/**
 * @file Utility exports for API server.
 *       Centralizes all utility imports for easy integration.
 */

// Response formatting utilities
export {
  ResponseFormatter,
  responseFormatter,
  formatResponse,
  timingMiddleware as responseTimingMiddleware,
  compressResponse,
  validateResponse,
  calculateResponseSize,
} from './response-formatter';

// Pagination utilities
export {
  PaginationUtil,
  CursorPagination,
  SearchPagination,
  PaginationLinkGenerator,
  pagination,
  searchPagination,
  paginationUtils,
} from './pagination';

// Timing and performance utilities
export {
  TimingUtil,
  RequestTimingManager,
  initializeTimingMiddleware,
  performanceLoggingMiddleware,
  metricsCollectionMiddleware,
  withTiming,
  PerformanceMetrics,
  responseHeaders,
} from './timing';

// Type exports
export type {
  PaginationConfig,
  PaginationParams,
  PaginationResult,
  CursorPaginationParams,
  CursorPaginationResult,
} from './pagination';

export type {
  PerformanceTiming,
  TimingContext,
} from './timing';

export type {
  ResponseMetadata,
  PaginationMetadata,
  BaseAPIResponse,
  SuccessAPIResponse,
  ErrorAPIResponse,
  APIResponse,
  SearchResultItem,
  SearchFacets,
  SearchSuggestions,
  SearchPerformance,
  SearchResponseData,
  HealthCheckData,
  APIInfoData,
  SemanticSearchData,
  StructuralSearchData,
  GitSearchData,
  HybridSearchData,
  ComprehensiveSearchData,
  CacheInfo,
  ExtendedResponseMetadata,
} from '../types/responses'; 
