# Enhanced Graph Database Schema

## Core Node Types

### Repository Level
- **Repository**: `repoId` (owner/name) - `url`, `defaultBranch`, `createdAt`
- **Commit**: `sha` - `message`, `author`, `timestamp`, `isMerge`

### File Level  
- **Directory**: `dirId` (repoId@rev:dirPath) - `path`, `depth`
- **File**: `fileId` (repoId@rev:path) - `path`, `ext`, `language`, `size`, `loc`, `hash`
- **Module**: `moduleId` (resolvedModuleName) - `name`, `isBuiltin`, `isExternal`, `version`

### AST Level (Deep Analysis)
- **Function**: `fnId` (fileId#name#line) - `name`, `async`, `generator`, `params`, `returnType`, `loc`
- **ArrowFunction**: same as Function - subtype for arrow functions
- **Class**: `classId` (fileId#ClassName) - `name`, `isAbstract`, `extends`, `implements`
- **Variable**: `varId` (fileId#name#line) - `name`, `kind`, `typeAnnotation`, `valueSnippet`
- **Import**: `importId` (fileId#line) - `isDefault`, `isNamespace`, `sourceModule`
- **Export**: `exportId` (fileId#exportedName) - `name`, `type` (default/named/namespace)

### Test Level
- **TestCase**: `testId` (fileId#describe#it) - `title`, `suite`, `status`

## Core Relationship Types

### File Structure
- **CONTAINS**: Repository → Directory, Directory → File
- **DECLARES**: File → Function/Class/Variable/Export
- **IMPORTS**: File → Module
- **EXPORTS**: File → Export

### Code Relationships  
- **CALLS**: Function → Function/Method
- **EXTENDS**: Class → Class
- **IMPLEMENTS**: Class → Interface
- **READS**: Function → Variable (with line/col)
- **WRITES**: Function → Variable (with line/col)
- **RETURNS**: Function → Type
- **THROWS**: Function → Class (exceptions)

### Test Relationships
- **TESTED_BY**: Function → TestCase
- **COVERS**: TestCase → Function

### Version Control
- **HAS_COMMIT**: Repository → Commit
- **TOUCHED**: Commit → File (with changeType, linesAdded, linesDeleted)

## Cross-Cutting Properties
All nodes include:
- `repoId`, `commitSha`, `filePath`, `line`, `col`
- `signatureHash` for duplicate detection
- `labels` array for tagging

## Business Key Format
- Repository: `owner/name`
- File: `repoId@sha:path`  
- Function: `fileId#functionName#startLine`
- Variable: `fileId#varName#line`
- Class: `fileId#ClassName`
