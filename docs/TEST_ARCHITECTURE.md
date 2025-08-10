# Test Architecture Guide

## 🎯 Test Organization Standards

This document defines the standardized test architecture for the Hikma Engine project.

## 📁 Directory Structure

```
src/
├── [module]/
│   ├── [file].ts
│   ├── [file].test.ts              # Unit tests (co-located)
│   └── __tests__/                  # Integration tests
│       ├── [module].integration.test.ts
│       └── [module].e2e.test.ts
└── __tests__/                      # System-wide integration tests

tests/                              # System-level tests only
├── setup.ts                       # Test configuration
├── fixtures/                      # Test data
└── [system].integration.test.ts   # End-to-end system tests
```

## 🏷️ Naming Conventions

### Unit Tests
- **Location**: Co-located with source files
- **Naming**: `[filename].test.ts` or `[filename].spec.ts`
- **Purpose**: Test individual functions, classes, or modules in isolation

### Integration Tests
- **Location**: `__tests__/` directory within relevant module
- **Naming**: `[feature].integration.test.ts`
- **Purpose**: Test interaction between multiple components

### End-to-End Tests
- **Location**: `__tests__/` directory or root `tests/`
- **Naming**: `[feature].e2e.test.ts`
- **Purpose**: Test complete user workflows

### System Tests
- **Location**: Root `tests/` directory
- **Naming**: `[system].integration.test.ts`
- **Purpose**: Test entire system functionality

## 📋 Test Categories

### ✅ Unit Tests (Co-located)
```
src/api/config/api-config.test.ts
src/api/middleware/auth.test.ts
src/modules/data-loader.test.ts
src/modules/search-service.test.ts
src/persistence/db/connection.test.ts
```

### 🔗 Integration Tests (Module __tests__)
```
src/api/__tests__/api-integration.test.ts
src/modules/__tests__/llm-provider-integration.test.ts
src/persistence/__tests__/db-schema.test.ts
```

### 🌐 System Tests (Root tests/)
```
tests/integration-pipeline.test.ts
tests/unified-database-integration.test.ts
tests/setup.ts
```

## 🛠️ Jest Configuration

The Jest configuration automatically discovers tests using these patterns:
- `**/__tests__/**/*.ts` - Integration tests in __tests__ directories
- `**/?(*.)+(spec|test).ts` - Unit tests co-located with source files

## 📝 Writing New Tests

### For Unit Tests:
1. Create `[filename].test.ts` next to the source file
2. Test individual functions/classes in isolation
3. Mock external dependencies

### For Integration Tests:
1. Create `__tests__/` directory in the relevant module
2. Name file `[feature].integration.test.ts`
3. Test component interactions

### For System Tests:
1. Add to root `tests/` directory
2. Name file `[system].integration.test.ts`
3. Test end-to-end workflows

## 🔧 Import Path Guidelines

### Unit Tests (co-located):
```typescript
import { MyClass } from './my-class';  // Same directory
import { Helper } from '../utils/helper';  // Relative paths
```

### Integration Tests (in __tests__):
```typescript
import { APIServer } from '../server';  // Parent directory
import { Config } from '../../config';  // Grandparent directory
```

### System Tests (in root tests/):
```typescript
import { MyClass } from '../src/modules/my-class';  // From src
```

## ✨ Benefits of This Architecture

1. **Discoverability**: Tests are easy to find next to the code they test
2. **Maintainability**: When you modify code, the test is right there
3. **Scalability**: Works well as the codebase grows
4. **Industry Standard**: Follows TypeScript/Node.js best practices
5. **Clear Separation**: Different test types have clear locations

## 🚀 Migration Complete

The test architecture has been standardized. All existing tests have been moved to their correct locations according to this guide.

Going forward, follow these conventions for all new tests.