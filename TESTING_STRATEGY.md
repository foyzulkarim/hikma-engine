# Hikma-Engine Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for hikma-engine, including test data setup, expected outcomes at each pipeline stage, and database validation criteria. This strategy supports both automated testing and manual verification workflows.

## Test Repository Setup

### Primary Test Repository: hikma-engine (Self-Testing)
```bash
# Current working directory
/Users/foyzul/personal/hikma-engine

# Expected structure:
- 27 TypeScript/JavaScript files
- 9 directories
- 2 git commits
- Multiple code constructs (classes, functions, interfaces)
```

### Secondary Test Repository: hikma-pr
```bash
# Alternative test repository
/Users/foyzul/personal/hikma-pr

# Use for different scenarios:
- Different language mix
- Different repository size
- Different git history patterns
```

### Minimal Test Repository (Create for Unit Tests)
```bash
# Create a minimal test repo structure:
test-fixtures/
├── simple-project/
│   ├── .git/
│   ├── src/
│   │   ├── index.ts
│   │   ├── utils.js
│   │   └── types.d.ts
│   ├── tests/
│   │   └── index.test.ts
│   ├── package.json
│   ├── README.md
│   └── .gitignore
```

## Pipeline Testing Strategy

### Phase 1: File Discovery Testing

**Input:**
```bash
npm start /path/to/test/repo -- --dry-run
```

**Expected Intermediate Results:**
```typescript
// FileScanner output validation
interface FileDiscoveryResult {
  totalFound: number;        // Raw file count
  afterFiltering: number;    // After .gitignore filtering
  filtered: number;          // Files excluded
  fileTypes: {
    '.ts': number;
    '.js': number;
    '.json': number;
    '.md': number;
    // ... other extensions
  };
}
```

**Validation Criteria:**
- [ ] All source files discovered (no false negatives)
- [ ] .gitignore patterns respected (no false positives)
- [ ] File type detection accurate
- [ ] Binary files excluded
- [ ] Large files handled appropriately

**Test Cases:**
```typescript
describe('FileScanner', () => {
  test('should discover all TypeScript files', () => {
    // Expected: finds all .ts files not in .gitignore
  });
  
  test('should respect .gitignore patterns', () => {
    // Expected: excludes node_modules, dist, .git
  });
  
  test('should handle empty directories', () => {
    // Expected: graceful handling, no errors
  });
});
```

### Phase 2: AST Parsing Testing

**Expected Intermediate Results:**
```typescript
interface ASTParsingResult {
  totalNodes: number;        // All nodes created
  totalEdges: number;        // All relationships
  nodeTypes: {
    FileNode: number;        // One per file
    DirectoryNode: number;   // One per directory
    CodeNode: number;        // Functions, classes, etc.
    TestNode: number;        // Test functions
  };
  languageBreakdown: {
    typescript: number;
    javascript: number;
    python: number;
    // ... other languages
  };
}
```

**Validation Criteria:**
- [ ] FileNode count matches discovered files
- [ ] DirectoryNode count matches directory structure
- [ ] CodeNode extraction accurate (functions, classes, interfaces)
- [ ] TestNode detection works for test files
- [ ] Relationships correctly established (DEFINED_IN, CONTAINS)

**Test Cases:**
```typescript
describe('AstParser', () => {
  test('should extract all functions from TypeScript file', () => {
    // Given: TypeScript file with 3 functions
    // Expected: 3 CodeNodes with correct signatures
  });
  
  test('should create DEFINED_IN edges', () => {
    // Expected: Each CodeNode linked to its FileNode
  });
  
  test('should detect test files correctly', () => {
    // Expected: *.test.ts files create TestNodes
  });
});
```

### Phase 3: Git Analysis Testing

**Expected Intermediate Results:**
```typescript
interface GitAnalysisResult {
  totalNodes: number;        // CommitNodes + PullRequestNodes
  totalEdges: number;        // MODIFIED relationships
  nodeTypes: {
    CommitNode: number;      // One per commit
    PullRequestNode: number; // Mock PRs created
  };
  commitAnalysis: {
    commitsProcessed: number;
    filesModified: number;
    diffSummariesGenerated: number;
  };
}
```

**Validation Criteria:**
- [ ] All commits discovered and processed
- [ ] Commit metadata extracted (hash, author, date, message)
- [ ] File modification relationships created (MODIFIED edges)
- [ ] Diff summaries generated without git format errors
- [ ] Mock pull requests created for testing

