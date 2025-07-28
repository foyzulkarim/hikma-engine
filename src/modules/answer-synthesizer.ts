/**
 * @file Module responsible for synthesizing search results into coherent answers using local LLM.
 */

import { pipeline, env } from '@xenova/transformers';
import { ConfigManager } from '../config';
import { getLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-handling';

export class AnswerSynthesizer {
  private config: ConfigManager;
  private logger = getLogger('AnswerSynthesizer');
  private model: any = null;

  /**
   * Initializes the Answer Synthesizer.
   * @param {ConfigManager} config - Configuration manager instance.
   */
  constructor(config: ConfigManager) {
    this.config = config;
    this.logger.info('Initializing AnswerSynthesizer');
    // Set environment for transformers
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
  }

  /**
   * Loads the text generation model for answer synthesis.
   */
  async loadModel(): Promise<void> {
    if (this.model) {
      this.logger.debug('Model already loaded, skipping');
      return;
    }

    const operation = this.logger.operation('Loading answer synthesis model');

    try {
      const aiConfig = this.config.getAIConfig();
      this.logger.info('Loading answer synthesis model', {
        model: aiConfig.summary.model,
      });

      // Load the transformers pipeline for text generation
      this.logger.info('Loading transformers.js text generation model', {
        model: aiConfig.summary.model,
      });
      this.model = await pipeline('text-generation', aiConfig.summary.model);
      this.logger.info(
        'Transformers.js text generation model loaded successfully'
      );

      this.logger.info('Answer synthesis model loaded successfully');
      operation();
    } catch (error) {
      this.logger.error('Failed to load answer synthesis model', {
        error: getErrorMessage(error),
      });
      operation();
      throw error;
    }
  }

  /**
   * Synthesizes search results into a coherent answer to the user's question using RAG approach.
   * @param {string} question - The user's original query/question
   * @param {Array<{node: any, similarity: number}>} results - Search results with nodes and similarity scores
   * @returns {Promise<string>} The synthesized answer
   */
  async synthesizeAnswer(
    question: string,
    results: Array<{ node: any; similarity: number }>
  ): Promise<string> {
    const operation = this.logger.operation('Synthesizing answer');

    try {
      this.logger.info(`Starting answer synthesis for question: "${question}"`);

      if (results.length === 0) {
        this.logger.info('No results to synthesize');
        operation();
        return "I couldn't find any relevant information to answer your question.";
      }

      // Ensure model is loaded
      if (!this.model) {
        await this.loadModel();
      }

      // Extract text from nodes
      const docs = results.map((result) => result.node.sourceText || '');
      this.logger.info('Results docs', docs);

      // Join documents and truncate if needed (to fit within model's context window)
      const context = docs.join('\n');

      // Create the prompt for the model following the RAG pattern
      const prompt = `Answer the question based only on the context below. If the question is not related to the context, say "I don't know".

${context}

Q: ${question}
A:`;

      this.logger.debug('Generating answer with prompt', {
        promptLength: prompt.length,
      });

      // Generate answer using the loaded pipeline
      const result = await this.model(prompt, {
        max_new_tokens: 256,
        temperature: 0.7,
        repetition_penalty: 1.2,
        do_sample: true,
      });

      let answer: string;
      if (result && result[0] && result[0].generated_text) {
        // Extract just the answer part (after the prompt)
        answer = result[0].generated_text.substring(prompt.length).trim();
      } else {
        throw new Error('Unexpected result format from text generation model');
      }

      this.logger.debug('Answer generated successfully', {
        answerLength: answer.length,
      });

      operation();
      return answer;
    } catch (error) {
      this.logger.error('Answer synthesis failed', {
        error: getErrorMessage(error),
      });
      operation();
      throw error;
    }
  }
}
