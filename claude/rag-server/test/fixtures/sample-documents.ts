export const SAMPLE_DOCUMENTS = {
  simple: {
    filename: 'simple.txt',
    content: 'This is a simple test document with some basic text content.'
  },
  
  markdown: {
    filename: 'sample.md',
    content: `# Sample Document

This is a sample markdown document for testing purposes.

## Section 1

Here is some content in section 1.

## Section 2

Here is some content in section 2 with **bold** and *italic* text.

### Subsection

- List item 1
- List item 2
- List item 3

\`\`\`javascript
const example = "code block";
console.log(example);
\`\`\`
`
  },
  
  longText: {
    filename: 'long.txt',
    content: Array(50).fill('This is a long document with repeated content. ').join('')
  },
  
  technical: {
    filename: 'technical.txt',
    content: `Vector databases are specialized storage systems designed to handle high-dimensional vector data efficiently. They enable fast similarity search and are crucial for applications like recommendation systems, image search, and retrieval-augmented generation (RAG) systems.

Key features of vector databases include:
1. Efficient storage of vector embeddings
2. Fast similarity search using algorithms like KNN
3. Scalability for large datasets
4. Integration with machine learning pipelines

Popular vector database solutions include Pinecone, Weaviate, Qdrant, and FAISS.`
  }
};

export const SAMPLE_CHUNKS = {
  chunk1: {
    content: 'This is the first chunk of a document.',
    startIndex: 0,
    endIndex: 39
  },
  
  chunk2: {
    content: 'This is the second chunk with different content.',
    startIndex: 40,
    endIndex: 87
  }
};