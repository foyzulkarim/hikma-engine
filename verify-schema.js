/**
 * Simple verification script to demonstrate the updated SQLite schema
 */

const { SQLiteClient } = require('./dist/persistence/db-clients');
const path = require('path');
const fs = require('fs');

async function verifySchema() {
  const dbPath = path.join(__dirname, 'verification.db');
  
  // Clean up any existing verification database
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const client = new SQLiteClient(dbPath);
  
  try {
    console.log('🔧 Connecting to SQLite database...');
    client.connect();
    
    console.log('📊 Getting database schema information...');
    
    // Get all tables
    const tables = client.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log('\n📋 Created Tables:');
    tables.forEach(table => {
      console.log(`  ✓ ${table.name}`);
    });
    
    // Get all indexes
    const indexes = client.all(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log('\n🔍 Created Indexes:');
    indexes.forEach(index => {
      console.log(`  ✓ ${index.name}`);
    });
    
    // Test indexing state functionality
    console.log('\n🔄 Testing indexing state functionality...');
    const testCommit = 'abc123def456789';
    client.setLastIndexedCommit(testCommit);
    const retrievedCommit = client.getLastIndexedCommit();
    console.log(`  ✓ Set commit: ${testCommit}`);
    console.log(`  ✓ Retrieved commit: ${retrievedCommit}`);
    console.log(`  ✓ Match: ${testCommit === retrievedCommit}`);
    
    // Get indexing stats
    console.log('\n📈 Getting indexing statistics...');
    const stats = await client.getIndexingStats();
    console.log('  Statistics:');
    Object.entries(stats).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
    
    console.log('\n✅ Schema verification completed successfully!');
    
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    process.exit(1);
  } finally {
    if (client.isConnectedToDatabase()) {
      client.disconnect();
    }
    
    // Clean up verification database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
}

verifySchema().catch(console.error);
