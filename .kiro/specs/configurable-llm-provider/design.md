# Design Document

## Overview

This design extends the hikma-engine's LLM RAG service to support configurable providers through environment variables. The system will maintain backward compatibility with the existing Python-based implementation while adding support for external providers like OpenAI. The design follows a provider pattern that abstracts the underlying LLM service while maintaining consistent interfaces and payload structures.

## Architecture

### Provider Pattern Implementation

The system will implement a provider pattern with the following components:

1. **LLMProviderFactory**: Creates appropriate provider instances based on configuration
2. **LLMProviderInterface**: Defines the contract all providers must implement
3. **PythonLLMProvider**: Wraps the existing Python implementation
4. **OpenAILLMProvider**: Implements OpenAI API integration
5. **LLMProviderManager**: Manages provider lifecycle and fallback logic

### Configuration Layer

Environment variables will be added to support provider configuration:

```
# LLM Provider Configuration
HIKMA_ENGINE_LLM_PROVIDER=python|openai
HIKMA_ENGINE_LLM_OPENAI_API_URL=https://api.openai.com/v1/chat/completions
HIKMA_ENGINE_LLM_OPENAI_API_KEY=sk-...
HIKMA_ENGINE_LLM_OPENAI_MODEL=gpt-4
HIKMA_ENGINE_LLM_TIMEOUT=300000
HIKMA_ENGINE_LLM_RETRY_ATTEMPTS=3
HIKMA_ENGINE_LLM_RETRY_DELAY=1000
```

## Components and Interfaces

### LLMProviderInterface

```typescript
interface LLMProviderInterface {
  readonly name: string;
  readonly isAvailable: boolean;
  
  generateExplanation(
    query: string,
    searchResults: SearchResult[],
    options: RAGOptions
  ): Promise<RAGResponse>;
  
  validateConfiguration(): Promise<boolean>;
  cleanup(): Promise<void>;
}
```

### LLMProviderFactory

```typescript
class LLMProviderFactory {
  static createProvider(config: LLMProviderConfig): LLMProviderInterface;
  static getAvailableProviders(): string[];
  static validateProviderConfig(provider: string, config: any): boolean;
}
```

### OpenAILLMProvider

The OpenAI provider will:
- Transform the existing payload structure to OpenAI's chat completion format
- Handle API authentication and rate limiting
- Implement retry logic with exponential backoff
- Normalize responses back to the expected RAGResponse format
- Support configurable models (gpt-3.5-turbo, gpt-4, etc.)

### PythonLLMProvider

The Python provider will:
- Wrap the existing LLMRAGService implementation
- Maintain full backward compatibility
- Serve as the default fallback provider

## Data Models

### LLMProviderConfig

```typescript
interface LLMProviderConfig {
  provider: 'python' | 'openai';
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  
  // OpenAI specific
  openai?: {
    apiUrl: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
  };
  
  // Python specific (existing)
  python?: {
    model: string;
    maxResults: number;
  };
}
```

### OpenAI Payload Transformation

The system will transform the current payload structure:

**Current Python Format:**
```json
{
  "query": "string",
  "search_results": [SearchResult[]],
  "model": "string"
}
```

**OpenAI API Format:**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a senior software engineer..."
    },
    {
      "role": "user", 
      "content": "Query: ... Based on these search results..."
    }
  ],
  "max_tokens": 400,
  "temperature": 0.6
}
```

## Error Handling

### Provider Validation

1. **Configuration Validation**: Validate provider-specific configuration at startup
2. **Runtime Validation**: Check provider availability before making requests
3. **API Key Validation**: Validate OpenAI API key format and test connectivity

### Fallback Strategy

1. **Primary Provider Failure**: Retry with exponential backoff
2. **Provider Unavailable**: Fall back to Python provider if available
3. **All Providers Failed**: Return meaningful error with context

### Error Categories

```typescript
enum LLMProviderErrorType {
  CONFIGURATION_ERROR = 'configuration_error',
  NETWORK_ERROR = 'network_error', 
  AUTHENTICATION_ERROR = 'authentication_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  RESPONSE_FORMAT_ERROR = 'response_format_error'
}
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Implement provider interfaces and factory
- Add configuration management for new environment variables
- Create base provider classes

### Phase 2: OpenAI Integration
- Implement OpenAI provider with payload transformation
- Add authentication and error handling
- Implement retry logic and rate limiting

### Phase 3: Documentation and Deployment
- Update configuration documentation
- Add provider selection guidelines
- Deploy with backward compatibility verification

## Security Considerations

### API Key Management
- Store API keys in environment variables only
- Never log API keys in application logs
- Validate API key format before making requests
- Support API key rotation without service restart

### Request/Response Logging
- Log request metadata without sensitive content
- Sanitize logs to remove API keys or tokens
- Include correlation IDs for request tracing
- Log provider performance metrics

## Performance Considerations

### Caching Strategy
- Cache provider availability checks
- Implement response caching for identical queries
- Use connection pooling for HTTP requests

### Resource Management
- Limit concurrent requests per provider
- Implement request queuing for rate-limited providers
- Monitor memory usage across providers

## Monitoring and Observability

### Metrics Collection
- Track request count per provider
- Monitor response times and success rates
- Track fallback usage patterns
- Monitor API costs for external providers

### Logging Strategy
- Log provider selection decisions
- Track configuration changes
- Log error patterns and recovery actions
- Include performance metrics in logs
