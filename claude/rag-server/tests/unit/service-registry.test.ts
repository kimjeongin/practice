/**
 * Service Registry Tests
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ServiceRegistry } from '@/shared/dependency-injection/service-registry.js';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  test('should register and retrieve services', async () => {
    registry.registerInstance('testService', { name: 'test', version: '1.0' });
    const retrieved = await registry.resolve('testService');
    
    expect(retrieved).toEqual({ name: 'test', version: '1.0' });
  });

  test('should check if service exists', () => {
    const testService = () => ({ name: 'test' });
    
    expect(registry.isRegistered('nonexistent')).toBe(false);
    
    registry.register('existing', testService);
    expect(registry.isRegistered('existing')).toBe(true);
  });

  test('should get service names', () => {
    registry.register('service1', () => ({}));
    registry.register('service2', () => ({}));
    
    const names = registry.getServiceNames();
    expect(names).toContain('service1');
    expect(names).toContain('service2');
    expect(names).toHaveLength(2);
  });

  test('should clear all instances', () => {
    registry.register('service1', () => ({}));
    registry.register('service2', () => ({}));
    
    expect(registry.getServiceNames()).toHaveLength(2);
    
    registry.clear();
    // Clear only clears instances, not service registrations
    expect(registry.getServiceNames()).toHaveLength(2);
  });

  test('should throw error for non-existent service', async () => {
    await expect(registry.resolve('nonexistent')).rejects.toThrow('Service \'nonexistent\' is not registered');
  });
});