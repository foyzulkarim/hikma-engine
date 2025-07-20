# Development Guide

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Git
- TypeScript knowledge

### Setup Development Environment

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd hikma-engine
   npm install
   ```

2. **Development Scripts**
   ```bash
   npm run dev          # Run with auto-reload
   npm run build        # Compile TypeScript
   npm run test         # Run tests
   npm run test:watch   # Run tests in watch mode
   npm run lint         # Check code style
   npm run lint:fix     # Fix code style issues
   ```

3. **Environment Configuration**
   Create a `.env` file in the project root:
   ```env
   HIKMA_LOG_LEVEL=debug
   HIKMA_ENABLE_CONSOLE_LOG=true
   HIKMA_SQLITE_PATH=./data/metadata.db
   HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib
   ```

## Project Architecture

### Directory Structure
```
src/
├── config/           # Configuration management
│   └── index.ts      # ConfigManager class
├── core/             # Core orchestration
│   └── indexer.ts    # Main Indexer class
├── modules/          # Processing modules
│   ├── file-scanner.ts
│   ├── ast-parser.ts
│   ├── git-analyzer.ts
│   ├── summary-generator.ts
│   ├── embedding-service.ts
│   └── data-loader.ts
├── persistence/      # Database clients
│   └── db-clients.ts
├── types/            # Type definitions
│   └── index.ts
├── utils/            # Shared utilities
│   └── logger.ts
└── index.ts          # CLI entry point
```

### Design Principles

1. **Separation of Concerns**: Each module has a single responsibility
2. **Dependency Injection**: Configuration and dependencies are injected
3. **Error Handling**: Comprehensive error handling with graceful degradation
4. **Logging**: Structured logging throughout the application
5. **Type Safety**: Full TypeScript coverage with strict type checking

## Adding New Features

### Adding a New Processing Module

1. **Create the Module File**
   ```typescript
   // src/modules/my-new-analyzer.ts
   import { Logger, getLogger } from '../utils/logger';
   import { ConfigManager } from '../config';

   export class MyNewAnalyzer {
     private logger: Logger;
     private config: ConfigManager;

     constructor(config: ConfigManager) {
       this.config = config;
       this.logger = getLogger('MyNewAnalyzer');
     }

     async analyze(input: string): Promise<AnalysisResult> {
       this.logger.info('Starting analysis', { input });
       
       try {
         // Your analysis logic here
         const result = await this.performAnalysis(input);
         
         this.logger.info('Analysis completed', { 
           resultCount: result.items.length 
         });
         
         return result;
       } catch (error) {
         this.logger.error('Analysis failed', { 
           error: error.message,
           input 
         });
         throw error;
       }
     }

     private async performAnalysis(input: string): Promise<AnalysisResult> {
       // Implementation details
     }
   }
   ```

2. **Add Type Definitions**
   ```typescript
   // src/types/index.ts
   export interface AnalysisResult {
     items: AnalysisItem[];
     metadata: Record<string, any>;
   }

   export interface AnalysisItem {
     id: string;
     type: string;
     data: any;
   }
   ```

3. **Integrate with Core Indexer**
   ```typescript
   // src/core/indexer.ts
   import { MyNewAnalyzer } from '../modules/my-new-analyzer';

   export class Indexer {
     private myNewAnalyzer: MyNewAnalyzer;

     constructor(projectRoot: string, config: ConfigManager) {
       // ... existing code
       this.myNewAnalyzer = new MyNewAnalyzer(config);
     }

     async run(options: IndexingOptions): Promise<IndexingResult> {
       // ... existing pipeline steps
       
       // Add your analysis step
       const analysisResults = await this.myNewAnalyzer.analyze(input);
       
       // ... continue with pipeline
     }
   }
   ```

4. **Add Configuration Support**
   ```typescript
   // src/config/index.ts
   export interface AppConfig {
     // ... existing config
     myNewAnalyzer: {
       enabled: boolean;
       options: Record<string, any>;
     };
   }
   ```

5. **Write Tests**
   ```typescript
   // tests/my-new-analyzer.test.ts
   import { MyNewAnalyzer } from '../src/modules/my-new-analyzer';
   import { ConfigManager } from '../src/config';

   describe('MyNewAnalyzer', () => {
     let analyzer: MyNewAnalyzer;
     let config: ConfigManager;

     beforeEach(() => {
       config = new ConfigManager('/test/path');
       analyzer = new MyNewAnalyzer(config);
     });

     test('should analyze input correctly', async () => {
       const result = await analyzer.analyze('test input');
       expect(result.items).toBeDefined();
       expect(result.items.length).toBeGreaterThan(0);
     });
   });
   ```

### Adding New Node Types

1. **Define the Node Type**
   ```typescript
   // src/types/index.ts
   export interface MyCustomNode extends BaseNode {
     type: 'my-custom';
     customProperty: string;
     customData: CustomData;
   }

   export interface CustomData {
     field1: string;
     field2: number;
   }
   ```

2. **Update Node Type Union**
   ```typescript
   // src/types/index.ts
   export type Node = 
     | FileNode 
     | DirectoryNode 
     | FunctionNode 
     | ClassNode
     | MyCustomNode;  // Add your new type
   ```

3. **Update Database Schema**
   ```typescript
   // src/persistence/db-clients.ts
   export class SQLiteClient {
     async initialize(): Promise<void> {
       // ... existing tables
       
       await this.db.exec(`
         CREATE TABLE IF NOT EXISTS my_custom_nodes (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           path TEXT NOT NULL,
           custom_property TEXT,
           custom_data TEXT,
           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
         )
       `);
     }
   }
   ```

## Testing Guidelines

### Unit Tests
- Test individual modules in isolation
- Mock external dependencies
- Focus on business logic and edge cases

```typescript
// Example unit test
describe('FileScanner', () => {
  test('should filter files by pattern', () => {
    const scanner = new FileScanner(mockConfig);
    const files = scanner.filterFiles([
      'src/index.ts',
      'src/test.spec.ts',
      'node_modules/lib.js'
    ]);
    
    expect(files).toEqual(['src/index.ts', 'src/test.spec.ts']);
  });
});
```

### Integration Tests
- Test module interactions
- Use real databases with test data
- Verify end-to-end workflows

```typescript
// Example integration test
describe('Indexer Integration', () => {
  test('should process a simple project', async () => {
    const tempDir = await createTempProject();
    const indexer = new Indexer(tempDir, testConfig);
    
    const result = await indexer.run({ dryRun: true });
    
    expect(result.processedFiles).toBeGreaterThan(0);
    expect(result.totalNodes).toBeGreaterThan(0);
  });
});
```

### Test Data Management
- Use fixtures for consistent test data
- Clean up test databases after each test
- Use temporary directories for file system tests

## Code Style and Standards

### TypeScript Guidelines
- Use strict type checking
- Prefer interfaces over types for object shapes
- Use enums for constants with multiple values
- Always specify return types for public methods

### Error Handling
- Use custom error classes for different error types
- Always log errors with context
- Implement graceful degradation where possible
- Don't swallow errors silently

```typescript
// Good error handling example
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  this.logger.error('Operation failed', {
    operation: 'riskyOperation',
    error: error.message,
    context: { /* relevant context */ }
  });
  
  // Decide whether to rethrow, return default, or handle gracefully
  throw new CustomError('Failed to perform operation', error);
}
```

### Logging Best Practices
- Use structured logging with metadata
- Log at appropriate levels (debug, info, warn, error)
- Include operation context in log messages
- Use operation tracking for long-running processes

```typescript
// Good logging example
const operation = this.logger.startOperation('processFile');
try {
  this.logger.info('Processing file', { filePath, fileSize });
  
  const result = await this.processFile(filePath);
  
  operation.end({ 
    success: true, 
    resultSize: result.length 
  });
  
  return result;
} catch (error) {
  operation.end({ 
    success: false, 
    error: error.message 
  });
  throw error;
}
```

## Database Development

### Adding New Database Operations

1. **Extend Database Client Interface**
   ```typescript
   // src/persistence/db-clients.ts
   export interface DatabaseClient {
     // ... existing methods
     myNewOperation(params: OperationParams): Promise<OperationResult>;
   }
   ```

2. **Implement in Each Client**
   ```typescript
   export class SQLiteClient implements DatabaseClient {
     async myNewOperation(params: OperationParams): Promise<OperationResult> {
       const stmt = this.db.prepare(`
         SELECT * FROM nodes WHERE condition = ?
       `);
       
       return stmt.all(params.condition);
     }
   }
   ```

3. **Add Migration Support**
   ```typescript
   // For schema changes, add migration logic
   async migrate(): Promise<void> {
     const version = await this.getSchemaVersion();
     
     if (version < 2) {
       await this.db.exec(`
         ALTER TABLE nodes ADD COLUMN new_field TEXT
       `);
       await this.setSchemaVersion(2);
     }
   }
   ```

## Performance Optimization

### Profiling and Monitoring
- Use the built-in operation tracking for performance monitoring
- Profile memory usage for large repositories
- Monitor database query performance

### Optimization Strategies
- Batch database operations
- Use streaming for large file processing
- Implement caching for expensive operations
- Parallelize independent operations

```typescript
// Example of batched operations
async processBatch<T>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
  }
}
```

## Debugging

### Common Issues and Solutions

1. **Database Connection Errors**
   - Check file permissions for SQLite
   - Verify database paths exist
   - Check connection strings for remote databases

2. **Memory Issues with Large Repositories**
   - Increase Node.js memory limit: `node --max-old-space-size=4096`
   - Process files in smaller batches
   - Use streaming where possible

3. **AI Service Timeouts**
   - Reduce batch sizes for embeddings
   - Implement retry logic with exponential backoff
   - Check network connectivity

### Debug Configuration
```typescript
// Enable debug logging
const config = {
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: true,
    logFilePath: './debug.log'
  }
};
```

## Contributing Guidelines

### Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Update documentation if needed
4. Run full test suite
5. Submit PR with clear description

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Error handling is appropriate
- [ ] Logging is structured and informative
- [ ] Performance impact is considered

### Release Process
1. Update version in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Build and test release artifacts
5. Deploy to production environment

## Backup and Restore

### Single Database Architecture

With the unified SQLite architecture, all data (metadata, graph relationships, and vector embeddings) is stored in a single database file, making backup and restore operations simple and reliable.

### Backup Procedures

#### Manual Backup
```bash
# Simple file copy backup
cp ./data/metadata.db ./backups/metadata-$(date +%Y%m%d-%H%M%S).db

