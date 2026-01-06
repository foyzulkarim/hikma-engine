/**
 * find_callers tool implementation
 */

import { SearchService } from '../services/search-service';
import { FindCallersInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';

export async function findCallersHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = FindCallersInputSchema.parse(args);

  logger.debug('find_callers called', {
    function_name: input.function_name,
    depth: input.depth,
  });

  // Find callers
  const callers = await searchService.findCallers(input.function_name, input.depth);

  // Build response
  const lines: string[] = [];

  if (callers.length === 0) {
    lines.push(`No callers found for: ${input.function_name}`);
    lines.push('');
    lines.push('This could mean:');
    lines.push('- The function is not called anywhere (entry point or unused)');
    lines.push('- The function name is misspelled');
    lines.push('- The call graph was not captured during indexing');
  } else {
    lines.push(`## Callers of \`${input.function_name}\``);
    lines.push('');

    // Group by depth
    const byDepth = new Map<number, typeof callers>();
    for (const caller of callers) {
      if (!byDepth.has(caller.depth)) {
        byDepth.set(caller.depth, []);
      }
      byDepth.get(caller.depth)!.push(caller);
    }

    for (const [depth, depthCallers] of byDepth) {
      const label = depth === 1 ? 'Direct callers' : `Depth ${depth} callers`;
      lines.push(`**${label} (${depthCallers.length}):**`);
      lines.push('');

      for (const caller of depthCallers.slice(0, 10)) {
        const relativePath = toRelativePath(caller.filePath, projectPath);
        const callSite = caller.callSiteLine ? ` (call at line ${caller.callSiteLine})` : '';

        lines.push(`- \`${caller.name}\` in ${relativePath}:${caller.line}${callSite}`);
      }

      if (depthCallers.length > 10) {
        lines.push(`- ... and ${depthCallers.length - 10} more`);
      }

      lines.push('');
    }

    lines.push(`**Total:** ${callers.length} caller(s)`);
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
