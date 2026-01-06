/**
 * explain_module tool implementation
 *
 * Gathers relevant code context for a question about the codebase.
 * Uses semantic search to find the most relevant code snippets.
 */

import { SearchService } from '../services/search-service';
import { ExplainModuleInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';

export async function explainModuleHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = ExplainModuleInputSchema.parse(args);

  logger.debug('explain_module called', {
    query: input.query,
    scope: input.scope,
    max_context_files: input.max_context_files,
  });

  const lines: string[] = [];

  lines.push(`## Context for: "${input.query}"`);
  lines.push('');

  // Search for relevant code
  const searchResults = await searchService.semanticSearch(input.query, {
    limit: input.max_context_files * 2, // Get more results to filter
    minSimilarity: 0.3,
    filePattern: input.scope,
  });

  if (searchResults.length === 0) {
    lines.push('No relevant code found for this query.');
    lines.push('');
    lines.push('Try:');
    lines.push('- Rephrasing your question');
    lines.push('- Using different keywords');
    if (input.scope) {
      lines.push(`- Removing or broadening the scope filter (${input.scope})`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  // Group results by file to avoid duplicate file content
  const fileContexts = new Map<string, {
    filePath: string;
    snippets: Array<{
      name: string;
      type: string;
      similarity: number;
      preview: string;
      lineStart?: number;
    }>;
  }>();

  for (const result of searchResults) {
    const relativePath = toRelativePath(result.filePath, projectPath);

    if (!fileContexts.has(relativePath)) {
      fileContexts.set(relativePath, {
        filePath: relativePath,
        snippets: [],
      });
    }

    const fileContext = fileContexts.get(relativePath)!;
    fileContext.snippets.push({
      name: result.name || 'unknown',
      type: result.nodeType,
      similarity: result.similarity,
      preview: truncateCode(result.sourceText, 300),
      lineStart: result.lineStart,
    });
  }

  // Limit to max_context_files
  const limitedContexts = Array.from(fileContexts.values())
    .slice(0, input.max_context_files);

  lines.push(`**Found ${limitedContexts.length} relevant file(s):**`);
  lines.push('');

  for (const context of limitedContexts) {
    lines.push(`### ${context.filePath}`);
    lines.push('');

    for (const snippet of context.snippets.slice(0, 3)) {
      const location = snippet.lineStart ? `:${snippet.lineStart}` : '';
      const relevance = (snippet.similarity * 100).toFixed(0);

      lines.push(`**${snippet.name}** (${snippet.type}) [${relevance}% match]${location}`);
      lines.push('');
      lines.push('```');
      lines.push(snippet.preview);
      lines.push('```');
      lines.push('');
    }
  }

  // Add helpful summary
  lines.push('---');
  lines.push('');
  lines.push(`**Summary:** Found ${searchResults.length} code elements across ${fileContexts.size} files.`);

  if (searchResults.length > input.max_context_files * 3) {
    lines.push(`Additional relevant files may exist. Try refining your query for more specific results.`);
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

/**
 * Truncate code to a maximum length, preserving structure
 */
function truncateCode(code: string, maxLength: number): string {
  if (code.length <= maxLength) {
    return code;
  }

  // Try to cut at a line boundary
  const truncated = code.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > maxLength * 0.7) {
    return truncated.substring(0, lastNewline) + '\n  // ... truncated';
  }

  return truncated + '... (truncated)';
}
