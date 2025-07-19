/**
 * @file Response formatting utilities for consistent API responses.
 *       Provides standardized response formatting with metadata injection.
 */

import { Request } from 'express';
import {
  SuccessAPIResponse,
  ErrorAPIResponse,
  ResponseMetadata,
  PaginationMetadata,
  ExtendedResponseMetadata,
  CacheInfo,
} from '../types/responses';

/**
 * Response formatter configuration options.
 */
interface ResponseFormatterOptions {
  includeDebugInfo?: boolean;
  includeCacheInfo?: boolean;
  includePerformance?: boolean;
  includeTimestamp?: boolean;
}

/**
 * Creates standard response metadata from request context.
 */
function createResponseMetadata(
  req: Request,
  startTime?: number,
  options: ResponseFormatterOptions = {}
): ResponseMetadata {
  const processingTime = startTime ? Date.now() - startTime : undefined;

  const metadata: ResponseMetadata = {
    timestamp: new Date().toISOString(),
    requestId: req.context?.requestId || req.headers['x-request-id'] as string || 'unknown',
  };

  // Add optional metadata
  if (processingTime !== undefined) {
    metadata.processingTime = processingTime;
  }

  if (req.path) {
    metadata.path = req.path;
  }

  if (req.method) {
    metadata.method = req.method;
  }

  return metadata;
}

/**
 * Creates pagination metadata for paginated responses.
 */
function createPaginationMetadata(
  currentPage: number,
  pageSize: number,
  totalResults?: number,
  offset?: number
): PaginationMetadata {
  const totalPages = totalResults ? Math.ceil(totalResults / pageSize) : undefined;
  const hasNextPage = totalPages ? currentPage < totalPages : false;
  const hasPreviousPage = currentPage > 1;

  return {
    currentPage,
    totalPages,
    pageSize,
    totalResults,
    hasNextPage,
    hasPreviousPage,
    nextPage: hasNextPage ? currentPage + 1 : undefined,
    previousPage: hasPreviousPage ? currentPage - 1 : undefined,
    offset,
  };
}

/**
 * Response formatter class for creating standardized API responses.
 */
export class ResponseFormatter {
  private options: ResponseFormatterOptions;

  constructor(options: ResponseFormatterOptions = {}) {
    this.options = {
      includeDebugInfo: process.env.NODE_ENV === 'development',
      includeCacheInfo: true,
      includePerformance: true,
      includeTimestamp: true,
      ...options,
    };
  }

  /**
   * Creates a successful API response.
   */
  success<T>(
    req: Request,
    data: T,
    startTime?: number,
    pagination?: {
      page: number;
      limit: number;
      total?: number;
      offset?: number;
    }
  ): SuccessAPIResponse<T> {
    const metadata = createResponseMetadata(req, startTime, this.options);

    const response: SuccessAPIResponse<T> = {
      success: true,
      data,
      meta: metadata,
    };

    // Add pagination metadata if provided
    if (pagination) {
      response.meta.pagination = createPaginationMetadata(
        pagination.page,
        pagination.limit,
        pagination.total,
        pagination.offset
      );
    }

    return response;
  }

  /**
   * Creates an error API response.
   */
  error(
    req: Request,
    code: string,
    message: string,
    statusCode?: number,
    details?: any,
    startTime?: number
  ): ErrorAPIResponse {
    const metadata = createResponseMetadata(req, startTime, this.options);

    const response: ErrorAPIResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: metadata,
    };

