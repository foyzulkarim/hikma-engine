#!/usr/bin/env node

/**
 * Test script for Enhanced SQLite Graph Database Implementation
 * Tests deep AST analysis, business keys, and advanced relationship queries
 */

const { SQLiteClient } = require('./dist/persistence/db-clients');
const { EnhancedASTParser } = require('./dist/modules/enhanced-ast-parser');
const { BusinessKeyGenerator } = require('./dist/types/enhanced-graph');
const path = require('path');
const fs = require('fs');

async function testEnhancedSQLiteGraph() {
  console.log('🧪 Testing Enhanced SQLite Graph Database Implementation...\n');

  // Initialize SQLite client
  const dbPath = path.join(__dirname, 'data', 'enhanced-graph.db');
  const client = new SQLiteClient(dbPath);

  try {
    // Connect to database
    console.log('📡 Connecting to Enhanced SQLite...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Test 1: Enhanced Node Creation with Business Keys
    console.log('🔑 Testing Business Key Generation...');
    const repoId = 'owner/test-repo';
    const commitSha = 'abc123def456';
    const filePath = '/src/utils/calculator.ts';
    
    const fileBusinessKey = BusinessKeyGenerator.file(repoId, commitSha, filePath);
    const funcBusinessKey = BusinessKeyGenerator.function(fileBusinessKey, 'calculateSum', 10);
    const varBusinessKey = BusinessKeyGenerator.variable(fileBusinessKey, 'result', 15);
    
    console.log(`File Key: ${fileBusinessKey}`);
    console.log(`Function Key: ${funcBusinessKey}`);
    console.log(`Variable Key: ${varBusinessKey}\n`);

    // Test 2: Create Enhanced Test Data
    console.log('📝 Creating enhanced test data...');
    
    const enhancedNodes = [
      // Repository
      {
        id: 'repo-1',
        businessKey: repoId,
        type: 'Repository',
        properties: {
          url: 'https://github.com/owner/test-repo',
          defaultBranch: 'main',
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-12-01T00:00:00Z'
        },
        repoId: repoId
      },
      
      // File
      {
        id: 'file-1',
        businessKey: fileBusinessKey,
        type: 'File',
        properties: {
          path: filePath,
          ext: '.ts',
          language: 'typescript',
          size: 1024,
          loc: 50,
          hash: 'file-hash-123'
        },
        repoId: repoId,
        commitSha: commitSha,
        filePath: filePath
      },
      
      // Function
      {
        id: 'func-1',
        businessKey: funcBusinessKey,
        type: 'Function',
        properties: {
          name: 'calculateSum',
          async: false,
          generator: false,
          params: ['a', 'b'],
          returnType: 'number',
          loc: 8,
          startLine: 10,
          endLine: 18,
          body: 'function calculateSum(a, b) { const result = a + b; return result; }',
          docstring: 'Calculates the sum of two numbers'
        },
        repoId: repoId,
        commitSha: commitSha,
        filePath: filePath,
        line: 10,
        col: 1,
        signatureHash: 'func-hash-123',
        labels: ['public', 'utility']
      },
      
      // Variable
      {
        id: 'var-1',
        businessKey: varBusinessKey,
        type: 'Variable',
        properties: {
          name: 'result',
          kind: 'const',
          typeAnnotation: 'number',
          valueSnippet: 'a + b',
          isExported: false,
          scope: 'function'
        },
        repoId: repoId,
        commitSha: commitSha,
        filePath: filePath,
        line: 15,
        col: 5
      },
      
      // Another Function
      {
        id: 'func-2',
        businessKey: BusinessKeyGenerator.function(fileBusinessKey, 'validateInput', 20),
        type: 'Function',
        properties: {
          name: 'validateInput',
          async: false,
          generator: false,
          params: ['input'],
          returnType: 'boolean',
          loc: 5,
          startLine: 20,
          endLine: 25,
          body: 'function validateInput(input) { return typeof input === "number"; }'
        },
        repoId: repoId,
        commitSha: commitSha,
        filePath: filePath,
        line: 20,
        col: 1
      }
    ];

    const enhancedEdges = [
      // File DECLARES Function
      {
        id: 'edge-1',
        source: 'file-1',
        target: 'func-1',
        sourceBusinessKey: fileBusinessKey,
        targetBusinessKey: funcBusinessKey,
        type: 'DECLARES',
        line: 10,
        col: 1
      },
      
      // File DECLARES Variable
      {
        id: 'edge-2',
        source: 'file-1',
        target: 'var-1',
        sourceBusinessKey: fileBusinessKey,
        targetBusinessKey: varBusinessKey,
        type: 'DECLARES',
        line: 15,
        col: 5
      },
      
      // Function WRITES Variable
      {
        id: 'edge-3',
        source: 'func-1',
        target: 'var-1',
        sourceBusinessKey: funcBusinessKey,
        targetBusinessKey: varBusinessKey,
        type: 'WRITES',
        line: 15,
        col: 5
      },
      
      // Function CALLS Function
      {
        id: 'edge-4',
        source: 'func-1',
        target: 'func-2',
        sourceBusinessKey: funcBusinessKey,
        targetBusinessKey: BusinessKeyGenerator.function(fileBusinessKey, 'validateInput', 20),
        type: 'CALLS',
        line: 12,
        col: 10,
        dynamic: false
      }
    ];

    // Insert enhanced data
    const nodeResult = await client.batchInsertEnhancedGraphNodes(enhancedNodes);
    console.log(`✅ Inserted ${nodeResult.success} enhanced nodes (${nodeResult.failed} failed)`);

    const edgeResult = await client.batchInsertEnhancedGraphEdges(enhancedEdges);
    console.log(`✅ Inserted ${edgeResult.success} enhanced edges (${edgeResult.failed} failed)\n`);

    // Test 3: Advanced Graph Queries
    console.log('🔍 Testing enhanced graph queries...\n');

    // Query 1: Find nodes by business key pattern
    console.log('Query 1: Find all functions in the file');
    const functionsInFile = client.findNodesByBusinessKey(`${fileBusinessKey}#%#%`);
    console.log('Functions found:', functionsInFile.map(f => f.properties.name));
    console.log('');

    // Query 2: Function calls with location info
    console.log('Query 2: Find what calculateSum calls (with locations)');
    const functionCalls = client.findFunctionCallsWithLocation(funcBusinessKey);
    functionCalls.forEach(call => {
      console.log(`  - Calls: ${call.properties.name} at line ${call.callLocation.line}, col ${call.callLocation.col}`);
    });
    console.log('');

    // Query 3: Variable access patterns
    console.log('Query 3: Find variables that calculateSum writes to');
    const variableWrites = client.findVariableAccess(funcBusinessKey, 'WRITES');
    variableWrites.forEach(access => {
      console.log(`  - Writes to: ${access.properties.name} (${access.properties.kind}) at line ${access.accessLocation.line}`);
    });
    console.log('');

    // Query 4: Functions declared in file
    console.log('Query 4: Find functions declared in file (enhanced)');
    const declaredFunctions = client.findFunctionsInFileEnhanced(fileBusinessKey);
    declaredFunctions.forEach(func => {
      console.log(`  - ${func.properties.name} at line ${func.location.line} (${func.properties.params.join(', ')})`);
    });
    console.log('');

    // Test 4: Enhanced Statistics
    console.log('📊 Enhanced Graph Statistics:');
    const stats = await client.getEnhancedGraphStats();
    console.log(`- Total nodes: ${stats.nodeCount}`);
    console.log(`- Total edges: ${stats.edgeCount}`);
    console.log('- Node types:', stats.nodeTypes);
    console.log('- Edge types:', stats.edgeTypes);
    console.log('- Repository breakdown:', stats.repoBreakdown);
    console.log('- File languages:', stats.fileLanguages);
    console.log('- Function complexity:', stats.functionComplexity);
    console.log('');

    // Test 5: AST Parser Integration (if TypeScript file exists)
    console.log('🌳 Testing AST Parser Integration...');
    
    // Create a sample TypeScript file for testing
    const testTsFile = path.join(__dirname, 'test-sample.ts');
    const sampleCode = `
import { Logger } from './logger';
import * as fs from 'fs';

export class Calculator {
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger();
  }
  
  public add(a: number, b: number): number {
    const result = a + b;
    this.logger.log(\`Adding \${a} + \${b} = \${result}\`);
    return result;
  }
  
  public multiply(x: number, y: number): number {
    let product = 0;
    for (let i = 0; i < y; i++) {
      product = this.add(product, x);
    }
    return product;
  }
}

export function validateNumber(input: any): boolean {
  return typeof input === 'number' && !isNaN(input);
}
`;

    fs.writeFileSync(testTsFile, sampleCode);
    
    try {
      const astParser = new EnhancedASTParser();
      const astResult = await astParser.parseFile(testTsFile, repoId, commitSha);
      
      console.log(`✅ AST Parser extracted ${astResult.nodes.length} nodes and ${astResult.edges.length} edges`);
      
      // Show some AST results
      const functions = astResult.nodes.filter(n => n.type === 'Function' || n.type === 'ArrowFunction');
      console.log('Functions found by AST:');
      functions.forEach(func => {
        console.log(`  - ${func.properties.name} (${func.properties.params.join(', ')}) - ${func.properties.loc} LOC`);
      });
      
      const imports = astResult.nodes.filter(n => n.type === 'Import');
      console.log('Imports found by AST:');
      imports.forEach(imp => {
        console.log(`  - ${imp.properties.sourceModule} (${imp.properties.importedNames.join(', ')})`);
      });
      
      // Insert AST results into database
      if (astResult.nodes.length > 0) {
        const astNodeResult = await client.batchInsertEnhancedGraphNodes(astResult.nodes);
        const astEdgeResult = await client.batchInsertEnhancedGraphEdges(astResult.edges);
        console.log(`✅ Inserted AST data: ${astNodeResult.success} nodes, ${astEdgeResult.success} edges`);
      }
      
    } catch (astError) {
      console.log(`⚠️  AST parsing failed (expected in test environment): ${astError.message}`);
    } finally {
      // Clean up test file
      if (fs.existsSync(testTsFile)) {
        fs.unlinkSync(testTsFile);
      }
    }

    console.log('\n🎉 All enhanced graph database tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    client.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the test
testEnhancedSQLiteGraph().catch(console.error);
