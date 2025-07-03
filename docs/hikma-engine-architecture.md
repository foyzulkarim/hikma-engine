# hikma-engine Architecture Document & Implementation Plan

## 1. Introduction
This document outlines the architecture of the hikma-engine, a code knowledge graph indexer designed to represent a codebase as an interconnected knowledge graph. It details the components, data flow, and persistence strategies, including recent enhancements for test method analysis, advanced commit message association, AI Summary Generation, and Incremental Indexing. This document also serves as a comprehensive implementation plan.

## 2. Overall Architecture
The hikma-engine operates as a pipeline, ingesting raw code and Git history, processing it into structured nodes and edges, generating semantic embeddings, and persisting this multi-dimensional data across specialized databases. The process is designed to be efficient, supporting incremental updates and leveraging AI for enhanced data representation.

## 3. Core Components

### 3.1. File Discovery 
**Responsibility:** Identifies all relevant source code files within a given project directory, respecting `.gitignore` rules. For incremental indexing, it will be adapted to identify only changed, added, or deleted files.
**Input:** Project root path, file patterns.
**Output:** List of file paths.

### 3.2. AST Parser
**Responsibility:** Parses source code files to extract structural information, creating CodeNodes, FileNodes, DirectoryNodes, and their relationships (edges). It also identifies and extracts TestNodes and their associations. For AI Summary Generation, it will prepare content for summarization.
**Input:** List of file paths.
**Output:** Raw nodes (CodeNode, FileNode, DirectoryNode, TestNode) and edges (CALLS, DEFINED_IN, CONTAINS, TESTS, TESTED_BY).

### 3.3. Git Analyzer 
**Responsibility:** Analyzes the Git repository history to extract commit information, creating CommitNodes. It also associates commits with files and, where possible, with PullRequestNodes, and tracks file evolution. For incremental indexing, it will compare the current Git HEAD with the last indexed commit hash to identify changes.
**Input:** Project root path, FileNodes.
**Output:** Raw nodes (CommitNode, PullRequestNode) and edges (MODIFIED, INCLUDES_COMMIT, EVOLVED_BY).

### 3.4. AI Summary Generator 
**Responsibility:** Integrates an LLM to generate meaningful `aiSummary` for `FileNode` and `DirectoryNode` content.
**Input:** Content of `FileNode`s and `DirectoryNode`s.
**Output:** Updated `FileNode`s and `DirectoryNode`s with `aiSummary` properties.

### 3.5. Embedding Generator 
**Responsibility:** Generates vector embeddings for all relevant nodes (CodeNode, FileNode, DirectoryNode, CommitNode, TestNode, PullRequestNode) using a pre-trained transformer model. These embeddings enable semantic search capabilities.
**Input:** All generated nodes (including those with AI summaries).
**Output:** Nodes with attached vector embeddings.

### 3.6. Database Loader 
**Responsibility:** Persists the processed nodes (with embeddings) and edges into the respective polyglot persistence layers: LanceDB (vector database), TinkerGraph (graph database), and SQLite (relational database). For incremental indexing, it will use upsert operations and handle deletions.
**Input:** Nodes with embeddings, all generated edges.
**Output:** Populated databases.

### 3.7. Main Orchestrator (`index.ts`)
**Responsibility:** Coordinates the entire indexing pipeline, orchestrating the execution of each component in sequence. It will also manage the state for incremental indexing (last indexed commit hash).

## 4. Data Model (Nodes & Edges)

### 4.1. Node Types
- **`CodeNode`**: Represents functions, methods, classes. Stores name, signature, body, language, file path, and line numbers.
- **`FileNode`**: Represents individual source code files. Stores path, name, extension, and an AI-generated `aiSummary`.
- **`DirectoryNode`**: Represents directories. Stores path, name, and an AI-generated `aiSummary`.
- **`CommitNode`**: Represents Git commits. Stores hash, author, date, message, and diff summary.
- **`DiscussionNode`**: (Future/Placeholder) Represents discussions like issues or pull request comments.
- **`AnnotationNode`**: (Future/Placeholder) Represents user-added annotations.
- **`TestNode`**: Represents test methods. Stores name, file path, line numbers, framework, and test body.
- **`PullRequestNode`**: Represents pull requests. Stores ID, title, author, dates, URL, and body.

