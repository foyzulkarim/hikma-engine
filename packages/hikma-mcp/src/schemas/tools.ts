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
// Phase 2: find_callers
// ============================================

export const FindCallersInputSchema = z.object({
  function_name: z
    .string()
    .min(1)
    .describe('Name of the function to find callers for'),

  file_path: z
    .string()
    .optional()
    .describe('Narrow search to specific file'),

  depth: z
    .number()
    .min(1)
    .max(5)
    .default(1)
    .describe('How many levels up the call chain to traverse'),
});

export type FindCallersInput = z.infer<typeof FindCallersInputSchema>;

// ============================================
// Phase 2: find_dependencies
// ============================================

export const FindDependenciesInputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .describe('Path to the file to analyze'),

  direction: z
    .enum(['imports', 'imported_by', 'both'])
    .default('both')
    .describe('Direction of dependencies to find'),
});

export type FindDependenciesInput = z.infer<typeof FindDependenciesInputSchema>;

// ============================================
// Phase 2: find_related
// ============================================

export const FindRelatedInputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .describe('Starting file'),

  line: z
    .number()
    .optional()
    .describe('Specific line number (finds related to symbol at line)'),

  relationship_types: z
    .array(z.enum([
      'calls', 'called_by', 'imports', 'imported_by',
      'same_module', 'similar_code'
    ]))
    .default(['calls', 'called_by', 'similar_code'])
    .describe('Types of relationships to find'),

  limit: z
    .number()
    .min(1)
    .max(20)
    .default(10)
    .describe('Maximum results to return'),
});

export type FindRelatedInput = z.infer<typeof FindRelatedInputSchema>;

// ============================================
// Phase 3: explain_module
// ============================================

export const ExplainModuleInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Question about the codebase (e.g., 'How does authentication work?')"),

  scope: z
    .string()
    .optional()
    .describe("Limit to specific path or module (e.g., 'src/auth')"),

  max_context_files: z
    .number()
    .min(1)
    .max(20)
    .default(10)
    .describe('Maximum files to use as context'),
});

export type ExplainModuleInput = z.infer<typeof ExplainModuleInputSchema>;

// ============================================
// Phase 3: get_architecture
// ============================================

export const GetArchitectureInputSchema = z.object({
  focus: z
    .enum(['full', 'modules', 'dependencies'])
    .default('full')
    .describe('What aspect of architecture to focus on'),

  path: z
    .string()
    .optional()
    .describe('Limit to specific directory'),
});

export type GetArchitectureInput = z.infer<typeof GetArchitectureInputSchema>;

// ============================================
// Tool metadata for MCP registration
// ============================================

export const TOOL_DEFINITIONS = {
  // Phase 1 Tools
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

  // Phase 2 Tools
  find_callers: {
    name: 'find_callers',
    description:
      'Find what functions call a given function. Traces the call chain up to see where ' +
      'a function is invoked from. Use this to understand impact of changes or trace execution flow.',
    inputSchema: FindCallersInputSchema,
  },

  find_dependencies: {
    name: 'find_dependencies',
    description:
      'Find what a file imports and what imports it. Shows the dependency graph around a file. ' +
      'Use this to understand module relationships and impact of changes.',
    inputSchema: FindDependenciesInputSchema,
  },

  find_related: {
    name: 'find_related',
    description:
      'Find code related to a given location through various relationships (calls, imports, ' +
      'similar code). Use this to discover connected code when exploring the codebase.',
    inputSchema: FindRelatedInputSchema,
  },

  // Phase 3 Tools
  explain_module: {
    name: 'explain_module',
    description:
      'Get an AI-generated explanation of how part of the codebase works. Searches for relevant ' +
      'code and synthesizes an explanation. Use this to understand complex systems or unfamiliar code.',
    inputSchema: ExplainModuleInputSchema,
  },

  get_architecture: {
    name: 'get_architecture',
    description:
      'Get a high-level overview of the codebase structure, modules, and key patterns. ' +
      'Use this to understand the overall organization of a project.',
    inputSchema: GetArchitectureInputSchema,
  },
} as const;