    return response;
  }

  /**
   * Creates a paginated response with search results.
   */
  paginatedResults<T>(
    req: Request,
    results: T[],
    pagination: {
      page: number;
      limit: number;
      total?: number;
      offset?: number;
    },
    startTime?: number,
    additionalData?: Record<string, any>
  ): SuccessAPIResponse<{ results: T[] } & Record<string, any>> {
    const data = {
      results,
      ...additionalData,
    };

    return this.success(req, data, startTime, pagination);
  }

  /**
   * Creates a health check response.
   */
  healthCheck(
    req: Request,
    status: 'healthy' | 'unhealthy' | 'degraded',
    checks: Record<string, any>,
    startTime?: number
  ): SuccessAPIResponse<any> {
    const data = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
    };

    return this.success(req, data, startTime);
  }

  /**
   * Creates an extended response with additional metadata.
   */
  extended<T>(
    req: Request,
    data: T,
    startTime?: number,
    extensions?: {
      cache?: CacheInfo;
      performance?: Record<string, number>;
      debug?: Record<string, any>;
    }
  ): SuccessAPIResponse<T> {
    const response = this.success(req, data, startTime);

    if (extensions && this.options.includeDebugInfo) {
      const extendedMeta = response.meta as ExtendedResponseMetadata;

      if (extensions.cache && this.options.includeCacheInfo) {
        extendedMeta.cache = extensions.cache;
      }

      if (extensions.performance && this.options.includePerformance) {
        extendedMeta.performance = extensions.performance;
      }

      if (extensions.debug && this.options.includeDebugInfo) {
        extendedMeta.debug = extensions.debug;
      }
    }

    return response;
  }
}

/**
 * Default response formatter instance.
 */
export const responseFormatter = new ResponseFormatter();

/**
 * Utility functions for quick response formatting.
 */
export const formatResponse = {
  /**
   * Quick success response.
   */
  success: <T>(req: Request, data: T, startTime?: number) =>
    responseFormatter.success(req, data, startTime),

  /**
   * Quick error response.
   */
  error: (req: Request, code: string, message: string, details?: any, startTime?: number) =>
    responseFormatter.error(req, code, message, undefined, details, startTime),

  /**
   * Quick paginated response.
   */
  paginated: <T>(
    req: Request,
    results: T[],
    page: number,
    limit: number,
    total?: number,
    startTime?: number
  ) =>
    responseFormatter.paginatedResults(
      req,
      results,
      { page, limit, total, offset: (page - 1) * limit },
      startTime
    ),

  /**
   * Quick health check response.
   */
  health: (
    req: Request,
    status: 'healthy' | 'unhealthy' | 'degraded',
    checks: Record<string, any>,
    startTime?: number
  ) => responseFormatter.healthCheck(req, status, checks, startTime),
};

/**
 * Middleware to inject timing information into responses.
 */
export function timingMiddleware(req: Request, res: any, next: Function) {
  // Store start time in request context
  if (req.context) {
    req.context.startTime = Date.now();
  }

  // Override response methods to inject timing
  const originalJson = res.json;
  res.json = function(data: any) {
    const startTime = req.context?.startTime;
    
    // If data is already a formatted response, add timing if missing
    if (data && typeof data === 'object' && 'success' in data && 'meta' in data) {
      if (startTime && !data.meta.processingTime) {
        data.meta.processingTime = Date.now() - startTime;
      }
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Response compression utility for large responses.
 */
export function compressResponse(data: any): any {
  // Remove undefined values and empty arrays/objects
  function cleanObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(cleanObject).filter(item => item !== undefined);
    }
    
    if (obj && typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = cleanObject(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
    
    return obj;
  }

  return cleanObject(data);
}

/**
 * Response validation utility to ensure responses meet API standards.
 */
export function validateResponse(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check basic structure
  if (!response || typeof response !== 'object') {
    errors.push('Response must be an object');
    return { valid: false, errors };
  }

  // Check required fields
  if (!('success' in response)) {
    errors.push('Response must have a "success" field');
  }

  if (!('meta' in response)) {
    errors.push('Response must have a "meta" field');
  }

  // Check meta structure
  if (response.meta) {
    if (!response.meta.timestamp) {
      errors.push('Response meta must include timestamp');
    }

    if (!response.meta.requestId) {
      errors.push('Response meta must include requestId');
    }
  }

  // Check success response structure
  if (response.success === true) {
    if (!('data' in response)) {
      errors.push('Success response must have a "data" field');
    }
  }

  // Check error response structure
  if (response.success === false) {
    if (!response.error) {
      errors.push('Error response must have an "error" field');
    } else {
      if (!response.error.code) {
        errors.push('Error response must have an error code');
      }
      if (!response.error.message) {
        errors.push('Error response must have an error message');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Response size calculator for monitoring.
 */
export function calculateResponseSize(response: any): number {
  return Buffer.byteLength(JSON.stringify(response), 'utf8');
} 
