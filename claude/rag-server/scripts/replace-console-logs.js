#!/usr/bin/env node
/**
 * Script to replace console.log statements with structured logger calls
 * 86개의 console.log를 구조화된 logger로 일괄 변환
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const srcDir = join(__dirname, '..', 'src')

// Console.log 패턴과 logger 변환 규칙
const consolePatternsToReplace = [
  // Basic console.log patterns
  {
    pattern: /console\.log\(`([^`]+)`\)/g,
    replacement: "logger.info('$1')"
  },
  {
    pattern: /console\.log\('([^']+)'\)/g,
    replacement: "logger.info('$1')"
  },
  {
    pattern: /console\.log\("([^"]+)"\)/g,
    replacement: 'logger.info("$1")'
  },
  
  // Error patterns
  {
    pattern: /console\.error\(`([^`]+)`[,\s]*([^)]*)\)/g,
    replacement: "logger.error('$1', $2 instanceof Error ? $2 : new Error(String($2)))"
  },
  {
    pattern: /console\.error\('([^']+)'[,\s]*([^)]*)\)/g,
    replacement: "logger.error('$1', $2 instanceof Error ? $2 : new Error(String($2)))"
  },
  
  // Warning patterns  
  {
    pattern: /console\.warn\(`([^`]+)`\)/g,
    replacement: "logger.warn('$1')"
  },
  {
    pattern: /console\.warn\('([^']+)'\)/g,
    replacement: "logger.warn('$1')"
  },
]

// Files to process and their import requirements
const filesToProcess = [
  'src/shared/schemas/schema-validator.ts',
  'src/shared/utils/file-metadata.ts', 
  'src/app/index.ts',
  'src/shared/logger/index.ts',
  'src/domains/filesystem/services/watcher.ts',
  'src/domains/rag/services/chunking.ts',
  'src/domains/rag/services/document/reader.ts',
  'src/domains/rag/integrations/vectorstores/providers/lancedb/embedding-bridge.ts',
  'src/domains/rag/services/models/operations.ts',
  'src/domains/dashboard/public/dashboard.js',
  'src/domains/rag/integrations/embeddings/index.ts',
  'src/domains/rag/integrations/embeddings/adapter.ts',
  'src/domains/rag/integrations/embeddings/providers/transformers.ts',
  'src/domains/rag/integrations/vectorstores/providers/qdrant.ts',
  'src/domains/rag/integrations/embeddings/providers/ollama.ts',
]

function needsLoggerImport(filePath, content) {
  // Check if file already imports logger
  if (content.includes("from '@/shared/logger/index.js'") || 
      content.includes('import { logger }')) {
    return false
  }
  
  // Check if file has console statements that will be replaced
  return /console\.(log|error|warn)/.test(content)
}

function addLoggerImport(content, filePath) {
  // Find the best place to add the import
  const lines = content.split('\n')
  let importInsertIndex = 0
  
  // Find the last import statement
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ') || 
        lines[i].trim().startsWith("import ")) {
      importInsertIndex = i + 1
    } else if (lines[i].trim() === '') {
      continue
    } else {
      break
    }
  }
  
  // Insert logger import
  const loggerImport = "import { logger } from '@/shared/logger/index.js'"
  lines.splice(importInsertIndex, 0, loggerImport)
  
  return lines.join('\n')
}

function replaceConsoleLogs(content) {
  let updatedContent = content
  
  // Apply all replacement patterns
  for (const { pattern, replacement } of consolePatternsToReplace) {
    updatedContent = updatedContent.replace(pattern, replacement)
  }
  
  // Handle specific complex patterns that need manual adjustment
  // Example: console.log with template literals containing expressions
  updatedContent = updatedContent.replace(
    /console\.log\(`([^`]*\${[^}]*}[^`]*)`\)/g,
    (match, template) => {
      // Convert template literal to logger info with context object
      const cleanTemplate = template.replace(/\${([^}]*)}/g, '${$1}')
      return `logger.info(\`${cleanTemplate}\`)`
    }
  )
  
  return updatedContent
}

function walkDirectory(dir, callback) {
  const files = readdirSync(dir)
  
  for (const file of files) {
    const filePath = join(dir, file)
    const stat = statSync(filePath)
    
    if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
      walkDirectory(filePath, callback)
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
      callback(filePath)
    }
  }
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const originalConsoleCount = (content.match(/console\.(log|error|warn)/g) || []).length
    
    if (originalConsoleCount === 0) {
      return { processed: false, consolesReplaced: 0 }
    }
    
    let updatedContent = content
    
    // Add logger import if needed
    if (needsLoggerImport(filePath, content)) {
      updatedContent = addLoggerImport(updatedContent, filePath)
    }
    
    // Replace console statements
    updatedContent = replaceConsoleLogs(updatedContent)
    
    const newConsoleCount = (updatedContent.match(/console\.(log|error|warn)/g) || []).length
    const consolesReplaced = originalConsoleCount - newConsoleCount
    
    if (consolesReplaced > 0) {
      writeFileSync(filePath, updatedContent, 'utf-8')
      console.log(`✅ ${filePath}: ${consolesReplaced} console statements replaced`)
      return { processed: true, consolesReplaced }
    }
    
    return { processed: false, consolesReplaced: 0 }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message)
    return { processed: false, consolesReplaced: 0, error: error.message }
  }
}

function main() {
  console.log('🔄 Starting console.log replacement...')
  console.log(`📂 Scanning directory: ${srcDir}`)
  
  let totalProcessed = 0
  let totalConsoleReplaced = 0
  const results = []
  
  // Process all TypeScript and JavaScript files
  walkDirectory(srcDir, (filePath) => {
    const result = processFile(filePath)
    if (result.processed) {
      totalProcessed++
      totalConsoleReplaced += result.consolesReplaced
    }
    if (result.consolesReplaced > 0 || result.error) {
      results.push({
        file: filePath.replace(srcDir + '/', ''),
        ...result
      })
    }
  })
  
  // Summary
  console.log('\n📊 Console.log Replacement Summary:')
  console.log(`Files processed: ${totalProcessed}`)
  console.log(`Total console statements replaced: ${totalConsoleReplaced}`)
  
  if (results.length > 0) {
    console.log('\n📋 Detailed Results:')
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.file}: Error - ${result.error}`)
      } else {
        console.log(`✅ ${result.file}: ${result.consolesReplaced} replacements`)
      }
    })
  }
  
  console.log('\n🎯 Next steps:')
  console.log('1. Review the changed files for any complex console.log patterns that need manual adjustment')
  console.log('2. Run yarn typecheck to ensure all imports are correct')
  console.log('3. Test the application to ensure logging works as expected')
  console.log('4. Run yarn lint to fix any style issues')
  
  console.log('\n✅ Console.log replacement completed!')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { processFile, replaceConsoleLogs, addLoggerImport }