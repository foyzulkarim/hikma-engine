#!/usr/bin/env node

import { SQLiteClient } from '../persistence/db/connection';
import { InMemoryGraphService } from '../utils/in-memory-graph';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';
import path from 'path';

/**
 * CLI utility for querying the graph data in memory
 * Usage: npm run graph-query [command] [args...]
 */

const logger = getLogger('GraphQueryCLI');

class GraphQueryCLI {
  private graphService: InMemoryGraphService;
  private sqliteClient: SQLiteClient;

  constructor() {
    // Initialize SQLite client with the metadata database
    const dbPath = path.join(process.cwd(), 'data', 'metadata.db');
    this.sqliteClient = new SQLiteClient(dbPath);
    this.graphService = new InMemoryGraphService(this.sqliteClient);
  }

  async initialize(): Promise<void> {
    try {
      await this.sqliteClient.connect();
      await this.graphService.loadGraph();
      console.log('✅ Graph loaded successfully into memory');
    } catch (error) {
      console.error('❌ Failed to initialize graph:', getErrorMessage(error));
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.sqliteClient.disconnect();
    } catch (error) {
      logger.error('Error during cleanup', { error: getErrorMessage(error) });
    }
  }

  /**
   * Show graph statistics
   */
  showStats(): void {
    const stats = this.graphService.getStats();
    
    console.log('\n📊 Graph Statistics:');
    console.log(`Total Nodes: ${stats.nodeCount}`);
    console.log(`Total Edges: ${stats.edgeCount}`);
    
    console.log('\nNode Types:');
    for (const [type, count] of Object.entries(stats.nodeTypes)) {
      console.log(`  ${type}: ${count}`);
    }
    
    console.log('\nEdge Types:');
    for (const [type, count] of Object.entries(stats.edgeTypes)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  /**
   * List all functions in a file
   */
  listFunctionsInFile(filePath: string): void {
    const functions = this.graphService.getFunctionsInFile(filePath);
    
    console.log(`\n🔍 Functions in ${filePath}:`);
    if (functions.length === 0) {
      console.log('  No functions found');
      return;
    }
    
    functions.forEach(func => {
      const name = func.properties.name || 'anonymous';
      const line = func.line || 'unknown';
      console.log(`  ${name} (line ${line})`);
    });
  }

  /**
   * Show function call relationships
   */
  showFunctionCalls(functionName: string): void {
    // Find function by name
    const functions = this.graphService.getNodesByType('FunctionNode')
      .filter(func => func.properties.name === functionName);
    
    if (functions.length === 0) {
      console.log(`❌ Function '${functionName}' not found`);
      return;
    }
    
    if (functions.length > 1) {
      console.log(`⚠️  Multiple functions named '${functionName}' found:`);
      functions.forEach((func, index) => {
        console.log(`  ${index + 1}. ${func.filePath}:${func.line}`);
      });
      return;
    }
    
    const func = functions[0];
    console.log(`\n📞 Function Calls for '${functionName}' (${func.filePath}:${func.line}):`);
    
    // Show what this function calls
    const calls = this.graphService.getFunctionCalls(func.id);
    console.log(`\nCalls (${calls.length}):`);
    calls.forEach(calledFunc => {
      const name = calledFunc.properties.name || 'anonymous';
      console.log(`  → ${name} (${calledFunc.filePath}:${calledFunc.line})`);
    });
    
    // Show what calls this function
    const callers = this.graphService.getFunctionCallers(func.id);
    console.log(`\nCalled by (${callers.length}):`);
    callers.forEach(callerFunc => {
      const name = callerFunc.properties.name || 'anonymous';
      console.log(`  ← ${name} (${callerFunc.filePath}:${callerFunc.line})`);
    });
  }

  /**
   * Find call chain between two functions
   */
  findCallChain(fromFunction: string, toFunction: string): void {
    // Find functions by name
    const fromFuncs = this.graphService.getNodesByType('FunctionNode')
      .filter(func => func.properties.name === fromFunction);
    const toFuncs = this.graphService.getNodesByType('FunctionNode')
      .filter(func => func.properties.name === toFunction);
    
    if (fromFuncs.length === 0) {
      console.log(`❌ Source function '${fromFunction}' not found`);
      return;
    }
    
    if (toFuncs.length === 0) {
      console.log(`❌ Target function '${toFunction}' not found`);
      return;
    }
    
    if (fromFuncs.length > 1 || toFuncs.length > 1) {
      console.log('⚠️  Multiple functions found. Please be more specific.');
      return;
    }
    
    const chain = this.graphService.findCallChain(fromFuncs[0].id, toFuncs[0].id);
    
    if (!chain) {
      console.log(`❌ No call chain found from '${fromFunction}' to '${toFunction}'`);
      return;
    }
    
    console.log(`\n🔗 Call chain from '${fromFunction}' to '${toFunction}':`);
    chain.forEach((func, index) => {
      const name = func.properties.name || 'anonymous';
      const arrow = index < chain.length - 1 ? ' →' : '';
      console.log(`  ${index + 1}. ${name} (${func.filePath}:${func.line})${arrow}`);
    });
  }

  /**
   * Search functions by pattern
   */
  searchFunctions(pattern: string): void {
    const regex = new RegExp(pattern, 'i');
    const functions = this.graphService.searchNodes(node => 
      node.nodeType === 'FunctionNode' && 
      regex.test(node.properties.name || '')
    );
    
    console.log(`\n🔍 Functions matching '${pattern}':`);
    if (functions.length === 0) {
      console.log('  No functions found');
      return;
    }
    
    functions.forEach(func => {
      const name = func.properties.name || 'anonymous';
      console.log(`  ${name} (${func.filePath}:${func.line})`);
    });
  }

  /**
   * Show file dependencies
   */
  showFileDependencies(filePath: string): void {
    const dependents = this.graphService.getFileDependents(filePath);
    
    console.log(`\n📁 Files that depend on '${filePath}':`);
    if (dependents.length === 0) {
      console.log('  No dependencies found');
      return;
    }
    
    dependents.forEach(file => {
      console.log(`  ${file.filePath}`);
    });
  }

  /**
   * Show help
   */
  showHelp(): void {
    console.log(`
📖 Graph Query CLI Usage:

Commands:
  stats                           Show graph statistics
  functions <file-path>           List functions in a file
  calls <function-name>           Show function call relationships
  chain <from-func> <to-func>     Find call chain between functions
  search <pattern>                Search functions by name pattern
  deps <file-path>                Show file dependencies
  help                            Show this help

Examples:
  npm run graph-query stats
  npm run graph-query functions src/utils/logger.ts
  npm run graph-query calls getLogger
  npm run graph-query chain main processFile
  npm run graph-query search "test"
  npm run graph-query deps src/utils/logger.ts
`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === 'help') {
    const cli = new GraphQueryCLI();
    cli.showHelp();
    return;
  }
  
  const cli = new GraphQueryCLI();
  
  try {
    await cli.initialize();
    
    switch (command) {
      case 'stats':
        cli.showStats();
        break;
        
      case 'functions':
        if (!args[1]) {
          console.log('❌ Please provide a file path');
          return;
        }
        cli.listFunctionsInFile(args[1]);
        break;
        
      case 'calls':
        if (!args[1]) {
          console.log('❌ Please provide a function name');
          return;
        }
        cli.showFunctionCalls(args[1]);
        break;
        
      case 'chain':
        if (!args[1] || !args[2]) {
          console.log('❌ Please provide both source and target function names');
          return;
        }
        cli.findCallChain(args[1], args[2]);
        break;
        
      case 'search':
        if (!args[1]) {
          console.log('❌ Please provide a search pattern');
          return;
        }
        cli.searchFunctions(args[1]);
        break;
        
      case 'deps':
        if (!args[1]) {
          console.log('❌ Please provide a file path');
          return;
        }
        cli.showFileDependencies(args[1]);
        break;
        
      default:
        console.log(`❌ Unknown command: ${command}`);
        cli.showHelp();
    }
  } catch (error) {
    console.error('❌ Error:', getErrorMessage(error));
    process.exit(1);
  } finally {
    await cli.cleanup();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', getErrorMessage(error));
    process.exit(1);
  });
}

export { GraphQueryCLI };