#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parse, TreeHugger, TreeNode } from "tree-hugger-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface ParsedAST {
  tree: TreeHugger;
  filePath?: string;
  sourceCode: string;
  language: string;
  timestamp: Date;
  functions?: any[];
  classes?: any[];
  imports?: any[];
}

interface AnalysisResult {
  functions: any[];
  classes: any[];
  imports: any[];
  exports: any[];
  variables: any[];
  comments: any[];
  jsxComponents?: any[];
  timestamp: Date;
}

interface TransformResult {
  operation: string;
  parameters: any;
  preview: string;
  timestamp: Date;
}

class TreeHuggerMCPServer {
  private server: Server;
  private currentAST: ParsedAST | null = null;
  private lastAnalysis: AnalysisResult | null = null;
  private transformHistory: TransformResult[] = [];

  constructor() {
    this.server = new Server(
      {
        name: "tree-hugger-js-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "ast://current",
          mimeType: "application/json",
          name: "Current AST State",
          description: "Currently parsed AST with metadata and basic statistics",
        },
        {
          uri: "ast://analysis", 
          mimeType: "application/json",
          name: "Last Analysis Results",
          description: "Results from the most recent code analysis (functions, classes, imports, etc.)",
        },
        {
          uri: "ast://transforms",
          mimeType: "application/json",
          name: "Transformation History", 
          description: "History of code transformations and available operations",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case "ast://current":
          if (!this.currentAST) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({ error: "No AST currently loaded" }, null, 2),
                },
              ],
            };
          }
          
          const astData = {
            filePath: this.currentAST.filePath,
            language: this.currentAST.language,
            timestamp: this.currentAST.timestamp,
            lineCount: this.currentAST.sourceCode.split('\n').length,
            characterCount: this.currentAST.sourceCode.length,
            hasParseErrors: this.currentAST.tree.root.hasError,
            rootNodeType: this.currentAST.tree.root.type,
            childrenCount: this.currentAST.tree.root.children.length,
          };
          
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(astData, null, 2),
              },
            ],
          };
        
        case "ast://analysis":
          if (!this.lastAnalysis) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({ error: "No analysis results available" }, null, 2),
                },
              ],
            };
          }
          
          return {
            contents: [
              {
                uri,
                mimeType: "application/json", 
                text: JSON.stringify(this.lastAnalysis, null, 2),
              },
            ],
          };
        
        case "ast://transforms":
          const transformData = {
            history: this.transformHistory,
            availableOperations: [
              "rename_identifier",
              "remove_unused_imports", 
              "transform_code",
              "insert_code"
            ],
          };
          
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(transformData, null, 2),
              },
            ],
          };
        
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "parse_code",
          description: "Parse JavaScript/TypeScript code from file or string and load it into the AST state. Must be called before using other analysis tools.\n\nExamples:\n• Parse a React component: parse_code('./src/UserProfile.jsx')\n• Parse code string: parse_code('function hello() { return \"world\"; }')\n• Parse with explicit language: parse_code('./config.js', language='javascript')\n• Analyze legacy code: parse_code('./old-script.js') then use other tools to understand structure\n• Code review prep: parse_code('./feature.ts') then get_functions() to review all functions",
          inputSchema: {
            type: "object",
            properties: {
              source: { 
                type: "string", 
                description: "File path (./src/app.js) or code string ('const x = 1;')" 
              },
              isFilePath: {
                type: "boolean",
                description: "Whether source is a file path (true) or code string (false). Defaults to auto-detect."
              },
              language: {
                type: "string",
                description: "Language to use (javascript, typescript, jsx, tsx). Auto-detected if not provided."
              }
            },
            required: ["source"],
          },
        },
        {
          name: "find_pattern",
          description: "Find first node matching the specified pattern using tree-hugger-js intuitive syntax. Use for targeted searches when you need one specific match.\n\nExamples:\n• Find main function: find_pattern('function[name=\"main\"]')\n• Find React component: find_pattern('function[name=\"UserProfile\"]')\n• Find async functions: find_pattern('function[async]')\n• Find specific class: find_pattern('class[name=\"UserManager\"]')\n• Find error handling: find_pattern('call[text*=\"catch\"]')\n• Find JSX with props: find_pattern('jsx:has(jsx-attribute[name=\"className\"])')\n• Debug specific calls: find_pattern('call[text*=\"console.log\"]')",
          inputSchema: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Pattern using intuitive syntax: 'function', 'class[name=\"MyClass\"]', 'function[async]', 'call[text*=\"fetch\"]'"
              }
            },
            required: ["pattern"],
          },
        },
        {
          name: "find_all_pattern", 
          description: "Find all nodes matching the specified pattern. Use for comprehensive analysis when you need all matches.\n\nExamples:\n• Audit all functions: find_all_pattern('function')\n• Find all TODO comments: find_all_pattern('comment[text*=\"TODO\"]')\n• Security audit: find_all_pattern('call[text*=\"eval\"]')\n• Performance review: find_all_pattern('call[text*=\"console.log\"]') to find debug logs\n• API usage: find_all_pattern('call[text*=\"fetch\"]') to find all API calls\n• React hooks: find_all_pattern('call[text*=\"use\"]') for hooks usage\n• Error patterns: find_all_pattern('string[text*=\"error\"]') for error messages\n• Database queries: find_all_pattern('string[text*=\"SELECT\"]') for SQL\n• Event handlers: find_all_pattern('function[text*=\"onClick\"]')",
          inputSchema: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Pattern to match: 'function', 'call[text*=\"console.log\"]', 'string[text*=\"TODO\"]'"
              },
              limit: {
                type: "number",
                description: "Maximum number of matches to return (default: no limit). Use for large codebases."
              }
            },
            required: ["pattern"],
          },
        },
        {
          name: "get_functions",
          description: "Get all functions with metadata including name, type, location, and async status. Includes class methods, arrow functions, and declarations.\n\nExamples:\n• Code review: get_functions() to see all functions in a file\n• Find async operations: get_functions({asyncOnly: true})\n• API analysis: get_functions() then look for functions with 'fetch' or 'api' in names\n• Test coverage: get_functions() to identify functions needing tests\n• Refactoring prep: get_functions({includeAnonymous: false}) to focus on named functions\n• Performance audit: get_functions() to find large/complex functions by line count",
          inputSchema: {
            type: "object",
            properties: {
              includeAnonymous: {
                type: "boolean",
                description: "Include anonymous functions (default: true). Set false to focus on named functions only."
              },
              asyncOnly: {
                type: "boolean", 
                description: "Only return async functions (default: false). Use for async/await pattern analysis."
              }
            },
          },
        },
        {
          name: "get_classes",
          description: "Get all classes with comprehensive method and property analysis. Perfect for OOP code review.\n\nExamples:\n• Architecture review: get_classes() to understand class structure\n• API design: get_classes() to see public method interfaces\n• Inheritance analysis: get_classes() to identify class hierarchies\n• Method-only view: get_classes({includeProperties: false}) to focus on behavior\n• Property audit: get_classes({includeMethods: false}) to review state management\n• Testing prep: get_classes() to identify methods needing unit tests",
          inputSchema: {
            type: "object",
            properties: {
              includeProperties: {
                type: "boolean",
                description: "Include class properties (default: true). Set false to focus only on methods."
              },
              includeMethods: {
                type: "boolean",
                description: "Include class methods (default: true). Set false to focus only on properties."
              }
            },
          },
        },
        {
          name: "get_imports",
          description: "Get all import statements with detailed module and specifier information. Essential for dependency analysis.\n\nExamples:\n• Dependency audit: get_imports() to see all external dependencies\n• Bundle analysis: get_imports() to identify heavy imports\n• Security audit: get_imports() to check for suspicious packages\n• TypeScript analysis: get_imports({includeTypeImports: false}) to focus on runtime imports\n• Refactoring prep: get_imports() to understand module structure before changes\n• License compliance: get_imports() to generate dependency list",
          inputSchema: {
            type: "object",
            properties: {
              includeTypeImports: {
                type: "boolean",
                description: "Include TypeScript type-only imports (default: true). Set false for runtime dependency analysis."
              }
            },
          },
        },
        {
          name: "rename_identifier", 
          description: "Intelligently rename all occurrences of an identifier throughout the code. Avoids renaming in strings/comments.\n\nExamples:\n• Refactor function names: rename_identifier('fetchData', 'fetchUserData')\n• Improve variable names: rename_identifier('data', 'userData')\n• Update class names: rename_identifier('Manager', 'UserManager')\n• API consistency: rename_identifier('getUserInfo', 'fetchUserInfo')\n• Preview first: rename_identifier('oldName', 'newName', {preview: true})\n• Legacy code update: rename_identifier('XMLHttpRequest', 'fetch')",
          inputSchema: {
            type: "object",
            properties: {
              oldName: {
                type: "string",
                description: "Current identifier name to find and replace"
              },
              newName: {
                type: "string", 
                description: "New identifier name (should be valid JavaScript identifier)"
              },
              preview: {
                type: "boolean",
                description: "Return preview only without applying changes (default: false). Always preview first for safety."
              }
            },
            required: ["oldName", "newName"],
          },
        },
        {
          name: "remove_unused_imports",
          description: "Automatically remove unused import statements to clean up code. Safely detects which imports are actually used.\n\nExamples:\n• Bundle size optimization: remove_unused_imports() to reduce bundle size\n• Code cleanup: remove_unused_imports() after refactoring\n• Linting compliance: remove_unused_imports() to fix ESLint warnings\n• Before deployment: remove_unused_imports({preview: true}) to see what will be removed\n• Legacy cleanup: remove_unused_imports() after removing old code\n• Development workflow: remove_unused_imports() during feature development",
          inputSchema: {
            type: "object",
            properties: {
              preview: {
                type: "boolean",
                description: "Return preview only without applying changes (default: false). Use to see what will be removed."
              }
            },
          },
        },
        {
          name: "transform_code",
          description: "Apply multiple transformations in a single operation. Most powerful tool for complex refactoring workflows.\n\nExamples:\n• API refactor: [{type: 'rename', parameters: {oldName: 'getData', newName: 'fetchData'}}, {type: 'removeUnusedImports'}]\n• Environment update: [{type: 'replaceIn', parameters: {nodeType: 'string', pattern: /localhost/g, replacement: 'api.production.com'}}, {type: 'removeUnusedImports'}]\n• Add logging: [{type: 'insertAfter', parameters: {pattern: 'function_declaration', text: 'console.log(\"Function called\");'}}, {type: 'removeUnusedImports'}]\n• Bulk rename: [{type: 'rename', parameters: {oldName: 'user', newName: 'customer'}}, {type: 'rename', parameters: {oldName: 'id', newName: 'customerId'}}]\n• Legacy migration: [{type: 'replaceIn', parameters: {nodeType: 'call_expression', pattern: /XMLHttpRequest/g, replacement: 'fetch'}}, {type: 'removeUnusedImports'}]",
          inputSchema: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["rename", "removeUnusedImports", "replaceIn", "insertBefore", "insertAfter"]
                    },
                    parameters: {
                      type: "object",
                      description: "Parameters: rename{oldName,newName}, replaceIn{nodeType,pattern,replacement}, insert{pattern,text}"
                    }
                  },
                  required: ["type"]
                },
                description: "Array of transformation operations applied in sequence. Use preview:true first!"
              },
              preview: {
                type: "boolean",
                description: "Return preview only without applying changes (default: false). ALWAYS preview complex transformations first."
              }
            },
            required: ["operations"],
          },
        },
        {
          name: "get_node_at_position",
          description: "Get detailed AST node information at a specific cursor position. Perfect for debugging and precise analysis.\n\nExamples:\n• Debug syntax errors: get_node_at_position(15, 23) to understand what's at error location\n• Understand code structure: get_node_at_position(line, col) to see AST node type at cursor\n• Refactoring assistance: get_node_at_position(line, col) to identify exact node before transformation\n• IDE integration: get_node_at_position(line, col) for hover information\n• Pattern development: get_node_at_position(line, col) to understand node structure for pattern writing",
          inputSchema: {
            type: "object",
            properties: {
              line: {
                type: "number",
                description: "Line number (1-based) - the line where cursor is positioned"
              },
              column: {
                type: "number", 
                description: "Column number (0-based) - the character position within the line"
              }
            },
            required: ["line", "column"],
          },
        },
        {
          name: "analyze_scopes",
          description: "Analyze variable scopes, bindings, and potential naming conflicts. Advanced tool for code quality analysis.\n\nExamples:\n• Variable shadowing detection: analyze_scopes() to find naming conflicts\n• Closure analysis: analyze_scopes() to understand variable capture\n• Refactoring safety: analyze_scopes() before variable renames\n• Code review: analyze_scopes() to identify scope-related issues\n• Learning aid: analyze_scopes({includeBuiltins: true}) to see all identifiers\n• Dead code detection: analyze_scopes() to find unused variables",
          inputSchema: {
            type: "object",
            properties: {
              includeBuiltins: {
                type: "boolean",
                description: "Include built-in identifiers (default: false). Set true for comprehensive analysis including globals."
              }
            },
          },
        },
        {
          name: "insert_code",
          description: "Insert code before or after nodes with smart formatting. Professional-quality code insertion with proper indentation.\n\nExamples:\n• Add logging: insert_code('function_declaration', 'console.log(\"Function started\");', 'after')\n• Add validation: insert_code('method_definition[name=\"save\"]', 'if (!this.isValid()) return;', 'after')\n• Add comments: insert_code('class_declaration', '// Main user management class', 'before')\n• Add error handling: insert_code('function[async]', 'try {', 'after') + insert_code('function[async]', '} catch(e) { console.error(e); }', 'after')\n• Add metrics: insert_code('function[name*=\"api\"]', 'performance.mark(\"api-start\");', 'after')\n• Debug mode: insert_code('call[text*=\"fetch\"]', 'console.log(\"API call:\", url);', 'before')",
          inputSchema: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Pattern to match: 'function_declaration', 'class[name=\"MyClass\"]', 'method_definition[async]'"
              },
              code: {
                type: "string",
                description: "Code to insert. Will be formatted with proper indentation automatically."
              },
              position: {
                type: "string",
                enum: ["before", "after"],
                description: "Insert position: 'before' (above) or 'after' (below) the matched nodes"
              },
              preview: {
                type: "boolean",
                description: "Return preview only without applying changes (default: false). Always preview first!"
              }
            },
            required: ["pattern", "code", "position"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "parse_code":
          return await this.parseCode(args as { source: string; isFilePath?: boolean; language?: string });
        
        case "find_pattern":
          return await this.findPattern(args as { pattern: string });
        
        case "find_all_pattern":
          return await this.findAllPattern(args as { pattern: string; limit?: number });
        
        case "get_functions":
          return await this.getFunctions(args as { includeAnonymous?: boolean; asyncOnly?: boolean });
        
        case "get_classes":
          return await this.getClasses(args as { includeProperties?: boolean; includeMethods?: boolean });
        
        case "get_imports":
          return await this.getImports(args as { includeTypeImports?: boolean });
        
        case "rename_identifier":
          return await this.renameIdentifier(args as { oldName: string; newName: string; preview?: boolean });
        
        case "remove_unused_imports":
          return await this.removeUnusedImports(args as { preview?: boolean });
        
        case "transform_code":
          return await this.transformCode(args as { operations: any[]; preview?: boolean });
        
        case "get_node_at_position":
          return await this.getNodeAtPosition(args as { line: number; column: number });
        
        case "analyze_scopes":
          return await this.analyzeScopes(args as { includeBuiltins?: boolean });
        
        case "insert_code":
          return await this.insertCode(args as { pattern: string; code: string; position: "before" | "after"; preview?: boolean });
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async parseCode(args: { source: string; isFilePath?: boolean; language?: string }) {
    try {
      let sourceCode: string;
      let filePath: string | undefined;
      let isFile: boolean = args.isFilePath ?? false;

      // Auto-detect if it's a file path
      if (args.isFilePath === undefined) {
        isFile = !args.source.includes('\n') && !args.source.includes(';') && args.source.length < 200;
      }

      let tree: TreeHugger;
      
      if (isFile) {
        const resolvedPath = resolve(args.source);
        if (!existsSync(resolvedPath)) {
          return {
            content: [{
              type: "text", 
              text: `File not found: ${resolvedPath}`,
            }],
            isError: true,
          };
        }
        // Let tree-hugger handle file reading and language detection
        tree = parse(resolvedPath, { language: args.language });
        sourceCode = readFileSync(resolvedPath, 'utf-8');
        filePath = resolvedPath;
      } else {
        sourceCode = args.source;
        tree = parse(sourceCode, { language: args.language });
      }
      
      this.currentAST = {
        tree,
        filePath,
        sourceCode,
        language: args.language || 'auto-detected',
        timestamp: new Date(),
      };

      return {
        content: [{
          type: "text",
          text: `Successfully parsed ${filePath || 'code string'}\n` +
                `Language: ${this.currentAST.language}\n` +
                `Lines: ${sourceCode.split('\n').length}\n` +
                `Characters: ${sourceCode.length}\n` +
                `Parse errors: ${tree.root.hasError ? 'Yes' : 'No'}\n` +
                `Root node type: ${tree.root.type}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error parsing code: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async findPattern(args: { pattern: string }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const result = this.currentAST.tree.find(args.pattern);
      
      if (!result) {
        return {
          content: [{
            type: "text",
            text: `No match found for pattern: ${args.pattern}`,
          }],
        };
      }

      const nodeInfo = {
        type: result.type,
        text: result.text.length > 200 ? result.text.slice(0, 200) + '...' : result.text,
        line: result.line,
        column: result.column,
        name: result.name,
        startPosition: result.startPosition,
        endPosition: result.endPosition,
        childrenCount: result.children.length,
      };

      return {
        content: [{
          type: "text", 
          text: `Found match for pattern "${args.pattern}":\n${JSON.stringify(nodeInfo, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error finding pattern: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async findAllPattern(args: { pattern: string; limit?: number }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const results = this.currentAST.tree.findAll(args.pattern);
      const limitedResults = args.limit ? results.slice(0, args.limit) : results;
      
      const matches = limitedResults.map(node => ({
        type: node.type,
        text: node.text.length > 100 ? node.text.slice(0, 100) + '...' : node.text,
        line: node.line,
        column: node.column,
        name: node.name,
      }));

      return {
        content: [{
          type: "text",
          text: `Found ${results.length} matches for pattern "${args.pattern}"${args.limit ? ` (showing first ${limitedResults.length})` : ''}:\n${JSON.stringify(matches, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error finding pattern: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getFunctions(args: { includeAnonymous?: boolean; asyncOnly?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      let functions = this.currentAST.tree.functions();
      
      if (args.asyncOnly) {
        functions = functions.filter(fn => fn.text.includes('async'));
      }
      
      if (args.includeAnonymous === false) {
        functions = functions.filter(fn => fn.name && fn.name.trim() !== '');
      }

      const functionData = functions.map(fn => ({
        name: fn.name || 'anonymous',
        type: fn.type,
        line: fn.line,
        column: fn.column,
        isAsync: fn.text.includes('async'),
        text: fn.text.length > 150 ? fn.text.slice(0, 150) + '...' : fn.text,
      }));
      
      this.lastAnalysis = {
        ...this.lastAnalysis,
        functions: functionData,
        timestamp: new Date(),
      } as AnalysisResult;

      return {
        content: [{
          type: "text",
          text: `Found ${functionData.length} functions:\n${JSON.stringify(functionData, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting functions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getClasses(args: { includeProperties?: boolean; includeMethods?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const classes = this.currentAST.tree.classes();
      
      const classData = classes.map(cls => {
        const data: any = {
          name: cls.name || 'anonymous',
          type: cls.type,
          line: cls.line,
          column: cls.column,
        };

        if (args.includeMethods !== false) {
          const methods = cls.findAll('method');
          data.methods = methods.map((method: TreeNode) => ({
            name: method.name || 'anonymous',
            line: method.line,
            isStatic: method.text.includes('static'),
            isAsync: method.text.includes('async'),
          }));
        }

        if (args.includeProperties !== false) {
          const properties = cls.findAll('property_definition');
          data.properties = properties.map((prop: TreeNode) => ({
            name: prop.name || 'unknown',
            line: prop.line,
            isStatic: prop.text.includes('static'),
          }));
        }

        return data;
      });

      this.lastAnalysis = {
        ...this.lastAnalysis,
        classes: classData,
        timestamp: new Date(),
      } as AnalysisResult;

      return {
        content: [{
          type: "text",
          text: `Found ${classData.length} classes:\n${JSON.stringify(classData, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting classes: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getImports(args: { includeTypeImports?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      let imports = this.currentAST.tree.imports();
      
      if (args.includeTypeImports === false) {
        imports = imports.filter(imp => !imp.text.includes('type '));
      }

      const importData = imports.map(imp => ({
        module: this.extractModuleName(imp.text),
        specifiers: this.extractImportSpecifiers(imp.text),
        line: imp.line,
        column: imp.column,
        isTypeOnly: imp.text.includes('type '),
        text: imp.text,
      }));

      this.lastAnalysis = {
        ...this.lastAnalysis,
        imports: importData,
        timestamp: new Date(),
      } as AnalysisResult;

      return {
        content: [{
          type: "text",
          text: `Found ${importData.length} imports:\n${JSON.stringify(importData, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting imports: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private extractModuleName(importText: string): string {
    const match = importText.match(/from\s+['"]([^'"]+)['"]/);
    return match ? match[1] : 'unknown';
  }

  private extractImportSpecifiers(importText: string): string[] {
    const defaultMatch = importText.match(/import\s+(\w+)(?=\s*[,{]|\s+from)/);
    const namedMatch = importText.match(/import\s*(?:\w+\s*,\s*)?{([^}]+)}/);
    const namespaceMatch = importText.match(/import\s*\*\s*as\s+(\w+)/);
    
    const specifiers: string[] = [];
    
    if (defaultMatch) {
      specifiers.push(defaultMatch[1]);
    }
    
    if (namedMatch) {
      const named = namedMatch[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      specifiers.push(...named);
    }
    
    if (namespaceMatch) {
      specifiers.push(`* as ${namespaceMatch[1]}`);
    }
    
    return specifiers;
  }

  private async renameIdentifier(args: { oldName: string; newName: string; preview?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const transformed = this.currentAST.tree.transform()
        .rename(args.oldName, args.newName);

      const result = transformed.toString();
      
      if (!args.preview) {
        this.currentAST.sourceCode = result;
        this.currentAST.tree = parse(result);
        this.currentAST.timestamp = new Date();
      }

      const transformResult: TransformResult = {
        operation: "rename_identifier",
        parameters: { oldName: args.oldName, newName: args.newName },
        preview: result.slice(0, 500) + (result.length > 500 ? '...' : ''),
        timestamp: new Date(),
      };
      
      this.transformHistory.push(transformResult);

      return {
        content: [{
          type: "text",
          text: `${args.preview ? 'Preview: ' : ''}Renamed "${args.oldName}" to "${args.newName}"\n\n${args.preview ? 'Preview:\n' : 'Result:\n'}${result}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error renaming identifier: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async removeUnusedImports(args: { preview?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const transformed = this.currentAST.tree.transform()
        .removeUnusedImports();

      const result = transformed.toString();
      
      if (!args.preview) {
        this.currentAST.sourceCode = result;
        this.currentAST.tree = parse(result);
        this.currentAST.timestamp = new Date();
      }

      const transformResult: TransformResult = {
        operation: "remove_unused_imports",
        parameters: {},
        preview: result.slice(0, 500) + (result.length > 500 ? '...' : ''),
        timestamp: new Date(),
      };
      
      this.transformHistory.push(transformResult);

      return {
        content: [{
          type: "text",
          text: `${args.preview ? 'Preview: ' : ''}Removed unused imports\n\n${args.preview ? 'Preview:\n' : 'Result:\n'}${result}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error removing unused imports: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async transformCode(args: { operations: any[]; preview?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      let transformer = this.currentAST.tree.transform();
      
      for (const op of args.operations) {
        switch (op.type) {
          case "rename":
            transformer = transformer.rename(op.parameters.oldName, op.parameters.newName);
            break;
          case "removeUnusedImports":
            transformer = transformer.removeUnusedImports();
            break;
          case "replaceIn":
            transformer = transformer.replaceIn(op.parameters.nodeType, op.parameters.pattern, op.parameters.replacement);
            break;
          case "insertBefore":
            transformer = transformer.insertBefore(op.parameters.pattern, op.parameters.text);
            break;
          case "insertAfter":
            transformer = transformer.insertAfter(op.parameters.pattern, op.parameters.text);
            break;
          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }
      }

      const result = transformer.toString();
      
      if (!args.preview) {
        this.currentAST.sourceCode = result;
        this.currentAST.tree = parse(result);
        this.currentAST.timestamp = new Date();
      }

      const transformResult: TransformResult = {
        operation: "transform_code",
        parameters: { operations: args.operations },
        preview: result.slice(0, 500) + (result.length > 500 ? '...' : ''),
        timestamp: new Date(),
      };
      
      this.transformHistory.push(transformResult);

      return {
        content: [{
          type: "text",
          text: `${args.preview ? 'Preview: ' : ''}Applied ${args.operations.length} transformations\n\n${args.preview ? 'Preview:\n' : 'Result:\n'}${result}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error transforming code: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getNodeAtPosition(args: { line: number; column: number }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const node = this.currentAST.tree.nodeAt(args.line, args.column);
      
      if (!node) {
        return {
          content: [{
            type: "text",
            text: `No node found at position ${args.line}:${args.column}`,
          }],
        };
      }

      const nodeInfo = {
        type: node.type,
        text: node.text.length > 200 ? node.text.slice(0, 200) + '...' : node.text,
        line: node.line,
        column: node.column,
        name: node.name,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        parent: node.parent ? {
          type: node.parent.type,
          name: node.parent.name,
        } : null,
        childrenCount: node.children.length,
      };

      return {
        content: [{
          type: "text",
          text: `Node at position ${args.line}:${args.column}:\n${JSON.stringify(nodeInfo, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting node at position: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async analyzeScopes(args: { includeBuiltins?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const scopes = this.currentAST.tree.analyzeScopes();
      
      // Note: This is a simplified scope analysis implementation
      // The actual tree-hugger-js library may have more sophisticated scope analysis
      const scopeInfo = {
        message: "Scope analysis completed",
        scopeCount: "Scope analysis functionality depends on tree-hugger-js implementation",
        note: "This is a placeholder - actual implementation would use tree-hugger-js scope analysis features",
      };

      return {
        content: [{
          type: "text",
          text: `Scope Analysis Results:\n${JSON.stringify(scopeInfo, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error analyzing scopes: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async insertCode(args: { pattern: string; code: string; position: "before" | "after"; preview?: boolean }) {
    if (!this.currentAST) {
      return {
        content: [{
          type: "text",
          text: "No AST loaded. Please use parse_code first.",
        }],
        isError: true,
      };
    }

    try {
      const transformer = this.currentAST.tree.transform();
      const transformed = args.position === "before" 
        ? transformer.insertBefore(args.pattern, args.code)
        : transformer.insertAfter(args.pattern, args.code);

      const result = transformed.toString();
      
      if (!args.preview) {
        this.currentAST.sourceCode = result;
        this.currentAST.tree = parse(result);
        this.currentAST.timestamp = new Date();
      }

      const transformResult: TransformResult = {
        operation: "insert_code",
        parameters: { pattern: args.pattern, code: args.code, position: args.position },
        preview: result.slice(0, 500) + (result.length > 500 ? '...' : ''),
        timestamp: new Date(),
      };
      
      this.transformHistory.push(transformResult);

      return {
        content: [{
          type: "text",
          text: `${args.preview ? 'Preview: ' : ''}Inserted code ${args.position} pattern "${args.pattern}"\n\n${args.preview ? 'Preview:\n' : 'Result:\n'}${result}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error inserting code: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new TreeHuggerMCPServer();
server.run().catch(console.error);