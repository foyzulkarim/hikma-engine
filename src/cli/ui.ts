import chalk from 'chalk';
import Table from 'cli-table3';
// Avoid importing from llm-rag here to prevent side-effects (e.g., provider manager init)
export interface SimpleRAGResponse {
  success?: boolean;
  explanation?: string;
  model: string;
  device?: string;
  finishReason?: string;
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  [key: string]: any;
}

export function displaySuccess(message: string, metrics?: Record<string, any>): void {
  console.log(chalk.green(`\n✅ ${message}`));
  if (metrics) {
    console.log(chalk.gray('='.repeat(Math.min(message.length + 3, 50))));
    Object.entries(metrics).forEach(([key, value]) => {
      const formattedKey = chalk.cyan(key);
      const formattedValue = typeof value === 'number'
        ? chalk.yellow(value.toLocaleString())
        : chalk.white(String(value));
      console.log(`${formattedKey}: ${formattedValue}`);
    });
  }
}

export function displayCommandHeader(command: string, description: string): void {
  console.log(chalk.blue(`\n🚀 ${command}`));
  console.log(chalk.gray(description));
  console.log(chalk.gray('-'.repeat(50)));
}

export function displayProgress(message: string): void {
  console.log(chalk.blue(`🔄 ${message}`));
}

export function displayRAGExplanation(query: string, ragResponse: SimpleRAGResponse): void {
  const { explanation, model, device, finishReason, usage } = ragResponse;

  console.log(chalk.green('\n🧠 Code Explanation:'));
  console.log(chalk.gray('='.repeat(60)));
  console.log(chalk.cyan(`Query: "${query}"`));
  console.log(chalk.gray(`Model: ${model}${device ? ` (${device})` : ''}`));
  console.log(chalk.gray('='.repeat(60)));
  console.log();

  if (explanation) {
    const paragraphs = explanation.split('\n\n').filter((p) => p.trim());
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) console.log();
      console.log(chalk.white(paragraph.trim()));
    });
  } else {
    console.log(chalk.yellow('No explanation generated.'));
  }

  console.log();
  console.log(chalk.gray('='.repeat(60)));
  if (finishReason && finishReason !== 'stop') {
    console.log(chalk.yellow(`⚠️  Generation finished due to: ${finishReason}`));
  }
  if (usage?.total_tokens) {
    console.log(chalk.gray(`Tokens used: total=${usage.total_tokens}${usage.prompt_tokens !== undefined ? `, prompt=${usage.prompt_tokens}` : ''}${usage.completion_tokens !== undefined ? `, completion=${usage.completion_tokens}` : ''}`));
  }
  console.log(chalk.green('✨ Code explanation completed'));
}

export function displayResults(results: any[], title: string): void {
  console.log(chalk.green(`\n📋 ${title}`));
  console.log(chalk.gray('='.repeat(title.length + 3)));

  if (results.length === 0) {
    console.log(chalk.yellow('\n📭 No results found. Try adjusting your search criteria.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Node ID'),
      chalk.bold('Type'),
      chalk.bold('File Path'),
      chalk.bold('Similarity'),
      chalk.bold('Source Text Preview'),
    ],
    colWidths: [12, 15, 35, 12, 50],
    wordWrap: true,
    style: { head: ['cyan'], border: ['gray'] },
  });

  results.forEach((result: any, index: number) => {
    const similarity = result.similarity ? `${(result.similarity * 100).toFixed(1)}%` : 'N/A';
    const preview = result.node?.sourceText
      ? result.node.sourceText.length > 80
        ? result.node.sourceText.substring(0, 80).replace(/\n/g, ' ') + '...'
        : result.node.sourceText.replace(/\n/g, ' ')
      : 'N/A';

    const nodeId = result.node?.nodeId || 'N/A';
    const nodeType = result.node?.nodeType || 'N/A';
    const filePath = result.node?.filePath || 'N/A';

    table.push([
      chalk.dim(`#${index + 1} `) + nodeId.substring(0, 8),
      chalk.blue(nodeType),
      chalk.gray(filePath.length > 30 ? '...' + filePath.substring(filePath.length - 30) : filePath),
      similarity === 'N/A' ? chalk.gray(similarity) : chalk.green(similarity),
      chalk.white(preview),
    ]);
  });

  console.log(table.toString());
  console.log(chalk.green(`\n📊 Displayed ${results.length} result${results.length === 1 ? '' : 's'}`));
}


