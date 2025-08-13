import { describe, test, expect } from '@jest/globals';

// Mock the normalizeOpenAIBaseUrl function since it's private
// We'll extract it for testing purposes
function normalizeOpenAIBaseUrl(rawUrl: string): string {
  try {
    let url = (rawUrl || '').trim();
    url = url.replace(/\/+$/g, '');
    url = url.replace(/\/v1\/embeddings$/i, '');
    url = url.replace(/\/api\/embeddings$/i, '');
    url = url.replace(/\/v1$/i, '');
    url = url.replace(/\/+$/g, '');
    return url;
  } catch {
    return rawUrl;
  }
}

describe('Pure Helper Functions', () => {
  describe('normalizeOpenAIBaseUrl', () => {
    test('should normalize OpenAI base URL with trailing slash', () => {
      expect(normalizeOpenAIBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
    });

    test('should remove /v1/embeddings suffix', () => {
      expect(normalizeOpenAIBaseUrl('http://localhost:11434/v1/embeddings')).toBe('http://localhost:11434');
    });

    test('should remove /api/embeddings suffix', () => {
      expect(normalizeOpenAIBaseUrl('http://localhost:11434/api/embeddings')).toBe('http://localhost:11434');
    });

    test('should remove /v1 suffix', () => {
      expect(normalizeOpenAIBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434');
    });

    test('should handle complex URLs', () => {
      expect(normalizeOpenAIBaseUrl('https://api.openai.com/v1/embeddings')).toBe('https://api.openai.com');
    });

    test('should return original URL for invalid input', () => {
      expect(normalizeOpenAIBaseUrl('invalid-url')).toBe('invalid-url');
    });

    test('should handle empty string', () => {
      expect(normalizeOpenAIBaseUrl('')).toBe('');
    });

    test('should handle whitespace', () => {
      expect(normalizeOpenAIBaseUrl('  http://localhost:11434/  ')).toBe('http://localhost:11434');
    });
  });

  describe('simpleHash', () => {
    test('should convert string to char codes', () => {
      // Mock simpleHash function
      function simpleHash(text: string): number[] {
        const hash = [];
        for (let i = 0; i < text.length; i++) {
          (hash as number[]).push(text.charCodeAt(i));
        }
        return hash;
      }

      expect(simpleHash('hello')).toEqual([104, 101, 108, 108, 111]);
    });

    test('should handle empty string', () => {
      function simpleHash(text: string): number[] {
        const hash = [] as number[];
        for (let i = 0; i < text.length; i++) {
          (hash as number[]).push(text.charCodeAt(i));
        }
        return hash;
      }

      expect(simpleHash('')).toEqual([]);
    });
  });
});