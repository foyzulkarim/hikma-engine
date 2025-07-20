---
inclusion: fileMatch
fileMatchPattern: 'src/cli/**'
---

# CLI Guidelines

## Command Structure

- Use the `commander` package for CLI argument parsing
- Implement a consistent command structure across all CLI tools
- Provide clear help text and examples for each command
- Support both short and long option formats where appropriate
- Implement proper exit codes for success and failure cases

## Search CLI

The search CLI in `src/cli/search.ts` should:

- Accept search queries as arguments
- Support filtering by file type, language, and other metadata
- Allow limiting the number of results
- Provide different output formats (text, JSON, table)
- Include relevance scores in the results
- Support semantic and keyword search modes

## Output Formatting

- Use `chalk` for colorized terminal output
- Use `cli-table3` for tabular data display
- Format code snippets with syntax highlighting when possible
- Provide both verbose and concise output modes
- Support machine-readable output formats (JSON, CSV)

## Progress Reporting

- Show progress bars for long-running operations
- Provide real-time status updates during indexing
- Display summary statistics after completion
- Allow verbose logging with debug flag

## Error Handling

- Display user-friendly error messages
- Provide troubleshooting hints for common errors
- Include debug information with verbose flag
- Log detailed errors for debugging
- Handle keyboard interrupts gracefully
