# Search API Endpoints Documentation

This document describes the search API endpoints implemented for the hikma-engine semantic search functionality.

## Base URL

```
http://localhost:3000/api/v1/search
```

## Authentication

Currently, no authentication is required for the search endpoints.

## Rate Limiting

- **Development**: 1000 requests per 15 minutes per IP
- **Production**: 100 requests per 15 minutes per IP

## Response Format

All endpoints return responses in the following standardized format:

```json
{
  "success": true,
  "data": {
    // Endpoint-specific data
  },
  "meta": {
    "timestamp": "2025-07-18T22:06:36.694Z",
    "requestId": "req_md9dcjuu_4e73efb1",
    "processingTime": 13,
    "path": "/semantic",
    "method": "GET"
  }
}
```

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Query parameter 'q' is required",
    "details": {
      "field": "q",
      "value": null
    }
  },
  "meta": {
    "timestamp": "2025-07-18T22:06:36.694Z",
    "requestId": "req_md9dcjuu_4e73efb1"
  }
}
```

## Endpoints

### 1. Semantic Search

**Task 4 Implementation**

Performs semantic search using vector embeddings with text-based fallback.

```
GET /api/v1/search/semantic
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `limit` | number | No | 10 | Maximum results (1-100) |
| `nodeTypes` | string | No | all | Comma-separated node types to search |
| `minSimilarity` | number | No | 0.1 | Minimum similarity threshold (0-1) |
| `includeMetadata` | boolean | No | true | Include metadata in results |

#### Example Request

```bash
curl "http://localhost:3000/api/v1/search/semantic?q=function%20test&limit=5&nodeTypes=CodeNode,FileNode"
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "node": {
          "id": "code_123",
          "type": "CodeNode",
          "properties": {
            "name": "testFunction",
            "signature": "function testFunction(): void",
            "language": "typescript",
            "filePath": "src/test.ts",
            "startLine": 10,
            "endLine": 15
          }
        },
        "similarity": 0.85,
        "rank": 1,
        "context": {
          "filePath": "src/test.ts",
          "fileName": "test.ts",
          "breadcrumbs": ["src", "src/test.ts"],
          "beforeLines": ["// Helper functions", ""],
          "afterLines": ["", "// End of function"]
        },
        "metadata": {
          "language": "typescript",
          "author": "developer",
          "lastModified": "2025-07-18T10:00:00Z",
          "fileSize": 1024
        }
      }
    ],
    "totalResults": 1,
    "cached": false
  },
  "meta": {
    "timestamp": "2025-07-18T22:06:36.694Z",
    "requestId": "req_md9dcjuu_4e73efb1",
    "processingTime": 13
  }
}
```

### 2. Structural Search

**Task 5 Implementation**

Searches for code structures and patterns using AST data.

```
GET /api/v1/search/structure
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `language` | string | No | - | Programming language filter |
| `type` | string | No | - | Element type (function, class, interface, variable) |
| `filePath` | string | No | - | File path pattern |
| `limit` | number | No | 10 | Maximum results (1-100) |

#### Example Request

```bash
curl "http://localhost:3000/api/v1/search/structure?q=test&language=typescript&type=function"
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "node": {
          "id": "code_456",
          "type": "CodeNode",
          "properties": {
            "name": "testHelper",
            "signature": "function testHelper(param: string): boolean",
            "language": "typescript"
          }
        },
        "similarity": 1.0,
        "rank": 1,
        "context": {
          "syntaxHighlighted": "**function** testHelper(param: string): boolean"
        }
      }
    ],
    "totalResults": 1,
    "cached": false,
    "filters": {
      "language": "typescript",
      "elementType": "function"
    }
  }
}
```

### 3. Git History Search

**Task 6 Implementation**

Searches through git commit history and authorship data.

```
GET /api/v1/search/git
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `author` | string | No | - | Author filter |
| `dateFrom` | string | No | - | Start date (ISO format) |
| `dateTo` | string | No | - | End date (ISO format) |
| `limit` | number | No | 10 | Maximum results (1-100) |

#### Example Request

```bash
curl "http://localhost:3000/api/v1/search/git?q=fix%20bug&author=developer&dateFrom=2025-01-01"
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "node": {
          "id": "commit_789",
          "type": "CommitNode",
          "properties": {
            "hash": "abc123def456",
            "message": "Fix bug in user authentication",
            "author": "developer",
            "date": "2025-07-15T14:30:00Z"
          }
        },
        "similarity": 0.92,
        "rank": 1,
        "context": {
          "affectedFiles": ["src/auth.ts", "src/user.ts"]
        },
        "metadata": {
          "commitHash": "abc123def456",
          "commitDate": "2025-07-15T14:30:00Z",
          "diffSummary": "+15 -8 lines"
        }
      }
    ],
    "totalResults": 1,
    "cached": false,
    "filters": {
      "author": "developer",
      "dateFrom": "2025-01-01"
    }
  }
}
```

### 4. Hybrid Search

**Task 7 Implementation**

Combines multiple search dimensions with configurable weights.

