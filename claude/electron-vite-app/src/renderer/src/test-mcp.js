// Quick MCP test function to run in browser console
window.testMCP = async function() {
  console.log('🚀 Testing MCP Connection...');
  
  try {
    // Add RAG server
    const addResult = await window.api.clientHost.addRagServer();
    console.log('Add server result:', addResult);
    
    if (!addResult.success) {
      console.error('Failed to add server:', addResult.error);
      return;
    }
    
    const serverId = addResult.data.id;
    console.log('Server ID:', serverId);
    
    // Wait for connection
    await new Promise(r => setTimeout(r, 2000));
    
    // Connect
    const connectResult = await window.api.clientHost.connectServer(serverId);
    console.log('Connect result:', connectResult);
    
    // Wait for tools to be discovered
    await new Promise(r => setTimeout(r, 3000));
    
    // List tools
    const toolsResult = await window.api.clientHost.listTools(serverId);
    console.log('Tools result:', toolsResult);
    
    if (toolsResult.success && toolsResult.data) {
      console.log('Available tools:', toolsResult.data.map(t => t.name));
      
      // Test get_server_status
      const statusResult = await window.api.clientHost.executeTool(serverId, 'get_server_status', {});
      console.log('Server status:', statusResult);
      
      // Test list_files
      const filesResult = await window.api.clientHost.executeTool(serverId, 'list_files', {});
      console.log('Files result:', filesResult);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
};

console.log('MCP test function loaded. Run: testMCP()');