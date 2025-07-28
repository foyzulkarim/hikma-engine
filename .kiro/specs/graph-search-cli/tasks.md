# Implementation Plan

- [ ] 1. Create graph command handler service class
  - Implement `GraphCommandHandler` class with initialization and cleanup methods
  - Add database connection management using existing `SQLiteClient` and `ConfigManager`
  - Integrate with existing `InMemoryGraphService` for graph operations
  - _Requirements: 1.1, 5.1_

- [ ] 1.1 Implement core graph service wrapper functionality
  - Create `GraphServiceWrapper` class to manage SQLite client and graph service lifecycle
  - Add initialization method that loads graph data into memory
  - Implement proper cleanup and error handling for database connections
  - _Requirements: 1.1, 5.1_

- [ ] 1.2 Add function resolution and disambiguation logic
  - Implement function name resolution with exact and partial matching
  - Create disambiguation prompt system for multiple function matches
  - Add helper methods to format function information for display
  - _Requirements: 1.3, 2.2_

- [ ] 2. Implement function call relationship commands
  - Add `showFunctionCalls` method to display functions called by and calling a specific function
  - Implement proper formatting for call relationships with file paths and line numbers
  - Add error handling for function not found scenarios
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2.1 Create function call chain discovery functionality
  - Implement `findCallChain` method using existing graph service BFS algorithm
  - Add support for maximum depth limits and path optimization
  - Create formatted output for call chains in tree and list formats
  - _Requirements: 2.1, 2.2_

- [ ] 3. Add graph statistics and search commands
  - Implement `showGraphStats` method to display comprehensive graph statistics
  - Add `searchFunctions` method with regex pattern matching
  - Create `listFunctionsInFile` method to show all functions in a specific file
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3.1 Implement file dependency analysis commands
  - Add `showFileDependencies` method to display files that depend on a target file
  - Implement `showFileImports` method to show files imported by a target file
  - Create proper error handling for file not found scenarios
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 4. Integrate graph commands into main CLI structure
  - Add new `graph` command group to existing `src/cli/main.ts`
  - Implement all graph subcommands (calls, chain, stats, search, functions, deps, imports)
  - Ensure consistent argument parsing and option handling with existing CLI patterns
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.3_

- [ ] 4.1 Add graph command option parsing and validation
  - Implement command-line option parsing for all graph subcommands
  - Add input validation for function names, file paths, and search patterns
  - Create consistent error messages using existing CLI error handling patterns
  - _Requirements: 5.1, 5.2_

- [ ] 4.2 Implement consistent output formatting for graph commands
  - Add support for table, list, tree, and JSON output formats
  - Integrate with existing CLI display functions for consistent styling
  - Implement proper color coding and formatting for different data types
  - _Requirements: 5.2, 5.3_

- [ ] 5. Add comprehensive error handling for graph operations
  - Implement graph-specific error classes (GraphNotLoadedError, FunctionNotFoundError, etc.)
  - Add proper error recovery strategies and helpful error messages
  - Integrate with existing CLI error handling system
  - _Requirements: 5.1_

- [ ] 5.1 Create graph command help text and documentation
  - Add comprehensive help text for the main `hikma graph` command
  - Implement help text for all graph subcommands with usage examples
  - Ensure help text follows existing CLI documentation patterns
  - _Requirements: 5.3_

- [ ] 6. Write unit tests for graph command functionality
  - Create unit tests for `GraphCommandHandler` class methods
  - Test function resolution, call chain discovery, and search functionality
  - Add tests for error handling scenarios and edge cases
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

- [ ] 6.1 Add integration tests for graph CLI commands
  - Test complete command execution flows with real database connections
  - Verify output formatting and error handling in realistic scenarios
  - Test integration with existing CLI structure and configuration system
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Validate graph commands with manual testing
  - Test all graph subcommands manually with sample indexed codebase
  - Verify function call relationships are displayed correctly
  - Test call chain discovery with various function combinations
  - Ensure consistent user experience across all graph commands
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