```
GET /api/v1/search/hybrid
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `filters` | string | No | {} | JSON string of metadata filters |
| `weights` | string | No | {"semantic":0.4,"structural":0.3,"temporal":0.3} | JSON string of dimension weights |
| `limit` | number | No | 10 | Maximum results (1-100) |

#### Example Request

```bash
curl -G "http://localhost:3000/api/v1/search/hybrid" \
  --data-urlencode 'q=test function' \
  --data-urlencode 'filters={"language":"typescript","author":"developer"}' \
  --data-urlencode 'weights={"semantic":0.5,"structural":0.3,"temporal":0.2}'
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "node": {
          "id": "code_101",
          "type": "CodeNode",
          "properties": {
            "name": "testFunction"
          }
        },
        "similarity": 0.78,
        "rank": 1,
        "metadata": {
          "searchDimensions": ["semantic", "structural"],
          "hybridScore": 0.78
        }
      }
    ],
    "totalResults": 1,
    "cached": false,
    "weights": {
      "semantic": 0.5,
      "structural": 0.3,
      "temporal": 0.2
    },
    "filters": {
      "language": "typescript",
      "author": "developer"
    }
  }
}
```

### 5. Comprehensive Search

**Task 8 Implementation**

Performs comprehensive search with facets, suggestions, and categorization.

```
GET /api/v1/search/comprehensive
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `limit` | number | No | 20 | Maximum results (1-100) |
| `includeTypes` | string | No | all | Comma-separated node types to include |

#### Example Request

```bash
curl "http://localhost:3000/api/v1/search/comprehensive?q=authentication&limit=15"
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "node": {
          "id": "code_202",
          "type": "CodeNode",
          "properties": {
            "name": "authenticate"
          }
        },
        "similarity": 0.89,
        "rank": 1
      }
    ],
    "facets": {
      "languages": [
        {"name": "typescript", "count": 5},
        {"name": "javascript", "count": 3}
      ],
      "nodeTypes": [
        {"name": "CodeNode", "count": 8},
        {"name": "FileNode", "count": 2}
      ],
      "fileTypes": [
        {"name": "ts", "count": 5},
        {"name": "js", "count": 3}
      ],
      "authors": [
        {"name": "developer", "count": 6},
        {"name": "contributor", "count": 2}
      ]
    },
    "suggestions": [
      "authentication",
      "authenticate in typescript",
      "auth",
      "login",
      "verify"
    ],
    "categories": {
      "code": [
        // CodeNode results
      ],
      "files": [
        // FileNode results
      ],
      "commits": [
        // CommitNode results
      ]
    },
    "totalResults": 10,
    "cached": false
  }
}
```

### 6. Search Statistics

Provides information about the search service and cache statistics.

```
GET /api/v1/search/stats
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "cache": {
      "size": 25,
      "maxSize": 500,
      "oldestEntry": {
        "key": "search:semantic:test",
        "age": 120
      }
    },
    "endpoints": {
      "semantic": "/api/v1/search/semantic",
      "structural": "/api/v1/search/structure",
      "git": "/api/v1/search/git",
      "hybrid": "/api/v1/search/hybrid",
      "comprehensive": "/api/v1/search/comprehensive"
    },
    "supportedNodeTypes": [
      "CodeNode",
      "FileNode",
      "DirectoryNode",
      "CommitNode",
      "TestNode",
      "PullRequestNode"
    ]
  }
}
```

## Caching

All search endpoints implement intelligent caching:

- **Semantic search**: 5 minutes TTL
- **Structural search**: 10 minutes TTL
- **Git search**: 15 minutes TTL
- **Hybrid search**: 8 minutes TTL
- **Comprehensive search**: 10 minutes TTL

Cache keys are generated based on query parameters, so different parameter combinations will have separate cache entries.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid or missing query parameters |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Server-side error |
| `SERVICE_UNAVAILABLE` | 503 | Search service unavailable |

## Performance Notes

- All endpoints support concurrent requests
- Results are enhanced with context and metadata
- Syntax highlighting is available for code results
- File breadcrumbs and related files are included where applicable
- Search suggestions are generated based on indexed content

## Usage Examples

### Basic Semantic Search

```bash
curl "http://localhost:3000/api/v1/search/semantic?q=user%20authentication"
```

### Advanced Structural Search

```bash
curl "http://localhost:3000/api/v1/search/structure?q=login&language=typescript&type=function&filePath=src/auth"
```

### Git History with Date Range

```bash
curl "http://localhost:3000/api/v1/search/git?q=security%20fix&dateFrom=2025-01-01&dateTo=2025-07-01"
```

### Complex Hybrid Search

```bash
curl -G "http://localhost:3000/api/v1/search/hybrid" \
  --data-urlencode 'q=database connection' \
  --data-urlencode 'filters={"language":"typescript"}' \
  --data-urlencode 'weights={"semantic":0.6,"structural":0.4}'
```

### Comprehensive Search with Facets

```bash
curl "http://localhost:3000/api/v1/search/comprehensive?q=api%20endpoint&limit=25"
```