# Verify backup integrity
sqlite3 ./backups/metadata-backup.db "PRAGMA integrity_check;"
```

#### Automated Backup Script
```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="./backups"
DB_PATH="./data/metadata.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/metadata-${TIMESTAMP}.db"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
cp "$DB_PATH" "$BACKUP_FILE"

# Verify backup
if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Optional: Compress backup
    gzip "$BACKUP_FILE"
    echo "Backup compressed: ${BACKUP_FILE}.gz"
else
    echo "Backup verification failed"
    rm "$BACKUP_FILE"
    exit 1
fi

# Optional: Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "metadata-*.db.gz" -mtime +7 -delete
```

#### Production Backup with SQLite Backup API
```typescript
// backup-service.ts
import Database from 'better-sqlite3';

export class BackupService {
  async createBackup(sourcePath: string, backupPath: string): Promise<void> {
    const source = new Database(sourcePath, { readonly: true });
    const backup = source.backup(backupPath);
    
    return new Promise((resolve, reject) => {
      backup.on('progress', ({ totalPages, remainingPages }) => {
        console.log(`Backup progress: ${totalPages - remainingPages}/${totalPages} pages`);
      });
      
      backup.on('done', () => {
        console.log('Backup completed successfully');
        source.close();
        resolve();
      });
      
      backup.on('error', (error) => {
        console.error('Backup failed:', error);
        source.close();
        reject(error);
      });
    });
  }
}
```

### Restore Procedures

#### Simple Restore
```bash
# Stop the application first
# Then restore from backup
cp ./backups/metadata-20240120-143000.db ./data/metadata.db