**Test Cases:**
```typescript
describe('GitAnalyzer', () => {
  test('should extract all commits', () => {
    // Expected: CommitNode for each git commit
  });
  
  test('should create MODIFIED edges', () => {
    // Expected: Commits linked to modified files
  });
  
  test('should handle git format strings correctly', () => {
    // Expected: No git pretty format warnings
  });
});
```

### Phase 4: AI Processing Testing

**Expected Intermediate Results:**
```typescript
interface AIProcessingResult {
  summariesGenerated: number;    // Files + directories with AI summaries
  embeddingsGenerated: number;   // Nodes with vector embeddings
  modelPerformance: {
    summaryModel: string;        // Model name/version
    embeddingModel: string;      // Model name/version
    averageProcessingTime: number;
  };
}
```

**Validation Criteria:**
- [ ] AI summaries generated for files and directories
- [ ] Vector embeddings created (when not skipped)
- [ ] Models load successfully
- [ ] Processing completes without memory issues
- [ ] Graceful degradation when AI features skipped

**Test Cases:**
```typescript
describe('AI Processing', () => {
  test('should generate file summaries', () => {
    // Expected: aiSummary property populated
  });
  
  test('should create vector embeddings', () => {
    // Expected: embedding array with correct dimensions
  });
  
  test('should handle --skip-ai-summary flag', () => {
    // Expected: No AI processing, no errors
  });
});
```

### Phase 5: Data Persistence Testing

**Expected Final Results:**
```typescript
interface DataPersistenceResult {
  databases: {
    sqlite: boolean;      // Connection successful
    lancedb: boolean;     // Connection successful
  };
  dataIntegrity: {
    totalNodesStored: number;
    totalEdgesStored: number;
    crossDatabaseConsistency: boolean;
  };
}
```

## Database Validation Strategy

### SQLite Database Validation

**Expected Tables and Data:**
```sql
-- Files table
SELECT COUNT(*) FROM files;
-- Expected: Number of source files processed

SELECT file_path, file_name, file_extension, ai_summary 
FROM files 
WHERE file_extension = '.ts';
-- Expected: All TypeScript files with metadata

-- Directories table  
SELECT COUNT(*) FROM directories;
-- Expected: Number of unique directories

-- Code nodes table
SELECT COUNT(*) FROM code_nodes;
-- Expected: All functions, classes, interfaces extracted

SELECT name, signature, language, file_path 
FROM code_nodes 
WHERE language = 'typescript';
-- Expected: All TypeScript code constructs

-- Commits table
SELECT COUNT(*) FROM commits;
-- Expected: Number of git commits processed

SELECT hash, author, date, message, diff_summary 
FROM commits 
ORDER BY date DESC;
-- Expected: All commit metadata with diff summaries
```

**Validation Test Cases:**
```typescript
describe('SQLite Integration', () => {
  test('should store all file metadata', async () => {
    const fileCount = await db.get('SELECT COUNT(*) as count FROM files');
    expect(fileCount.count).toBe(expectedFileCount);
  });
  
  test('should maintain referential integrity', async () => {
    // Verify all code_nodes reference valid files
    const orphanedNodes = await db.all(`
      SELECT cn.id FROM code_nodes cn 
      LEFT JOIN files f ON cn.file_path = f.file_path 
      WHERE f.id IS NULL
    `);
    expect(orphanedNodes).toHaveLength(0);
  });
});
```

### LanceDB Database Validation

**Expected Vector Storage:**
```typescript
interface LanceDBValidation {
  tables: {
    filenodes: number;        // FileNode vectors
    directorynodes: number;   // DirectoryNode vectors
    codenodes: number;        // CodeNode vectors
    commitnodes: number;      // CommitNode vectors
    pullrequestnodes: number; // PullRequestNode vectors
  };
  vectorDimensions: number;   // Consistent embedding size
  searchCapability: boolean;  // Vector similarity search works
}
```

**Validation Test Cases:**
```typescript
describe('LanceDB Integration', () => {
  test('should create tables for each node type', async () => {
    const tables = await lancedb.listTables();
    expect(tables).toContain('filenodes');
    expect(tables).toContain('codenodes');
  });
  
  test('should store vectors with consistent dimensions', async () => {
    const table = await lancedb.getTable('filenodes');
    const sample = await table.limit(1).toArray();
    expect(sample[0].embedding).toHaveLength(expectedDimensions);
  });
  
  test('should support vector similarity search', async () => {
    // Test semantic search functionality
    const results = await lancedb.search(queryVector, { limit: 5 });
    expect(results).toHaveLength(5);
  });
});
```

