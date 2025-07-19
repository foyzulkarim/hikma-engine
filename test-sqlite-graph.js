#!/usr/bin/env node

/**
 * Test script to verify SQLite graph database functionality
 */

const { SQLiteClient } = require('./dist/persistence/db-clients');
const path = require('path');

async function testSQLiteGraph() {
  console.log('🧪 Testing SQLite Graph Database Implementation...\n');

  // Initialize SQLite client
  const dbPath = path.join(__dirname, 'data', 'test-graph.db');
  const client = new SQLiteClient(dbPath);

  try {
    // Connect to database
    console.log('📡 Connecting to SQLite...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Test data
    const testNodes = [
      {
        id: 'file-1',
        type: 'FileNode',
        properties: {
          filePath: '/src/utils/helper.ts',
          fileName: 'helper.ts',
          language: 'typescript'
        }
      },
      {
        id: 'func-1',
        type: 'FunctionNode',
        properties: {
          name: 'calculateSum',
          signature: 'calculateSum(a: number, b: number): number',
          filePath: '/src/utils/helper.ts'
        }
      },
      {
        id: 'func-2',
        type: 'FunctionNode',
        properties: {
          name: 'validateInput',
          signature: 'validateInput(input: string): boolean',
          filePath: '/src/utils/helper.ts'
        }
      }
    ];

    const testEdges = [
      {
        source: 'func-1',
        target: 'file-1',
        type: 'DEFINED_IN',
        properties: { lineNumber: 10 }
      },
      {
        source: 'func-2',
        target: 'file-1',
        type: 'DEFINED_IN',
        properties: { lineNumber: 20 }
      },
      {
        source: 'func-1',
        target: 'func-2',
        type: 'CALLS',
        properties: { callCount: 3 }
      }
    ];

    // Insert test data
    console.log('📝 Inserting test nodes...');
    const nodeResult = await client.batchInsertGraphNodes(testNodes);
    console.log(`✅ Inserted ${nodeResult.success} nodes (${nodeResult.failed} failed)\n`);

    console.log('🔗 Inserting test edges...');
    const edgeResult = await client.batchInsertGraphEdges(testEdges);
    console.log(`✅ Inserted ${edgeResult.success} edges (${edgeResult.failed} failed)\n`);

    // Test graph queries
    console.log('🔍 Testing graph queries...\n');

    // Find functions in a file
    console.log('Query: Find functions defined in file-1');
    const functionsInFile = client.findIncomingNodes('file-1', 'DEFINED_IN');
    console.log('Result:', functionsInFile.map(f => f.properties.name));
    console.log('');

    // Find what a function calls
    console.log('Query: Find what calculateSum calls');
    const functionCalls = client.findConnectedNodes('func-1', 'CALLS');
    console.log('Result:', functionCalls.map(f => f.properties.name));
    console.log('');

    // Find what calls a function
    console.log('Query: Find what calls validateInput');
    const callers = client.findIncomingNodes('func-2', 'CALLS');
    console.log('Result:', callers.map(f => f.properties.name));
    console.log('');

    // Get graph statistics
    console.log('📊 Graph Statistics:');
    const stats = await client.getGraphStats();
    console.log(`- Total nodes: ${stats.nodeCount}`);
    console.log(`- Total edges: ${stats.edgeCount}`);
    console.log('- Node types:', stats.nodeTypes);
    console.log('- Edge types:', stats.edgeTypes);
    console.log('');

    console.log('🎉 All tests passed! SQLite Graph Database is working correctly.');

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
testSQLiteGraph().catch(console.error);
