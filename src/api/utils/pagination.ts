/**
 * @file Pagination utilities for API responses.
 *       Provides comprehensive pagination support for large result sets.
 */

import { Request } from 'express';
import { PaginationMetadata } from '../types/responses';

/**
 * Pagination configuration interface.
 */
export interface PaginationConfig {
  defaultLimit: number;
  maxLimit: number;
  defaultPage: number;
}

/**
 * Pagination parameters extracted from request.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Pagination result interface.
 */
export interface PaginationResult<T> {
  items: T[];
  metadata: PaginationMetadata;
  hasMore: boolean;
}

/**
 * Cursor-based pagination parameters.
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction: 'forward' | 'backward';
}

/**
 * Cursor pagination result interface.
 */
export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor?: string;
  previousCursor?: string;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Default pagination configuration.
 */
const DEFAULT_CONFIG: PaginationConfig = {
  defaultLimit: 10,
  maxLimit: 100,
  defaultPage: 1,
};

/**
 * Pagination utility class for handling different pagination strategies.
 */
export class PaginationUtil {
  private config: PaginationConfig;

  constructor(config: Partial<PaginationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extracts pagination parameters from request query.
   */
  extractParams(req: Request): PaginationParams {
    const query = req.query;
    
    // Parse page number
    let page = this.config.defaultPage;
    if (query.page) {
      const parsedPage = parseInt(query.page as string, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        page = parsedPage;
      }
    }

    // Parse limit
    let limit = this.config.defaultLimit;
    if (query.limit) {
      const parsedLimit = parseInt(query.limit as string, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, this.config.maxLimit);
      }
    }

    // Handle offset parameter (alternative to page)
    let offset = (page - 1) * limit;
    if (query.offset) {
      const parsedOffset = parseInt(query.offset as string, 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
        page = Math.floor(offset / limit) + 1;
      }
    }

    return { page, limit, offset };
  }

  /**
   * Creates pagination metadata.
   */
  createMetadata(
    params: PaginationParams,
    totalResults?: number
  ): PaginationMetadata {
    const { page, limit, offset } = params;
    const totalPages = totalResults ? Math.ceil(totalResults / limit) : undefined;
    const hasNextPage = totalPages ? page < totalPages : false;
    const hasPreviousPage = page > 1;

    return {
      currentPage: page,
      totalPages,
      pageSize: limit,
      totalResults,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : undefined,
      previousPage: hasPreviousPage ? page - 1 : undefined,
      offset,
    };
  }