# Verify restored database
sqlite3 ./data/metadata.db "PRAGMA integrity_check;"

# Restart the application
```

#### Restore with Verification
```bash
#!/bin/bash
# restore-database.sh

BACKUP_FILE="$1"
DB_PATH="./data/metadata.db"
DB_BACKUP="${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

# Verify backup file exists and is valid
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing backup..."
    gunzip -c "$BACKUP_FILE" > /tmp/restore.db
    BACKUP_FILE="/tmp/restore.db"
fi

# Verify backup integrity
if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Backup file is corrupted"
    exit 1
fi

# Create backup of current database
if [ -f "$DB_PATH" ]; then
    echo "Creating backup of current database..."
    cp "$DB_PATH" "$DB_BACKUP"
fi

# Restore from backup
echo "Restoring database from backup..."
cp "$BACKUP_FILE" "$DB_PATH"

# Verify restored database
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Database restored successfully"
    
    # Clean up temporary files
    [ -f "/tmp/restore.db" ] && rm "/tmp/restore.db"
    
    echo "Previous database backed up to: $DB_BACKUP"
else
    echo "Restored database is corrupted, rolling back..."
    cp "$DB_BACKUP" "$DB_PATH"
    exit 1
fi
```

### Docker Backup and Restore

#### Backup from Docker Container
```bash
# Create backup from running container
docker exec hikma-api cp /app/data/metadata.db /app/data/backup.db
docker cp hikma-api:/app/data/backup.db ./backups/metadata-$(date +%Y%m%d).db

