/**
 * Test setup file
 */

import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ConfigFactory } from '@/shared/config/config-factory.js';
import { serviceRegistry } from '@/shared/dependency-injection/service-registry.js';

beforeAll(async () => {
  // Set test environment
  process.env['NODE_ENV'] = 'test';
  
  // Clean up any existing services
  serviceRegistry.clear();
});

afterAll(async () => {
  // Clean up services after all tests
  serviceRegistry.clear();
});

beforeEach(() => {
  // Reset services before each test
  serviceRegistry.clear();
});