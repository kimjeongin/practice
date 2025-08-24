import { readFileSync } from 'fs'
import { extname } from 'path'
import { Document } from '@langchain/core/documents'
import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import csv from 'csv-parser'
import { Readable } from 'stream'

/**
 * LangChain 기반 향상된 파일 리더 서비스
 * PDF, DOCX, CSV 등 다양한 파일 형식을 지원
 */
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
      console.error(`❌ Error reading file ${filePath}:`, error)
      return null
    }
  }

  private getFileType(filePath: string): string {
    return extname(filePath).slice(1).toLowerCase() || 'txt'
  }

  private async readPdf(filePath: string): Promise<Document | null> {
    try {
      const buffer = readFileSync(filePath)

      // Get PDF document proxy
      const pdf = await getDocumentProxy(new Uint8Array(buffer))

      // Extract text with merged pages
      const { totalPages, text } = await extractText(pdf, {
        mergePages: true,
      })

      // Extract individual pages for more detailed analysis
      const { text: pagesText } = await extractText(pdf, {
        mergePages: false,
      })

      const pages = Array.isArray(pagesText) ? pagesText : [pagesText]

      return new Document({
        pageContent: text.trim(),
        metadata: {
          source: filePath,
          fileType: 'pdf',
          pages: totalPages,
          pageTexts: pages, // Store individual page texts
          pdfInfo: {
            numPages: totalPages,
            // unpdf doesn't provide metadata extraction in the same way
            // but it's focused on text extraction which is our main need
            extractedWith: 'unpdf',
          },
        },
      })
    } catch (error) {
      console.error(`❌ Error parsing PDF ${filePath} with unpdf:`, error)
      return null
    }
  }

  private async readDocx(filePath: string): Promise<Document | null> {
    try {
      const buffer = readFileSync(filePath)
      const result = await mammoth.extractRawText({ buffer })

      return new Document({
        pageContent: result.value,
        metadata: {
          source: filePath,
          fileType: 'docx',
          warnings: result.messages,
        },
      })
    } catch (error) {
      console.error(`❌ Error parsing DOCX ${filePath}:`, error)
      return null
    }
  }

  private async readCsv(filePath: string): Promise<Document | null> {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const rows: any[] = []

      return new Promise((resolve, reject) => {
        const stream = Readable.from(content)
        stream
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', () => {
            const pageContent = this.formatCsvData(rows)
            resolve(
              new Document({
                pageContent,
                metadata: {
                  source: filePath,
                  fileType: 'csv',
                  rowCount: rows.length,
                  columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                },
              })
            )
          })
          .on('error', reject)
      })
    } catch (error) {
      console.error(`❌ Error parsing CSV ${filePath}:`, error)
      return null
    }
  }

  private readMarkdown(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')

    return new Document({
      pageContent: this.cleanMarkdown(content),
      metadata: {
        source: filePath,
        fileType: 'md',
      },
    })
  }

  private readJson(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')

    return new Document({
      pageContent: this.formatJson(content),
      metadata: {
        source: filePath,
        fileType: 'json',
      },
    })
  }

  private readHtml(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')

    return new Document({
      pageContent: this.stripHtml(content),
      metadata: {
        source: filePath,
        fileType: 'html',
      },
    })
  }

  private readXml(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')

    return new Document({
      pageContent: this.stripXml(content),
      metadata: {
        source: filePath,
        fileType: 'xml',
      },
    })
  }

  private readPlainText(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8')

    return new Document({
      pageContent: content,
      metadata: {
        source: filePath,
        fileType: 'txt',
      },
    })
  }

  // Helper methods for content processing
  private formatCsvData(rows: any[]): string {
    if (rows.length === 0) return ''

    const headers = Object.keys(rows[0])
    let result = `CSV Data with ${rows.length} rows and columns: ${headers.join(', ')}\n\n`

    // Include first few rows as examples
    const sampleRows = rows.slice(0, Math.min(5, rows.length))
    for (const [index, row] of sampleRows.entries()) {
      result += `Row ${index + 1}:\n`
      for (const [key, value] of Object.entries(row)) {
        result += `  ${key}: ${value}\n`
      }
      result += '\n'
    }

    if (rows.length > 5) {
      result += `... and ${rows.length - 5} more rows\n`
    }

    return result
  }

  private cleanMarkdown(content: string): string {
    return content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '') // Remove inline code
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Remove images
      .replace(/\[[^\]]*\]\([^)]*\)/g, '$1') // Convert links to text
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/[*_]{1,3}([^*_]*)[*_]{1,3}/g, '$1') // Remove emphasis
      .replace(/^\s*[-*+]\s/gm, '') // Remove list markers
      .replace(/^\s*\d+\.\s/gm, '') // Remove numbered list markers
      .trim()
  }

  private formatJson(content: string): string {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return content
    }
  }

  private stripHtml(content: string): string {
    return content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  private stripXml(content: string): string {
    return content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }
}