### SQLite Graph Database Validation

**Expected Graph Structure:**
```typescript
interface SQLiteGraphValidation {
  nodes: {
    total: number;           // All nodes in graph_nodes table
    byType: {
      FileNode: number;
      CodeNode: number;
      CommitNode: number;
      // ... other types
    };
  };
  edges: {
    total: number;           // All relationships as edges
    byType: {
      DEFINED_IN: number;    // Code → File relationships
      CONTAINS: number;      // Directory → File relationships
      MODIFIED: number;      // Commit → File relationships
      TESTS: number;         // Test → Code relationships
    };
  };
  traversalCapability: boolean; // Graph queries work
}
```

**Validation Test Cases:**
```typescript
describe('SQLite Graph Integration', () => {
  test('should create nodes for all entities', async () => {
    const nodeCount = await sqliteClient.getEnhancedGraphStats();
    expect(vertexCount.value).toBe(expectedNodeCount);
  });
  
  test('should create edges for all relationships', async () => {
    const edgeCount = await g.E().count().next();
    expect(edgeCount.value).toBe(expectedEdgeCount);
  });
  
  test('should support graph traversals', async () => {
    // Find all functions in a specific file
    const functions = await g.V()
      .hasLabel('FileNode')
      .has('filePath', '/path/to/file.ts')
      .in('DEFINED_IN')
      .hasLabel('CodeNode')
      .toList();
    expect(functions.length).toBeGreaterThan(0);
  });
});
```

## Local Directory Processing Tests

### Core Test Scenario: Directory → Processing → Database Validation

This is the primary test pattern for local development assurance. Each test follows the pattern:
1. **Input**: Directory path
2. **Process**: Run hikma-engine 
3. **Assert**: Validate data in all 3 databases

### Test Scenario 1: hikma-engine Self-Processing

**Setup:**
```bash
# Test directory
TEST_DIR="/Users/foyzul/personal/hikma-engine"

# Clean databases before test
rm -f data/metadata.db
rm -rf data/lancedb
```

**Execution:**
```bash
npm start $TEST_DIR -- --skip-ai-summary --skip-embeddings
```

**Database Assertions:**
```typescript
describe('hikma-engine Self-Processing', () => {
  beforeAll(async () => {
    // Run the indexer
    await runIndexer('/Users/foyzul/personal/hikma-engine', {
      skipAISummary: true,
      skipEmbeddings: true
    });
  });

  describe('SQLite Database Validation', () => {
    test('should store exactly 27 files', async () => {
      const result = await db.get('SELECT COUNT(*) as count FROM files');
      expect(result.count).toBe(27);
    });

    test('should store exactly 9 directories', async () => {
      const result = await db.get('SELECT COUNT(*) as count FROM directories');
      expect(result.count).toBe(9);
    });

    test('should store 254+ code nodes', async () => {
      const result = await db.get('SELECT COUNT(*) as count FROM code_nodes');
      expect(result.count).toBeGreaterThanOrEqual(254);
    });

    test('should store exactly 2 commits', async () => {
      const result = await db.get('SELECT COUNT(*) as count FROM commits');
      expect(result.count).toBe(2);
    });

    test('should have specific files in database', async () => {
      const indexFile = await db.get(
        'SELECT * FROM files WHERE file_name = ? AND file_extension = ?',
        ['index', '.ts']
      );
      expect(indexFile).toBeDefined();
      expect(indexFile.file_path).toContain('src/index.ts');
    });

    test('should have main classes extracted', async () => {
      const classes = await db.all(
        'SELECT * FROM code_nodes WHERE signature LIKE ?',
        ['class %']
      );
      expect(classes.length).toBeGreaterThan(5);
      
      // Should find specific classes
      const classNames = classes.map(c => c.name);
      expect(classNames).toContain('ConfigManager');
      expect(classNames).toContain('Indexer');
      expect(classNames).toContain('FileScanner');
    });
  });

  describe('LanceDB Database Validation', () => {
    test('should create 5 tables for node types', async () => {
      const db = await lancedb.connect('data/lancedb');
      const tables = await db.listTables();
      expect(tables).toContain('filenodes');
      expect(tables).toContain('directorynodes');
      expect(tables).toContain('codenodes');
      expect(tables).toContain('commitnodes');
      expect(tables).toContain('pullrequestnodes');
    });

    test('should store file nodes with metadata', async () => {
      const db = await lancedb.connect('data/lancedb');
      const table = await db.getTable('filenodes');
      const count = await table.count();
      expect(count).toBe(27);
    });
  });

  describe('SQLite Graph Database Validation', () => {
    test('should create 298 nodes', async () => {
      const stats = await sqliteClient.getEnhancedGraphStats();
      expect(stats.nodeCount).toBe(298);
    });

    test('should create 338 edges', async () => {
      const edgeCount = await g.E().count().next();
      expect(edgeCount.value).toBe(338);
    });
  });
});
```