  /**
   * Paginates an array of items.
   */
  paginate<T>(
    items: T[],
    params: PaginationParams,
    totalCount?: number
  ): PaginationResult<T> {
    const { offset, limit } = params;
    const paginatedItems = items.slice(offset, offset + limit);
    const total = totalCount || items.length;
    const metadata = this.createMetadata(params, total);

    return {
      items: paginatedItems,
      metadata,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Creates pagination info for database queries.
   */
  getDatabaseParams(params: PaginationParams): { limit: number; offset: number } {
    return {
      limit: params.limit,
      offset: params.offset,
    };
  }

  /**
   * Validates pagination parameters.
   */
  validateParams(params: Partial<PaginationParams>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.page !== undefined) {
      if (!Number.isInteger(params.page) || params.page < 1) {
        errors.push('Page must be a positive integer');
      }
    }

    if (params.limit !== undefined) {
      if (!Number.isInteger(params.limit) || params.limit < 1) {
        errors.push('Limit must be a positive integer');
      } else if (params.limit > this.config.maxLimit) {
        errors.push(`Limit cannot exceed ${this.config.maxLimit}`);
      }
    }

    if (params.offset !== undefined) {
      if (!Number.isInteger(params.offset) || params.offset < 0) {
        errors.push('Offset must be a non-negative integer');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Cursor-based pagination utility for large datasets.
 */
export class CursorPagination {
  /**
   * Extracts cursor pagination parameters from request.
   */
  static extractParams(req: Request, defaultLimit: number = 10): CursorPaginationParams {
    const query = req.query;
    
    const cursor = query.cursor as string;
    
    let limit = defaultLimit;
    if (query.limit) {
      const parsedLimit = parseInt(query.limit as string, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        limit = parsedLimit;
      }
    }

    const direction = (query.direction as string) === 'backward' ? 'backward' : 'forward';

    return { cursor, limit, direction };
  }

  /**
   * Encodes a cursor from an object.
   */
  static encodeCursor(data: Record<string, any>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Decodes a cursor back to an object.
   */
  static decodeCursor(cursor: string): Record<string, any> | null {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Creates a cursor pagination result.
   */
  static createResult<T>(
    items: T[],
    limit: number,
    getCursorData: (item: T) => Record<string, any>
  ): CursorPaginationResult<T> {
    const hasNext = items.length > limit;
    const hasPrevious = false; // This would be determined by your query logic
    
    // Remove extra item if we have more than requested
    const resultItems = hasNext ? items.slice(0, limit) : items;
    
    let nextCursor: string | undefined;
    let previousCursor: string | undefined;

    if (hasNext && resultItems.length > 0) {
      const lastItem = resultItems[resultItems.length - 1];
      nextCursor = this.encodeCursor(getCursorData(lastItem));
    }

    if (hasPrevious && resultItems.length > 0) {
      const firstItem = resultItems[0];
      previousCursor = this.encodeCursor(getCursorData(firstItem));
    }

    return {
      items: resultItems,
      nextCursor,
      previousCursor,
      hasNext,
      hasPrevious,
    };
  }
}

/**
 * Search-specific pagination utility.
 */
export class SearchPagination extends PaginationUtil {
  constructor() {
    super({
      defaultLimit: 20,
      maxLimit: 100,
      defaultPage: 1,
    });
  }

  /**
   * Creates pagination for search results with relevance sorting.
   */
  paginateSearchResults<T>(
    results: T[],
    params: PaginationParams,
    totalCount?: number,
    searchMetadata?: {
      query: string;
      processingTime: number;
      totalIndexed: number;
    }
  ): PaginationResult<T> & { searchMetadata?: typeof searchMetadata } {
    const paginationResult = this.paginate(results, params, totalCount);
    
    return {
      ...paginationResult,
      searchMetadata,
    };
  }

  /**
   * Calculates relevance-based pagination offsets.
   */
  getRelevanceParams(
    params: PaginationParams,
    minRelevanceScore: number = 0.1
  ): { limit: number; offset: number; minScore: number } {
    return {
      ...this.getDatabaseParams(params),
      minScore: minRelevanceScore,
    };
  }
}

/**
 * Pagination link generator for HAL-style pagination.
 */
export class PaginationLinkGenerator {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  /**
   * Generates pagination links for HAL responses.
   */
  generateLinks(
    req: Request,
    metadata: PaginationMetadata,
    preserveQuery: boolean = true
  ): Record<string, { href: string }> {
    const links: Record<string, { href: string }> = {};
    const baseParams = new URLSearchParams();

    // Preserve existing query parameters
    if (preserveQuery) {
      Object.entries(req.query).forEach(([key, value]) => {
        if (key !== 'page' && key !== 'offset' && value !== undefined) {
          baseParams.set(key, String(value));
        }
      });
    }

    const path = req.path;

    // Self link
    baseParams.set('page', metadata.currentPage.toString());
    links.self = { href: `${this.baseUrl}${path}?${baseParams.toString()}` };

    // First page link
    baseParams.set('page', '1');
    links.first = { href: `${this.baseUrl}${path}?${baseParams.toString()}` };

    // Last page link (if total pages is known)
    if (metadata.totalPages) {
      baseParams.set('page', metadata.totalPages.toString());
      links.last = { href: `${this.baseUrl}${path}?${baseParams.toString()}` };
    }

    // Previous page link
    if (metadata.hasPreviousPage && metadata.previousPage) {
      baseParams.set('page', metadata.previousPage.toString());
      links.prev = { href: `${this.baseUrl}${path}?${baseParams.toString()}` };
    }

    // Next page link
    if (metadata.hasNextPage && metadata.nextPage) {
      baseParams.set('page', metadata.nextPage.toString());
      links.next = { href: `${this.baseUrl}${path}?${baseParams.toString()}` };
    }

    return links;
  }
}

/**
 * Default pagination utility instance.
 */
export const pagination = new PaginationUtil();

/**
 * Default search pagination utility instance.
 */
export const searchPagination = new SearchPagination();

/**
 * Utility functions for common pagination operations.
 */
export const paginationUtils = {
  /**
   * Quick pagination parameter extraction.
   */
  getParams: (req: Request) => pagination.extractParams(req),

  /**
   * Quick pagination for arrays.
   */
  paginate: <T>(items: T[], req: Request, total?: number) => {
    const params = pagination.extractParams(req);
    return pagination.paginate(items, params, total);
  },

  /**
   * Quick search pagination.
   */
  paginateSearch: <T>(items: T[], req: Request, total?: number) => {
    const params = searchPagination.extractParams(req);
    return searchPagination.paginate(items, params, total);
  },

  /**
   * Validates pagination query parameters.
   */
  validate: (req: Request) => {
    const params = pagination.extractParams(req);
    return pagination.validateParams(params);
  },
}; 
