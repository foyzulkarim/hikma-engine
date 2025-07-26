#!/usr/bin/env ts-node

/**
 * Enhanced Search Example
 * 
 * This example demonstrates how to use the EnhancedSearchService
 * to perform various types of searches on the embedding_nodes table.
 */

import { EnhancedSearchService } from '../src/modules/enhanced-search-service';
import { ConfigManager } from '../src/config';
import chalk from 'chalk';

async function runSearchExamples() {
  console.log(chalk.blue('🔍 Enhanced Search Service Examples\n'));

  try {
    // Initialize the service
    const config = new ConfigManager(process.cwd());
    const searchService = new EnhancedSearchService(config);
    
    console.log(chalk.yellow('Initializing Enhanced Search Service...'));
    await searchService.initialize();
    console.log(chalk.green('✅ Service initialized successfully\n'));

    // Example 1: Semantic Search
    console.log(chalk.cyan('📊 Example 1: Semantic Search'));
    console.log('Query: "authentication function"\n');
    
    const semanticResults = await searchService.semanticSearch('authentication function', {
      limit: 5,
      minSimilarity: 0.7
    });
    
    console.log(`Found ${semanticResults.length} semantic results:`);
    semanticResults.forEach((result, index) => {
      console.log(`${index + 1}. ${chalk.green(result.node.nodeType)} in ${chalk.blue(result.node.filePath)}`);
      console.log(`   Similarity: ${chalk.yellow((result.similarity * 100).toFixed(1))}%`);
      console.log(`   Text: ${result.node.sourceText.substring(0, 100)}...\n`);
    });

    // Example 2: Metadata Search
    console.log(chalk.cyan('📋 Example 2: Metadata Search'));
    console.log('Filter: node_type = "function"\n');
    
    const metadataResults = await searchService.metadataSearch({
      nodeType: 'function'
    }, {
      limit: 3
    });
    
    console.log(`Found ${metadataResults.length} metadata results:`);
    metadataResults.forEach((result, index) => {
      console.log(`${index + 1}. ${chalk.green(result.node.nodeType)} in ${chalk.blue(result.node.filePath)}`);
      console.log(`   Text: ${result.node.sourceText.substring(0, 80)}...\n`);
    });

    // Example 3: Hybrid Search
    console.log(chalk.cyan('🔄 Example 3: Hybrid Search'));
    console.log('Query: "database query" + Filter: TypeScript files\n');
    
    const hybridResults = await searchService.hybridSearch('database query', {
      filePath: '.ts'
    }, {
      limit: 4
    });
    
    console.log(`Found ${hybridResults.length} hybrid results:`);
    hybridResults.forEach((result, index) => {
      console.log(`${index + 1}. ${chalk.green(result.node.nodeType)} in ${chalk.blue(result.node.filePath)}`);
      console.log(`   Similarity: ${chalk.yellow((result.similarity * 100).toFixed(1))}%`);
      console.log(`   Text: ${result.node.sourceText.substring(0, 80)}...\n`);
    });

    // Example 4: Text-based Search (fallback)
    console.log(chalk.cyan('📝 Example 4: Text-based Search'));
    console.log('Query: "export"\n');
    
    const textResults = await searchService.textBasedSearch('export', {
      limit: 3
    });
    
    console.log(`Found ${textResults.length} text-based results:`);
    textResults.forEach((result, index) => {
      console.log(`${index + 1}. ${chalk.green(result.node.nodeType)} in ${chalk.blue(result.node.filePath)}`);
      console.log(`   Text: ${result.node.sourceText.substring(0, 80)}...\n`);
    });

    // Example 5: Similar Node Search
    if (semanticResults.length > 0) {
      console.log(chalk.cyan('🔗 Example 5: Similar Node Search'));
      const targetNodeId = semanticResults[0].node.nodeId;
      console.log(`Finding nodes similar to: ${targetNodeId}\n`);
      
      const similarResults = await searchService.findSimilarNodes(targetNodeId, {
        limit: 3,
        minSimilarity: 0.6
      });
      
      console.log(`Found ${similarResults.length} similar nodes:`);
      similarResults.forEach((result, index) => {
        console.log(`${index + 1}. ${chalk.green(result.node.nodeType)} in ${chalk.blue(result.node.filePath)}`);
        console.log(`   Similarity: ${chalk.yellow((result.similarity * 100).toFixed(1))}%`);
        console.log(`   Text: ${result.node.sourceText.substring(0, 80)}...\n`);
      });
    }

    // Example 6: Get Statistics
    console.log(chalk.cyan('📈 Example 6: Embedding Statistics'));
    const stats = await searchService.getEmbeddingStats();
    
    console.log('Database Statistics:');
    console.log(`- Total nodes: ${chalk.yellow(stats.totalNodes)}`);
    console.log(`- Embedding coverage: ${chalk.yellow((stats.embeddingCoverage * 100).toFixed(1))}%`);
    
    console.log('\nNode Type Breakdown:');
    Object.entries(stats.nodeTypeBreakdown).forEach(([type, count]) => {
      console.log(`- ${chalk.green(type)}: ${chalk.yellow(count)}`);
    });
    
    console.log('\nTop File Paths:');
    Object.entries(stats.filePathBreakdown).slice(0, 5).forEach(([path, count]) => {
      console.log(`- ${chalk.blue(path)}: ${chalk.yellow(count)}`);
    });

  } catch (error) {
    console.error(chalk.red('❌ Error running search examples:'), error);
    process.exit(1);
  }
}

// Run the examples
if (require.main === module) {
  runSearchExamples()
    .then(() => {
      console.log(chalk.green('\n✅ All examples completed successfully!'));
      process.exit(0);
    })
    .catch((error) => {
      console.error(chalk.red('❌ Examples failed:'), error);
      process.exit(1);
    });
}

export { runSearchExamples };