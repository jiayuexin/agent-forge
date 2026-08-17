import { describe, it, expect } from 'vitest';
import { createGenerator, slugifyName } from '../../../server/lib/generator.js';

describe('generator', () => {
  describe('createGenerator', () => {
    it('returns an object with a generate method', () => {
      const generator = createGenerator();
      expect(generator).toBeDefined();
      expect(typeof generator.generate).toBe('function');
    });
  });

  describe('slugifyName', () => {
    it('lowercases input', () => {
      expect(slugifyName('HelloWorld')).toBe('helloworld');
    });

    it('replaces non-alphanumeric characters with dashes', () => {
      expect(slugifyName('hello world!')).toBe('hello-world');
    });

    it('trims leading and trailing dashes', () => {
      expect(slugifyName('---hello-world---')).toBe('hello-world');
    });

    it('truncates to 48 characters', () => {
      const long = 'a'.repeat(100);
      expect(slugifyName(long)).toHaveLength(48);
      expect(slugifyName(long)).toBe('a'.repeat(48));
    });

    it('returns agent when result would be empty', () => {
      expect(slugifyName('!!!')).toBe('agent');
    });
  });
});
