# Docker Usage Guide for Hikma Engine

This guide explains how to use Docker to index source repositories and run the Semantic Search API.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Setup                             │
├─────────────────────────────────────────────────────────────┤
│  Host Machine                                               │
│  ├── /path/to/your/source/repo  ──────────────────────┐    │
│  └── /path/to/another/project   ──────────────────────┼─┐  │
├─────────────────────────────────────────────────────────┼─┼──┤
│  Docker Containers                                     │ │  │
│  ├── hikma-indexer (processes source)  ←──────────────┘ │  │
│  ├── hikma-api (serves search API)                      │  │
│  └── redis (caching)                                    │  │
├─────────────────────────────────────────────────────────────┤
│  Shared Volumes                                             │
│  ├── hikma-data (databases persist here)  ←─────────────────┘  │
│  └── source mount (read-only access to your code)          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Method 1: Direct Repository Mounting

```bash
# Set the path to your source repository
export SOURCE_REPO_PATH="/path/to/your/source/repository"

# Start the services
docker-compose up -d

# Index the repository (one-time operation)
docker-compose --profile indexing run --rm hikma-indexer

# Access the API
curl "http://localhost:3000/api/v1/search/semantic?q=authentication&limit=5"
```

### Method 2: Using Environment File

Create a `.env` file:

```bash
# .env file
SOURCE_REPO_PATH=/Users/yourname/projects/my-awesome-project
INDEX_ON_STARTUP=true
HIKMA_API_PORT=3000
```

Then run:

```bash
docker-compose up -d
```

## 📁 Volume Mounting Options

### Option 1: Single Repository
```bash
# Mount a single repository
export SOURCE_REPO_PATH="/path/to/your/repo"
docker-compose up -d
```

### Option 2: Multiple Repositories
```yaml
# In docker-compose.override.yml
services:
  hikma-indexer:
    volumes:
      - /path/to/repo1:/app/source/repo1:ro
      - /path/to/repo2:/app/source/repo2:ro
      - /path/to/repo3:/app/source/repo3:ro
```

### Option 3: Workspace Directory
```bash
# Mount your entire workspace
export SOURCE_REPO_PATH="/Users/yourname/workspace"
docker-compose up -d
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOURCE_REPO_PATH` | Host path to source repository | `./sample-repo` |
| `INDEX_ON_STARTUP` | Auto-index on container start | `false` |
| `HIKMA_API_PORT` | API server port | `3000` |
| `HIKMA_SOURCE_PATH` | Container path to source | `/app/source` |

### Docker Compose Profiles

| Profile | Description | Usage |
|---------|-------------|-------|
| `default` | API + databases only | `docker-compose up` |
| `indexing` | Include indexer service | `docker-compose --profile indexing up` |
| `monitoring` | Include Prometheus/Grafana | `docker-compose --profile monitoring up` |
| `with-proxy` | Include Nginx proxy | `docker-compose --profile with-proxy up` |

## 📋 Step-by-Step Usage

### Step 1: Prepare Your Repository

```bash
# Navigate to your project directory
cd /path/to/your/project

# Ensure it's a Git repository
git status

# Note the absolute path
pwd
# Example output: /Users/yourname/projects/my-awesome-project
```

### Step 2: Configure Docker

```bash
# Set the source repository path
export SOURCE_REPO_PATH="/Users/yourname/projects/my-awesome-project"

# Optional: Create .env file for persistence
echo "SOURCE_REPO_PATH=/Users/yourname/projects/my-awesome-project" > .env
echo "INDEX_ON_STARTUP=false" >> .env
```

### Step 3: Start the Services

```bash
# Start databases and API
docker-compose up -d

# Verify services are running
docker-compose ps
```

### Step 4: Index Your Repository

```bash
# Option A: Run indexer as a one-time job
docker-compose --profile indexing run --rm hikma-indexer

# Option B: Run indexer with custom command
docker-compose --profile indexing run --rm hikma-indexer node dist/cli/index.ts --source /app/source

# Option C: Interactive indexing
docker-compose --profile indexing run --rm hikma-indexer sh
# Inside container: node dist/cli/index.ts --source /app/source --verbose
```

### Step 5: Use the API

```bash
# Health check
curl "http://localhost:3000/api/v1/monitoring/health"

# Semantic search
curl "http://localhost:3000/api/v1/search/semantic?q=authentication%20function&limit=10"

# Structural search
curl "http://localhost:3000/api/v1/search/structure?q=class%20UserService&language=typescript"

# Browse API documentation
open http://localhost:3000/api/v1/docs
```

