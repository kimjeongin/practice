#!/usr/bin/env node
/**
 * Fix template literal issues in logger calls
 * 템플릿 리터럴 오류 수정
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const srcDir = join(__dirname, '..', 'src')

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

function fixTemplateStrings(content) {
  // Fix logger calls with template literals that are incorrectly quoted
  // Pattern: logger.info('...${...}...') -> logger.info(`...${...}...`)
  
  let fixed = content
  
  // Fix single quoted template literals
  fixed = fixed.replace(
    /logger\.(info|warn|error|debug|fatal)\('([^']*\$\{[^}]*\}[^']*)'\)/g,
    (match, level, template) => {
      return `logger.${level}(\`${template}\`)`
    }
  )
  
  // Fix double quoted template literals
  fixed = fixed.replace(
    /logger\.(info|warn|error|debug|fatal)\("([^"]*\$\{[^}]*\}[^"]*)"\)/g,
    (match, level, template) => {
      return `logger.${level}(\`${template}\`)`
    }
  )
  
  return fixed
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const hasTemplateIssues = /logger\.[a-z]+\(['"][^'"]*\$\{[^}]*\}[^'"]*['"]/.test(content)
    
    if (!hasTemplateIssues) {
      return { processed: false, fixed: 0 }
    }
    
    const fixed = fixTemplateStrings(content)
    const fixCount = (content.match(/logger\.[a-z]+\(['"][^'"]*\$\{[^}]*\}[^'"]*['"]/g) || []).length
    
    if (fixed !== content) {
      writeFileSync(filePath, fixed, 'utf-8')
      console.log(`✅ ${filePath}: ${fixCount} template literal issues fixed`)
      return { processed: true, fixed: fixCount }
    }
    
    return { processed: false, fixed: 0 }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message)
    return { processed: false, fixed: 0, error: error.message }
  }
}

function main() {
  console.log('🔄 Starting template literal fixes...')
  
  let totalProcessed = 0
  let totalFixed = 0
  const results = []
  
  walkDirectory(srcDir, (filePath) => {
    const result = processFile(filePath)
    if (result.processed) {
      totalProcessed++
      totalFixed += result.fixed
    }
    if (result.fixed > 0 || result.error) {
      results.push({
        file: filePath.replace(srcDir + '/', ''),
        ...result
      })
    }
  })
  
  console.log('\n📊 Template Literal Fix Summary:')
  console.log(`Files processed: ${totalProcessed}`)
  console.log(`Total fixes applied: ${totalFixed}`)
  
  if (results.length > 0) {
    console.log('\n📋 Detailed Results:')
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.file}: Error - ${result.error}`)
      } else {
        console.log(`✅ ${result.file}: ${result.fixed} fixes`)
      }
    })
  }
  
  console.log('\n✅ Template literal fixes completed!')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}