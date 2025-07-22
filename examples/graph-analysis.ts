import { SQLiteClient } from '../src/persistence/db/connection';
import { InMemoryGraphService } from '../src/utils/in-memory-graph';
import { getLogger } from '../src/utils/logger';
import path from 'path';

/**
 * Example: Advanced graph analysis using the in-memory graph service
 * 
 * This demonstrates how to perform complex graph queries and analysis
 * on your local repository data for personal use.
 */

const logger = getLogger('GraphAnalysisExample');

async function analyzeCodeComplexity() {
  // Initialize the graph service
  const dbPath = path.join(process.cwd(), 'data', 'metadata.db');
  const sqliteClient = new SQLiteClient(dbPath);
  const graphService = new InMemoryGraphService(sqliteClient);
  
  try {
    // Connect and load graph
    await sqliteClient.connect();
    console.log('Loading graph into memory...');
    await graphService.loadGraph();
    console.log('✅ Graph loaded successfully\n');
    
    // 1. Analyze function complexity by call count
    console.log('🔍 Function Complexity Analysis:');
    const functions = graphService.getNodesByType('FunctionNode');
    const functionComplexity = functions.map(func => {
      const outgoingCalls = graphService.getOutgoingEdges(func.id)
        .filter(edge => edge.edgeType === 'CALLS').length;
      const incomingCalls = graphService.getIncomingEdges(func.id)
        .filter(edge => edge.edgeType === 'CALLS').length;
      
      return {
        name: func.properties.name || 'anonymous',
        filePath: func.filePath,
        line: func.line,
        outgoingCalls,
        incomingCalls,
        totalComplexity: outgoingCalls + incomingCalls
      };
    });
    
    // Sort by complexity and show top 10
    const topComplex = functionComplexity
      .sort((a, b) => b.totalComplexity - a.totalComplexity)
      .slice(0, 10);
    
    console.log('Top 10 most complex functions:');
    topComplex.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name} (${func.filePath}:${func.line})`);
      console.log(`     Calls: ${func.outgoingCalls} out, ${func.incomingCalls} in`);
    });
    
    // 2. Find potential refactoring candidates (functions with many callers)
    console.log('\n🔧 Refactoring Candidates (functions called by many others):');
    const refactoringCandidates = functionComplexity
      .filter(func => func.incomingCalls >= 3)
      .sort((a, b) => b.incomingCalls - a.incomingCalls)
      .slice(0, 5);
    
    refactoringCandidates.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name} (${func.filePath}:${func.line})`);
      console.log(`     Called by ${func.incomingCalls} functions`);
    });
    
    // 3. Find isolated functions (no callers)
    console.log('\n🏝️  Isolated Functions (potential dead code):');
    const isolatedFunctions = functionComplexity
      .filter(func => func.incomingCalls === 0 && func.outgoingCalls === 0)
      .slice(0, 10);
    
    isolatedFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name} (${func.filePath}:${func.line})`);
    });
    
    // 4. Analyze file interconnectedness
    console.log('\n📁 File Analysis:');
    const fileStats = new Map<string, { functions: number; calls: number }>();
    
    functions.forEach(func => {
      const filePath = func.filePath || 'unknown';
      if (!fileStats.has(filePath)) {
        fileStats.set(filePath, { functions: 0, calls: 0 });
      }
      
      const stats = fileStats.get(filePath)!;
      stats.functions++;
      stats.calls += graphService.getOutgoingEdges(func.id)
        .filter(edge => edge.edgeType === 'CALLS').length;
    });
    
    const topFiles = Array.from(fileStats.entries())
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 5);
    
    console.log('Top 5 most active files:');
    topFiles.forEach(([filePath, stats], index) => {
      console.log(`  ${index + 1}. ${filePath}`);
      console.log(`     ${stats.functions} functions, ${stats.calls} total calls`);
    });
    
    // 5. Find circular dependencies (simplified)
    console.log('\n🔄 Potential Circular Dependencies:');
    const checkedPairs = new Set<string>();
    let circularCount = 0;
    
    for (const func1 of functions.slice(0, 100)) { // Limit for performance
      for (const func2 of functions.slice(0, 100)) {
        if (func1.id === func2.id) continue;
        
        const pairKey = [func1.id, func2.id].sort().join('-');
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        
        const chain1to2 = graphService.findCallChain(func1.id, func2.id, 3);
        const chain2to1 = graphService.findCallChain(func2.id, func1.id, 3);
        
        if (chain1to2 && chain2to1) {
          console.log(`  ${func1.properties.name} ↔ ${func2.properties.name}`);
          console.log(`    ${func1.filePath}:${func1.line} ↔ ${func2.filePath}:${func2.line}`);
          circularCount++;
          
          if (circularCount >= 5) break; // Limit output
        }
      }
      if (circularCount >= 5) break;
    }
    
    if (circularCount === 0) {
      console.log('  No circular dependencies found in sample');
    }
    
    // 6. Summary statistics
    const stats = graphService.getStats();
    console.log('\n📊 Summary Statistics:');
    console.log(`Total Functions: ${stats.nodeTypes.FunctionNode || 0}`);
    console.log(`Total Nodes: ${stats.nodeCount}`);
    console.log(`Total Edges: ${stats.edgeCount}`);
    console.log(`Average calls per function: ${(functionComplexity.reduce((sum, f) => sum + f.outgoingCalls, 0) / functions.length).toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
  } finally {
    await sqliteClient.disconnect();
  }
}

