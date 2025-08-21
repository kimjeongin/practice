import { TestContent } from '../helpers/test-helpers.js';

/**
 * Sample documents for testing various scenarios
 */
export const SampleDocuments = {
  basic: {
    fileName: 'basic-test.txt',
    content: TestContent.simple,
    expectedChunks: 1
  },
  
  technical: {
    fileName: 'technical-doc.md',
    content: TestContent.technical,
    expectedChunks: 3 // Approximate based on chunk size 512
  },
  
  markdown: {
    fileName: 'sample.md',
    content: TestContent.markdown,
    expectedChunks: 2
  },
  
  longDocument: {
    fileName: 'long-document.txt',
    content: TestContent.longDocument,
    expectedChunks: 8 // Approximate
  },
  
  codeFile: {
    fileName: 'example.js',
    content: TestContent.codeDocument,
    expectedChunks: 3
  },
  
  // Edge cases
  empty: {
    fileName: 'empty.txt',
    content: '',
    expectedChunks: 0
  },
  
  singleWord: {
    fileName: 'single.txt',
    content: 'word',
    expectedChunks: 1
  },
  
  unicodeContent: {
    fileName: 'unicode-test.txt',
    content: '안녕하세요! 이것은 한국어 테스트 문서입니다. 🚀 This document contains Korean and emoji characters.',
    expectedChunks: 1
  }
};

/**
 * Sample search queries for testing
 */
export const SampleQueries = {
  simple: 'simple test',
  technical: 'vector embeddings machine learning',
  code: 'function calculate embedding',
  markdown: 'markdown features lists',
  korean: '한국어 테스트',
  nonExistent: 'this query should not match anything',
  empty: '',
  longQuery: 'This is a very long query that contains many words and should test the system ability to handle complex search terms with multiple keywords and phrases that span across different concepts and topics'
};

/**
 * Sample metadata for testing
 */
export const SampleMetadata = {
  basic: {
    author: 'test-user',
    category: 'testing',
    tags: 'unit-test,basic'
  },
  
  technical: {
    author: 'ai-researcher',
    category: 'ml-documentation',
    tags: 'ai,ml,embeddings,rag',
    difficulty: 'advanced'
  },
  
  code: {
    author: 'developer',
    category: 'code-examples',
    tags: 'javascript,programming',
    language: 'javascript'
  }
};

/**
 * Expected search results for validation
 */
export const ExpectedSearchResults = {
  simpleQuery: {
    query: SampleQueries.simple,
    expectedFiles: ['basic-test.txt'],
    minScore: 0.1
  },
  
  technicalQuery: {
    query: SampleQueries.technical,
    expectedFiles: ['technical-doc.md'],
    minScore: 0.3
  },
  
  codeQuery: {
    query: SampleQueries.code,
    expectedFiles: ['example.js'],
    minScore: 0.2
  }
};

/**
 * Test configuration variations
 */
export const TestConfigurations = {
  minimal: {
    chunkSize: 256,
    chunkOverlap: 10,
    similarityTopK: 1,
    similarityThreshold: 0.0
  },
  
  standard: {
    chunkSize: 512,
    chunkOverlap: 25,
    similarityTopK: 3,
    similarityThreshold: 0.1
  },
  
  aggressive: {
    chunkSize: 1024,
    chunkOverlap: 50,
    similarityTopK: 10,
    similarityThreshold: 0.3
  }
};

/**
 * Error scenarios for testing error handling
 */
export const ErrorScenarios = {
  corruptedFile: {
    fileName: 'corrupted.txt',
    content: '\x00\x01\x02\xFF\xFE', // Binary content that might cause parsing errors
  },
  
  veryLargeFile: {
    fileName: 'large.txt',
    content: 'A'.repeat(1000000), // 1MB of 'A' characters
  },
  
  specialCharacters: {
    fileName: 'special-chars.txt',
    content: '!@#$%^&*()[]{}|\\:";\'<>,.?/~`±§∞¢£™¡¿',
  }
};