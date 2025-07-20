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

    // Override database paths for fresh start
    const dataDir = path.join(__dirname, '..', 'data');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = path.join(dataDir, `unified-hikma-${timestamp}.db`);
    const vectorExtensionPath = path.join(__dirname, '..', 'extensions', 'vec0.dylib');

    console.log(`💾 Unified SQLite Database:`);
    console.log(`   - Database: ${dbPath}`);
    console.log(`   - Vector Extension: ${vectorExtensionPath}`);
    console.log('');
    
    // Set environment variables to override default config
    process.env.HIKMA_SQLITE_PATH = dbPath;
    process.env.HIKMA_SQLITE_VEC_EXTENSION = vectorExtensionPath;

    // Initialize configuration (will use environment overrides)
    const config = new ConfigManager(repoPath);

    // Create indexer with enhanced configuration
    const indexer = new Indexer(repoPath, config);

    // Start indexing
    console.log('⚡ Starting indexing process...');
    const startTime = Date.now();
    
    const result = await indexer.run();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Indexing completed successfully in ${duration}s`);
    
    // Display statistics from indexing result
    console.log('\n📊 Indexing Statistics:');
    console.log(`   - Total nodes: ${result.totalNodes}`);
    console.log(`   - Total edges: ${result.totalEdges}`);
    console.log(`   - Processed files: ${result.processedFiles}`);
    console.log(`   - Incremental: ${result.isIncremental}`);
    console.log(`   - Duration: ${result.duration}ms`);
    console.log(`   - Errors: ${result.errors.length}`);
    
    // Connect to the database to get additional stats
    const { SQLiteClient } = require('../dist/persistence/db-clients');
    const dbConfig = config.getDatabaseConfig();
    const client = new SQLiteClient(dbConfig.sqlite.path);
    
    try {
      await client.connect();
      const stats = await client.getIndexingStats();
      const vectorAvailable = await client.isVectorSearchAvailable();
      
      console.log('\n📈 Database Statistics:');
      console.log(`   - Files: ${stats.totalFiles || 0}`);
      console.log(`   - Functions: ${stats.totalFunctions || 0}`);
      console.log(`   - Commits: ${stats.totalCommits || 0}`);
      console.log(`   - Vector search available: ${vectorAvailable}`);
      
      client.disconnect();
    } catch (error) {
      console.log(`   - Could not retrieve detailed stats: ${error.message}`);
    }

    console.log('\n🎯 Next Steps:');
    console.log('   1. Query relationships using the unified SQLite database');
    console.log('   2. Test semantic search with vector embeddings');
    console.log('   3. Analyze code dependencies and data flow');
    console.log('   4. Test hybrid search combining metadata and vector search');
    console.log(`   5. Database file: ${dbConfig.sqlite.path}`);

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
