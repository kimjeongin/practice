import React, { useState } from 'react'

interface SearchResult {
  content: string
  score: number
  metadata: {
    filePath: string
    fileName: string
    chunkIndex: number
  }
}

interface SearchOptions {
  topK?: number
  useSemanticSearch?: boolean
  useHybridSearch?: boolean
  semanticWeight?: number
  fileTypes?: string[]
}

interface RagSearchProps {
  onSearch: (query: string, options?: SearchOptions) => Promise<{ results: SearchResult[], totalResults: number } | null>
  loading: boolean
}

export default function RagSearch({ onSearch, loading }: RagSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ results: SearchResult[], totalResults: number } | null>(null)
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    topK: 5,
    useSemanticSearch: true,
    useHybridSearch: false,
    semanticWeight: 0.7
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    
    if (!query.trim()) {
      return
    }

    try {
      const searchResults = await onSearch(query, searchOptions)
      setResults(searchResults)
    } catch (error) {
      console.error('Search error:', error)
      setResults(null)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResults(null)
  }

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '20px' }}>
      <h3>🔍 Search Documents</h3>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your search query..."
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '16px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Searching...' : '🔍 Search'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🗑️ Clear
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ⚙️ {showAdvanced ? 'Hide' : 'Show'} Advanced
          </button>
        </div>

        {showAdvanced && (
          <div style={{ 
            marginBottom: '15px', 
            padding: '15px', 
            border: '1px solid #e9ecef', 
            borderRadius: '4px',
            backgroundColor: '#f8f9fa'
          }}>
            <h4>Advanced Search Options</h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label>
                  Max Results:
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={searchOptions.topK}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, topK: parseInt(e.target.value) }))}
                    style={{
                      marginLeft: '10px',
                      padding: '5px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      width: '80px'
                    }}
                  />
                </label>
              </div>

              <div>
                <label>
                  Semantic Weight:
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={searchOptions.semanticWeight}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, semanticWeight: parseFloat(e.target.value) }))}
                    style={{ marginLeft: '10px' }}
                  />
                  <span style={{ marginLeft: '10px' }}>{searchOptions.semanticWeight}</span>
                </label>
              </div>

              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.useSemanticSearch}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, useSemanticSearch: e.target.checked }))}
                    style={{ marginRight: '5px' }}
                  />
                  Use Semantic Search
                </label>
              </div>

              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.useHybridSearch}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, useHybridSearch: e.target.checked }))}
                    style={{ marginRight: '5px' }}
                  />
                  Use Hybrid Search
                </label>
              </div>
            </div>
          </div>
        )}
      </form>

      {results && (
        <div style={{ marginTop: '20px' }}>
          <h4>📊 Search Results ({results.totalResults} total)</h4>
          
          {results.results.length === 0 ? (
            <p style={{ color: '#6c757d', fontStyle: 'italic' }}>No results found for "{query}"</p>
          ) : (
            <div>
              {results.results.map((result, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: '15px',
                    padding: '15px',
                    border: '1px solid #e9ecef',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <h5 style={{ margin: 0, color: '#495057' }}>
                      📄 {result.metadata.fileName}
                    </h5>
                    <span style={{ 
                      backgroundColor: getScoreColor(result.score),
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  
                  <p style={{ 
                    margin: '10px 0',
                    lineHeight: '1.5',
                    color: '#212529'
                  }}>
                    {result.content}
                  </p>
                  
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>
                    📁 {result.metadata.filePath} • Chunk #{result.metadata.chunkIndex}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return '#28a745' // Green
  if (score >= 0.6) return '#ffc107' // Yellow
  if (score >= 0.4) return '#fd7e14' // Orange
  return '#dc3545' // Red
}