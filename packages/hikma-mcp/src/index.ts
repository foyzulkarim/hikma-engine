/**
 * hikma-mcp - MCP server for code intelligence
 *
 * Exposes hikma-engine's code search and analysis capabilities
 * to AI CLIs via the Model Context Protocol.
 */

export { createServer, startServer } from './server';
export { HikmaMcpServer } from './server';
export * from './schemas/tools';
