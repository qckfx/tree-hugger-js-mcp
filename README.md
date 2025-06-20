# Tree-Hugger-JS MCP Server

An MCP (Model Context Protocol) server that provides AI agents with powerful JavaScript/TypeScript code analysis and transformation capabilities using the tree-hugger-js library.

## Features

### 🔍 Code Analysis
- Parse JavaScript, TypeScript, JSX, and TSX files or code strings
- Find patterns using intuitive syntax (e.g., `function`, `class[name="MyClass"]`)
- Extract functions, classes, imports with detailed metadata
- Navigate AST nodes and analyze code structure
- Get nodes at specific positions

### 🔧 Code Transformation
- Rename identifiers throughout code
- Remove unused imports
- Chain multiple transformations
- Insert code before/after patterns
- Preview transformations before applying

### 📊 Code Intelligence
- Scope analysis and variable binding
- Pattern matching with CSS-like selectors
- Support for async functions, classes, methods
- TypeScript type import handling

## Installation

```bash
cd tree-hugger-js-mcp
npm install
npm run build
```

## Usage

### Running the Server

```bash
npm start
```

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "tree-hugger-js": {
      "command": "node",
      "args": ["/path/to/tree-hugger-js-mcp/build/index.js"]
    }
  }
}
```

## Tools

### Code Analysis Tools

#### `parse_code`
Parse JavaScript/TypeScript code from file or string.

**Parameters:**
- `source` (string): File path or code string to parse
- `isFilePath` (boolean, optional): Whether source is a file path (auto-detected if not provided)
- `language` (string, optional): Language to use (javascript, typescript, jsx, tsx)

**Example:**
```javascript
// Parse a file
await callTool("parse_code", { 
  source: "./src/app.js",
  isFilePath: true 
});

// Parse code string
await callTool("parse_code", { 
  source: "function hello() { console.log('world'); }" 
});
```

#### `find_pattern`
Find first node matching a pattern.

**Parameters:**
- `pattern` (string): Pattern to match using tree-hugger-js syntax

**Examples:**
```javascript
// Find any function
await callTool("find_pattern", { pattern: "function" });

// Find async functions
await callTool("find_pattern", { pattern: "function[async]" });

// Find class by name
await callTool("find_pattern", { pattern: "class[name='MyClass']" });
```

#### `find_all_pattern`
Find all nodes matching a pattern.

**Parameters:**
- `pattern` (string): Pattern to match
- `limit` (number, optional): Maximum matches to return

#### `get_functions`
Get all functions with details.

**Parameters:**
- `includeAnonymous` (boolean, optional): Include anonymous functions (default: true)
- `asyncOnly` (boolean, optional): Only return async functions (default: false)

#### `get_classes`
Get all classes with methods and properties.

**Parameters:**
- `includeProperties` (boolean, optional): Include class properties (default: true)
- `includeMethods` (boolean, optional): Include class methods (default: true)

#### `get_imports`
Get all import statements.

**Parameters:**
- `includeTypeImports` (boolean, optional): Include TypeScript type-only imports (default: true)

### Code Transformation Tools

#### `rename_identifier`
Rename all occurrences of an identifier.

**Parameters:**
- `oldName` (string): Current identifier name
- `newName` (string): New identifier name
- `preview` (boolean, optional): Return preview only (default: false)

**Example:**
```javascript
await callTool("rename_identifier", {
  oldName: "fetchData",
  newName: "fetchUserData",
  preview: true
});
```

#### `remove_unused_imports`
Remove unused import statements.

**Parameters:**
- `preview` (boolean, optional): Return preview only (default: false)

#### `transform_code`
Apply multiple transformations in sequence.

**Parameters:**
- `operations` (array): Array of transformation operations
- `preview` (boolean, optional): Return preview only (default: false)

**Example:**
```javascript
await callTool("transform_code", {
  operations: [
    { type: "rename", parameters: { oldName: "oldFunc", newName: "newFunc" } },
    { type: "removeUnusedImports" },
    { type: "replaceIn", parameters: { nodeType: "string", pattern: /localhost/g, replacement: "api.example.com" } }
  ],
  preview: true
});
```

#### `insert_code`
Insert code before or after nodes matching a pattern.

**Parameters:**
- `pattern` (string): Pattern to match for insertion points
- `code` (string): Code to insert
- `position` (string): "before" or "after"
- `preview` (boolean, optional): Return preview only (default: false)

### Navigation Tools

#### `get_node_at_position`
Get AST node at specific line and column.

**Parameters:**
- `line` (number): Line number (1-based)
- `column` (number): Column number (0-based)

#### `analyze_scopes`
Analyze variable scopes and bindings.

**Parameters:**
- `includeBuiltins` (boolean, optional): Include built-in identifiers (default: false)

## Resources

The server provides three resources for accessing internal state:

### `ast://current`
Current parsed AST state with metadata and statistics.

### `ast://analysis`
Results from the most recent code analysis (functions, classes, imports).

### `ast://transforms`
History of code transformations and available operations.

## Pattern Syntax

Tree-hugger-js uses intuitive patterns instead of verbose tree-sitter node types:

### Basic Patterns
- `function` - Any function (declaration, expression, arrow, method)
- `class` - Class declarations and expressions
- `string` - String and template literals
- `import`/`export` - Import/export statements
- `call` - Function calls
- `loop` - For, while, do-while loops

### Attribute Selectors
- `[name="foo"]` - Nodes with specific name
- `[async]` - Async functions
- `[text*="test"]` - Nodes containing text

### CSS-like Selectors
- `class method` - Methods inside classes
- `function > return` - Return statements directly in functions
- `:has()` and `:not()` pseudo-selectors

## Examples

### Basic Code Analysis
```javascript
// Parse and analyze a React component
await callTool("parse_code", { source: "./components/UserProfile.jsx" });

// Get all functions
const functions = await callTool("get_functions", { asyncOnly: true });

// Find JSX elements
const jsxElements = await callTool("find_all_pattern", { pattern: "jsx" });
```

### Code Refactoring
```javascript
// Rename a function and remove unused imports
await callTool("transform_code", {
  operations: [
    { type: "rename", parameters: { oldName: "getUserData", newName: "fetchUserProfile" } },
    { type: "removeUnusedImports" }
  ]
});
```

### Pattern Matching
```javascript
// Find all async functions that call console.log
await callTool("find_all_pattern", { 
  pattern: "function[async]:has(call[text*='console.log'])" 
});

// Find classes with constructor methods
await callTool("find_all_pattern", { 
  pattern: "class:has(method[name='constructor'])" 
});
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode for development
npm run dev

# Test with MCP inspector
npm run inspector
```

## Error Handling

The server provides detailed error messages and suggestions:
- File not found errors for invalid file paths
- Parse errors with helpful context
- Pattern matching errors with suggestions
- Transformation errors with rollback capability

## License

MIT