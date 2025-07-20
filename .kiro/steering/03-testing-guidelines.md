---
inclusion: always
---

# Testing Guidelines

## Test Structure

- Use Jest as the primary testing framework
- Organize tests to mirror the source code structure
- Name test files with `.test.ts` or `.spec.ts` suffix
- Group related tests using `describe` blocks
- Write clear test descriptions that explain the expected behavior

## Test Coverage

- Aim for at least 80% code coverage
- Test all public APIs and interfaces
- Include both positive and negative test cases
- Test edge cases and error handling
- Use code coverage reports to identify untested code paths

## Test Types

- **Unit Tests**: Test individual functions and classes in isolation
- **Integration Tests**: Test interactions between multiple components
- **End-to-End Tests**: Test complete workflows from input to output
- **Performance Tests**: Verify system performance under load

## Mocking and Fixtures

- Use Jest mocks for external dependencies
- Create reusable test fixtures for common test data
- Use `beforeEach` and `afterEach` for test setup and teardown
- Mock file system operations for tests that interact with files
- Create mock implementations for database clients

## Best Practices

- Keep tests independent and isolated
- Avoid test interdependencies
- Write deterministic tests that don't depend on execution order
- Use setup and teardown functions to maintain clean test state
- Prefer explicit assertions over implicit assumptions
- Test asynchronous code using async/await
- Use snapshots sparingly and review them carefully
