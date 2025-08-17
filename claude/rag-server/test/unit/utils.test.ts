import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { waitFor, expectAsyncThrow } from '../helpers/test-helpers';

describe('Test Utilities', () => {
  describe('waitFor', () => {
    test('should wait for specified time', async () => {
      const start = Date.now();
      await waitFor(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow some timing variance
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('expectAsyncThrow', () => {
    test('should catch async errors', async () => {
      const throwingFunction = async () => {
        throw new Error('Test error');
      };

      const error = await expectAsyncThrow(throwingFunction, 'Test error');
      expect(error.message).toContain('Test error');
    });

    test('should fail if function does not throw', async () => {
      const nonThrowingFunction = async () => {
        return 'success';
      };

      await expect(expectAsyncThrow(nonThrowingFunction)).rejects.toThrow('Expected function to throw');
    });
  });
});