## 🔄 Re-indexing and Updates

### Incremental Updates
```bash
# Re-run indexer to pick up changes
docker-compose --profile indexing run --rm hikma-indexer

# Or with incremental flag
docker-compose --profile indexing run --rm hikma-indexer node dist/cli/index.ts --source /app/source --incremental
```

### Full Re-index
```bash
# Clear existing data and re-index
docker-compose down
docker volume rm hikma-engine_hikma-data
docker-compose up -d
docker-compose --profile indexing run --rm hikma-indexer
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Permission Denied
```bash
# Issue: Container can't read source files
# Solution: Check file permissions
ls -la /path/to/your/repo
chmod -R +r /path/to/your/repo
```

#### 2. Path Not Found
```bash
# Issue: SOURCE_REPO_PATH doesn't exist
# Solution: Use absolute paths
export SOURCE_REPO_PATH="$(pwd)/your-repo"
```

#### 3. Empty Index
```bash
# Issue: No files were indexed
# Solution: Check file patterns and exclusions
docker-compose --profile indexing run --rm hikma-indexer node dist/cli/index.ts --source /app/source --verbose
```

#### 4. Database Connection Issues
```bash
# Issue: Can't connect to databases
# Solution: Ensure services are running
docker-compose ps
docker-compose logs redis
```

### Debug Commands

```bash
# Check mounted volumes
docker-compose --profile indexing run --rm hikma-indexer ls -la /app/source

# View indexer logs
docker-compose --profile indexing run --rm hikma-indexer node dist/cli/index.ts --source /app/source --verbose

# Interactive debugging
docker-compose --profile indexing run --rm hikma-indexer sh

# Check API logs
docker-compose logs hikma-api

# Monitor database files
docker-compose exec hikma-api ls -la /app/data
```

## 📊 Monitoring Indexing Progress

### Real-time Monitoring
```bash
# Watch indexer progress
docker-compose --profile indexing run --rm hikma-indexer node dist/cli/index.ts --source /app/source --verbose

# Monitor API health during indexing
watch -n 5 'curl -s http://localhost:3000/api/v1/monitoring/health | jq .data.status'

# Check database sizes
docker-compose exec hikma-api du -sh /app/data/*
```

### Post-Indexing Verification
```bash
# Check indexed file count
curl -s "http://localhost:3000/api/v1/monitoring/system" | jq '.data'

# Test search functionality
curl -s "http://localhost:3000/api/v1/search/semantic?q=test&limit=1" | jq '.data.totalResults'

# Verify database health
curl -s "http://localhost:3000/api/v1/monitoring/health" | jq '.data.checks'
```

## 🔧 Advanced Configuration

### Custom Docker Compose Override

Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  hikma-indexer:
    environment:
      - HIKMA_LOG_LEVEL=debug
      - HIKMA_INCLUDE_PATTERNS=**/*.ts,**/*.js,**/*.py
      - HIKMA_EXCLUDE_PATTERNS=**/node_modules/**,**/dist/**
    volumes:
      # Mount multiple repositories
      - /path/to/repo1:/app/source/repo1:ro
      - /path/to/repo2:/app/source/repo2:ro
      # Mount configuration files
      - ./custom-config.json:/app/config/custom.json:ro

  hikma-api:
    environment:
      - HIKMA_API_LOG_LEVEL=debug
    ports:
      - "3001:3000"  # Use different port
```

### Batch Processing Multiple Repositories

```bash
#!/bin/bash
# batch-index.sh

REPOS=(
  "/path/to/repo1"
  "/path/to/repo2" 
  "/path/to/repo3"
)

for repo in "${REPOS[@]}"; do
  echo "Indexing $repo..."
  SOURCE_REPO_PATH="$repo" docker-compose --profile indexing run --rm hikma-indexer
done
```

## 🚀 Production Deployment

### Using Docker Swarm
```bash
# Deploy to swarm
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml hikma-engine
```

### Using Kubernetes
```bash
# Create ConfigMap for source repository
kubectl create configmap source-repo --from-file=/path/to/your/repo

# Deploy to Kubernetes
kubectl apply -f k8s/
```

This setup ensures your source repositories are properly accessible to the containerized Hikma Engine while keeping your data persistent and secure! 🐳✨
