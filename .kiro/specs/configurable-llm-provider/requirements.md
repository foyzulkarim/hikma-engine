# Requirements Document

## Introduction

This feature adds support for configurable LLM providers through environment variables, allowing the hikma-engine to use external LLM services (like OpenAI) instead of the local Python LLM RAG implementation. The system will maintain the same payload structure and semantic processing capabilities while providing flexibility in choosing the underlying LLM provider.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to configure the LLM provider through environment variables, so that I can choose between local Python processing and external services like OpenAI.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL read the LLM provider configuration from environment variables
2. WHEN no provider is specified THEN the system SHALL default to the existing Python LLM RAG implementation
3. WHEN an invalid provider is specified THEN the system SHALL log an error and fall back to the default implementation
4. WHEN the provider configuration changes THEN the system SHALL use the new provider for subsequent requests without requiring a restart

### Requirement 2

**User Story:** As a developer, I want to configure OpenAI as an LLM provider with API URL and key, so that I can leverage OpenAI's models for semantic processing.

#### Acceptance Criteria

1. WHEN the provider is set to "openai" THEN the system SHALL require all of API URL, MODEL NAME and API key environment variables
2. WHEN OpenAI provider is configured THEN the system SHALL validate the API key format before making requests
3. WHEN the OpenAI API URL is invalid THEN the system SHALL log an error and fall back to the default implementation
4. WHEN the OpenAI API key is missing or invalid THEN the system SHALL return an appropriate error message
5. WHEN the OpenAI model name is missing THEN the system SHALL log an error and fall back to the default implementation

### Requirement 3

**User Story:** As a developer, I want the system to send the same payload structure to external providers, so that the semantic processing results remain consistent regardless of the provider.

#### Acceptance Criteria

1. WHEN calling an external provider THEN the system SHALL use the same payload structure as the Python LLM RAG implementation
2. WHEN receiving responses from external providers THEN the system SHALL validate the response format matches expected structure
3. WHEN the external provider returns an unexpected format THEN the system SHALL log the error and attempt to normalize the response
4. WHEN payload transformation is needed THEN the system SHALL handle it transparently without affecting the calling code

### Requirement 4

**User Story:** As a developer, I want proper error handling and fallback mechanisms, so that the system remains stable when external providers are unavailable.

#### Acceptance Criteria

1. WHEN an external provider request fails THEN the system SHALL log the error with appropriate context
2. WHEN an external provider is unreachable THEN the system SHALL implement retry logic with exponential backoff
3. WHEN all retry attempts fail THEN the system SHALL fall back to the local Python implementation if available
4. WHEN both external and local providers fail THEN the system SHALL return a meaningful error message to the caller

### Requirement 5

**User Story:** As a developer, I want to monitor and log provider usage, so that I can track performance and costs across different LLM providers.

#### Acceptance Criteria

1. WHEN making requests to any provider THEN the system SHALL log the provider name, request size, and response time
2. WHEN requests succeed THEN the system SHALL track success metrics per provider
3. WHEN requests fail THEN the system SHALL track failure metrics with error categories
4. WHEN using external providers THEN the system SHALL log token usage information if available in the response
