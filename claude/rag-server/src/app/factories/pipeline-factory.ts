/**
 * Pipeline Factory - Component Wiring for Domain RAG Systems
 * Follows domain-driven architecture and Factory patterns
 */

import { ServiceRegistry } from '@/shared/dependency-injection/service-registry.js';
import { ServerConfig, ConfigFactory } from '@/shared/config/config-factory.js';
import { Orchestrator } from '@/app/orchestrator/orchestrator.js';
import { logger } from '@/shared/logger/index.js';

export class PipelineFactory {
  /**
   * Create development orchestrator
   */
  static createDevelopmentOrchestrator(): Promise<Orchestrator> {
    const config = ConfigFactory.createDevelopmentConfig();
    const services = new ServiceRegistry();
    return Promise.resolve(new Orchestrator(config, services));
  }

  /**
   * Create production orchestrator
   */
  static createProductionOrchestrator(): Promise<Orchestrator> {
    const config = ConfigFactory.createProductionConfig();
    const services = new ServiceRegistry();
    return Promise.resolve(new Orchestrator(config, services));
  }

  /**
   * Create test orchestrator
   */
  static createTestOrchestrator(): Promise<Orchestrator> {
    const config = ConfigFactory.createTestConfig();
    const services = new ServiceRegistry();
    return Promise.resolve(new Orchestrator(config, services));
  }
}