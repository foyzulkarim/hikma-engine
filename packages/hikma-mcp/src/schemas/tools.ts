import { z } from 'zod';

/**
 * Tool input/output schemas for hikma-mcp
 *
 * These schemas define the contract between the MCP client (AI CLI)
 * and the hikma-mcp server.
 */

// ============================================
// semantic_search
// ============================================

export const SemanticSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('Natural language query or code pattern to search for'),

  language: z
    .string()
    .optional()
    .describe("Filter by programming language (e.g., 'typescript', 'python')"),

  file_pattern: z
    .string()
    .optional()
    .describe("Glob pattern to filter files (e.g., 'src/**/*.ts')"),

  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of results to return'),

  min_similarity: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe('Minimum similarity threshold (0-1)'),
});

export type SemanticSearchInput = z.infer<typeof SemanticSearchInputSchema>;

export const SemanticSearchResultSchema = z.object({
  file_path: z.string(),
  line_start: z.number(),
  line_end: z.number(),
  node_type: z.enum(['function', 'class', 'method', 'file', 'variable', 'interface', 'type']),
  name: z.string(),
  preview: z.string().describe('Code snippet'),
  similarity: z.number(),
  summary: z.string().optional().describe('AI-generated summary if available'),
});

export const SemanticSearchOutputSchema = z.object({
  results: z.array(SemanticSearchResultSchema),
  total_matches: z.number(),
  search_time_ms: z.number(),
});

export type SemanticSearchOutput = z.infer<typeof SemanticSearchOutputSchema>;

// ============================================
// get_file_summary
// ============================================

export const GetFileSummaryInputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .describe('Path to the file (relative to project root)'),

  include_symbols: z
    .boolean()
    .default(true)
    .describe('Include list of functions, classes, exports'),

  include_imports: z
    .boolean()
    .default(true)
    .describe('Include import/dependency information'),
});

export type GetFileSummaryInput = z.infer<typeof GetFileSummaryInputSchema>;

export const SymbolInfoSchema = z.object({
  name: z.string(),
  type: z.enum(['function', 'class', 'interface', 'variable', 'type', 'method']),
  line: z.number(),
  exported: z.boolean(),
});

export const ImportInfoSchema = z.object({
  module: z.string(),
  symbols: z.array(z.string()),
});

export const GetFileSummaryOutputSchema = z.object({
  file_path: z.string(),
  language: z.string(),
  summary: z.string().describe('Description of file purpose'),

  symbols: z.array(SymbolInfoSchema).optional(),

  imports: z.array(ImportInfoSchema).optional(),

  exports: z.array(z.string()).optional(),

  metrics: z.object({
    lines: z.number(),
    functions: z.number(),
    classes: z.number(),
  }),
});

export type GetFileSummaryOutput = z.infer<typeof GetFileSummaryOutputSchema>;

// ============================================
// find_symbol
// ============================================

export const FindSymbolInputSchema = z.object({
  symbol_name: z
    .string()
    .min(1)
    .describe('Name of the function, class, or variable to find'),

  symbol_type: z
    .enum(['function', 'class', 'interface', 'variable', 'any'])
    .default('any')
    .describe('Type of symbol to search for'),

  include_usages: z
    .boolean()
    .default(true)
    .describe('Include locations where symbol is used'),
});

export type FindSymbolInput = z.infer<typeof FindSymbolInputSchema>;

export const SymbolDefinitionSchema = z.object({
  file_path: z.string(),
  line: z.number(),
  column: z.number(),
  type: z.string(),
  signature: z.string().optional(),
  docstring: z.string().optional(),
});

export const SymbolUsageSchema = z.object({
  file_path: z.string(),
  line: z.number(),
  context: z.string().describe('Line of code containing usage'),
});

export const FindSymbolOutputSchema = z.object({
  definitions: z.array(SymbolDefinitionSchema),

  usages: z.array(SymbolUsageSchema).optional(),

  total_usages: z.number(),
});

export type FindSymbolOutput = z.infer<typeof FindSymbolOutputSchema>;

// ============================================
// Tool metadata for MCP registration
// ============================================

export const TOOL_DEFINITIONS = {
  semantic_search: {
    name: 'semantic_search',
    description:
      'Search the codebase using natural language. Finds code by meaning, not just keywords. ' +
      'Use this to find where specific functionality is implemented, locate related code, or ' +
      'understand how concepts are represented in the codebase.',
    inputSchema: SemanticSearchInputSchema,
  },

  get_file_summary: {
    name: 'get_file_summary',
    description:
      'Get a summary of what a file does, including its symbols (functions, classes), ' +
      'imports, exports, and basic metrics. Use this to quickly understand a file without ' +
      'reading all its code.',
    inputSchema: GetFileSummaryInputSchema,
  },

  find_symbol: {
    name: 'find_symbol',
    description:
      'Find where a symbol (function, class, variable) is defined and where it is used. ' +
      'Use this to understand the scope and usage patterns of specific code elements.',
    inputSchema: FindSymbolInputSchema,
  },
} as const;
