import { useState, useEffect } from 'react'

interface FileInfo {
  id: string
  name: string
  path: string
  fileType: string
  size: number
  uploadedAt: string
}

interface ListFilesOptions {
  fileType?: string
  limit?: number
  offset?: number
}

interface RagFileListProps {
  onListFiles: (options?: ListFilesOptions) => Promise<FileInfo[] | null>
  onForceReindex: (clearCache?: boolean) => Promise<any>
  loading: boolean
}

export default function RagFileList({ onListFiles, onForceReindex, loading }: RagFileListProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [reindexLoading, setReindexLoading] = useState(false)
  const [filters, setFilters] = useState<ListFilesOptions>({
    limit: 50,
    offset: 0
  })
  const [message, setMessage] = useState('')

  const loadFiles = async () => {
    setListLoading(true)
    setMessage('')
    
    try {
      const result = await onListFiles(filters)
      if (result) {
        setFiles(result)
        setMessage(`✅ Found ${result.length} files`)
      } else {
        setFiles([])
        setMessage('❌ Failed to load files')
      }
    } catch (error) {
      setFiles([])
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setListLoading(false)
    }
  }

  const handleReindex = async (clearCache = false) => {
    setReindexLoading(true)
    setMessage('')
    
    try {
      const result = await onForceReindex(clearCache)
      if (result?.success) {
        setMessage(`✅ Reindex completed: ${result.message}`)
        // Reload files after reindex
        setTimeout(() => loadFiles(), 1000)
      } else {
        setMessage(`❌ Reindex failed: ${result?.message || 'Unknown error'}`)
      }
    } catch (error) {
      setMessage(`❌ Reindex error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setReindexLoading(false)
    }
  }

  // Load files on component mount
  useEffect(() => {
    loadFiles()
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getFileIcon = (fileType: string): string => {
    switch (fileType.toLowerCase()) {
      case 'txt': return '📄'
      case 'md': return '📝'
      case 'json': return '📋'
      case 'csv': return '📊'
      case 'pdf': return '📕'
      default: return '📄'
    }
  }

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '20px' }}>
      <h3>📁 Document Library</h3>
      
      {/* Controls */}
      <div style={{ 
        marginBottom: '20px', 
        display: 'flex', 
        gap: '10px', 
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => loadFiles()}
          disabled={listLoading || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: listLoading ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: listLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {listLoading ? '⏳ Loading...' : '🔄 Refresh'}
        </button>

        <button
          onClick={() => handleReindex(false)}
          disabled={reindexLoading || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: reindexLoading ? '#ccc' : '#fd7e14',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: reindexLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {reindexLoading ? '⏳ Reindexing...' : '🔄 Reindex'}
        </button>

        <button
          onClick={() => handleReindex(true)}
          disabled={reindexLoading || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: reindexLoading ? '#ccc' : '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: reindexLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {reindexLoading ? '⏳ Clearing...' : '🗑️ Clear & Reindex'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>
            File Type:
            <select
              value={filters.fileType || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, fileType: e.target.value || undefined }))}
              style={{
                marginLeft: '5px',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            >
              <option value="">All</option>
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </label>

          <label>
            Limit:
            <input
              type="number"
              min="1"
              max="1000"
              value={filters.limit}
              onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
              style={{
                marginLeft: '5px',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '80px'
              }}
            />
          </label>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px', 
          borderRadius: '4px',
          backgroundColor: message.includes('✅') ? '#d4edda' : '#f8d7da',
          color: message.includes('✅') ? '#155724' : '#721c24',
          border: `1px solid ${message.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message}
        </div>
      )}

      {/* File List */}
      {files.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: '#6c757d',
          fontStyle: 'italic'
        }}>
          {listLoading ? 'Loading files...' : 'No files found. Upload some documents to get started!'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            backgroundColor: 'white'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                  File
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                  Type
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                  Size
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                  Uploaded
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                  Path
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, index) => (
                <tr 
                  key={file.id}
                  style={{ 
                    backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                    borderBottom: '1px solid #dee2e6'
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>
                        {getFileIcon(file.fileType)}
                      </span>
                      <span style={{ fontWeight: '500' }}>
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      backgroundColor: '#e9ecef',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      {file.fileType}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#6c757d' }}>
                    {formatFileSize(file.size)}
                  </td>
                  <td style={{ padding: '12px', color: '#6c757d', fontSize: '14px' }}>
                    {formatDate(file.uploadedAt)}
                  </td>
                  <td style={{ 
                    padding: '12px', 
                    color: '#6c757d', 
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {file.path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}