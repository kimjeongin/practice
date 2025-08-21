/**
 * Simple runtime test for Modern RAG Application
 * Tests basic instantiation and configuration without full startup
 */

import { ConfigFactory } from './src/infrastructure/config/config-factory.js';
import { ServiceRegistry } from './src/shared/di/service-registry.js';

async function testConfigFactory() {
  console.log('🧪 Testing ConfigFactory...');
  
  try {
    // Test different environment configs
    const devConfig = ConfigFactory.createDevelopmentConfig();
    console.log('✅ Development config created');
    console.log(`   - Environment: ${devConfig.nodeEnv}`);
    console.log(`   - Vector Store: ${devConfig.vectorStore.provider}`);
    console.log(`   - Log Level: ${devConfig.logLevel}`);

    const prodConfig = ConfigFactory.createProductionConfig();
    console.log('✅ Production config created');
    console.log(`   - Environment: ${prodConfig.nodeEnv}`);
    console.log(`   - Vector Store: ${prodConfig.vectorStore.provider}`);

    const testConfig = ConfigFactory.createTestConfig();
    console.log('✅ Test config created');
    console.log(`   - Environment: ${testConfig.nodeEnv}`);
    console.log(`   - Monitoring: ${testConfig.monitoring.enabled}`);

    // Test validation
    ConfigFactory.validateConfig(devConfig);
    console.log('✅ Configuration validation passed');
    
    return true;
  } catch (error) {
    console.error('❌ ConfigFactory test failed:', error.message);
    return false;
  }
}

async function testServiceRegistry() {
  console.log('\n🧪 Testing ServiceRegistry...');
  
  try {
    const registry = new ServiceRegistry();
    
    // Test simple class registration
    class TestService {
      constructor(message = 'test') {
        this.message = message;
      }
      
      getMessage() {
        return this.message;
      }
    }
    
    registry.register('testService', TestService, { lifecycle: 'singleton' });
    console.log('✅ Service registered');
    
    const instance1 = await registry.resolve('testService');
    const instance2 = await registry.resolve('testService');
    
    console.log(`✅ Service resolved: ${instance1.getMessage()}`);
    console.log(`✅ Singleton test: ${instance1 === instance2 ? 'PASS' : 'FAIL'}`);
    
    // Test factory function
    registry.register('factoryService', () => new TestService('factory'), { lifecycle: 'transient' });
    const factoryInstance = await registry.resolve('factoryService');
    console.log(`✅ Factory service: ${factoryInstance.getMessage()}`);
    
    // Test service registry utilities
    console.log(`✅ Registered services: ${registry.getServiceNames().join(', ')}`);
    console.log(`✅ Is registered check: ${registry.isRegistered('testService')}`);
    
    return true;
  } catch (error) {
    console.error('❌ ServiceRegistry test failed:', error.message);
    return false;
  }
}

async function testModernRAGApplication() {
  console.log('\n🧪 Testing ModernRAGApplication instantiation...');
  
  try {
    // Dynamic import to test module loading
    const { ModernRAGApplication } = await import('./src/app/modern-rag-application.js');
    
    // Test factory methods
    const devApp = ModernRAGApplication.createDevelopment();
    console.log('✅ Development app created');
    console.log(`   - Environment: ${devApp.getConfig().nodeEnv}`);
    console.log(`   - Vector Store: ${devApp.getConfig().vectorStore.provider}`);

    const testApp = ModernRAGApplication.createTest();
    console.log('✅ Test app created');
    console.log(`   - Environment: ${testApp.getConfig().nodeEnv}`);
    console.log(`   - Monitoring: ${testApp.getConfig().monitoring.enabled}`);

    // Test status before initialization
    const status = devApp.getStatus();
    console.log(`✅ Status check: initialized=${status.application.initialized}, running=${status.application.running}`);
    
    // Test configuration update
    devApp.updateConfig({ chunkSize: 2048 });
    console.log(`✅ Config updated: chunkSize=${devApp.getConfig().chunkSize}`);
    
    return true;
  } catch (error) {
    console.error('❌ ModernRAGApplication test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Modern RAG Architecture Tests\n');
  
  const results = await Promise.all([
    testConfigFactory(),
    testServiceRegistry(),
    testModernRAGApplication()
  ]);
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Modern RAG Architecture is working correctly.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
});