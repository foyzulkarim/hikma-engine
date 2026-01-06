/**
 * find_symbol tool implementation
 */

import { SearchService } from '../services/search-service';
import { FindSymbolInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';
import { SymbolNotFoundError } from '../utils/errors';

export async function findSymbolHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = FindSymbolInputSchema.parse(args);

  logger.debug('find_symbol called', { symbol_name: input.symbol_name, symbol_type: input.symbol_type });

  // Find symbol definitions
  const symbols = await searchService.findSymbol(
    input.symbol_name,
    input.symbol_type === 'any' ? undefined : input.symbol_type
  );

  if (symbols.length === 0) {
    throw new SymbolNotFoundError(input.symbol_name, input.symbol_type);
  }

  // Separate definitions from usages (simple heuristic: definitions have signatures)
  const definitions = symbols.filter(s => s.signature || s.name === input.symbol_name);
  const usages = input.include_usages
    ? symbols.filter(s => !s.signature && s.name !== input.symbol_name).slice(0, 10)
    : [];

  // Build response
  const lines: string[] = [];

  // Definitions
  lines.push(`## Symbol: ${input.symbol_name}`);
  lines.push('');

  if (definitions.length > 0) {
    lines.push(`**Definitions (${definitions.length}):**`);
    lines.push('');

    for (const def of definitions.slice(0, 5)) {
      const relativePath = toRelativePath(def.filePath, projectPath);
      const lineInfo = def.line ? `:${def.line}` : '';
      const exportInfo = def.exported ? ' (exported)' : '';

      lines.push(`- **${relativePath}${lineInfo}** (${def.type}${exportInfo})`);

      if (def.signature) {
        lines.push(`  \`${def.signature}\``);
      }

      if (def.docstring) {
        lines.push(`  ${def.docstring.substring(0, 100)}`);
      }

      lines.push('');
    }

    if (definitions.length > 5) {
      lines.push(`... and ${definitions.length - 5} more definitions`);
      lines.push('');
    }
  }

  // Usages
  if (input.include_usages && usages.length > 0) {
    lines.push(`**Usages (${usages.length}):**`);
    lines.push('');

    for (const usage of usages) {
      const relativePath = toRelativePath(usage.filePath, projectPath);
      const lineInfo = usage.line ? `:${usage.line}` : '';

      lines.push(`- ${relativePath}${lineInfo}`);
    }

    lines.push('');
  }

  // Summary
  lines.push(`**Total:** ${definitions.length} definition(s), ${usages.length} usage(s)`);

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}
