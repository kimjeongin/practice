import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ServiceRegistry, Injectable } from '../../src/shared/di/service-registry.js';

// Test services for dependency injection
class TestService {
  constructor(public message: string = 'test') {}
  
  getMessage(): string {
    return this.message;
  }
}

class DependentService {
  constructor(private testService: TestService) {}
  
  getDependentMessage(): string {
    return `Dependent: ${this.testService.getMessage()}`;
  }
}

describe('ServiceRegistry Tests', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  test('should register and resolve singleton service', async () => {
    registry.register('testService', TestService, { lifecycle: 'singleton' });
    
    const instance1 = await registry.resolve<TestService>('testService');
    const instance2 = await registry.resolve<TestService>('testService');
    
    expect(instance1).toBeInstanceOf(TestService);
    expect(instance2).toBeInstanceOf(TestService);
    expect(instance1).toBe(instance2); // Same instance for singleton
    expect(instance1.getMessage()).toBe('test');
  });

  test('should register and resolve transient service', async () => {
    registry.register('testService', TestService, { lifecycle: 'transient' });
    
    const instance1 = await registry.resolve<TestService>('testService');
    const instance2 = await registry.resolve<TestService>('testService');
    
    expect(instance1).toBeInstanceOf(TestService);
    expect(instance2).toBeInstanceOf(TestService);
    expect(instance1).not.toBe(instance2); // Different instances for transient
  });

  test('should register service with factory function', async () => {
    registry.register('testService', () => new TestService('factory'), { lifecycle: 'singleton' });
    
    const instance = await registry.resolve<TestService>('testService');
    
    expect(instance).toBeInstanceOf(TestService);
    expect(instance.getMessage()).toBe('factory');
  });

  test('should register service instance directly', async () => {
    const testInstance = new TestService('direct');
    registry.registerInstance('testService', testInstance);
    
    const instance = await registry.resolve<TestService>('testService');
    
    expect(instance).toBe(testInstance);
    expect(instance.getMessage()).toBe('direct');
  });

  test('should resolve service with dependencies', async () => {
    registry.register('testService', TestService, { lifecycle: 'singleton' });
    registry.register('dependentService', DependentService, { 
      dependencies: ['testService'], 
      lifecycle: 'singleton' 
    });
    
    const instance = await registry.resolve<DependentService>('dependentService');
    
    expect(instance).toBeInstanceOf(DependentService);
    expect(instance.getDependentMessage()).toBe('Dependent: test');
  });

  test('should resolve service with factory dependencies', async () => {
    registry.register('testService', () => new TestService('factory'), { lifecycle: 'singleton' });
    registry.register('dependentService', (testService: TestService) => new DependentService(testService), {
      dependencies: ['testService'],
      lifecycle: 'singleton'
    });
    
    const instance = await registry.resolve<DependentService>('dependentService');
    
    expect(instance).toBeInstanceOf(DependentService);
    expect(instance.getDependentMessage()).toBe('Dependent: factory');
  });

  test('should handle scoped services', async () => {
    registry.register('testService', TestService, { lifecycle: 'scoped' });
    
    const scope1 = registry.createScope('scope1');
    const scope2 = registry.createScope('scope2');
    
    const instance1 = await scope1.resolve<TestService>('testService');
    const instance2 = await scope1.resolve<TestService>('testService');
    const instance3 = await scope2.resolve<TestService>('testService');
    
    expect(instance1).toBe(instance2); // Same instance within scope
    expect(instance1).not.toBe(instance3); // Different instance across scopes
  });

  test('should check if service is registered', () => {
    expect(registry.isRegistered('testService')).toBe(false);
    
    registry.register('testService', TestService);
    
    expect(registry.isRegistered('testService')).toBe(true);
  });

  test('should get service names', () => {
    expect(registry.getServiceNames()).toEqual([]);
    
    registry.register('service1', TestService);
    registry.register('service2', TestService);
    
    const names = registry.getServiceNames();
    expect(names).toContain('service1');
    expect(names).toContain('service2');
    expect(names).toHaveLength(2);
  });

  test('should clear all instances', async () => {
    registry.register('testService', TestService, { lifecycle: 'singleton' });
    
    const instance1 = await registry.resolve<TestService>('testService');
    registry.clear();
    const instance2 = await registry.resolve<TestService>('testService');
    
    expect(instance1).not.toBe(instance2); // Different instances after clear
  });

  test('should throw error for unregistered service', async () => {
    await expect(registry.resolve('nonExistentService')).rejects.toThrow(/not registered/);
  });

  test('should throw error for unknown lifecycle', async () => {
    registry.register('testService', TestService, { lifecycle: 'invalid' as any });
    
    await expect(registry.resolve('testService')).rejects.toThrow(/Unknown lifecycle/);
  });

  test('should handle async factory functions', async () => {
    registry.register('testService', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return new TestService('async');
    }, { lifecycle: 'singleton' });
    
    const instance = await registry.resolve<TestService>('testService');
    
    expect(instance).toBeInstanceOf(TestService);
    expect(instance.getMessage()).toBe('async');
  });

  test('should handle circular dependencies gracefully', async () => {
    // This would cause infinite recursion in a naive implementation
    registry.register('service1', TestService, { dependencies: ['service2'] });
    registry.register('service2', TestService, { dependencies: ['service1'] });
    
    // Should timeout or throw error instead of infinite loop
    await expect(registry.resolve('service1')).rejects.toThrow();
  });
});