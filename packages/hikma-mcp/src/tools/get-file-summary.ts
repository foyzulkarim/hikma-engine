/**
 * get_file_summary tool implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import { SearchService } from '../services/search-service';
import { GetFileSummaryInputSchema } from '../schemas/tools';
import { logger } from '../utils/logger';
import { validatePathWithinProject, toRelativePath } from '../utils/paths';
import { FileNotFoundError } from '../utils/errors';

export async function getFileSummaryHandler(
  args: Record<string, unknown>,
  searchService: SearchService,
  projectPath: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate input
  const input = GetFileSummaryInputSchema.parse(args);

  logger.debug('get_file_summary called', { file_path: input.file_path });

  // Resolve and validate path
  const absolutePath = validatePathWithinProject(input.file_path, projectPath);
  const relativePath = toRelativePath(absolutePath, projectPath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    throw new FileNotFoundError(input.file_path);
  }

  // Get file info from index
  const fileInfo = await searchService.getFileSummary(relativePath);

  // Get symbols if requested
  let symbols: Awaited<ReturnType<typeof searchService.getFileSymbols>> = [];
  if (input.include_symbols) {
    symbols = await searchService.getFileSymbols(relativePath);
  }

  // Read file for additional info
  let lineCount = 0;
  let imports: string[] = [];
  let exports: string[] = [];

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    lineCount = content.split('\n').length;

    if (input.include_imports) {
      // Extract imports (basic patterns)
      const importMatches = content.match(/^import\s+.*$/gm) || [];
      imports = importMatches.slice(0, 20).map(imp => {
        const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
        return fromMatch ? fromMatch[1] : imp.substring(0, 50);
      });

      // Extract exports
      const exportMatches = content.match(/^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/gm) || [];
      exports = exportMatches.map(exp => {
        const nameMatch = exp.match(/(?:class|function|const|let|var|interface|type)\s+(\w+)/);
        return nameMatch ? nameMatch[1] : 'default';
      });
    }
  } catch (error) {
    logger.warn(`Could not read file ${absolutePath}: ${error}`);
  }

  // Build response
  const lines: string[] = [];
  const language = fileInfo?.language || detectLanguage(absolutePath);

  lines.push(`## ${relativePath} (${language})`);
  lines.push('');

  // Summary
  if (fileInfo?.summary) {
    lines.push(`**Summary:** ${fileInfo.summary.substring(0, 300)}`);
    lines.push('');
  }

  // Metrics
  const functionCount = symbols.filter(s => s.type === 'function' || s.type === 'method').length;
  const classCount = symbols.filter(s => s.type === 'class').length;

  lines.push(`**Metrics:** ${lineCount} lines, ${functionCount} functions, ${classCount} classes`);
  lines.push('');

  // Symbols
  if (input.include_symbols && symbols.length > 0) {
    lines.push(`**Symbols (${symbols.length}):**`);
    for (const symbol of symbols.slice(0, 15)) {
      const exported = symbol.exported ? ' (exported)' : '';
      const lineInfo = symbol.line ? ` - line ${symbol.line}` : '';
      lines.push(`- ${symbol.type} ${symbol.name}${exported}${lineInfo}`);
    }
    if (symbols.length > 15) {
      lines.push(`- ... and ${symbols.length - 15} more`);
    }
    lines.push('');
  }

  // Imports
  if (input.include_imports && imports.length > 0) {
    lines.push(`**Imports (${imports.length}):**`);
    for (const imp of imports.slice(0, 10)) {
      lines.push(`- ${imp}`);
    }
    if (imports.length > 10) {
      lines.push(`- ... and ${imports.length - 10} more`);
    }
    lines.push('');
  }

  // Exports
  if (input.include_imports && exports.length > 0) {
    lines.push(`**Exports:** ${exports.join(', ')}`);
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

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.c': 'C',
    '.cpp': 'C++',
    '.h': 'C Header',
    '.hpp': 'C++ Header',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
    '.cs': 'C#',
  };
  return langMap[ext] || 'Unknown';
}
