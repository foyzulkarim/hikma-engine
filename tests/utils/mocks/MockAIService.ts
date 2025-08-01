/**
 * @file MockAIService - Mock implementation for AI service testing
 */

import { jest } from '@jest/globals';

export interface MockAIServiceOptions {
  shouldFailGeneration?: boolean;
  maxTokens?: number;
  temperature?: number;
  simulateLatency?: boolean;
  modelName?: string;
}

export interface SummaryOptions {
  maxTokens?: number;
  temperature?: number;
  context?: string;
}

export class MockAIService {
  private shouldFailGeneration: boolean;
  private maxTokens: number;
  private temperature: number;
  private simulateLatency: boolean;
  private modelName: string;
  private modelLoaded = false;

  // Mock methods
  public loadModel = jest.fn();
  public generateSummary = jest.fn();
  public batchSummarize = jest.fn();
  public generateDocstring = jest.fn();
  public analyzeCode = jest.fn();
  public extractKeywords = jest.fn();
  public classifyCode = jest.fn();
  public getStats = jest.fn();

  constructor(options: MockAIServiceOptions = {}) {
    this.shouldFailGeneration = options.shouldFailGeneration ?? false;
    this.maxTokens = options.maxTokens ?? 150;
    this.temperature = options.temperature ?? 0.7;
    this.simulateLatency = options.simulateLatency ?? false;
    this.modelName = options.modelName ?? 'mock-ai-model';

    this.setupMockImplementations();
  }

  private setupMockImplementations(): void {
    // Use any type for all mock implementations to avoid TypeScript issues
    this.loadModel.mockImplementation(jest.fn());
    this.generateSummary.mockImplementation(jest.fn());
    this.batchSummarize.mockImplementation(jest.fn());
    this.generateDocstring.mockImplementation(jest.fn());
    this.analyzeCode.mockImplementation(jest.fn());
    this.extractKeywords.mockImplementation(jest.fn());
    this.classifyCode.mockImplementation(jest.fn());
    this.getStats.mockImplementation(jest.fn());

    // Set up the actual implementations
    this.setupActualImplementations();
  }

