import React, { useState, useRef } from 'react'

interface RagUploadProps {
  onUpload: (content: string, fileName: string) => Promise<any>
  loading: boolean
}

export default function RagUpload({ onUpload, loading }: RagUploadProps) {
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setFileName(file.name)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        setContent(text)
      }
      reader.readAsText(file)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    
    if (!content.trim() || !fileName.trim()) {
      setUploadMessage('Please provide both content and filename')
      return
    }

    try {
      const result = await onUpload(content, fileName)
      if (result?.success) {
        setUploadMessage(`✅ Successfully uploaded: ${fileName}`)
        setContent('')
        setFileName('')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        setUploadMessage(`❌ Upload failed: ${result?.message || 'Unknown error'}`)
      }
    } catch (error) {
      setUploadMessage(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleClear = () => {
    setContent('')
    setFileName('')
    setUploadMessage('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '20px' }}>
      <h3>📄 Upload Document</h3>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label>
            Upload file:
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.csv"
              onChange={handleFileUpload}
              style={{ 
                marginLeft: '10px',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>
            Filename:
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Enter filename (e.g., document.txt)"
              style={{
                marginLeft: '10px',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '300px'
              }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>
            Content:
            <br />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter document content or upload a file above"
              rows={10}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '14px',
                marginTop: '5px'
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading || !content.trim() || !fileName.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Uploading...' : '📤 Upload Document'}
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
        </div>
      </form>

      {uploadMessage && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          borderRadius: '4px',
          backgroundColor: uploadMessage.includes('✅') ? '#d4edda' : '#f8d7da',
          color: uploadMessage.includes('✅') ? '#155724' : '#721c24',
          border: `1px solid ${uploadMessage.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {uploadMessage}
        </div>
      )}
    </div>
  )
}