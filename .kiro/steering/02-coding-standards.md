---
inclusion: always
---

# Coding Standards

## TypeScript Guidelines

- Use TypeScript's strict mode for all files
- Define explicit return types for functions
- Use interfaces for complex object structures
- Prefer type annotations over `any` types
- Use readonly properties when values shouldn't change
- Leverage union types for variables that can have multiple types

## Code Style

- Use 2-space indentation
- Use camelCase for variables and functions
- Use PascalCase for classes, interfaces, and types
- Use UPPER_CASE for constants
- Use single quotes for strings
- Add semicolons at the end of statements
- Keep line length under 100 characters
- Use async/await instead of raw promises

## Documentation

- Use JSDoc comments for all public APIs
- Include @param and @return tags in function documentation
- Document complex algorithms with explanatory comments
- Add file-level documentation explaining the purpose of each module
- Keep comments up-to-date with code changes

## Error Handling

- Use the provided error handling utilities in `src/utils/error-handling.ts`
- Log errors with appropriate context
- Use typed error classes for different error categories
- Provide meaningful error messages
- Handle edge cases explicitly

## Performance Considerations

- Batch operations when processing large datasets
- Use incremental processing where possible
- Consider memory usage when dealing with large files
- Implement pagination for large result sets
- Use efficient data structures for frequent operations
