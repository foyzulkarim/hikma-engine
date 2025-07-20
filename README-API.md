# Hikma Engine Semantic Search API

A comprehensive semantic search API that provides powerful search capabilities over indexed codebases. The API leverages vector embeddings, AST parsing, git analysis, and multi-database storage to offer semantic similarity search, structural queries, git history searches, and hybrid multi-dimensional searches.

## 🚀 Features

- **Semantic Search**: Natural language and code similarity search using vector embeddings
- **Structural Search**: AST-based code structure queries for functions, classes, and modules
- **Git History Search**: Search through commit history, authors, and code evolution
- **Hybrid Search**: Multi-dimensional search combining semantic, structural, and temporal data
- **Comprehensive Search**: All-in-one search with facets, suggestions, and result categorization
- **Real-time Monitoring**: Health checks, performance metrics, and error tracking
- **Result Enhancement**: Syntax highlighting, relevance scoring, and related file discovery
- **Production Ready**: Comprehensive error handling, monitoring, and performance optimization

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Development](#development)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Performance](#performance)
- [Security](#security)
- [Testing](#testing)
- [Contributing](#contributing)

## 🏃 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker (optional, for containerized deployment)
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/hikma-engine/hikma-engine.git
   cd hikma-engine
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start the API server**
   ```bash
   npm run api:start
   ```

The API will be available at `http://localhost:3000`

### Docker Quick Start

```bash
# Build and start with Docker Compose
docker-compose up -d

# Or for development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## 📚 API Documentation

### Interactive Documentation

- **Swagger UI**: http://localhost:3000/api/v1/docs
- **OpenAPI Spec**: http://localhost:3000/api/v1/docs/openapi.json

### Core Endpoints

#### Search Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/search/semantic` | GET | Semantic similarity search |
| `/api/v1/search/structure` | GET | AST-based structural search |
| `/api/v1/search/git` | GET | Git history and commit search |
| `/api/v1/search/hybrid` | GET | Multi-dimensional hybrid search |
| `/api/v1/search/comprehensive` | GET | All-in-one search with facets |

#### Monitoring Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/monitoring/health` | GET | Health status and checks |
| `/api/v1/monitoring/metrics` | GET | Comprehensive metrics |
| `/api/v1/monitoring/performance` | GET | Performance statistics |
| `/api/v1/monitoring/system` | GET | System information |
| `/api/v1/monitoring/errors` | GET | Error statistics |

### Example Usage

#### Semantic Search
```bash
curl "http://localhost:3000/api/v1/search/semantic?q=authentication%20function&limit=10"
```

#### Structural Search
```bash
curl "http://localhost:3000/api/v1/search/structure?q=class%20UserService&language=typescript"
```

#### Health Check
```bash
curl "http://localhost:3000/api/v1/monitoring/health"
```

## ⚙️ Configuration

The API supports extensive configuration through environment variables:

### Server Configuration
```bash
HIKMA_API_PORT=3000                    # Server port
HIKMA_API_HOST=localhost               # Server host
HIKMA_API_TIMEOUT=30000               # Request timeout (ms)
```

### Database Configuration
```bash
HIKMA_SQLITE_PATH=./data/metadata.db           # SQLite database path
HIKMA_SQLITE_VEC_EXTENSION=./extensions/vec0.dylib  # Vector extension path
```

### Cache Configuration
```bash
HIKMA_API_CACHE_ENABLED=true          # Enable caching
HIKMA_API_REDIS_ENABLED=false         # Enable Redis cache
HIKMA_API_REDIS_URL=redis://localhost:6379  # Redis URL
```

### Security Configuration
```bash
HIKMA_API_CORS_ENABLED=true           # Enable CORS
HIKMA_API_RATE_LIMIT_ENABLED=true     # Enable rate limiting
HIKMA_API_KEY_ENABLED=false           # Enable API key auth
HIKMA_API_JWT_ENABLED=false           # Enable JWT auth
```

### Monitoring Configuration
```bash
HIKMA_API_MONITORING_ENABLED=true     # Enable monitoring
HIKMA_API_HEALTH_CHECK_ENABLED=true   # Enable health checks
HIKMA_API_METRICS_ENABLED=true        # Enable metrics collection
```

For a complete list of configuration options, see the [Configuration Guide](src/api/config/api-config.ts).

## 🛠️ Development

### Development Setup

1. **Start in development mode**
   ```bash
   npm run dev
   ```

2. **Run with hot reload**
   ```bash
   npm run api:dev
   ```

3. **Run tests**
   ```bash
   npm test
   npm run test:integration
   npm run test:performance
   ```

### Project Structure

```
src/api/
├── config/           # Configuration management
├── controllers/      # Request handlers
├── middleware/       # Express middleware
├── routes/          # API route definitions
├── services/        # Business logic services
├── utils/           # Utility functions
├── errors/          # Error handling
├── docs/            # API documentation
└── tests/           # Test suites
```

### Development Scripts

```bash
npm run dev              # Start development server
npm run build           # Build for production
npm run test            # Run unit tests
npm run test:integration # Run integration tests
npm run test:performance # Run performance tests
npm run lint            # Run linting
npm run docs:generate   # Generate documentation
```

## 🚀 Deployment

### Docker Deployment

1. **Build the image**
   ```bash
   docker build -f Dockerfile.api -t hikma-api .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

### Kubernetes Deployment

1. **Apply manifests**
   ```bash
   kubectl apply -f k8s/
   ```

2. **Check deployment status**
   ```bash
   kubectl get pods -n hikma-engine
   ```

### Production Deployment

Use the deployment script for automated deployment:

```bash
# Deploy to staging
./scripts/deploy.sh staging v1.0.0

# Deploy to production
./scripts/deploy.sh production v1.0.0
```

### Production Readiness Check

Before deploying to production, run the readiness check:

```bash
./scripts/production-readiness.sh production
```

## 📊 Monitoring

### Health Checks

The API provides multiple health check endpoints:

- **Liveness**: `/api/v1/monitoring/liveness` - Basic service availability
- **Readiness**: `/api/v1/monitoring/readiness` - Service ready to handle requests
- **Health**: `/api/v1/monitoring/health` - Comprehensive health status

### Metrics Collection

- **Performance Metrics**: Response times, throughput, error rates
- **System Metrics**: Memory usage, CPU usage, uptime
- **Business Metrics**: Search query statistics, cache hit rates
- **Error Tracking**: Error counts, error types, error trends

### Alerting

Configure alerts based on:
- Error rate thresholds
- Response time thresholds
- Memory usage limits
- Service availability

### Observability

- **Request Correlation**: All requests include correlation IDs
- **Structured Logging**: JSON-formatted logs with context
- **Distributed Tracing**: Request tracing across services
- **Metrics Export**: Prometheus-compatible metrics

## ⚡ Performance

### Optimization Features

- **Multi-level Caching**: In-memory and Redis caching
- **Connection Pooling**: Database connection management
- **Request Queuing**: Intelligent request prioritization
- **Batch Processing**: Efficient bulk operations
- **Memory Management**: Automatic memory optimization

### Performance Testing

Run performance tests to validate system capacity:

```bash
# Run load tests
./scripts/performance-test.sh artillery 600

# Run custom benchmarks
./scripts/performance-test.sh benchmark

# Run all performance tests
./scripts/performance-test.sh all
```

### Performance Targets

- **Response Time**: < 2s for 95% of requests
- **Throughput**: > 100 requests/second
- **Memory Usage**: < 1GB under normal load
- **Cache Hit Rate**: > 70% for repeated queries

## 🔒 Security

### Security Features

- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization
- **Security Headers**: OWASP recommended headers
- **Rate Limiting**: Configurable rate limits
- **Authentication**: API key and JWT support

### Security Headers

The API automatically includes security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Content-Security-Policy`

### Authentication

Configure authentication methods:

```bash
# API Key Authentication
HIKMA_API_KEY_ENABLED=true
HIKMA_API_KEYS=key1,key2,key3

# JWT Authentication
HIKMA_API_JWT_ENABLED=true
HIKMA_API_JWT_SECRET=your-secret-key
```

## 🧪 Testing

### Test Suites

1. **Unit Tests**: Individual component testing
   ```bash
   npm test
   ```

2. **Integration Tests**: API endpoint testing
   ```bash
   npm run test:integration
   ```

3. **Performance Tests**: Load and stress testing
   ```bash
   npm run test:performance
   ```

4. **System Tests**: End-to-end validation
   ```bash
   npm run test:system
   ```

### Test Coverage

- Target: > 80% code coverage
- Critical paths: 100% coverage
- Integration tests: All endpoints
- Performance tests: All search types

### Continuous Testing

Tests are automatically run on:
- Pull requests
- Main branch commits
- Release candidates
- Scheduled intervals

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Run tests**
   ```bash
   npm test
   npm run test:integration
   ```
5. **Submit a pull request**

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured linting rules
- **Prettier**: Code formatting
- **JSDoc**: Comprehensive documentation
- **Testing**: Unit and integration tests required

### Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add changelog entry
4. Request review from maintainers
5. Address review feedback
6. Merge after approval

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help

- **Documentation**: Check the API docs and this README
- **Issues**: Create a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Email**: Contact support@hikma-engine.com

### Troubleshooting

#### Common Issues

1. **API not starting**
   - Check port availability
   - Verify configuration
   - Check logs for errors

2. **Search not working**
   - Verify database connections
   - Check index status
   - Review search service logs

3. **Performance issues**
   - Monitor memory usage
   - Check cache hit rates
   - Review slow query logs

#### Debug Mode

Enable debug logging:
```bash
HIKMA_API_LOG_LEVEL=debug npm run api:start
```

#### Health Diagnostics

Run comprehensive health check:
```bash
curl http://localhost:3000/api/v1/monitoring/health/detailed
```

## 🗺️ Roadmap

### Upcoming Features

- [ ] GraphQL API support
- [ ] Real-time search subscriptions
- [ ] Advanced analytics dashboard
- [ ] Multi-tenant support
- [ ] Enhanced security features
- [ ] Machine learning improvements

### Version History

- **v1.0.0**: Initial release with core search functionality
- **v1.1.0**: Enhanced monitoring and performance optimization
- **v1.2.0**: Advanced security features and authentication
- **v2.0.0**: GraphQL support and real-time features (planned)

---

**Built with ❤️ by the Hikma Engine Team**

For more information, visit our [website](https://hikma-engine.com) or check out our [documentation](https://docs.hikma-engine.com).
