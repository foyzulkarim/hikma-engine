/**
 * get_architecture tool implementation
 *
 * Provides a high-level overview of the codebase structure,
 * modules, and key patterns.
 */

import { SearchService } from '../services/search-service';
import { GetArchitectureInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { toRelativePath } from '../utils/paths';
import * as path from 'path';

export async function getArchitectureHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = GetArchitectureInputSchema.parse(args);

  logger.debug('get_architecture called', {
    focus: input.focus,
    path: input.path,
  });

  const lines: string[] = [];

  // Get stats
  const stats = await searchService.getStats();

  lines.push(`## Codebase Architecture`);
  lines.push('');

  // Overview stats
  lines.push('### Overview');
  lines.push('');
  lines.push(`- **Total files:** ${stats.totalFiles}`);
  lines.push(`- **Indexed elements:** ${stats.totalNodes}`);
  lines.push(`- **Vector search:** ${stats.vectorEnabled ? 'Enabled' : 'Disabled (text fallback)'}`);
  lines.push('');

  // Node type breakdown
  if (Object.keys(stats.nodeTypes).length > 0) {
    lines.push('**Code elements:**');
    for (const [nodeType, count] of Object.entries(stats.nodeTypes)) {
      const displayType = formatNodeType(nodeType);
      lines.push(`- ${displayType}: ${count}`);
    }
    lines.push('');
  }

  // Module structure (if focus is 'full' or 'modules')
  if (input.focus === 'full' || input.focus === 'modules') {
    const moduleStructure = await searchService.getModuleStructure();

    // Filter by path if specified
    const filteredModules = input.path
      ? Object.entries(moduleStructure).filter(([dir]) => dir.includes(input.path!))
      : Object.entries(moduleStructure);

    if (filteredModules.length > 0) {
      lines.push('### Module Structure');
      lines.push('');

      // Group by top-level directory
      const topLevelGroups = groupByTopLevel(filteredModules, projectPath);

      for (const [topLevel, modules] of Object.entries(topLevelGroups)) {
        const relativeTop = toRelativePath(topLevel, projectPath) || topLevel;
        const totalFiles = modules.reduce((sum, m) => sum + m.files.length, 0);

        lines.push(`**${relativeTop}/** (${totalFiles} files)`);

        // Show subdirectories
        for (const module of modules.slice(0, 10)) {
          const relativePath = toRelativePath(module.path, projectPath);
          const indent = getIndentLevel(relativePath, relativeTop);
          const prefix = '  '.repeat(indent) + '├── ';

          // Show directory with file count
          const dirName = path.basename(module.path);
          lines.push(`${prefix}${dirName}/ (${module.files.length} files)`);

          // Show key files (entry points, index files)
          const keyFiles = module.files.filter(f =>
            f.includes('index') ||
            f.includes('main') ||
            f.includes('app') ||
            f.includes('server')
          );

          for (const file of keyFiles.slice(0, 3)) {
            lines.push(`${prefix}  └── ${file}`);
          }
        }

        if (modules.length > 10) {
          lines.push(`  └── ... and ${modules.length - 10} more directories`);
        }

        lines.push('');
      }
    }
  }

  // Dependencies view (if focus is 'full' or 'dependencies')
  if (input.focus === 'full' || input.focus === 'dependencies') {
    lines.push('### Key Entry Points');
    lines.push('');

    // Find potential entry points (files with few/no importers)
    const allFiles = await searchService.getAllFiles();
    const entryPoints: string[] = [];

    for (const file of allFiles.slice(0, 50)) {
      const relativePath = toRelativePath(file, projectPath);
      const fileName = path.basename(file);

      // Heuristics for entry points
      if (
        fileName.includes('index') ||
        fileName.includes('main') ||
        fileName.includes('app') ||
        fileName.includes('server') ||
        fileName.includes('cli') ||
        fileName === 'index.ts' ||
        fileName === 'index.js'
      ) {
        entryPoints.push(relativePath);
      }
    }

    if (entryPoints.length > 0) {
      for (const entry of entryPoints.slice(0, 10)) {
        lines.push(`- \`${entry}\``);
      }
    } else {
      lines.push('No clear entry points detected. Look for files named index, main, app, or server.');
    }

    lines.push('');
  }

  // Code patterns (if focus is 'full')
  if (input.focus === 'full') {
    lines.push('### Detected Patterns');
    lines.push('');

    const patterns = detectPatterns(stats.nodeTypes, await searchService.getAllFiles());

    if (patterns.length > 0) {
      for (const pattern of patterns) {
        lines.push(`- ${pattern}`);
      }
    } else {
      lines.push('- No specific patterns detected');
    }

    lines.push('');
  }

  // Tips for exploration
  lines.push('---');
  lines.push('');
  lines.push('**Next steps:**');
  lines.push('- Use `semantic_search` to find specific functionality');
  lines.push('- Use `find_dependencies` to explore module relationships');
  lines.push('- Use `explain_module` to understand specific areas');

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

function formatNodeType(nodeType: string): string {
  const typeMap: Record<string, string> = {
    'FunctionNode': 'Functions',
    'CodeNode': 'Code blocks',
    'ClassNode': 'Classes',
    'MethodNode': 'Methods',
    'InterfaceNode': 'Interfaces',
    'TypeNode': 'Types',
    'FileNode': 'Files',
    'VariableNode': 'Variables',
  };
  return typeMap[nodeType] || nodeType;
}

function groupByTopLevel(
  modules: [string, string[]][],
  projectPath: string
): Record<string, Array<{ path: string; files: string[] }>> {
  const groups: Record<string, Array<{ path: string; files: string[] }>> = {};

  for (const [dir, files] of modules) {
    const relativePath = toRelativePath(dir, projectPath);
    const topLevel = relativePath.split('/')[0] || relativePath;

    if (!groups[topLevel]) {
      groups[topLevel] = [];
    }

    groups[topLevel].push({ path: dir, files });
  }

  return groups;
}

function getIndentLevel(fullPath: string, basePath: string): number {
  const relativePart = fullPath.replace(basePath, '').replace(/^\//, '');
  return relativePart.split('/').filter(Boolean).length;
}

function detectPatterns(nodeTypes: Record<string, number>, files: string[]): string[] {
  const patterns: string[] = [];

  // Check for TypeScript/JavaScript
  const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.jsx'));

  if (tsFiles.length > jsFiles.length) {
    patterns.push('TypeScript project');
  } else if (jsFiles.length > 0) {
    patterns.push('JavaScript project');
  }

  // Check for React
  if (files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'))) {
    patterns.push('React components detected');
  }

  // Check for tests
  if (files.some(f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'))) {
    patterns.push('Test files present');
  }

  // Check for classes vs functions
  const classCount = nodeTypes['ClassNode'] || 0;
  const functionCount = (nodeTypes['FunctionNode'] || 0) + (nodeTypes['CodeNode'] || 0);

  if (classCount > functionCount * 0.3) {
    patterns.push('Object-oriented style (many classes)');
  } else if (functionCount > 0) {
    patterns.push('Functional style (function-heavy)');
  }

  // Check for services/controllers patterns
  if (files.some(f => f.includes('service') || f.includes('Service'))) {
    patterns.push('Service layer architecture');
  }

  if (files.some(f => f.includes('controller') || f.includes('Controller'))) {
    patterns.push('MVC or similar controller pattern');
  }

  return patterns;
}
