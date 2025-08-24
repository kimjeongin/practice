/**
 * Modern Dependency Injection Container
 * Based on 2025 enterprise patterns for modular RAG systems
 */

export type ServiceConstructor<T = any> = new (...args: any[]) => T
export type ServiceFactory<T = any> = (...args: any[]) => T | Promise<T>
export type ServiceLifecycle = 'singleton' | 'transient' | 'scoped'

export interface ServiceDescriptor<T = any> {
  name: string
  factory?: ServiceFactory<T>
  constructor?: ServiceConstructor<T>
  dependencies?: string[]
  lifecycle: ServiceLifecycle
  instance?: T
  metadata?: Record<string, any>
}

export class ServiceRegistry {
  private services = new Map<string, ServiceDescriptor>()
  private instances = new Map<string, any>()
  private scopedInstances = new Map<string, Map<string, any>>()

  /**
   * Register a service with the container
   */
  register<T>(
    name: string,
    factory: ServiceFactory<T> | ServiceConstructor<T>,
    options: {
      dependencies?: string[]
      lifecycle?: ServiceLifecycle
      metadata?: Record<string, any>
    } = {}
  ): this {
    const descriptor: any = {
      name,
      dependencies: options.dependencies || [],
      lifecycle: options.lifecycle || 'singleton',
      metadata: options.metadata,
    }

    if (typeof factory === 'function') {
      // Check if it's a class constructor by checking if it can be called with 'new'
      // and has a proper prototype chain
      const isConstructor =
        factory.prototype &&
        factory.prototype.constructor === factory &&
        typeof factory.prototype !== 'function'

      if (isConstructor) {
        descriptor.constructor = factory as ServiceConstructor<T>
      } else {
        descriptor.factory = factory as ServiceFactory<T>
      }
    } else {
      descriptor.factory = factory as ServiceFactory<T>
    }

    this.services.set(name, descriptor)
    return this
  }

  /**
   * Register a singleton service instance
   */
  registerInstance<T>(name: string, instance: T): this {
    this.services.set(name, {
      name,
      lifecycle: 'singleton',
      instance,
      dependencies: [],
    } as any)
    this.instances.set(name, instance)
    return this
  }

  /**
   * Resolve a service by name
   */
  async resolve<T>(name: string, scope?: string): Promise<T> {
    const descriptor = this.services.get(name)
    if (!descriptor) {
      throw new Error(`Service '${name}' is not registered`)
    }

    // Handle different lifecycles
    switch (descriptor.lifecycle) {
      case 'singleton':
        return this.resolveSingleton<T>(descriptor)

      case 'transient':
        return this.resolveTransient<T>(descriptor)

      case 'scoped':
        return this.resolveScoped<T>(descriptor, scope || 'default')

      default:
        throw new Error(`Unknown lifecycle: ${descriptor.lifecycle}`)
    }
  }

  /**
   * Check if a service is registered
   */
  isRegistered(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys())
  }

  /**
   * Create a scoped registry
   */
  createScope(scopeId: string): ScopedServiceRegistry {
    return new ScopedServiceRegistry(this, scopeId)
  }

  /**
   * Clear all instances (useful for testing)
   */
  clear(): void {
    this.instances.clear()
    this.scopedInstances.clear()
    // Also clear instance references in descriptors
    for (const descriptor of this.services.values()) {
      delete descriptor.instance
    }
  }

  private async resolveSingleton<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    if (descriptor.instance) {
      return descriptor.instance
    }

    if (this.instances.has(descriptor.name)) {
      return this.instances.get(descriptor.name)
    }

    const instance = await this.createInstance<T>(descriptor)
    this.instances.set(descriptor.name, instance)
    descriptor.instance = instance
    return instance
  }

  private async resolveTransient<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    return this.createInstance<T>(descriptor)
  }

  private async resolveScoped<T>(descriptor: ServiceDescriptor<T>, scope: string): Promise<T> {
    if (!this.scopedInstances.has(scope)) {
      this.scopedInstances.set(scope, new Map())
    }

    const scopeMap = this.scopedInstances.get(scope)!
    if (scopeMap.has(descriptor.name)) {
      return scopeMap.get(descriptor.name)
    }

    const instance = await this.createInstance<T>(descriptor)
    scopeMap.set(descriptor.name, instance)
    return instance
  }

  private async createInstance<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    // Resolve dependencies first
    const dependencies = await Promise.all(
      (descriptor.dependencies || []).map((dep) => this.resolve(dep))
    )

    if (descriptor.constructor) {
      return new descriptor.constructor(...dependencies)
    }

    if (descriptor.factory) {
      return await descriptor.factory(...dependencies)
    }

    throw new Error(`No factory or constructor provided for service '${descriptor.name}'`)
  }
}

/**
 * Scoped service registry that delegates to parent registry
 */
export class ScopedServiceRegistry {
  constructor(private parent: ServiceRegistry, private scopeId: string) {}

  async resolve<T>(name: string): Promise<T> {
    return this.parent.resolve<T>(name, this.scopeId)
  }

  isRegistered(name: string): boolean {
    return this.parent.isRegistered(name)
  }
}

/**
 * Decorator for automatic service registration
 */
export function Injectable(
  name: string,
  options: {
    dependencies?: string[]
    lifecycle?: ServiceLifecycle
  } = {}
) {
  return function <T extends ServiceConstructor>(target: T) {
    // Store metadata for later registration
    ;(target as any).__injectable = {
      name,
      dependencies: options.dependencies || [],
      lifecycle: options.lifecycle || 'singleton',
    }
    return target
  }
}

/**
 * Extract dependency names from constructor parameters (TypeScript reflection)
 */
export function getDependencies(target: ServiceConstructor): string[] {
  const injectable = (target as any).__injectable
  return injectable?.dependencies || []
}

/**
 * Global service registry instance
 */
export const serviceRegistry = new ServiceRegistry()
