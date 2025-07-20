# hikma-engine

A sophisticated TypeScript-based code knowledge graph indexer that transforms Git repositories into multi-dimensional knowledge stores for AI agents. hikma-engine creates interconnected representations of codebases through AST parsing, Git analysis, AI-powered summarization, and vector embeddings.

## 🚀 Features

- **Multi-Language Support**: TypeScript, JavaScript, Python, Java, Go, C/C++, and more
- **AST-Based Analysis**: Deep code structure extraction with function, class, and test detection
- **Git Integration**: Complete commit history analysis and file evolution tracking
- **AI-Enhanced**: LLM-powered summaries for files and directories
- **Vector Embeddings**: Semantic similarity search using transformer models
- **Unified Persistence**: SQLite with vector extension for all data types
- **Incremental Indexing**: Process only changes since last run
- **Test Analysis**: Automatic test detection and coverage mapping
- **Configurable**: Environment-based configuration with sensible defaults

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git repository to analyze

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd hikma-engine

# Install dependencies
npm install

# Build the project (optional)
npm run build
```

## 🚀 Quick Start

```bash
# Index current directory
npm start

# Index specific project
npm start /path/to/your/project

# Force full re-indexing
npm start -- --force-full

# Dry run (no data persistence)
npm start -- --dry-run

# Skip AI summary generation
npm start -- --skip-ai-summary

# Skip vector embedding generation
npm start -- --skip-embeddings
```

## 📁 Project Structure

```
hikma-engine/
├── src/
│   ├── config/              # Configuration management
│   │   └── index.ts
│   ├── core/                # Core business logic
│   │   └── indexer.ts       # Main pipeline orchestrator
│   ├── modules/             # Processing modules
│   │   ├── file-scanner.ts  # File discovery
│   │   ├── ast-parser.ts    # Code structure extraction
│   │   ├── git-analyzer.ts  # Git history analysis
│   │   ├── summary-generator.ts  # AI-powered summaries
│   │   ├── embedding-service.ts  # Vector embeddings
│   │   └── data-loader.ts   # Database persistence
│   ├── persistence/         # Database clients
│   │   └── db-clients.ts
│   ├── types/               # Type definitions
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   └── logger.ts
│   └── index.ts             # Application entry point
├── tests/                   # Test files
├── docs/                    # Documentation
├── data/                    # Generated databases
└── package.json
```

## 🏗️ Architecture

### Pipeline Overview

hikma-engine processes repositories through a 7-phase pipeline:

1. **File Discovery** - Identifies relevant source files
2. **AST Parsing** - Extracts code structures and relationships
3. **Git Analysis** - Processes commit history and evolution
4. **AI Summary Generation** - Creates intelligent summaries
5. **Embedding Generation** - Generates vector embeddings
6. **Data Persistence** - Stores in polyglot databases
7. **State Management** - Tracks indexing progress

### Data Model

#### Node Types
- **CodeNode**: Functions, methods, classes
- **FileNode**: Source code files (with AI summaries)
- **DirectoryNode**: Directory structures (with AI summaries)
- **CommitNode**: Git commits with metadata
- **TestNode**: Test methods and cases
- **PullRequestNode**: Pull request information

#### Relationship Types
- **CALLS**: Function call relationships
- **DEFINED_IN**: Code-to-file relationships
- **CONTAINS**: Directory-to-file relationships
- **TESTS/TESTED_BY**: Test coverage relationships
- **MODIFIED/EVOLVED_BY**: Git history relationships

### Storage Strategy

- **SQLite with Vector Extension**: Unified storage for metadata, graph relationships, and vector embeddings
- **sqlite-vec**: Enables efficient semantic similarity search within SQLite
- **Single Database**: Simplified architecture with ACID transactions and unified queries

## ⚙️ Configuration

### Environment Variables

```bash
# Database paths
HIKMA_SQLITE_PATH=./data/metadata.db
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib

# Logging
HIKMA_LOG_LEVEL=info  # debug, info, warn, error
```

### Configuration File

The system uses sensible defaults but can be customized through the configuration system:

```typescript
// Example configuration override
const config = {
  ai: {
    embedding: {
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 32
    },
    summary: {
      model: 'Xenova/distilbart-cnn-6-6',
      maxTokens: 150
    }
  },
  indexing: {
    maxFileSize: 1024 * 1024, // 1MB
    filePatterns: ['**/*.ts', '**/*.js', '**/*.py']
  }
};
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📊 Usage Examples

### Basic Indexing

```bash
# Index a TypeScript project
npm start /path/to/typescript-project

# Index with full logging
HIKMA_LOG_LEVEL=debug npm start /path/to/project
```

### Advanced Options

```bash
# Force complete re-indexing
npm start /path/to/project -- --force-full

# Skip expensive operations for quick analysis
npm start /path/to/project -- --skip-ai-summary --skip-embeddings

# Test run without persistence
npm start /path/to/project -- --dry-run
```

### Incremental Updates

```bash
# First run (full indexing)
npm start /path/to/project

# Subsequent runs (incremental)
npm start /path/to/project  # Only processes changes since last run
```

## 🔧 Development

### Building

```bash
# Compile TypeScript
npm run build

# Development mode with auto-reload
npm run dev
```

### Linting

```bash
# Check code style
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Cleaning

```bash
# Remove generated files and databases
npm run clean
```

## 📈 Performance

### Optimization Tips

1. **Incremental Indexing**: Use for regular updates
2. **File Filtering**: Adjust `filePatterns` to exclude unnecessary files
3. **Batch Processing**: Configure appropriate batch sizes for embeddings
4. **Resource Limits**: Set `maxFileSize` to skip large files

### Monitoring

The system provides comprehensive logging and performance metrics:

```bash
# Enable debug logging
HIKMA_LOG_LEVEL=debug npm start

# Monitor processing times
# Check logs for operation durations and statistics
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new functionality
- Update documentation for API changes
- Use the existing logging and error handling patterns

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with TypeScript and Node.js
- Uses Xenova/transformers for AI capabilities
- Leverages simple-git for Git analysis
- Powered by better-sqlite3 and sqlite-vec extension

## 📞 Support

- Create an issue for bug reports
- Start a discussion for feature requests
- Check the documentation in the `docs/` directory

---

**hikma-engine** - Transforming code repositories into intelligent knowledge graphs for the AI era.