# Or use volume backup
docker run --rm -v hikma_data:/data -v $(pwd)/backups:/backup alpine \
  cp /data/metadata.db /backup/metadata-$(date +%Y%m%d).db
```

#### Restore to Docker Container
```bash
# Stop container
docker-compose down

# Restore backup to volume
docker run --rm -v hikma_data:/data -v $(pwd)/backups:/backup alpine \
  cp /backup/metadata-20240120.db /data/metadata.db

# Start container
docker-compose up -d
```

### Kubernetes Backup and Restore

#### Backup from Kubernetes Pod
```bash
# Create backup
kubectl exec -n hikma-engine deployment/hikma-api -- \
  cp /app/data/metadata.db /app/data/backup.db

# Copy backup to local machine
kubectl cp hikma-engine/hikma-api-pod:/app/data/backup.db \
  ./backups/metadata-$(date +%Y%m%d).db
```

#### Restore to Kubernetes
```bash
# Copy backup to pod
kubectl cp ./backups/metadata-20240120.db \
  hikma-engine/hikma-api-pod:/app/data/metadata.db

# Restart deployment to pick up restored database
kubectl rollout restart deployment/hikma-api -n hikma-engine
```

### Backup Best Practices

1. **Regular Automated Backups**: Set up cron jobs or scheduled tasks
2. **Multiple Backup Locations**: Store backups in different locations (local, cloud, etc.)
3. **Backup Verification**: Always verify backup integrity after creation
4. **Retention Policy**: Implement backup rotation to manage storage space
5. **Test Restores**: Regularly test restore procedures
6. **Monitor Backup Size**: Track backup size growth over time

### Disaster Recovery

#### Complete System Recovery
```bash
# 1. Set up new environment
git clone <repository>
cd hikma-engine
npm install

# 2. Restore database
cp ./backups/latest-backup.db ./data/metadata.db

# 3. Verify database integrity
sqlite3 ./data/metadata.db "PRAGMA integrity_check;"

# 4. Start application
npm start
```

#### Point-in-Time Recovery
Since SQLite doesn't have built-in point-in-time recovery, implement application-level logging:

```typescript
// audit-log.ts
export class AuditLogger {
  async logOperation(operation: string, data: any): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      data: JSON.stringify(data)
    };
    
    // Log to separate audit database or file
    await this.auditDb.run(
      'INSERT INTO audit_log (timestamp, operation, data) VALUES (?, ?, ?)',
      [logEntry.timestamp, logEntry.operation, logEntry.data]
    );
  }
}
```

## Troubleshooting

### Common Development Issues

**TypeScript Compilation Errors**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
npm run build
```

**Test Failures**
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- my-test.test.ts
```

**Database Issues**
```bash
# Reset databases
npm run clean
npm start  # Will recreate databases
```

**Dependency Issues**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```