### Test Scenario 2: Small Test Project

**Setup:**
```bash
# Create minimal test project
mkdir -p test-fixtures/small-project/src
cd test-fixtures/small-project

# Initialize git
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Create test files
cat > src/index.ts << 'EOF'
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  
  multiply(a: number, b: number): number {
    return a * b;
  }
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}
EOF

cat > src/utils.js << 'EOF'
function formatNumber(num) {
  return num.toLocaleString();
}

module.exports = { formatNumber };
EOF

cat > package.json << 'EOF'
{
  "name": "small-test-project",
  "version": "1.0.0",
  "main": "src/index.ts"
}
EOF

# Commit files
git add .
git commit -m "Initial commit"
```

**Execution:**
```bash
npm start test-fixtures/small-project -- --skip-ai-summary --skip-embeddings
```

**Database Assertions:**
```typescript
describe('Small Test Project Processing', () => {
  const testDir = 'test-fixtures/small-project';
  
  beforeAll(async () => {
    await runIndexer(testDir, {
      skipAISummary: true,
      skipEmbeddings: true
    });
  });

  test('should process exactly 3 files', async () => {
    const result = await db.get('SELECT COUNT(*) as count FROM files');
    expect(result.count).toBe(3); // index.ts, utils.js, package.json
  });

  test('should extract Calculator class', async () => {
    const calculator = await db.get(
      'SELECT * FROM code_nodes WHERE name = ? AND signature LIKE ?',
      ['Calculator', 'class %']
    );
    expect(calculator).toBeDefined();
    expect(calculator.language).toBe('typescript');
  });

  test('should extract 3 functions', async () => {
    const functions = await db.all(
      'SELECT * FROM code_nodes WHERE signature LIKE ?',
      ['function %']
    );
    expect(functions.length).toBe(3); // add, multiply, greet
  });

  test('should have 1 commit', async () => {
    const result = await db.get('SELECT COUNT(*) as count FROM commits');
    expect(result.count).toBe(1);
  });

  test('should link code nodes to files', async () => {
    const codeInIndex = await db.all(`
      SELECT cn.name, f.file_name 
      FROM code_nodes cn 
      JOIN files f ON cn.file_path = f.file_path 
      WHERE f.file_name = 'index'
    `);
    expect(codeInIndex.length).toBe(3); // Calculator, add, multiply, greet
  });
});
```

### Test Scenario 3: Multi-Language Project

**Setup:**
```bash
mkdir -p test-fixtures/multi-lang/src
cd test-fixtures/multi-lang

# TypeScript file
cat > src/main.ts << 'EOF'
interface User {
  id: number;
  name: string;
}

class UserService {
  getUser(id: number): User | null {
    return null;
  }
}
EOF

# Python file
cat > src/utils.py << 'EOF'
def calculate_total(items):
    return sum(item['price'] for item in items)

class DataProcessor:
    def __init__(self):
        self.data = []
    
    def process(self, input_data):
        return input_data.upper()
EOF

# Java file
cat > src/Helper.java << 'EOF'
public class Helper {
    public static String formatString(String input) {
        return input.trim().toLowerCase();
    }
    
    private int count = 0;
    
    public void increment() {
        count++;
    }
}
EOF

git init && git add . && git commit -m "Multi-language project"
```

