/**
 * find_related tool implementation
 */

import { SearchService } from '../services/search-service';
import { FindRelatedInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';

export async function findRelatedHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = FindRelatedInputSchema.parse(args);

  logger.debug('find_related called', {
    file_path: input.file_path,
    line: input.line,
    relationship_types: input.relationship_types,
  });

  // Find related code
  const related = await searchService.findRelated(
    input.file_path,
    input.line,
    input.relationship_types
  );

  // Limit results
  const limitedResults = related.slice(0, input.limit);

  // Build response
  const lines: string[] = [];

  const locationDesc = input.line
    ? `${input.file_path}:${input.line}`
    : input.file_path;

  lines.push(`## Code related to \`${locationDesc}\``);
  lines.push('');

  if (limitedResults.length === 0) {
    lines.push('No related code found.');
    lines.push('');
    lines.push('Try:');
    lines.push('- Different relationship types');
    lines.push('- A different file or location');
  } else {
    // Group by relationship type
    const byType = new Map<string, typeof limitedResults>();
    for (const item of limitedResults) {
      if (!byType.has(item.relationship)) {
        byType.set(item.relationship, []);
      }
      byType.get(item.relationship)!.push(item);
    }

    for (const [relationship, items] of byType) {
      const label = formatRelationshipLabel(relationship);
      lines.push(`**${label} (${items.length}):**`);
      lines.push('');

      for (const item of items) {
        const relativePath = toRelativePath(item.filePath, projectPath);
        const name = item.name ? ` (${item.name})` : '';
        const relevance = (item.relevance * 100).toFixed(0);

        lines.push(`- ${relativePath}:${item.line}${name} [${relevance}% relevance]`);
      }

      lines.push('');
    }

    lines.push(`**Total:** ${limitedResults.length} related items`);
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

function formatRelationshipLabel(relationship: string): string {
  const labels: Record<string, string> = {
    'calls': 'Calls',
    'called_by': 'Called by',
    'imports': 'Imports',
    'imported_by': 'Imported by',
    'same_module': 'Same module',
    'similar_code': 'Similar code',
    'tests': 'Tests',
  };
  return labels[relationship] || relationship;
}
