# Search Directory Support

## Overview

The Hikma Engine search commands now support searching in different directories, similar to how the index command works. This allows you to search across multiple indexed repositories on your local machine without having to change directories.

## How It Works

When you index a repository with a specific path:
```bash
hikma index /path/to/project
```

The system creates a `metadata.db` file in that project's `data` subdirectory (`/path/to/project/data/metadata.db`). 

Now you can search in that same repository from anywhere by providing the project path:

## Usage Examples

### Semantic Search with Directory Parameter
```bash
# Search in current directory (default behavior)
hikma search semantic "authentication logic"

# Search in a specific directory
hikma search semantic "authentication logic" /path/to/project

# Search with options and directory
hikma search semantic "user validation" /path/to/project --limit 5 --similarity 0.8
```

### Text Search with Directory Parameter
```bash
# Search in current directory
hikma search text "function authenticate"

# Search in specific directory
hikma search text "function authenticate" /path/to/project

# Search with filters and directory
hikma search text "password validation" /path/to/project --types function --limit 10
```

### Hybrid Search with Directory Parameter
```bash
# Search in current directory
hikma search hybrid "user validation" --type function

# Search in specific directory
hikma search hybrid "user validation" /path/to/project --type function --extension .ts

# Complex hybrid search
hikma search hybrid "authentication middleware" /path/to/backend --type function --file-path middleware
```

### Statistics with Directory Parameter
```bash
# Get stats for current directory
hikma search stats

# Get stats for specific directory
hikma search stats /path/to/project

# Get stats in JSON format
hikma search stats /path/to/project --json
```

## Command Syntax

All search commands now follow this pattern:
```bash
hikma search <command> <query> [project-path] [options]
```

Where:
- `<command>`: One of `semantic`, `text`, `hybrid`, or `stats`
- `<query>`: Your search query (not required for `stats`)
- `[project-path]`: Optional path to the project directory (defaults to current directory)
- `[options]`: Command-specific options like `--limit`, `--similarity`, etc.

## Directory Resolution

The system:
1. **Resolves the path**: Converts relative paths to absolute paths
2. **Validates existence**: Checks that the directory exists
3. **Finds the database**: Looks for `metadata.db` in the `data` subdirectory
4. **Initializes search**: Creates the search service with the correct database path

## Error Handling

If you provide an invalid directory path, you'll get a clear error message:
```bash
❌ Project path does not exist: /invalid/path
   Context: semantic search
```

If the directory exists but hasn't been indexed, you'll get a database connection error. Make sure to index the directory first:
```bash
hikma index /path/to/project
```

## Multi-Repository Workflow

This feature enables powerful multi-repository workflows:

```bash
# Index multiple repositories
hikma index /path/to/frontend
hikma index /path/to/backend
hikma index /path/to/shared-lib

# Search across different repositories
hikma search semantic "authentication" /path/to/frontend
hikma search semantic "authentication" /path/to/backend
hikma search hybrid "user model" /path/to/shared-lib --type class

# Compare statistics across repositories
hikma search stats /path/to/frontend
hikma search stats /path/to/backend
hikma search stats /path/to/shared-lib
```

## Implementation Details

### ConfigManager Integration
The `ConfigManager` class handles directory-specific configuration:
- Takes a `projectRoot` parameter in its constructor
- Resolves database paths relative to the project root
- Handles environment variable overrides per project

### Database Path Resolution
For a project at `/path/to/project`, the database is located at:
```
/path/to/project/data/metadata.db
```

The vector extension is resolved relative to the project root:
```
/path/to/project/extensions/vec0.dylib
```

### Backward Compatibility
All existing commands continue to work without changes:
- Commands without a directory parameter default to `process.cwd()`
- Existing scripts and workflows remain functional
- No breaking changes to the API

## Best Practices

1. **Use absolute paths** for clarity when working with multiple repositories
2. **Index before searching** - ensure the target directory has been indexed
3. **Check stats first** to verify the repository has been properly indexed
4. **Use consistent paths** - avoid mixing relative and absolute paths for the same repository

## Troubleshooting

### Database Not Found
```bash
❌ Failed to initialize search service: SQLITE_CANTOPEN: unable to open database file
```
**Solution**: Index the directory first with `hikma index /path/to/project`

### Permission Errors
```bash
❌ Project path does not exist: /restricted/path
```
**Solution**: Ensure you have read access to the directory and it exists

### Wrong Database
If you're getting unexpected results, verify you're searching the right repository:
```bash
hikma search stats /path/to/project
```
Check the file path breakdown to confirm you're in the right codebase.