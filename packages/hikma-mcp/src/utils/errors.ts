/**
 * Custom error types for hikma-mcp
 *
 * These errors are designed to be agent-friendly,
 * providing clear messages about what went wrong and how to fix it.
 */

export class HikmaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoveryHint?: string
  ) {
    super(message);
    this.name = 'HikmaError';
  }

  toAgentMessage(): string {
    if (this.recoveryHint) {
      return `${this.message}. ${this.recoveryHint}`;
    }
    return this.message;
  }
}

export class IndexNotFoundError extends HikmaError {
  constructor(projectPath: string) {
    super(
      `No index found for project at ${projectPath}`,
      'INDEX_NOT_FOUND',
      `Run 'hikma-mcp init' in the project directory to create an index.`
    );
    this.name = 'IndexNotFoundError';
  }
}

export class IndexCorruptedError extends HikmaError {
  constructor(projectPath: string) {
    super(
      `Index at ${projectPath} appears to be corrupted`,
      'INDEX_CORRUPTED',
      `Run 'hikma-mcp init --force' to rebuild the index.`
    );
    this.name = 'IndexCorruptedError';
  }
}

export class FileNotFoundError extends HikmaError {
  constructor(filePath: string) {
    super(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND',
      `Check that the file exists and the path is correct.`
    );
    this.name = 'FileNotFoundError';
  }
}

export class SymbolNotFoundError extends HikmaError {
  constructor(symbolName: string, symbolType?: string) {
    const typeInfo = symbolType ? ` of type '${symbolType}'` : '';
    super(
      `Symbol '${symbolName}'${typeInfo} not found in the codebase`,
      'SYMBOL_NOT_FOUND',
      `Try a broader search or check the symbol name spelling.`
    );
    this.name = 'SymbolNotFoundError';
  }
}

export class EmbeddingError extends HikmaError {
  constructor(details: string) {
    super(
      `Failed to generate embeddings: ${details}`,
      'EMBEDDING_ERROR',
      `Ensure the embedding model is properly configured.`
    );
    this.name = 'EmbeddingError';
  }
}

export class DatabaseError extends HikmaError {
  constructor(operation: string, details: string) {
    super(
      `Database error during ${operation}: ${details}`,
      'DATABASE_ERROR',
      `Try rebuilding the index with 'hikma-mcp init --force'.`
    );
    this.name = 'DatabaseError';
  }
}

export class InvalidPathError extends HikmaError {
  constructor(path: string, reason: string) {
    super(
      `Invalid path '${path}': ${reason}`,
      'INVALID_PATH',
      `Ensure the path is within the project directory.`
    );
    this.name = 'InvalidPathError';
  }
}

/**
 * Format any error for agent consumption
 */
export function formatErrorForAgent(error: unknown): string {
  if (error instanceof HikmaError) {
    return error.toAgentMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
