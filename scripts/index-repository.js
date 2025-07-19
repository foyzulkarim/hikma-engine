#!/usr/bin/env node

/**
 * Reproducible Repository Indexing Script
 * Indexes a repository with enhanced graph database schema
 */

const { Indexer } = require('../dist/core/indexer');
const { ConfigManager } = require('../dist/config');
const path = require('path');
const fs = require('fs');

async function indexRepository() {
  console.log('🚀 Starting Enhanced Repository Indexing...\n');

  try {
    // Get repository path from command line or use current directory
    const repoPath = process.argv[2] || process.cwd();
    
    if (!fs.existsSync(repoPath)) {
      console.error(`❌ Repository path does not exist: ${repoPath}`);
      process.exit(1);
    }

    console.log(`📁 Repository: ${repoPath}`);

    // Initialize configuration
    const config = new ConfigManager();
    
    // Override database paths for fresh start
    const dataDir = path.join(__dirname, '..', 'data');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const dbConfig = {
      lancedb: {
        path: path.join(dataDir, `lancedb-${timestamp}`)
      },
      sqlite: {
        path: path.join(dataDir, `enhanced-graph-${timestamp}.db`)
      }
    };

    console.log(`💾 Database files:`);
    console.log(`   - SQLite: ${dbConfig.sqlite.path}`);
    console.log(`   - LanceDB: ${dbConfig.lancedb.path}`);
    console.log('');

    // Create indexer with enhanced configuration
    const indexer = new Indexer(repoPath, config);

    // Start indexing
    console.log('⚡ Starting indexing process...');
    const startTime = Date.now();
    
    await indexer.index();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Indexing completed successfully in ${duration}s`);
    
    // Display statistics
    console.log('\n📊 Indexing Statistics:');
    
    // Connect to the database to get stats
    const { SQLiteClient } = require('../dist/persistence/db-clients');
    const client = new SQLiteClient(dbConfig.sqlite.path);
    
    try {
      await client.connect();
      const stats = await client.getEnhancedGraphStats();
      
      console.log(`   - Total nodes: ${stats.nodeCount}`);
      console.log(`   - Total edges: ${stats.edgeCount}`);
      console.log(`   - Node types:`, stats.nodeTypes);
      console.log(`   - Edge types:`, stats.edgeTypes);
      console.log(`   - Repositories:`, Object.keys(stats.repoBreakdown).length);
      console.log(`   - Languages:`, Object.keys(stats.fileLanguages).join(', '));
      console.log(`   - Functions: ${stats.functionComplexity.totalFunctions} (avg ${stats.functionComplexity.avgLoc.toFixed(1)} LOC)`);
      
      client.disconnect();
    } catch (error) {
      console.log(`   - Could not retrieve detailed stats: ${error.message}`);
    }

    console.log('\n🎯 Next Steps:');
    console.log('   1. Query relationships using the enhanced graph database');
    console.log('   2. Use business keys for precise node identification');
    console.log('   3. Analyze code dependencies and data flow');
    console.log(`   4. Database file: ${dbConfig.sqlite.path}`);

  } catch (error) {
    console.error('❌ Indexing failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Enhanced Repository Indexing Script

Usage:
  node scripts/index-repository.js [repository-path]

Arguments:
  repository-path    Path to the repository to index (default: current directory)

Options:
  --help, -h        Show this help message

Examples:
  node scripts/index-repository.js
  node scripts/index-repository.js /path/to/my/project
  node scripts/index-repository.js ~/projects/my-app

Features:
  ✅ Enhanced graph database schema
  ✅ Deep AST analysis (Functions, Variables, Classes)
  ✅ Business key generation for precise identification
  ✅ Relationship tracking (CALLS, READS, WRITES, DECLARES)
  ✅ File-based SQLite storage
  ✅ Reproducible indexing process
  ✅ Comprehensive statistics
`);
  process.exit(0);
}

// Run the indexing
indexRepository().catch(console.error);
