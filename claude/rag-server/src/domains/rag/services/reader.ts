/**
 * File Reader Service
 * Enhanced file reader based on LangChain supporting various file formats
 */

import { readFileSync } from 'fs'
import { extname } from 'path'
import { Document } from '@langchain/core/documents'
import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import csv from 'csv-parser'
import { Readable } from 'stream'
import { logger } from '@/shared/logger/index.js'

export class FileReader {
  async readFileContent(filePath: string): Promise<Document | null> {
    try {
      const fileType = this.getFileType(filePath)

      switch (fileType) {
        case 'pdf':
          return await this.readPdf(filePath)
        case 'docx':
          return await this.readDocx(filePath)
        case 'csv':
          return await this.readCsv(filePath)
        case 'md':
          return this.readMarkdown(filePath)
        case 'json':
          return this.readJson(filePath)
        case 'html':
          return this.readHtml(filePath)
        case 'xml':
          return this.readXml(filePath)
        default:
          return this.readPlainText(filePath)
      }
    } catch (error) {
      logger.error(`❌ Error reading file ${filePath}:`, error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  private getFileType(filePath: string): string {
    return extname(filePath).slice(1).toLowerCase() || 'txt'
  }

  private async readPdf(filePath: string): Promise<Document | null> {
    try {
      const buffer = readFileSync(filePath)
      const doc = await getDocumentProxy(new Uint8Array(buffer))
      const content = await extractText(doc, { mergePages: true })

      return new Document({
        pageContent: content.text,
        metadata: { source: filePath, type: 'pdf' }
      })
    } catch (error) {
      logger.error(`❌ Error reading PDF file ${filePath}:`, error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  private async readDocx(filePath: string): Promise<Document | null> {
    try {
      const buffer = readFileSync(filePath)
      const result = await mammoth.extractRawText({ buffer })

      return new Document({
        pageContent: result.value,
        metadata: { source: filePath, type: 'docx' }
      })
    } catch (error) {
      logger.error(`❌ Error reading DOCX file ${filePath}:`, error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  private async readCsv(filePath: string): Promise<Document | null> {
    try {
      const buffer = readFileSync(filePath)
      const rows: any[] = []

      return new Promise((resolve, reject) => {
        const stream = new Readable()
        stream.push(buffer)
        stream.push(null)

        stream
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', () => {
            const content = rows
              .map(row => Object.entries(row)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')
              )
              .join('\n')

            resolve(new Document({
              pageContent: content,
              metadata: { source: filePath, type: 'csv', rows: rows.length }
            }))
          })
          .on('error', reject)
      })
    } catch (error) {
      logger.error(`❌ Error reading CSV file ${filePath}:`, error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  private readMarkdown(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')
    return new Document({
      pageContent: content,
      metadata: { source: filePath, type: 'markdown' }
    })
  }

  private readJson(filePath: string): Document {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      // Convert JSON to readable text
      const readableContent = this.jsonToText(data)

      return new Document({
        pageContent: readableContent,
        metadata: { source: filePath, type: 'json' }
      })
    } catch (error) {
      logger.error(`❌ Error reading JSON file ${filePath}:`, error instanceof Error ? error : new Error(String(error)))
      return new Document({
        pageContent: '',
        metadata: { source: filePath, type: 'json', error: 'Invalid JSON' }
      })
    }
  }

  private readHtml(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')
    
    // Simple HTML tag removal
    const textContent = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")

    return new Document({
      pageContent: textContent,
      metadata: { source: filePath, type: 'html' }
    })
  }

  private readXml(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')
    
    // Simple XML tag removal
    const textContent = content
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")

    return new Document({
      pageContent: textContent,
      metadata: { source: filePath, type: 'xml' }
    })
  }

  private readPlainText(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')
    return new Document({
      pageContent: content,
      metadata: { source: filePath, type: 'text' }
    })
  }

  private jsonToText(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent)
    
    if (obj === null || obj === undefined) {
      return 'null'
    }
    
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj)
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]'
      return obj.map(item => `${spaces}- ${this.jsonToText(item, indent + 1)}`).join('\n')
    }
    
    if (typeof obj === 'object') {
      const entries = Object.entries(obj)
      if (entries.length === 0) return '{}'
      
      return entries
        .map(([key, value]) => `${spaces}${key}: ${this.jsonToText(value, indent + 1)}`)
        .join('\n')
    }
    
    return String(obj)
  }
}