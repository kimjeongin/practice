// Test script to execute in Electron app developer console
// This script will test MCP server connection and tool execution

async function testMCPConnection() {
  console.log('🚀 Starting MCP Connection Test...');
  
  try {
    // Test 1: Add RAG server
    console.log('📡 Step 1: Adding RAG server...');
    const addServerResult = await window.api.clientHost.addRagServer();
    
    if (!addServerResult.success) {
      console.error('❌ Failed to add RAG server:', addServerResult.error);
      return;
    }
    
    console.log('✅ RAG server added successfully:', addServerResult.data);
    const serverId = addServerResult.data.id;
    
    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Connect to server
    console.log('🔌 Step 2: Connecting to RAG server...');
    const connectResult = await window.api.clientHost.connectServer(serverId);
    
    if (!connectResult.success) {
      console.error('❌ Failed to connect to RAG server:', connectResult.error);
      return;
    }
    
    console.log('✅ Connected to RAG server successfully');
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 3: List available tools
    console.log('🔧 Step 3: Discovering tools...');
    const toolsResult = await window.api.clientHost.listTools(serverId);
    
    if (!toolsResult.success) {
      console.error('❌ Failed to list tools:', toolsResult.error);
      return;
    }
    
    const tools = toolsResult.data || [];
    console.log(`✅ Found ${tools.length} tools:`, tools.map(t => t.name));
    
    // Test 4: Get server status
    console.log('📊 Step 4: Testing get_server_status tool...');
    const statusResult = await window.api.clientHost.executeTool(
      serverId, 
      'get_server_status', 
      {}
    );
    
    if (statusResult.success) {
      console.log('✅ Server status retrieved:', statusResult.data);
    } else {
      console.error('❌ Failed to get server status:', statusResult.error);
    }
    
    // Test 5: List files
    console.log('📁 Step 5: Testing list_files tool...');
    const filesResult = await window.api.clientHost.executeTool(
      serverId, 
      'list_files', 
      { limit: 10 }
    );
    
    if (filesResult.success) {
      console.log('✅ Files listed:', filesResult.data);
    } else {
      console.error('❌ Failed to list files:', filesResult.error);
    }
    
    // Test 6: Search documents
    console.log('🔍 Step 6: Testing search_documents tool...');
    const searchResult = await window.api.clientHost.executeTool(
      serverId, 
      'search_documents', 
      { 
        query: 'test document',
        topK: 3 
      }
    );
    
    if (searchResult.success) {
      console.log('✅ Search completed:', searchResult.data);
    } else {
      console.error('❌ Failed to search documents:', searchResult.error);
    }
    
    // Test 7: List available models
    console.log('🤖 Step 7: Testing list_available_models tool...');
    const modelsResult = await window.api.clientHost.executeTool(
      serverId, 
      'list_available_models', 
      {}
    );
    
    if (modelsResult.success) {
      console.log('✅ Available models:', modelsResult.data);
    } else {
      console.error('❌ Failed to list models:', modelsResult.error);
    }
    
    // Test 8: Get current model info
    console.log('ℹ️ Step 8: Testing get_current_model_info tool...');
    const currentModelResult = await window.api.clientHost.executeTool(
      serverId, 
      'get_current_model_info', 
      {}
    );
    
    if (currentModelResult.success) {
      console.log('✅ Current model info:', currentModelResult.data);
    } else {
      console.error('❌ Failed to get current model info:', currentModelResult.error);
    }
    
    console.log('🎉 MCP Connection Test completed successfully!');
    
  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Execute the test
testMCPConnection();