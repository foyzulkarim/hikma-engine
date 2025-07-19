/**
 * @file Request validation middleware using Joi for API input validation.
 *       Validates query parameters, request bodies, and headers.
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { getLogger } from '../../utils/logger';

const logger = getLogger('ValidationMiddleware');

/**
 * Validation error response interface.
 */
interface ValidationError {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: {
      field: string;
      value: any;
      constraint: string;
    }[];
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Options for validation middleware.
 */
interface ValidationOptions {
  querySchema?: Joi.ObjectSchema;
  bodySchema?: Joi.ObjectSchema;
  paramsSchema?: Joi.ObjectSchema;
  abortEarly?: boolean;
  allowUnknown?: boolean;
}

/**
 * Creates validation middleware for request validation.
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    const validationErrors: any[] = [];

    // Validate query parameters
    if (options.querySchema) {
      const { error } = options.querySchema.validate(req.query, {
        abortEarly: options.abortEarly ?? false,
        allowUnknown: options.allowUnknown ?? false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.push(...error.details.map(detail => ({
          field: `query.${detail.path.join('.')}`,
          value: detail.context?.value,
          constraint: detail.message,
        })));
      }
    }

    // Validate request body
    if (options.bodySchema) {
      const { error } = options.bodySchema.validate(req.body, {
        abortEarly: options.abortEarly ?? false,
        allowUnknown: options.allowUnknown ?? false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.push(...error.details.map(detail => ({
          field: `body.${detail.path.join('.')}`,
          value: detail.context?.value,
          constraint: detail.message,
        })));
      }
    }

    // Validate path parameters
    if (options.paramsSchema) {
      const { error } = options.paramsSchema.validate(req.params, {
        abortEarly: options.abortEarly ?? false,
        allowUnknown: options.allowUnknown ?? false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.push(...error.details.map(detail => ({
          field: `params.${detail.path.join('.')}`,
          value: detail.context?.value,
          constraint: detail.message,
        })));
      }
    }

    // If validation errors exist, return 400 response
    if (validationErrors.length > 0) {
      logger.warn('Request validation failed', {
        requestId,
        method: req.method,
        url: req.url,
        errors: validationErrors,
      });

      const errorResponse: ValidationError = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validationErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      return res.status(400).json(errorResponse);
    }

    logger.debug('Request validation passed', {
      requestId,
      method: req.method,
      url: req.url,
    });

    next();
  };
}

/**
 * Common validation schemas for search endpoints.
 */
export const ValidationSchemas = {
  /**
   * Common query parameters for all search endpoints.
   */
  commonQuery: Joi.object({
    q: Joi.string().required().min(1).max(500).trim().description('Search query'),
    limit: Joi.number().integer().min(1).max(100).default(10).description('Maximum number of results'),
    offset: Joi.number().integer().min(0).default(0).description('Pagination offset'),
    page: Joi.number().integer().min(1).description('Page number (alternative to offset)'),
  }),

  /**
   * Semantic search query validation schema.
   */
  semanticSearch: Joi.object({
    q: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    nodeTypes: Joi.array().items(
      Joi.string().valid('function', 'class', 'interface', 'variable', 'file', 'commit')
    ).description('Filter by node types'),
    minSimilarity: Joi.number().min(0).max(1).default(0.1).description('Minimum similarity threshold'),
    includeMetadata: Joi.boolean().default(true).description('Include metadata in results'),
  }),

  /**
   * Structural search query validation schema.
   */
  structuralSearch: Joi.object({
    q: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    language: Joi.string().valid(
      'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'php', 'ruby'
    ).description('Programming language filter'),
    elementType: Joi.string().valid(
      'function', 'class', 'interface', 'variable', 'import', 'export'
    ).description('Code element type'),
    filePath: Joi.string().max(1000).description('File path pattern'),
  }),

  /**
   * Git history search query validation schema.
   */
  gitSearch: Joi.object({
    q: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    author: Joi.string().max(100).description('Author filter'),
    dateFrom: Joi.date().iso().description('Start date for date range filter'),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).description('End date for date range filter'),
    branch: Joi.string().max(100).description('Branch filter'),
  }),

  /**
   * Hybrid search query validation schema.
   */
  hybridSearch: Joi.object({
    q: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    filters: Joi.object({
      languages: Joi.array().items(Joi.string()),
      fileTypes: Joi.array().items(Joi.string()),
      dateRange: Joi.object({
        start: Joi.date().iso(),
        end: Joi.date().iso(),
      }),
      authors: Joi.array().items(Joi.string()),
    }).description('Metadata filters'),
    weights: Joi.object({
      semantic: Joi.number().min(0).max(1).default(0.4),
      structural: Joi.number().min(0).max(1).default(0.3),
      temporal: Joi.number().min(0).max(1).default(0.3),
    }).description('Search dimension weights'),
  }),

  /**
   * Comprehensive search query validation schema.
   */
  comprehensiveSearch: Joi.object({
    q: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    includeTypes: Joi.array().items(
      Joi.string().valid('semantic', 'structural', 'git', 'metadata')
    ).description('Search types to include'),
  }),
};

/**
 * Creates validation middleware for semantic search endpoints.
 */
export const validateSemanticSearch = createValidationMiddleware({
  querySchema: ValidationSchemas.semanticSearch,
  allowUnknown: false,
});

/**
 * Creates validation middleware for structural search endpoints.
 */
export const validateStructuralSearch = createValidationMiddleware({
  querySchema: ValidationSchemas.structuralSearch,
  allowUnknown: false,
});

/**
 * Creates validation middleware for git search endpoints.
 */
export const validateGitSearch = createValidationMiddleware({
  querySchema: ValidationSchemas.gitSearch,
  allowUnknown: false,
});

/**
 * Creates validation middleware for hybrid search endpoints.
 */
export const validateHybridSearch = createValidationMiddleware({
  querySchema: ValidationSchemas.hybridSearch,
  allowUnknown: false,
});

/**
 * Creates validation middleware for comprehensive search endpoints.
 */
export const validateComprehensiveSearch = createValidationMiddleware({
  querySchema: ValidationSchemas.comprehensiveSearch,
  allowUnknown: false,
}); 
