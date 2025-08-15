#!/usr/bin/env node
/**
 * Comprehensive MCP Test Client
 * Tests all RAG functionality after refactoring to verify everything works correctly
 */
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
class MCPTestClient {
    constructor() {
        this.requestId = 1;
        this.isConnected = false;
    }
    async connect() {
        console.log('🚀 Starting MCP Server...');
        // Start the MCP server process
        this.mcpProcess = spawn('node', ['dist/app/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'test' }
        });
        // Wait for server to start
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 10000);
            this.mcpProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('📝 Server output:', output.trim());
                if (output.includes('MCP Server started') || output.includes('listening')) {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    resolve(void 0);
                }
            });
            this.mcpProcess.stderr.on('data', (data) => {
                console.log('⚠️ Server error:', data.toString().trim());
            });
            this.mcpProcess.on('exit', (code) => {
                console.log(`❌ Server exited with code ${code}`);
                reject(new Error(`Server exited with code ${code}`));
            });
        });
        console.log('✅ MCP Server connected');
    }
    async sendRequest(method, params) {
        if (!this.isConnected) {
            throw new Error('Not connected to MCP server');
        }
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method,
            params
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout for method: ${method}`));
            }, 30000);
            const requestData = JSON.stringify(request) + '\n';
            console.log(`📤 Sending request: ${method}`, params ? JSON.stringify(params, null, 2) : '');
            this.mcpProcess.stdin.write(requestData);
            const onData = (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === request.id) {
                            clearTimeout(timeout);
                            this.mcpProcess.stdout.removeListener('data', onData);
                            if (response.error) {
                                console.log(`❌ Error response for ${method}:`, response.error);
                            }
                            else {
                                console.log(`✅ Success response for ${method}`);
                            }
                            resolve(response);
                            return;
                        }
                    }
                    catch (e) {
                        // Ignore non-JSON output
                    }
                }
            };
            this.mcpProcess.stdout.on('data', onData);
        });
    }
    async disconnect() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
            this.isConnected = false;
            console.log('🔌 Disconnected from MCP server');
        }
    }
    async setupTestData() {
        console.log('\n📁 Setting up test data...');
        // Create test directory if it doesn't exist
        const testDir = join(process.cwd(), 'test-data');
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        // Create test documents
        const testDocs = [
            {
                filename: 'test-doc-1.txt',
                content: 'This is a test document about artificial intelligence and machine learning. It contains information about neural networks, deep learning, and natural language processing.'
            },
            {
                filename: 'test-doc-2.md',
                content: '# RAG Systems\n\nRetrieval-Augmented Generation (RAG) systems combine information retrieval with language generation. They are useful for question answering and knowledge-based applications.\n\n## Key Components\n- Vector databases\n- Embedding models\n- Language models'
            },
            {
                filename: 'test-doc-3.json',
                content: JSON.stringify({
                    title: 'Machine Learning Concepts',
                    topics: ['supervised learning', 'unsupervised learning', 'reinforcement learning'],
                    description: 'Overview of different machine learning paradigms and their applications'
                }, null, 2)
            }
        ];
        for (const doc of testDocs) {
            const filepath = join(testDir, doc.filename);
            writeFileSync(filepath, doc.content);
            console.log(`📄 Created test file: ${doc.filename}`);
        }
    }
}
async function runTests() {
    const client = new MCPTestClient();
    let testsPassed = 0;
    let testsFailed = 0;
    const test = async (name, testFn) => {
        try {
            console.log(`\n🧪 Running test: ${name}`);
            await testFn();
            console.log(`✅ Test passed: ${name}`);
            testsPassed++;
        }
        catch (error) {
            console.log(`❌ Test failed: ${name}`, error);
            testsFailed++;
        }
    };
    try {
        // Setup
        await client.setupTestData();
        await client.connect();
        // Test 1: Initialize MCP connection
        await test('MCP Initialize', async () => {
            const response = await client.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    }
                },
                clientInfo: {
                    name: 'test-client',
                    version: '1.0.0'
                }
            });
            if (response.error) {
                throw new Error(`Initialize failed: ${response.error.message}`);
            }
        });
        // Test 2: List available tools
        await test('List Tools', async () => {
            const response = await client.sendRequest('tools/list');
            if (response.error) {
                throw new Error(`List tools failed: ${response.error.message}`);
            }
            const tools = response.result?.tools || [];
            const expectedTools = ['search_documents', 'list_files', 'get_file_metadata', 'get_server_status'];
            for (const tool of expectedTools) {
                if (!tools.find((t) => t.name === tool)) {
                    throw new Error(`Missing expected tool: ${tool}`);
                }
            }
            console.log(`📋 Found ${tools.length} tools:`, tools.map((t) => t.name));
        });
        // Test 3: Get server status
        await test('Server Status', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'get_server_status',
                arguments: {}
            });
            if (response.error) {
                throw new Error(`Get server status failed: ${response.error.message}`);
            }
            const status = response.result?.content?.[0]?.text;
            if (!status) {
                throw new Error('No status content received');
            }
            console.log('📊 Server status:', JSON.parse(status));
        });
        // Test 4: List files
        await test('List Files', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'list_files',
                arguments: {
                    limit: "10"
                }
            });
            if (response.error) {
                throw new Error(`List files failed: ${response.error.message}`);
            }
            const result = response.result?.content?.[0]?.text;
            if (!result) {
                throw new Error('No files content received');
            }
            const files = JSON.parse(result);
            console.log(`📁 Found ${files.files?.length || 0} files`);
        });
        // Test 5: Search documents (semantic search)
        await test('Search Documents - Semantic', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'search_documents',
                arguments: {
                    query: 'artificial intelligence',
                    topK: "5",
                    useSemanticSearch: "true"
                }
            });
            if (response.error) {
                throw new Error(`Search documents failed: ${response.error.message}`);
            }
            const result = response.result?.content?.[0]?.text;
            if (!result) {
                throw new Error('No search results received');
            }
            const searchResults = JSON.parse(result);
            console.log(`🔍 Found ${searchResults.results?.length || 0} semantic search results`);
        });
        // Test 6: Search documents (keyword search)
        await test('Search Documents - Keyword', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'search_documents',
                arguments: {
                    query: 'machine learning',
                    topK: "5",
                    useSemanticSearch: "false"
                }
            });
            if (response.error) {
                throw new Error(`Keyword search failed: ${response.error.message}`);
            }
            const result = response.result?.content?.[0]?.text;
            if (!result) {
                throw new Error('No search results received');
            }
            const searchResults = JSON.parse(result);
            console.log(`🔍 Found ${searchResults.results?.length || 0} keyword search results`);
        });
        // Test 7: Search documents (hybrid search)
        await test('Search Documents - Hybrid', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'search_documents',
                arguments: {
                    query: 'neural networks',
                    topK: "5",
                    useSemanticSearch: "true",
                    useHybridSearch: "true",
                    semanticWeight: "0.7"
                }
            });
            if (response.error) {
                throw new Error(`Hybrid search failed: ${response.error.message}`);
            }
            const result = response.result?.content?.[0]?.text;
            if (!result) {
                throw new Error('No search results received');
            }
            const searchResults = JSON.parse(result);
            console.log(`🔍 Found ${searchResults.results?.length || 0} hybrid search results`);
        });
        // Test 8: Get model information
        await test('Get Model Info', async () => {
            const response = await client.sendRequest('tools/call', {
                name: 'get_current_model_info',
                arguments: {}
            });
            if (response.error) {
                throw new Error(`Get model info failed: ${response.error.message}`);
            }
            const result = response.result?.content?.[0]?.text;
            if (!result) {
                throw new Error('No model info received');
            }
            const modelInfo = JSON.parse(result);
            console.log('🤖 Model info:', modelInfo);
        });
    }
    catch (error) {
        console.error('💥 Test suite failed:', error);
    }
    finally {
        await client.disconnect();
        console.log('\n📈 Test Results:');
        console.log(`✅ Tests passed: ${testsPassed}`);
        console.log(`❌ Tests failed: ${testsFailed}`);
        console.log(`📊 Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
        if (testsFailed === 0) {
            console.log('\n🎉 All tests passed! The RAG server refactoring was successful.');
        }
        else {
            console.log('\n⚠️ Some tests failed. Please check the implementation.');
        }
    }
}
// Run the tests
runTests().catch(console.error);
