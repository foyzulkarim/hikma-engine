/**
 * find_dependencies tool implementation
 */

import { SearchService } from '../services/search-service';
import { FindDependenciesInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath, validatePathWithinProject } from '../utils/paths';

export async function findDependenciesHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = FindDependenciesInputSchema.parse(args);

  logger.debug('find_dependencies called', {
    file_path: input.file_path,
    direction: input.direction,
  });

  // Get dependencies
  const deps = await searchService.findDependencies(input.file_path);

  // Build response
  const lines: string[] = [];

  lines.push(`## Dependencies for \`${input.file_path}\``);
  lines.push('');

  // Show imports
  if (input.direction === 'imports' || input.direction === 'both') {
    if (deps.imports.length > 0) {
      const internal = deps.imports.filter(d => !d.isExternal);
      const external = deps.imports.filter(d => d.isExternal);

      lines.push(`**Imports (${deps.imports.length}):**`);
      lines.push('');

      if (internal.length > 0) {
        lines.push('*Internal:*');
        for (const dep of internal.slice(0, 10)) {
          const relativePath = dep.filePath
            ? toRelativePath(dep.filePath, projectPath)
            : dep.module;
          const symbols = dep.symbols.length > 0 ? `: ${dep.symbols.join(', ')}` : '';
          lines.push(`- ${relativePath}${symbols}`);
        }
        if (internal.length > 10) {
          lines.push(`- ... and ${internal.length - 10} more`);
        }
        lines.push('');
      }

      if (external.length > 0) {
        lines.push('*External:*');
        for (const dep of external.slice(0, 10)) {
          const symbols = dep.symbols.length > 0 ? `: ${dep.symbols.join(', ')}` : '';
          lines.push(`- ${dep.module}${symbols}`);
        }
        if (external.length > 10) {
          lines.push(`- ... and ${external.length - 10} more`);
        }
        lines.push('');
      }
    } else {
      lines.push('**Imports:** None found');
      lines.push('');
    }
  }

  // Show imported by
  if (input.direction === 'imported_by' || input.direction === 'both') {
    if (deps.importedBy.length > 0) {
      lines.push(`**Imported by (${deps.importedBy.length}):**`);
      lines.push('');

      for (const dep of deps.importedBy.slice(0, 15)) {
        const relativePath = dep.filePath
          ? toRelativePath(dep.filePath, projectPath)
          : dep.module;
        const symbols = dep.symbols.length > 0 ? `: ${dep.symbols.join(', ')}` : '';
        lines.push(`- ${relativePath}${symbols}`);
      }

      if (deps.importedBy.length > 15) {
        lines.push(`- ... and ${deps.importedBy.length - 15} more`);
      }
      lines.push('');
    } else {
      lines.push('**Imported by:** None found (this may be an entry point)');
      lines.push('');
    }
  }

  // Summary
  lines.push('---');
  lines.push(`Total: ${deps.imports.length} imports, ${deps.importedBy.length} dependents`);

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}
