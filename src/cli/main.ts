#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { EmbedCommand } from './commands/embed';
import { SearchCommand } from './commands/search';
import { RagCommand } from './commands/rag';

function createProgram(): Command {
  const program = new Command();

  program
    .name('hikma-engine')
    .description('Hikma Engine - Embed, Search, and RAG for codebases')
    .version('2.2.0');

  // Register commands
  new EmbedCommand(program).register();
  new SearchCommand(program).register();
  new RagCommand(program).register();

  return program;
}

if (require.main === module) {
  const program = createProgram();
  program.parse(process.argv);
}

export { createProgram };