  private setupActualImplementations(): void {
    // Model loading
    (this.loadModel as any).mockImplementation(async () => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock AI model loading failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(200);
      }
      
      this.modelLoaded = true;
    });

    // Summary generation
    (this.generateSummary as any).mockImplementation(async (text: string, options?: SummaryOptions): Promise<string> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock summary generation failure');
      }
      
      if (!this.modelLoaded) {
        await (this.loadModel as any)();
      }
      
      if (this.simulateLatency) {
        await this.delay(500);
      }
      
      return this.createMockSummary(text, options);
    });

    // Batch summarization
    (this.batchSummarize as any).mockImplementation(async (texts: string[], options?: SummaryOptions): Promise<string[]> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock batch summarization failure');
      }
      
      if (!this.modelLoaded) {
        await (this.loadModel as any)();
      }
      
      const summaries: string[] = [];
      
      for (const text of texts) {
        if (this.simulateLatency) {
          await this.delay(300);
        }
        
        summaries.push(await (this.generateSummary as any)(text, options));
      }
      
      return summaries;
    });

    // Docstring generation
    (this.generateDocstring as any).mockImplementation(async (
      functionName: string,
      signature: string,
      body?: string
    ): Promise<string> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock docstring generation failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(400);
      }
      
      return this.createMockDocstring(functionName, signature, body);
    });

    // Code analysis
    (this.analyzeCode as any).mockImplementation(async (code: string): Promise<{
      complexity: number;
      maintainability: number;
      readability: number;
      suggestions: string[];
    }> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock code analysis failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(600);
      }
      
      return {
        complexity: Math.floor(Math.random() * 10) + 1,
        maintainability: Math.random() * 100,
        readability: Math.random() * 100,
        suggestions: [
          'Consider breaking down large functions',
          'Add more descriptive variable names',
          'Include error handling'
        ]
      };
    });

    // Keyword extraction
    (this.extractKeywords as any).mockImplementation(async (text: string, maxKeywords: number = 10): Promise<string[]> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock keyword extraction failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(200);
      }
      
      // Extract mock keywords based on text content
      const words = text.toLowerCase().split(/\s+/);
      const uniqueWords = [...new Set(words)];
      const keywords = uniqueWords
        .filter(word => word.length > 3)
        .slice(0, maxKeywords);
      
      return keywords;
    });

    // Code classification
    (this.classifyCode as any).mockImplementation(async (code: string): Promise<{
      type: string;
      confidence: number;
      categories: string[];
    }> => {
      if (this.shouldFailGeneration) {
        throw new Error('Mock code classification failure');
      }
      
      if (this.simulateLatency) {
        await this.delay(300);
      }
      
      // Simple classification based on code patterns
      let type = 'utility';
      const categories: string[] = [];
      
      if (code.includes('class ')) {
        type = 'class';
        categories.push('object-oriented');
      } else if (code.includes('function ') || code.includes('=>')) {
        type = 'function';
        categories.push('functional');
      } else if (code.includes('test') || code.includes('describe') || code.includes('it(')) {
        type = 'test';
        categories.push('testing');
      } else if (code.includes('interface ') || code.includes('type ')) {
        type = 'type-definition';
        categories.push('types');
      }
      
      if (code.includes('async') || code.includes('await') || code.includes('Promise')) {
        categories.push('asynchronous');
      }
      
      if (code.includes('import ') || code.includes('export ')) {
        categories.push('module');
      }
      
      return {
        type,
        confidence: Math.random() * 0.3 + 0.7, // 70-100% confidence
        categories
      };
    });

    // Stats
    (this.getStats as any).mockImplementation(async () => {
      return {
        modelLoaded: this.modelLoaded,
        model: this.modelName,
        maxTokens: this.maxTokens,
        temperature: this.temperature
      };
    });
  }

  private createMockSummary(text: string, options?: SummaryOptions): string {
    const maxTokens = options?.maxTokens || this.maxTokens;
    const context = options?.context || '';
    
    // Create a deterministic summary based on text content
    const words = text.split(/\s+/);
    const keyWords = words
      .filter(word => word.length > 3)
      .slice(0, Math.min(10, Math.floor(maxTokens / 10)));
    
    let summary = '';
    
    if (context.includes('file')) {
      summary = `This file contains ${keyWords.join(', ')} and implements functionality related to ${keyWords[0] || 'core operations'}.`;
    } else if (context.includes('function')) {
      summary = `This function handles ${keyWords.join(', ')} and performs operations involving ${keyWords[0] || 'data processing'}.`;
    } else if (context.includes('class')) {
      summary = `This class manages ${keyWords.join(', ')} and provides methods for ${keyWords[0] || 'object manipulation'}.`;
    } else {
      summary = `This code implements ${keyWords.join(', ')} with focus on ${keyWords[0] || 'system functionality'}.`;
    }
    
    // Truncate to max tokens (rough approximation)
    const words_in_summary = summary.split(/\s+/);
    if (words_in_summary.length > maxTokens) {
      summary = words_in_summary.slice(0, maxTokens).join(' ') + '...';
    }
    
    return summary;
  }

  private createMockDocstring(functionName: string, signature: string, body?: string): string {
    const params = this.extractParameters(signature);
    const returnType = this.extractReturnType(signature);
    
    let docstring = `/**\n * ${this.capitalizeFirst(functionName)} function\n *\n`;
    
    // Add parameter documentation
    if (params.length > 0) {
      params.forEach(param => {
        docstring += ` * @param {any} ${param} - Parameter description\n`;
      });
      docstring += ` *\n`;
    }
    
    // Add return documentation
    if (returnType && returnType !== 'void') {
      docstring += ` * @returns {${returnType}} Return value description\n *\n`;
    }
    
    // Add example if body is provided
    if (body) {
      docstring += ` * @example\n * const result = ${functionName}();\n *\n`;
    }
    
    docstring += ` */`;
    
    return docstring;
  }

  private extractParameters(signature: string): string[] {
    const paramMatch = signature.match(/\(([^)]*)\)/);
    if (!paramMatch || !paramMatch[1].trim()) {
      return [];
    }
    
    return paramMatch[1]
      .split(',')
      .map(param => param.trim().split(/[:\s]/)[0])
      .filter(param => param.length > 0);
  }

  private extractReturnType(signature: string): string {
    const returnMatch = signature.match(/:\s*([^{]+)/);
    return returnMatch ? returnMatch[1].trim() : 'any';
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper methods for testing
  public setModelLoaded(loaded: boolean): void {
    this.modelLoaded = loaded;
  }

  public simulateFailure(shouldFail: boolean = true): void {
    this.shouldFailGeneration = shouldFail;
  }

  public setMaxTokens(tokens: number): void {
    this.maxTokens = tokens;
  }

  public setTemperature(temp: number): void {
    this.temperature = temp;
  }

  public enableLatencySimulation(enabled: boolean = true): void {
    this.simulateLatency = enabled;
  }

  public isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  public getMaxTokens(): number {
    return this.maxTokens;
  }

  public getTemperature(): number {
    return this.temperature;
  }

  public resetMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockReset();
      }
    });
    this.modelLoaded = false;
    this.setupMockImplementations();
  }

  public clearMocks(): void {
    Object.values(this).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockClear();
      }
    });
  }
}