**Database Assertions:**
```typescript
describe('Multi-Language Project Processing', () => {
  test('should detect 3 different languages', async () => {
    const languages = await db.all(`
      SELECT DISTINCT language, COUNT(*) as count 
      FROM code_nodes 
      GROUP BY language
    `);
    
    const langMap = Object.fromEntries(languages.map(l => [l.language, l.count]));
    expect(langMap.typescript).toBeGreaterThan(0);
    expect(langMap.python).toBeGreaterThan(0);
    expect(langMap.java).toBeGreaterThan(0);
  });

  test('should extract TypeScript interface', async () => {
    const interface_ = await db.get(
      'SELECT * FROM code_nodes WHERE name = ? AND language = ?',
      ['User', 'typescript']
    );
    expect(interface_).toBeDefined();
  });

  test('should extract Python class', async () => {
    const pythonClass = await db.get(
      'SELECT * FROM code_nodes WHERE name = ? AND language = ?',
      ['DataProcessor', 'python']
    );
    expect(pythonClass).toBeDefined();
  });

  test('should extract Java methods', async () => {
    const javaMethods = await db.all(
      'SELECT * FROM code_nodes WHERE language = ? AND signature LIKE ?',
      ['java', 'method %']
    );
    expect(javaMethods.length).toBeGreaterThanOrEqual(2); // formatString, increment
  });
});
```

### Test Scenario 4: Error Handling - Invalid Directory

```typescript
describe('Error Handling Tests', () => {
  test('should handle non-existent directory', async () => {
    await expect(
      runIndexer('/non/existent/directory')
    ).rejects.toThrow('Directory not found');
  });

  test('should handle empty directory', async () => {
    const emptyDir = 'test-fixtures/empty-dir';
    await fs.mkdir(emptyDir, { recursive: true });
    
    const result = await runIndexer(emptyDir);
    expect(result.processedFiles).toBe(0);
    expect(result.totalNodes).toBe(0);
  });

  test('should handle directory without git', async () => {
    const noGitDir = 'test-fixtures/no-git';
    await fs.mkdir(`${noGitDir}/src`, { recursive: true });
    await fs.writeFile(`${noGitDir}/src/test.js`, 'console.log("test");');
    
    const result = await runIndexer(noGitDir);
    expect(result.processedFiles).toBe(1);
    expect(result.gitNodes).toBe(0); // No git history
  });
});
```

### Test Scenario 5: Incremental Processing

```typescript
describe('Incremental Processing Tests', () => {
  const testDir = 'test-fixtures/incremental-test';
  
  test('should process incrementally after file changes', async () => {
    // First run
    await runIndexer(testDir);
    const firstRun = await db.get('SELECT COUNT(*) as count FROM files');
    
    // Add new file
    await fs.writeFile(`${testDir}/src/new-file.ts`, 'export const x = 1;');
    await execSync(`cd ${testDir} && git add . && git commit -m "Add new file"`);
    
    // Second run
    await runIndexer(testDir);
    const secondRun = await db.get('SELECT COUNT(*) as count FROM files');
    
    expect(secondRun.count).toBe(firstRun.count + 1);
  });
});
```

## Test Execution Helpers

### Database Setup/Teardown
```typescript
// Test helper functions
export async function cleanDatabases() {
  // Clean SQLite
  if (fs.existsSync('data/metadata.db')) {
    fs.unlinkSync('data/metadata.db');
  }
  
  // Clean LanceDB
  if (fs.existsSync('data/lancedb')) {
    fs.rmSync('data/lancedb', { recursive: true });
  }
}

export async function runIndexer(directory: string, options = {}) {
  const indexer = new Indexer(directory, options);
  return await indexer.run();
}

export async function getDbConnection() {
  return new Database('data/metadata.db');
}
```

### Quick Validation Script
```bash
#!/bin/bash
# validate-processing.sh

REPO_PATH=$1
if [ -z "$REPO_PATH" ]; then
  echo "Usage: ./validate-processing.sh /path/to/repo"
  exit 1
fi

echo "🧹 Cleaning databases..."
rm -f data/metadata.db
rm -rf data/lancedb

echo "🚀 Processing repository: $REPO_PATH"
npm start "$REPO_PATH" -- --skip-ai-summary --skip-embeddings

echo "📊 Database validation:"
echo "Files: $(sqlite3 data/metadata.db 'SELECT COUNT(*) FROM files')"
echo "Directories: $(sqlite3 data/metadata.db 'SELECT COUNT(*) FROM directories')"
echo "Code nodes: $(sqlite3 data/metadata.db 'SELECT COUNT(*) FROM code_nodes')"
echo "Commits: $(sqlite3 data/metadata.db 'SELECT COUNT(*) FROM commits')"

echo "✅ Processing complete!"
```

## End-to-End Testing Scenarios

