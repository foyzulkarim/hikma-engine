import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './utils/logger';
import { formatErrorForAgent, IndexNotFoundError } from './utils/errors';
import { indexExists, getDatabasePath } from './utils/paths';
import { TOOL_DEFINITIONS } from './schemas/tools';
import { SearchService } from './services/search-service';
import { semanticSearchHandler } from './tools/semantic-search';
import { getFileSummaryHandler } from './tools/get-file-summary';
import { findSymbolHandler } from './tools/find-symbol';

const VERSION = '0.1.0';

export interface HikmaMcpServerOptions {
  projectPath: string;
  verbose?: boolean;
}

export class HikmaMcpServer {
  private server: Server;
  private projectPath: string;
  private searchService: SearchService | null = null;

  constructor(options: HikmaMcpServerOptions) {
    this.projectPath = options.projectPath;

    this.server = new Server(
      {
        name: 'hikma-mcp',
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: TOOL_DEFINITIONS.semantic_search.name,
            description: TOOL_DEFINITIONS.semantic_search.description,
            inputSchema: {
              type: 'object' as const,
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language query or code pattern to search for',
                  minLength: 1,
                  maxLength: 500,
                },
                language: {
                  type: 'string',
                  description: "Filter by programming language (e.g., 'typescript', 'python')",
                },
                file_pattern: {
                  type: 'string',
                  description: "Glob pattern to filter files (e.g., 'src/**/*.ts')",
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  minimum: 1,
                  maximum: 50,
                  default: 10,
                },
                min_similarity: {
                  type: 'number',
                  description: 'Minimum similarity threshold (0-1)',
                  minimum: 0,
                  maximum: 1,
                  default: 0.3,
                },
              },
              required: ['query'],
            },
          },
          {
            name: TOOL_DEFINITIONS.get_file_summary.name,
            description: TOOL_DEFINITIONS.get_file_summary.description,
            inputSchema: {
              type: 'object' as const,
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Path to the file (relative to project root)',
                },
                include_symbols: {
                  type: 'boolean',
                  description: 'Include list of functions, classes, exports',
                  default: true,
                },
                include_imports: {
                  type: 'boolean',
                  description: 'Include import/dependency information',
                  default: true,
                },
              },
              required: ['file_path'],
            },
          },
          {
            name: TOOL_DEFINITIONS.find_symbol.name,
            description: TOOL_DEFINITIONS.find_symbol.description,
            inputSchema: {
              type: 'object' as const,
              properties: {
                symbol_name: {
                  type: 'string',
                  description: 'Name of the function, class, or variable to find',
                },
                symbol_type: {
                  type: 'string',
                  enum: ['function', 'class', 'interface', 'variable', 'any'],
                  description: 'Type of symbol to search for',
                  default: 'any',
                },
                include_usages: {
                  type: 'boolean',
                  description: 'Include locations where symbol is used',
                  default: true,
                },
              },
              required: ['symbol_name'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.debug(`Tool call: ${name}`, args);

      try {
        // Ensure search service is initialized
        await this.ensureSearchService();

        switch (name) {
          case 'semantic_search':
            return await semanticSearchHandler(
              args as Record<string, unknown>,
              this.searchService!,
              this.projectPath
            );

          case 'get_file_summary':
            return await getFileSummaryHandler(
              args as Record<string, unknown>,
              this.searchService!,
              this.projectPath
            );

          case 'find_symbol':
            return await findSymbolHandler(
              args as Record<string, unknown>,
              this.searchService!,
              this.projectPath
            );

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        logger.error(`Tool ${name} failed:`, error);

        if (error instanceof McpError) {
          throw error;
        }

        // Return error as text content for the agent
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${formatErrorForAgent(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async ensureSearchService(): Promise<void> {
    if (this.searchService) {
      return;
    }

    if (!indexExists(this.projectPath)) {
      throw new IndexNotFoundError(this.projectPath);
    }

    const dbPath = getDatabasePath(this.projectPath);
    this.searchService = new SearchService(dbPath, this.projectPath);
    await this.searchService.initialize();
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`hikma-mcp server started for ${this.projectPath}`);
  }

  async stop(): Promise<void> {
    if (this.searchService) {
      this.searchService.close();
    }
    await this.server.close();
    logger.info('hikma-mcp server stopped');
  }
}

/**
 * Create a new hikma-mcp server instance
 */
export function createServer(options: HikmaMcpServerOptions): HikmaMcpServer {
  return new HikmaMcpServer(options);
}

/**
 * Create and start a server (convenience function)
 */
export async function startServer(options: HikmaMcpServerOptions): Promise<HikmaMcpServer> {
  const server = createServer(options);
  await server.start();
  return server;
}
