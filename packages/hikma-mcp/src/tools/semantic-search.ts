/**
 * semantic_search tool implementation
 */

import { SearchService } from '../services/search-service';
import { SemanticSearchInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';

export async function semanticSearchHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const startTime = Date.now();

  // Validate input
  const input = SemanticSearchInputSchema.parse(args);

  logger.debug('semantic_search called', { query: input.query.substring(0, 50) });

  // Perform search
  const results = await searchService.semanticSearch(input.query, {
    limit: input.limit,
    minSimilarity: input.min_similarity,
    filePattern: input.file_pattern,
    nodeTypes: input.language ? undefined : undefined, // Language filter would need mapping
  });

  const searchTimeMs = Date.now() - startTime;

  // Format results
  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No matches found for: "${input.query}"\n\nTry a different query or lower the similarity threshold.`,
        },
      ],
    };
  }

  // Build response text
  const lines: string[] = [
    `Found ${results.length} matches in ${searchTimeMs}ms:`,
    '',
  ];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const relativePath = toRelativePath(result.filePath, projectPath);
    const lineInfo = result.lineStart ? `:${result.lineStart}${result.lineEnd ? `-${result.lineEnd}` : ''}` : '';
    const nodeType = result.nodeType.replace('Node', '').toLowerCase();

    lines.push(`${i + 1}. **${relativePath}${lineInfo}** (${nodeType}: ${result.name || 'unknown'})`);
    lines.push(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`);

    // Add preview (truncated)
    const preview = result.sourceText
      .substring(0, 150)
      .replace(/\n/g, ' ')
      .trim();
    if (preview) {
      lines.push(`   "${preview}${result.sourceText.length > 150 ? '...' : ''}"`);
    }

    lines.push('');
  }

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}