### Scenario 1: hikma-engine Self-Analysis
```bash
# Command
npm start /Users/foyzul/personal/hikma-engine -- --skip-ai-summary --skip-embeddings

# Expected Results
✅ Files processed: 27
✅ Nodes created: 298
✅ Edges created: 338
✅ Duration: < 500ms
✅ SQLite records: 292 (files + directories + code_nodes + commits)
✅ LanceDB tables: 5 (one per node type)
✅ SQLite graph: 298 nodes, 338 edges
```

### Scenario 2: Full AI Processing
```bash
# Command  
npm start /Users/foyzul/personal/hikma-engine

# Expected Results
✅ All nodes have AI summaries
✅ All nodes have vector embeddings
✅ Processing time: < 2 minutes
✅ Memory usage: < 2GB
✅ Vector search functionality works
```

### Scenario 3: Incremental Processing
```bash
# First run
npm start /path/to/repo

# Make changes to repo
echo "// New comment" >> src/index.ts
git add . && git commit -m "Test change"

# Second run (incremental)
npm start /path/to/repo

# Expected Results
✅ Only processes changed files
✅ Updates existing records
✅ Maintains data consistency
✅ Faster execution time
```

## Performance Benchmarks

### Expected Performance Metrics

| Repository Size | Files | Processing Time | Memory Usage | Database Size |
|----------------|-------|-----------------|--------------|---------------|
| Small (< 50 files) | 27 | < 500ms | < 500MB | < 10MB |
| Medium (50-200 files) | 150 | < 2s | < 1GB | < 50MB |
| Large (200+ files) | 500+ | < 10s | < 2GB | < 200MB |

### Performance Test Cases
```typescript
describe('Performance Tests', () => {
  test('should process hikma-engine in under 500ms', async () => {
    const startTime = Date.now();
    await indexer.run();
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(500);
  });
  
  test('should use less than 500MB memory', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    await indexer.run();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
    expect(memoryIncrease).toBeLessThan(500);
  });
});
```

## Error Handling Testing

### Expected Error Scenarios
```typescript
describe('Error Handling', () => {
  test('should handle non-existent repository path', async () => {
    await expect(indexer.run('/non/existent/path')).rejects.toThrow();
  });
  
  test('should handle corrupted git repository', async () => {
    // Should gracefully degrade, not crash
    const result = await indexer.run('/path/to/corrupted/repo');
    expect(result.errors).toContain('git analysis failed');
  });
  
  test('should handle database connection failures', async () => {
    // Should attempt reconnection, then graceful degradation
    mockDatabaseFailure();
    const result = await indexer.run();
    expect(result.warnings).toContain('database connection failed');
  });
});
```

## Test Data Validation Helpers

### Database Inspection Utilities
```typescript
// SQLite inspection
export async function validateSQLiteData(dbPath: string) {
  const db = new Database(dbPath);
  return {
    files: db.prepare('SELECT COUNT(*) as count FROM files').get(),
    codeNodes: db.prepare('SELECT COUNT(*) as count FROM code_nodes').get(),
    commits: db.prepare('SELECT COUNT(*) as count FROM commits').get(),
  };
}

// LanceDB inspection  
export async function validateLanceDBData(dbPath: string) {
  const db = await lancedb.connect(dbPath);
  const tables = await db.listTables();
  const tableCounts = {};
  for (const table of tables) {
    const t = await db.getTable(table);
    tableCounts[table] = await t.count();
  }
  return tableCounts;
}

// SQLite Graph inspection
export async function validateSQLiteGraphData(sqliteClient: SQLiteClient) {
  const stats = await sqliteClient.getEnhancedGraphStats();
  return {
    vertices: await g.V().count().next(),
    edges: await g.E().count().next(),
    vertexTypes: await g.V().groupCount().by(label).next(),
    edgeTypes: await g.E().groupCount().by(label).next(),
  };
}
```

## Test Execution Strategy

### Manual Testing Workflow
1. **Setup**: Ensure test repositories are available
2. **Baseline**: Run with known good repository (hikma-engine)
3. **Variations**: Test different flags and options
4. **Validation**: Check database contents match expectations
5. **Performance**: Measure and compare against benchmarks
6. **Cleanup**: Reset databases between tests

### Automated Testing Integration
```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "FileScanner"
npm test -- --grep "Database Integration"
npm test -- --grep "Performance"

# Run with coverage
npm run test:coverage
```

This testing strategy provides a comprehensive framework for validating hikma-engine functionality at every level, from individual components to full end-to-end workflows.
