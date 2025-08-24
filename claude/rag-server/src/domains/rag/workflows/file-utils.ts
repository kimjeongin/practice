import { readFileSync } from 'fs'
import { extname } from 'path'

/**
 * 파일 리더 서비스
 * 다양한 파일 형식에서 텍스트 추출
 */
export class FileReaderService {
  readFileContent(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const fileType = this.getFileType(filePath)

      return this.processContentByType(content, fileType)
    } catch (error) {
      console.error(`❌ Error reading file ${filePath}:`, error)
      return null
    }
  }

  private getFileType(filePath: string): string {
    return extname(filePath).slice(1).toLowerCase() || 'txt'
  }

  private processContentByType(content: string, fileType: string): string {
    switch (fileType) {
      case 'md':
        return this.cleanMarkdown(content)
      case 'json':
        return this.formatJson(content)
      case 'html':
        return this.stripHtml(content)
      case 'xml':
        return this.stripXml(content)
      default:
        return content
    }
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