### 4.2. Edge Types
- **`CALLS`**: Connects a `CodeNode` to another `CodeNode` it calls.
- **`DEFINED_IN`**: Connects a `CodeNode` or `TestNode` to the `FileNode` it is defined within.
- **`CONTAINS`**: Connects a `DirectoryNode` to `FileNode`s or other `DirectoryNode`s it contains.
- **`MODIFIED`**: Connects a `CommitNode` to the `FileNode`s it modified.
- **`AUTHORED`**: (Conceptual) Connects a `User` (or author property) to a `CommitNode`.
- **`EXPLAINS`**: (Future/Placeholder) Connects a `DiscussionNode` to a `CodeNode` or `FileNode`.
- **`REFERENCES`**: (Future/Placeholder) Generic reference edge.
- **`TESTS`**: Connects a `TestNode` to the `CodeNode` it is designed to test.
- **`TESTED_BY`**: Connects a `CodeNode` to the `TestNode`s that test it (reverse of `TESTS`).
- **`INCLUDES_COMMIT`**: Connects a `PullRequestNode` to the `CommitNode`s included in that pull request.
- **`EVOLVED_BY`**: Connects a `FileNode` to the `CommitNode`s that modified it, tracking its evolution over time.

## 5. Persistence Strategy

The hikma-engine employs a polyglot persistence approach to optimize for different query patterns:

### 5.1. LanceDB (Vector Database)
- **Purpose:** Stores all nodes with their associated vector embeddings, enabling efficient semantic similarity searches (e.g., find code similar in meaning to a natural language query).
- **Data Stored:** `id`, `type`, `properties` (flattened), `embedding` for all node types.

### 5.2. TinkerGraph (Graph Database)
- **Purpose:** Stores the rich relationships between all nodes, facilitating complex graph traversals and pattern matching (e.g., find all methods called by a specific function, identify tests covering a particular module, trace file evolution).
- **Data Stored:** All nodes as vertices with their properties, and all edges with their types and properties.

### 5.3. SQLite (Relational Database)
- **Purpose:** Provides fast, lightweight lookup and keyword-based search for metadata and structured properties (e.g., search for files by name, commits by author, test methods by framework). It will also store the last indexed commit hash for incremental updates.
- **Data Stored:** Selected properties of `FileNode` (including `aiSummary`), `CodeNode`, `CommitNode`, `DirectoryNode` (including `aiSummary`), `TestNode`, and `PullRequestNode` in normalized tables. Also, a dedicated table or entry for indexing state.

## 6. Data Flow

1.  **Initialization:** `index.ts` starts, determines project root. It checks for the last indexed commit hash from SQLite.
2.  **File Discovery:** `FileDiscovery` identifies all relevant files. For incremental updates, it will identify only files changed since the last indexed commit.
3.  **AST Parsing:** `AstParser` reads files, generates `CodeNode`s, `FileNode`s, `DirectoryNode`s, `TestNode`s, and their `CALLS`, `DEFINED_IN`, `CONTAINS`, `TESTS`, `TESTED_BY` edges.
4.  **AI Summary Generation:** A dedicated component or an enhanced `AstParser`/`EmbeddingGenerator` will call an LLM to generate `aiSummary` for `FileNode` and `DirectoryNode` content.
5.  **Git Analysis:** `GitAnalyzer` processes Git history, generates `CommitNode`s, `PullRequestNode`s (mocked), and `MODIFIED`, `INCLUDES_COMMIT`, `EVOLVED_BY` edges. For incremental updates, it will process only new commits since the last indexed commit.
6.  **Node/Edge Aggregation:** All generated nodes and edges from `AstParser` and `GitAnalyzer` are combined.
7.  **Embedding Generation:** `EmbeddingGenerator` takes all combined nodes (including those with AI summaries) and produces vector embeddings for each.
8.  **Database Loading:** `DatabaseLoader` connects to LanceDB, TinkerGraph, and SQLite, then batch-loads the nodes (with embeddings) and edges into their respective databases. It performs upserts for existing data and inserts for new data, handling deletions as needed. It also updates the last indexed commit hash in SQLite.

## 7. Implementation Plan

**Overall Goal:** Implement the hikma-engine as described, creating a multi-dimensional datastore representing a codebase as an interconnected knowledge graph, including AI Summary Generation and Incremental Indexing.

### Phase 1: Setup & Core Utilities (Foundation)
**Objective:** Establish the project structure, set up development environment, and create essential utility functions and types.

**Tasks:**
*   **1.1 Project Initialization:**
*   **1.2 Define Core Types:**
*   **1.3 Database Client Setup:**

### Phase 2: Core components implementation
**Objective:** Implement the logic to discover files, parse code, and analyze Git history to generate raw nodes and edges.

**Tasks:**
*   **2.1 File Discovery:**
*   **2.2 AST Parser:**
*   **2.3 Git Analyzer:**
*   **2.4 AI Summary Generator:**
*   **2.5 Embedding Generator:**
*   **2.6 Database Loader:**


