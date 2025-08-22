export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  },
  moduleNameMapper: {
    '^@/(.*)\\.js$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-timeout|p-retry|opossum)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000, // Reduced from 60s to 30s
  verbose: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1,
  // Additional options to prevent hanging
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
  clearMocks: true,
  restoreMocks: true
};