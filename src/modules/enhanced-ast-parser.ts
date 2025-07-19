/**
 * Enhanced AST Parser for deep code analysis
 * Extracts Functions, Variables, Classes, Imports, Exports with relationships
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger';
import { 
  EnhancedNode, 
  EnhancedEdge, 
  EnhancedFunctionNode, 
  VariableNode, 
  ClassNode, 
  ImportNode, 
  ExportNode,
  BusinessKeyGenerator 
} from '../types/enhanced-graph';

export class EnhancedASTParser {
  private logger = getLogger('EnhancedASTParser');
  private nodes: EnhancedNode[] = [];
  private edges: EnhancedEdge[] = [];
  private currentFileId: string = '';
  private currentRepoId: string = '';
  private currentCommitSha: string = '';
  private sourceFile: ts.SourceFile | null = null;

  /**
   * Parse a TypeScript/JavaScript file and extract enhanced AST information
   */
  async parseFile(
    filePath: string, 
    repoId: string, 
    commitSha: string,
    content?: string
  ): Promise<{ nodes: EnhancedNode[], edges: EnhancedEdge[] }> {
    this.logger.debug(`Parsing file: ${filePath}`);
    
    // Reset state
    this.nodes = [];
    this.edges = [];
    this.currentRepoId = repoId;
    this.currentCommitSha = commitSha;
    this.currentFileId = BusinessKeyGenerator.file(repoId, commitSha, filePath);

    try {
      // Read file content if not provided
      const fileContent = content || fs.readFileSync(filePath, 'utf-8');
      
      // Create TypeScript source file
      this.sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true
      );

      // Visit all nodes in the AST
      this.visitNode(this.sourceFile);

      this.logger.debug(`Parsed ${filePath}: ${this.nodes.length} nodes, ${this.edges.length} edges`);
      
      return {
        nodes: [...this.nodes],
        edges: [...this.edges]
      };
    } catch (error) {
      this.logger.error(`Failed to parse ${filePath}`, { error });
      return { nodes: [], edges: [] };
    }
  }

  private visitNode(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
        this.processFunctionDeclaration(node as ts.FunctionDeclaration);
        break;
      case ts.SyntaxKind.ArrowFunction:
        this.processArrowFunction(node as ts.ArrowFunction);
        break;
      case ts.SyntaxKind.MethodDeclaration:
        this.processMethodDeclaration(node as ts.MethodDeclaration);
        break;
      case ts.SyntaxKind.ClassDeclaration:
        this.processClassDeclaration(node as ts.ClassDeclaration);
        break;
      case ts.SyntaxKind.VariableDeclaration:
        this.processVariableDeclaration(node as ts.VariableDeclaration);
        break;
      case ts.SyntaxKind.ImportDeclaration:
        this.processImportDeclaration(node as ts.ImportDeclaration);
        break;
      case ts.SyntaxKind.ExportDeclaration:
      case ts.SyntaxKind.ExportAssignment:
        this.processExportDeclaration(node);
        break;
      case ts.SyntaxKind.CallExpression:
        this.processCallExpression(node as ts.CallExpression);
        break;
      case ts.SyntaxKind.Identifier:
        this.processIdentifier(node as ts.Identifier);
        break;
    }

    // Continue visiting child nodes
    ts.forEachChild(node, child => this.visitNode(child));
  }

  private processFunctionDeclaration(node: ts.FunctionDeclaration): void {
    if (!node.name) return;

    const functionName = node.name.text;
    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const endPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getEnd());
    
    const businessKey = BusinessKeyGenerator.function(
      this.currentFileId, 
      functionName, 
      startPos.line + 1
    );

    const functionNode: EnhancedFunctionNode = {
      id: businessKey,
      businessKey,
      type: 'Function',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        name: functionName,
        async: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
        generator: !!node.asteriskToken,
        params: node.parameters.map(p => p.name?.getText() || '').filter(Boolean),
        returnType: node.type?.getText(),
        loc: endPos.line - startPos.line + 1,
        startLine: startPos.line + 1,
        endLine: endPos.line + 1,
        body: node.body?.getText() || '',
        docstring: this.extractJSDoc(node)
      }
    };

    this.nodes.push(functionNode);

    // Create DECLARES edge from file to function
    this.edges.push({
      id: `${this.currentFileId}-DECLARES-${businessKey}`,
      source: this.currentFileId,
      target: businessKey,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: businessKey,
      type: 'DECLARES',
      line: startPos.line + 1,
      col: startPos.character + 1
    });

    // Process function body for variable reads/writes and calls
    if (node.body) {
      this.processFunctionBody(node.body, businessKey);
    }
  }

  private processArrowFunction(node: ts.ArrowFunction): void {
    const parent = node.parent;
    let functionName = 'anonymous';
    
    // Try to get function name from variable declaration or property assignment
    if (ts.isVariableDeclaration(parent) && parent.name) {
      functionName = parent.name.getText();
    } else if (ts.isPropertyAssignment(parent) && parent.name) {
      functionName = parent.name.getText();
    }

    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const endPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getEnd());
    
    const businessKey = BusinessKeyGenerator.function(
      this.currentFileId, 
      functionName, 
      startPos.line + 1
    );

    const arrowFunctionNode: EnhancedFunctionNode = {
      id: businessKey,
      businessKey,
      type: 'ArrowFunction',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        name: functionName,
        async: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
        generator: false,
        params: node.parameters.map(p => p.name?.getText() || '').filter(Boolean),
        returnType: node.type?.getText(),
        loc: endPos.line - startPos.line + 1,
        startLine: startPos.line + 1,
        endLine: endPos.line + 1,
        body: node.body.getText(),
        docstring: this.extractJSDoc(node)
      }
    };

    this.nodes.push(arrowFunctionNode);

    // Create DECLARES edge
    this.edges.push({
      id: `${this.currentFileId}-DECLARES-${businessKey}`,
      source: this.currentFileId,
      target: businessKey,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: businessKey,
      type: 'DECLARES',
      line: startPos.line + 1,
      col: startPos.character + 1
    });

    // Process function body
    this.processFunctionBody(node.body, businessKey);
  }

  private processMethodDeclaration(node: ts.MethodDeclaration): void {
    if (!node.name) return;

    const methodName = node.name.getText();
    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const endPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getEnd());
    
    const businessKey = BusinessKeyGenerator.function(
      this.currentFileId, 
      methodName, 
      startPos.line + 1
    );

    const methodNode: EnhancedFunctionNode = {
      id: businessKey,
      businessKey,
      type: 'Function',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        name: methodName,
        async: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
        generator: !!node.asteriskToken,
        params: node.parameters.map(p => p.name?.getText() || '').filter(Boolean),
        returnType: node.type?.getText(),
        loc: endPos.line - startPos.line + 1,
        startLine: startPos.line + 1,
        endLine: endPos.line + 1,
        body: node.body?.getText() || '',
        docstring: this.extractJSDoc(node)
      }
    };

    this.nodes.push(methodNode);

    // Create DECLARES edge
    this.edges.push({
      id: `${this.currentFileId}-DECLARES-${businessKey}`,
      source: this.currentFileId,
      target: businessKey,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: businessKey,
      type: 'DECLARES',
      line: startPos.line + 1,
      col: startPos.character + 1
    });

    // Process method body
    if (node.body) {
      this.processFunctionBody(node.body, businessKey);
    }
  }

  private processClassDeclaration(node: ts.ClassDeclaration): void {
    if (!node.name) return;

    const className = node.name.text;
    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const endPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getEnd());
    
    const businessKey = BusinessKeyGenerator.class(this.currentFileId, className);

    const classNode: ClassNode = {
      id: businessKey,
      businessKey,
      type: 'Class',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        name: className,
        isAbstract: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword)),
        extends: node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.getText(),
        implements: node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ImplementsKeyword)?.types.map(t => t.getText()),
        decorators: (node as any).decorators?.map((d: any) => d.getText()),
        startLine: startPos.line + 1,
        endLine: endPos.line + 1
      }
    };

    this.nodes.push(classNode);

    // Create DECLARES edge
    this.edges.push({
      id: `${this.currentFileId}-DECLARES-${businessKey}`,
      source: this.currentFileId,
      target: businessKey,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: businessKey,
      type: 'DECLARES',
      line: startPos.line + 1,
      col: startPos.character + 1
    });

    // Process inheritance relationships
    if (classNode.properties.extends) {
      // Create EXTENDS edge (would need to resolve the target class)
      // For now, we'll create a placeholder
      this.edges.push({
        id: `${businessKey}-EXTENDS-${classNode.properties.extends}`,
        source: businessKey,
        target: classNode.properties.extends,
        sourceBusinessKey: businessKey,
        targetBusinessKey: classNode.properties.extends,
        type: 'EXTENDS'
      });
    }
  }

  private processVariableDeclaration(node: ts.VariableDeclaration): void {
    if (!node.name || !ts.isIdentifier(node.name)) return;

    const varName = node.name.text;
    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    
    const businessKey = BusinessKeyGenerator.variable(
      this.currentFileId, 
      varName, 
      startPos.line + 1
    );

    // Determine variable kind
    const parent = node.parent;
    let kind: 'const' | 'let' | 'var' = 'var';
    if (ts.isVariableDeclarationList(parent)) {
      if (parent.flags & ts.NodeFlags.Const) kind = 'const';
      else if (parent.flags & ts.NodeFlags.Let) kind = 'let';
    }

    const variableNode: VariableNode = {
      id: businessKey,
      businessKey,
      type: 'Variable',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        name: varName,
        kind,
        typeAnnotation: node.type?.getText(),
        valueSnippet: node.initializer?.getText()?.substring(0, 100),
        isExported: this.isExported(node),
        scope: this.determineScope(node)
      }
    };

    this.nodes.push(variableNode);

    // Create DECLARES edge
    this.edges.push({
      id: `${this.currentFileId}-DECLARES-${businessKey}`,
      source: this.currentFileId,
      target: businessKey,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: businessKey,
      type: 'DECLARES',
      line: startPos.line + 1,
      col: startPos.character + 1
    });
  }

  private processImportDeclaration(node: ts.ImportDeclaration): void {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const businessKey = BusinessKeyGenerator.import(this.currentFileId, startPos.line + 1);
    
    const sourceModule = node.moduleSpecifier.text;
    const importedNames: string[] = [];
    const localNames: string[] = [];
    let isDefault = false;
    let isNamespace = false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        isDefault = true;
        importedNames.push('default');
        localNames.push(node.importClause.name.text);
      }

      // Named imports
      if (node.importClause.namedBindings) {
        if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          isNamespace = true;
          importedNames.push('*');
          localNames.push(node.importClause.namedBindings.name.text);
        } else if (ts.isNamedImports(node.importClause.namedBindings)) {
          node.importClause.namedBindings.elements.forEach(element => {
            importedNames.push(element.propertyName?.text || element.name.text);
            localNames.push(element.name.text);
          });
        }
      }
    }

    const importNode: ImportNode = {
      id: businessKey,
      businessKey,
      type: 'Import',
      repoId: this.currentRepoId,
      commitSha: this.currentCommitSha,
      filePath: this.sourceFile!.fileName,
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        isDefault,
        isNamespace,
        sourceModule,
        importedNames,
        localNames
      }
    };

    this.nodes.push(importNode);

    // Create IMPORTS edge from file to module
    this.edges.push({
      id: `${this.currentFileId}-IMPORTS-${sourceModule}`,
      source: this.currentFileId,
      target: sourceModule,
      sourceBusinessKey: this.currentFileId,
      targetBusinessKey: sourceModule,
      type: 'IMPORTS',
      line: startPos.line + 1,
      col: startPos.character + 1,
      properties: {
        importedNames,
        localNames,
        isDefault,
        isNamespace
      }
    });
  }

  private processExportDeclaration(node: ts.Node): void {
    const startPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    
    if (ts.isExportDeclaration(node)) {
      // Handle export { ... } from '...'
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach(element => {
          const exportName = element.name.text;
          const businessKey = BusinessKeyGenerator.export(this.currentFileId, exportName);
          
          const exportNode: ExportNode = {
            id: businessKey,
            businessKey,
            type: 'Export',
            repoId: this.currentRepoId,
            commitSha: this.currentCommitSha,
            filePath: this.sourceFile!.fileName,
            line: startPos.line + 1,
            col: startPos.character + 1,
            properties: {
              name: exportName,
              type: 'named',
              isReExport: !!node.moduleSpecifier,
              sourceModule: node.moduleSpecifier?.getText()
            }
          };

          this.nodes.push(exportNode);

          // Create EXPORTS edge
          this.edges.push({
            id: `${this.currentFileId}-EXPORTS-${businessKey}`,
            source: this.currentFileId,
            target: businessKey,
            sourceBusinessKey: this.currentFileId,
            targetBusinessKey: businessKey,
            type: 'EXPORTS',
            line: startPos.line + 1,
            col: startPos.character + 1
          });
        });
      }
    } else if (ts.isExportAssignment(node)) {
      // Handle export = ... or export default ...
      const businessKey = BusinessKeyGenerator.export(this.currentFileId, 'default');
      
      const exportNode: ExportNode = {
        id: businessKey,
        businessKey,
        type: 'Export',
        repoId: this.currentRepoId,
        commitSha: this.currentCommitSha,
        filePath: this.sourceFile!.fileName,
        line: startPos.line + 1,
        col: startPos.character + 1,
        properties: {
          name: 'default',
          type: 'default',
          isReExport: false
        }
      };

      this.nodes.push(exportNode);

      // Create EXPORTS edge
      this.edges.push({
        id: `${this.currentFileId}-EXPORTS-${businessKey}`,
        source: this.currentFileId,
        target: businessKey,
        sourceBusinessKey: this.currentFileId,
        targetBusinessKey: businessKey,
        type: 'EXPORTS',
        line: startPos.line + 1,
        col: startPos.character + 1
      });
    }
  }

  private processCallExpression(node: ts.CallExpression): void {
    // This will be called from within function bodies to track function calls
    // Implementation depends on the current function context
  }

  private processIdentifier(node: ts.Identifier): void {
    // Track variable reads/writes within function contexts
    // Implementation depends on the current function context
  }

  private processFunctionBody(body: ts.Node, functionBusinessKey: string): void {
    // Recursively process function body to find:
    // - Function calls (CALLS edges)
    // - Variable reads (READS edges)  
    // - Variable writes (WRITES edges)
    
    const processNode = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        this.processFunctionCall(node, functionBusinessKey);
      } else if (ts.isIdentifier(node)) {
        this.processVariableAccess(node, functionBusinessKey);
      }
      
      ts.forEachChild(node, processNode);
    };

    processNode(body);
  }

  private processFunctionCall(node: ts.CallExpression, callerBusinessKey: string): void {
    const callPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    
    // Try to resolve the called function
    let calledFunctionName = '';
    if (ts.isIdentifier(node.expression)) {
      calledFunctionName = node.expression.text;
    } else if (ts.isPropertyAccessExpression(node.expression)) {
      calledFunctionName = node.expression.name.text;
    }

    if (calledFunctionName) {
      // Create a placeholder business key for the called function
      // In a real implementation, you'd resolve this properly
      const calleeBusinessKey = `${this.currentFileId}#${calledFunctionName}#unknown`;
      
      this.edges.push({
        id: `${callerBusinessKey}-CALLS-${calleeBusinessKey}`,
        source: callerBusinessKey,
        target: calleeBusinessKey,
        sourceBusinessKey: callerBusinessKey,
        targetBusinessKey: calleeBusinessKey,
        type: 'CALLS',
        line: callPos.line + 1,
        col: callPos.character + 1,
        dynamic: this.isDynamicCall(node)
      });
    }
  }

  private processVariableAccess(node: ts.Identifier, functionBusinessKey: string): void {
    const accessPos = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    const varName = node.text;
    
    // Determine if this is a read or write
    const isWrite = this.isWriteAccess(node);
    const edgeType = isWrite ? 'WRITES' : 'READS';
    
    // Create placeholder variable business key
    const varBusinessKey = BusinessKeyGenerator.variable(this.currentFileId, varName, accessPos.line + 1);
    
    this.edges.push({
      id: `${functionBusinessKey}-${edgeType}-${varBusinessKey}`,
      source: functionBusinessKey,
      target: varBusinessKey,
      sourceBusinessKey: functionBusinessKey,
      targetBusinessKey: varBusinessKey,
      type: edgeType as 'READS' | 'WRITES',
      line: accessPos.line + 1,
      col: accessPos.character + 1
    });
  }

  // Helper methods
  private extractJSDoc(node: ts.Node): string | undefined {
    const jsDoc = (node as any).jsDoc;
    if (jsDoc && jsDoc.length > 0) {
      return jsDoc[0].comment;
    }
    return undefined;
  }

  private isExported(node: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (ts.isExportDeclaration(current) || ts.isExportAssignment(current)) {
        return true;
      }
      if ((current as any).modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  private determineScope(node: ts.Node): 'global' | 'function' | 'block' {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) {
        return 'function';
      }
      if (ts.isBlock(current)) {
        return 'block';
      }
      current = current.parent;
    }
    return 'global';
  }

  private isDynamicCall(node: ts.CallExpression): boolean {
    // Check if this is a dynamic call like require() or import()
    if (ts.isIdentifier(node.expression)) {
      return ['require', 'import'].includes(node.expression.text);
    }
    return false;
  }

  private isWriteAccess(node: ts.Identifier): boolean {
    const parent = node.parent;
    
    // Check if this identifier is on the left side of an assignment
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return parent.left === node;
    }
    
    // Check for other write patterns (++, --, +=, etc.)
    if (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent)) {
      return [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator);
    }
    
    return false;
  }
}