// Example: Find all test functions and their coverage
async function analyzeTestCoverage() {
  const dbPath = path.join(process.cwd(), 'data', 'metadata.db');
  const sqliteClient = new SQLiteClient(dbPath);
  const graphService = new InMemoryGraphService(sqliteClient);
  
  try {
    await sqliteClient.connect();
    await graphService.loadGraph();
    
    console.log('\n🧪 Test Coverage Analysis:');
    
    // Find test functions
    const testFunctions = graphService.searchNodes(node => 
      node.nodeType === 'FunctionNode' && 
      (node.properties.name?.includes('test') || 
       node.properties.name?.includes('Test') ||
       node.filePath?.includes('.test.') ||
       node.filePath?.includes('.spec.'))
    );
    
    console.log(`Found ${testFunctions.length} test functions`);
    
    // Find functions that are called by tests
    const testedFunctions = new Set<string>();
    testFunctions.forEach(testFunc => {
      const calls = graphService.getFunctionCalls(testFunc.id);
      calls.forEach(calledFunc => {
        if (!calledFunc.properties.name?.includes('test') && 
            !calledFunc.properties.name?.includes('Test')) {
          testedFunctions.add(calledFunc.id);
        }
      });
    });
    
    // Find all non-test functions
    const allFunctions = graphService.getNodesByType('FunctionNode')
      .filter(func => 
        !func.properties.name?.includes('test') && 
        !func.properties.name?.includes('Test') &&
        !func.filePath?.includes('.test.') &&
        !func.filePath?.includes('.spec.')
      );
    
    const coveragePercentage = (testedFunctions.size / allFunctions.length * 100).toFixed(2);
    
    console.log(`Functions with test coverage: ${testedFunctions.size}/${allFunctions.length} (${coveragePercentage}%)`);
    
    // Show untested functions
    const untestedFunctions = allFunctions
      .filter(func => !testedFunctions.has(func.id))
      .slice(0, 10);
    
    console.log('\nUntested functions (first 10):');
    untestedFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.properties.name} (${func.filePath}:${func.line})`);
    });
    
  } catch (error) {
    console.error('❌ Error during test analysis:', error);
  } finally {
    await sqliteClient.disconnect();
  }
}

// Run the analysis
async function main() {
  console.log('🚀 Starting Advanced Graph Analysis\n');
  
  await analyzeCodeComplexity();
  await analyzeTestCoverage();
  
  console.log('\n✅ Analysis complete!');
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { analyzeCodeComplexity, analyzeTestCoverage };