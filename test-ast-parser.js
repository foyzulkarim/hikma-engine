// Quick test to verify AST parser type fixes
const { AstParser } = require('./dist/modules/ast-parser.js');
const { ConfigManager } = require('./dist/config/index.js');

async function testAstParser() {
  try {
    const config = new ConfigManager();
    const parser = new AstParser(process.cwd(), config);
    
    // Test with a simple TypeScript file
    const testFiles = ['src/types/index.ts'];
    await parser.parseFiles(testFiles);
    
    const nodes = parser.getNodes();
    const edges = parser.getEdges();
    
    console.log('✅ AST Parser test passed!');
    console.log(`Generated ${nodes.length} nodes and ${edges.length} edges`);
    
    // Check if FileNode has all required properties
    const fileNodes = nodes.filter(n => n.type === 'FileNode');
    if (fileNodes.length > 0) {
      const fileNode = fileNodes[0];
      const requiredProps = ['filePath', 'fileName', 'fileExtension', 'repoId', 'language', 'sizeKb', 'contentHash', 'fileType'];
      const hasAllProps = requiredProps.every(prop => fileNode.properties.hasOwnProperty(prop));
      
      if (hasAllProps) {
        console.log('✅ FileNode has all required properties');
      } else {
        console.log('❌ FileNode missing required properties');
      }
    }
    
    // Check if edges don't have invalid id property
    const hasInvalidId = edges.some(e => e.hasOwnProperty('id'));
    if (!hasInvalidId) {
      console.log('✅ Edges do not have invalid id property');
    } else {
      console.log('❌ Some edges still have invalid id property');
    }
    
  } catch (error) {
    console.error('❌ AST Parser test failed:', error.message);
  }
}

testAstParser();
