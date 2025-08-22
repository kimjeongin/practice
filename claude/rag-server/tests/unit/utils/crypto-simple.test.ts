/**
 * Unit tests for Crypto utilities
 * Tests actual hash functions available in the codebase
 */

import { describe, test, expect } from '@jest/globals';
import { calculateStringHash, calculateFileHash } from '@/shared/utils/crypto.js';
import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { createTempFilePath, ensureTempDirectory } from '../../helpers/test-utils.js';

describe('Crypto Utils Unit Tests', () => {
  describe('String Hash Calculation', () => {
    test('should generate consistent hashes for same input', () => {
      const input = 'test data for hashing';
      
      const hash1 = calculateStringHash(input);
      const hash2 = calculateStringHash(input);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA256 hex string length
    });

    test('should generate different hashes for different inputs', () => {
      const input1 = 'first test data';
      const input2 = 'second test data';
      
      const hash1 = calculateStringHash(input1);
      const hash2 = calculateStringHash(input2);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(hash2.length).toBe(64);
    });

    test('should generate hash for empty input', () => {
      const emptyHash = calculateStringHash('');
      
      expect(typeof emptyHash).toBe('string');
      expect(emptyHash.length).toBe(64);
      
      // Should be deterministic
      const emptyHash2 = calculateStringHash('');
      expect(emptyHash).toBe(emptyHash2);
    });

    test('should generate hash for large input', () => {
      const largeInput = 'x'.repeat(10000);
      
      const hash = calculateStringHash(largeInput);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      
      const hash = calculateStringHash(specialChars);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should handle Unicode characters', () => {
      const unicodeText = 'Hello 世界 🌍 émojis and àccénts';
      
      const hash = calculateStringHash(unicodeText);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      
      // Should be consistent
      const hash2 = calculateStringHash(unicodeText);
      expect(hash).toBe(hash2);
    });
  });

  describe('File Hash Calculation', () => {
    let tempFilePath: string;

    beforeEach(async () => {
      await ensureTempDirectory();
      tempFilePath = createTempFilePath();
    });

    afterEach(() => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('should calculate hash for existing file', () => {
      const content = 'This is test file content';
      fs.writeFileSync(tempFilePath, content);
      
      const hash = calculateFileHash(tempFilePath);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      
      // Should match string hash of same content
      const stringHash = calculateStringHash(content);
      expect(hash).toBe(stringHash);
    });

    test('should generate same hash for same file content', () => {
      const content = 'Consistent file content';
      fs.writeFileSync(tempFilePath, content);
      
      const hash1 = calculateFileHash(tempFilePath);
      const hash2 = calculateFileHash(tempFilePath);
      
      expect(hash1).toBe(hash2);
    });

    test('should generate different hash for different file content', () => {
      // Create first file
      fs.writeFileSync(tempFilePath, 'First content');
      const hash1 = calculateFileHash(tempFilePath);
      
      // Create second file
      const tempFilePath2 = createTempFilePath('second-file.txt');
      fs.writeFileSync(tempFilePath2, 'Second content');
      const hash2 = calculateFileHash(tempFilePath2);
      
      expect(hash1).not.toBe(hash2);
      
      // Cleanup
      fs.unlinkSync(tempFilePath2);
    });

    test('should handle empty file', () => {
      fs.writeFileSync(tempFilePath, '');
      
      const hash = calculateFileHash(tempFilePath);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      
      // Should match empty string hash
      const emptyStringHash = calculateStringHash('');
      expect(hash).toBe(emptyStringHash);
    });

    test('should throw error for non-existent file', () => {
      const nonExistentPath = '/path/that/does/not/exist.txt';
      
      expect(() => {
        calculateFileHash(nonExistentPath);
      }).toThrow();
    });

    test('should handle binary file', () => {
      const binaryData = Buffer.from([0, 1, 2, 3, 255, 254, 253]);
      fs.writeFileSync(tempFilePath, binaryData);
      
      const hash = calculateFileHash(tempFilePath);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should handle large file', () => {
      const largeContent = 'Large file content line.\n'.repeat(10000);
      fs.writeFileSync(tempFilePath, largeContent);
      
      const hash = calculateFileHash(tempFilePath);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });

  describe('Hash Validation and Verification', () => {
    test('should be valid SHA256 hex format', () => {
      const testInputs = [
        'test',
        'another test',
        'special chars !@#$%',
        '123456789',
        ''
      ];

      testInputs.forEach(input => {
        const hash = calculateStringHash(input);
        
        // Should be 64 character hex string
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    test('should demonstrate avalanche effect', () => {
      const base = 'security test';
      const similar1 = base + '1';
      const similar2 = base + '2';
      
      const hash1 = calculateStringHash(similar1);
      const hash2 = calculateStringHash(similar2);
      
      expect(hash1).not.toBe(hash2);
      
      // Count different characters (simple avalanche test)
      let differences = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
          differences++;
        }
      }
      
      // Should have significant differences for minor input changes
      expect(differences).toBeGreaterThan(hash1.length * 0.3);
    });

    test('should maintain consistency across test runs', () => {
      const testCases = [
        'consistent test 1',
        'consistent test 2',
        'consistent test with numbers 123',
        'consistent test with special chars !@#'
      ];
      
      // Generate hashes multiple times
      const runs = 3;
      const hashResults: string[][] = [];
      
      for (let run = 0; run < runs; run++) {
        hashResults.push(testCases.map(test => calculateStringHash(test)));
      }
      
      // All runs should produce identical results
      for (let i = 0; i < testCases.length; i++) {
        const firstRunHash = hashResults[0][i];
        for (let run = 1; run < runs; run++) {
          expect(hashResults[run][i]).toBe(firstRunHash);
        }
      }
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple hash calculations efficiently', () => {
      const inputs = Array.from({ length: 1000 }, (_, i) => `test data ${i}`);
      
      const startTime = Date.now();
      const hashes = inputs.map(input => calculateStringHash(input));
      const endTime = Date.now();
      
      expect(hashes).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });

    test('should handle large content efficiently', () => {
      const largeContent = 'x'.repeat(100000); // 100KB of data
      
      const startTime = Date.now();
      const hash = calculateStringHash(largeContent);
      const endTime = Date.now();
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });
  });

  describe('Integration with Node.js crypto', () => {
    test('should produce same results as direct crypto usage', () => {
      const testContent = 'Direct crypto comparison test';
      
      // Our function
      const ourHash = calculateStringHash(testContent);
      
      // Direct crypto usage
      const directHash = createHash('sha256').update(testContent, 'utf-8').digest('hex');
      
      expect(ourHash).toBe(directHash);
    });

    test('should handle different encodings correctly', () => {
      const testString = 'encoding test 🌟';
      
      // Our function uses UTF-8
      const utf8Hash = calculateStringHash(testString);
      
      // Direct crypto with UTF-8
      const directUtf8Hash = createHash('sha256').update(testString, 'utf-8').digest('hex');
      
      expect(utf8Hash).toBe(directUtf8Hash);
    });
  });

  describe('Error Handling', () => {
    test('should handle null and undefined inputs', () => {
      expect(() => calculateStringHash(null as any)).toThrow();
      expect(() => calculateStringHash(undefined as any)).toThrow();
    });

    test('should provide meaningful error messages for file operations', () => {
      const invalidPath = '/invalid/path/that/does/not/exist.txt';
      
      let error: Error;
      try {
        calculateFileHash(invalidPath);
      } catch (e) {
        error = e as Error;
      }
      
      expect(error!).toBeDefined();
      expect(error!.message).toContain('Failed to calculate hash');
      expect(error!.message).toContain(invalidPath);
    });
  });
});