/**
 * Web Client for RAG MCP Server
 * 
 * This is a demonstration web interface showing how to interact with the RAG server.
 * Note: This simulates API calls since the server uses MCP (stdio) protocol.
 * In a real implementation, you would need a REST API wrapper around the MCP server.
 */

class RAGWebClient {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
        this.isConnected = false;
        this.init();
    }

    init() {
        // Update semantic weight display
        const weightSlider = document.getElementById('semanticWeight');
        const weightValue = document.getElementById('weightValue');
        
        weightSlider.addEventListener('input', (e) => {
            weightValue.textContent = e.target.value;
        });

        // Disable hybrid search when semantic search is disabled
        document.getElementById('semanticSearch').addEventListener('change', (e) => {
            if (!e.target.checked) {
                document.getElementById('hybridSearch').checked = false;
            }
        });

        // Enable semantic search when hybrid is enabled
        document.getElementById('hybridSearch').addEventListener('change', (e) => {
            if (e.target.checked) {
                document.getElementById('semanticSearch').checked = true;
            }
        });

        // Auto-connect on page load
        this.connect();
    }

    async connect() {
        this.showLoading('connectBtn', true);
        this.showMessage('', 'Connecting to RAG server...', 'info');

        try {
            // Simulate connection check - in real implementation, this would be an API call
            const response = await this.simulateApiCall('/api/health', {});
            
            if (response.status === 'healthy') {
                this.isConnected = true;
                this.updateConnectionStatus(true);
                this.enableButtons();
                this.showMessage('', 'Connected successfully!', 'success');
                
                // Auto-load initial data
                await this.getStatus();
                await this.listFiles();
            } else {
                throw new Error('Server not healthy');
            }
        } catch (error) {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.showMessage('', `Connection failed: ${error.message}`, 'error');
        } finally {
            this.showLoading('connectBtn', false);
        }
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Disconnected';
        }
    }

    enableButtons() {
        const buttons = ['searchBtn', 'listBtn', 'statusBtn', 'modelInfoBtn', 'modelsBtn', 'refreshStatusBtn', 'reindexBtn'];
        buttons.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
            }
        });
    }

    async forceReindex() {
        if (!confirm('Force reindex all documents? This may take a while for large document collections.')) {
            return;
        }

        this.showLoading('reindexBtn', true);

        try {
            const response = await this.simulateApiCall('/api/reindex', {});
            this.showMessage('uploadMessage', 'Documents reindexed successfully!', 'success');
            
            // Refresh file list and status
            await Promise.all([this.listFiles(), this.getStatus()]);
            
        } catch (error) {
            this.showMessage('uploadMessage', `Reindex failed: ${error.message}`, 'error');
        } finally {
            this.showLoading('reindexBtn', false);
        }
    }

    async searchDocuments() {
        const query = document.getElementById('searchQuery').value.trim();
        
        if (!query) {
            this.showMessage('searchResults', 'Please enter a search query', 'error');
            return;
        }

        this.showLoading('searchBtn', true);
        document.getElementById('searchResults').innerHTML = '';

        try {
            const useSemanticSearch = document.getElementById('semanticSearch').checked;
            const useHybridSearch = document.getElementById('hybridSearch').checked;
            const topK = parseInt(document.getElementById('topK').value);
            const semanticWeight = parseFloat(document.getElementById('semanticWeight').value);

            const response = await this.simulateApiCall('/api/search', {
                query,
                useSemanticSearch,
                useHybridSearch,
                topK,
                semanticWeight
            });

            this.displaySearchResults(response.results || [], query);
        } catch (error) {
            this.showMessage('searchResults', `Search failed: ${error.message}`, 'error');
        } finally {
            this.showLoading('searchBtn', false);
        }
    }

    displaySearchResults(results, query) {
        const container = document.getElementById('searchResults');
        
        if (results.length === 0) {
            container.innerHTML = '<div class="message">No results found. Make sure documents are in the documents/ folder.</div>';
            return;
        }

        const resultsHtml = `
            <div class="search-header" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="margin: 0 0 5px 0; color: #333;">Search Results for "${query}"</h3>
                <p style="margin: 0; color: #666; font-size: 14px;">Found ${results.length} relevant document${results.length !== 1 ? 's' : ''}</p>
            </div>
            ${results.map((result, index) => `
                <div class="result-item">
                    <div class="result-header">
                        <div class="result-title">${result.metadata.fileName}</div>
                        <div class="result-score">${result.score.toFixed(4)}</div>
                    </div>
                    <div class="result-meta" style="font-size: 12px; color: #666; margin: 5px 0;">
                        Type: ${result.metadata.fileType} • Chunk: ${result.metadata.chunkIndex}
                    </div>
                    <div class="result-content">${result.content}</div>
                </div>
            `).join('')}
        `;

        container.innerHTML = resultsHtml;
    }

    async listFiles() {
        this.showLoading('listBtn', true);

        try {
            const response = await this.simulateApiCall('/api/files', {});
            this.displayFilesList(response.files || []);
        } catch (error) {
            document.getElementById('filesList').innerHTML = 
                `<div class="message error">Failed to load files: ${error.message}</div>`;
        } finally {
            this.showLoading('listBtn', false);
        }
    }

    displayFilesList(files) {
        const container = document.getElementById('filesList');
        
        if (files.length === 0) {
            container.innerHTML = '<div class="message">No files indexed yet. Place documents in the documents/ folder!</div>';
            return;
        }

        const filesHtml = files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">
                        ${file.fileType} • ${file.size} bytes • 
                        Updated: ${new Date(file.updatedAt).toLocaleString()}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = filesHtml;
    }

    async getStatus() {
        this.showLoading('statusBtn', true);
        this.showLoading('refreshStatusBtn', true);

        try {
            const response = await this.simulateApiCall('/api/status', {});
            this.displayServerStatus(response);
        } catch (error) {
            document.getElementById('serverStatus').innerHTML = 
                `<div class="message error">Failed to get status: ${error.message}</div>`;
        } finally {
            this.showLoading('statusBtn', false);
            this.showLoading('refreshStatusBtn', false);
        }
    }

    displayServerStatus(status) {
        const container = document.getElementById('serverStatus');
        
        const statusHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                <div class="result-item">
                    <div class="result-title">Server Status</div>
                    <div style="color: #28a745; font-weight: 600;">
                        Running
                    </div>
                </div>
                <div class="result-item">
                    <div class="result-title">Total Documents</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: #667eea;">
                        ${status.totalDocuments || 0}
                    </div>
                </div>
                <div class="result-item">
                    <div class="result-title">Vector Dimensions</div>
                    <div>${status.vectorDimensions || 'N/A'}</div>
                </div>
                <div class="result-item">
                    <div class="result-title">Current Model</div>
                    <div style="font-size: 12px;">${status.currentModel || 'N/A'}</div>
                </div>
                <div class="result-item">
                    <div class="result-title">Memory Usage</div>
                    <div>${status.memoryUsage || 'N/A'}</div>
                </div>
            </div>
        `;

        container.innerHTML = statusHtml;
    }

    async getModelInfo() {
        try {
            const response = await this.simulateApiCall('/api/model-info', {});
            this.displayModelInfo(response);
        } catch (error) {
            document.getElementById('modelInfo').innerHTML = 
                `<div class="message error">Failed to get model info: ${error.message}</div>`;
        }
    }

    async listModels() {
        try {
            const response = await this.simulateApiCall('/api/models', {});
            this.displayModelsList(response);
        } catch (error) {
            document.getElementById('modelInfo').innerHTML = 
                `<div class="message error">Failed to list models: ${error.message}</div>`;
        }
    }

    displayModelInfo(modelInfo) {
        const container = document.getElementById('modelInfo');
        
        const infoHtml = `
            <div class="result-item" style="margin-top: 15px;">
                <div class="result-title">Current Model</div>
                <div><strong>Model:</strong> ${modelInfo.model}</div>
                <div><strong>Service:</strong> ${modelInfo.service}</div>
                <div><strong>Dimensions:</strong> ${modelInfo.dimensions}</div>
                <div><strong>Description:</strong> ${modelInfo.description || 'N/A'}</div>
            </div>
        `;

        container.innerHTML = infoHtml;
    }

    displayModelsList(models) {
        const container = document.getElementById('modelInfo');
        
        let modelsHtml = '';
        
        if (models.currentModel) {
            modelsHtml += `
                <div class="result-item" style="margin-top: 15px;">
                    <div class="result-title">Current Model</div>
                    <div><strong>${models.currentModel.model}</strong> (${models.currentModel.dimensions}D)</div>
                    <div>${models.currentModel.description || ''}</div>
                </div>
            `;
        }

        if (models.availableModels) {
            modelsHtml += `
                <div class="result-item" style="margin-top: 15px;">
                    <div class="result-title">Available Models</div>
                    ${Object.entries(models.availableModels).map(([name, info]) => `
                        <div style="padding: 8px 0; border-bottom: 1px solid #eee;">
                            <strong>${name}</strong> (${info.dimensions}D)<br>
                            <small>${info.description}</small>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        container.innerHTML = modelsHtml;
    }

    showMessage(containerId, message, type = 'info') {
        if (containerId) {
            const container = document.getElementById(containerId);
            container.innerHTML = `<div class="message ${type}">${message}</div>`;
        }
    }

    showLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        const loadingSpinner = button.querySelector('.loading');
        
        if (loading) {
            button.disabled = true;
            if (loadingSpinner) {
                loadingSpinner.style.display = 'inline-block';
            }
        } else {
            button.disabled = !this.isConnected;
            if (loadingSpinner) {
                loadingSpinner.style.display = 'none';
            }
        }
    }

    // Simulate API calls with realistic responses
    async simulateApiCall(endpoint, data) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

        // Simulate different responses based on endpoint
        switch (endpoint) {
            case '/api/health':
                return {
                    status: 'healthy',
                    totalDocuments: this.getStoredDocuments().length,
                    memoryUsage: { used: '145.2MB' },
                    uptime: '00:15:32',
                    errorRate: 0
                };

            case '/api/reindex':
                // Simulate reindex delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                return { success: true, message: 'Documents reindexed successfully' };

            case '/api/search':
                return {
                    results: this.simulateSearchResults(data.query, data.topK || 5)
                };

            case '/api/files':
                return {
                    files: this.getStoredDocuments()
                };

            case '/api/status':
                return {
                    totalDocuments: this.getStoredDocuments().length,
                    vectorDimensions: 384,
                    currentModel: 'Xenova/all-MiniLM-L6-v2',
                    memoryUsage: '145.2MB',
                    version: '1.0.0'
                };

            case '/api/model-info':
                return {
                    model: 'Xenova/all-MiniLM-L6-v2',
                    service: 'transformers',
                    dimensions: 384,
                    description: 'Fast and efficient, good for general use'
                };

            case '/api/models':
                return {
                    currentModel: {
                        model: 'Xenova/all-MiniLM-L6-v2',
                        service: 'transformers',
                        dimensions: 384,
                        description: 'Fast and efficient, good for general use'
                    },
                    availableModels: {
                        'all-MiniLM-L6-v2': {
                            dimensions: 384,
                            description: 'Fast and efficient, good for general use'
                        },
                        'all-MiniLM-L12-v2': {
                            dimensions: 384,
                            description: 'Better quality, slower processing'
                        },
                        'bge-small-en': {
                            dimensions: 384,
                            description: 'High quality English embeddings'
                        }
                    }
                };

            default:
                throw new Error('Unknown endpoint');
        }
    }

    // Local storage simulation
    storeDocument(doc) {
        const docs = this.getStoredDocuments();
        const newDoc = {
            ...doc,
            id: Date.now(),
            fileType: 'text/markdown',
            createdAt: new Date().toISOString(),
            chunkCount: Math.ceil(doc.content.length / 1000)
        };
        docs.push(newDoc);
        localStorage.setItem('rag_documents', JSON.stringify(docs));
    }

    getStoredDocuments() {
        try {
            return JSON.parse(localStorage.getItem('rag_documents') || '[]');
        } catch {
            return [];
        }
    }

    simulateSearchResults(query, topK) {
        const docs = this.getStoredDocuments();
        
        if (docs.length === 0) {
            return [];
        }

        // Simple simulation of search results
        return docs.slice(0, topK).map((doc, index) => ({
            content: doc.content.substring(0, 200) + '...',
            score: Math.max(0.3, 1 - (index * 0.15) - Math.random() * 0.2),
            metadata: {
                fileName: doc.fileName,
                fileType: doc.fileType,
                chunkIndex: 0
            }
        })).sort((a, b) => b.score - a.score);
    }
}

// Global functions for HTML onclick handlers
let client;

function connect() {
    if (!client) {
        client = new RAGWebClient();
    } else {
        client.connect();
    }
}

function forceReindex() {
    client?.forceReindex();
}

function searchDocuments() {
    client?.searchDocuments();
}

function listFiles() {
    client?.listFiles();
}

function getStatus() {
    client?.getStatus();
}

function getModelInfo() {
    client?.getModelInfo();
}

function listModels() {
    client?.listModels();
}

// Initialize client when page loads
document.addEventListener('DOMContentLoaded', () => {
    client = new RAGWebClient();
});