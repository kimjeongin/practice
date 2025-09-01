/**
 * Content Analysis Engine
 *
 * Provides enhanced metadata collection capabilities including:
 * - Language detection
 * - Keyword extraction
 * - Category classification
 * - Content summarization
 * - Reading time estimation
 * - Context header generation
 */

import { logger } from '@/shared/logger/index.js'
import { DocumentMetadata } from '@/domains/rag/integrations/vectorstores/providers/lancedb/simple-schema.js'

/**
 * Content analysis configuration
 */
export interface ContentAnalysisConfig {
  enableLanguageDetection: boolean
  enableKeywordExtraction: boolean
  enableCategoryClassification: boolean
  enableSummarization: boolean
  enableContextHeaders: boolean
  keywordLimit: number
  summaryMaxLength: number
  contextHeaderLimit: number
}

/**
 * Content analysis result
 */
export interface ContentAnalysisResult {
  language?: string
  keywords?: string[]
  category?: string
  summary?: string
  importance?: number
  readingTime?: number
  wordCount: number
  contextHeaders?: string[]
  searchableText?: string
}

/**
 * Simple language detection patterns
 */
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  ko: [
    /[가-힣]/, // Korean characters
    /[ㄱ-ㅎㅏ-ㅣ]/, // Korean jamo
    /(?:이다|있다|했다|된다)$/m, // Korean verb endings
  ],
  en: [
    /\b(?:the|and|or|but|in|on|at|to|for|of|with|by)\b/gi, // English articles/prepositions
    /\b(?:is|are|was|were|will|would|could|should)\b/gi, // English auxiliary verbs
  ],
  ja: [
    /[ひらがな]/, // Hiragana
    /[カタカナ]/, // Katakana
    /[一-龯]/, // Kanji
    /(?:です|ます|だった|である)$/m, // Japanese verb endings
  ],
  zh: [
    /[一-龯]/, // Chinese characters
    /(?:的|是|在|有|和|了|不|我|你|他)/, // Common Chinese words
  ],
  es: [
    /\b(?:el|la|los|las|un|una|de|en|por|para)\b/gi, // Spanish articles
    /\b(?:que|con|por|para|desde|hasta|entre)\b/gi, // Spanish prepositions
  ],
  fr: [
    /\b(?:le|la|les|un|une|du|de|des|et|ou|mais)\b/gi, // French articles
    /\b(?:dans|sur|avec|pour|par|contre|sans)\b/gi, // French prepositions
  ],
}

/**
 * Category classification keywords
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  technical: [
    'api',
    'code',
    'programming',
    'algorithm',
    'database',
    'server',
    'client',
    'framework',
    'library',
    'development',
    'software',
    'hardware',
    'network',
    'security',
    'authentication',
    'authorization',
    'encryption',
    'protocol',
  ],
  business: [
    'market',
    'customer',
    'revenue',
    'profit',
    'strategy',
    'management',
    'marketing',
    'sales',
    'finance',
    'accounting',
    'budget',
    'investment',
    'partnership',
    'acquisition',
    'merger',
    'compliance',
    'regulation',
  ],
  academic: [
    'research',
    'study',
    'analysis',
    'methodology',
    'hypothesis',
    'conclusion',
    'literature',
    'review',
    'journal',
    'publication',
    'experiment',
    'theory',
    'model',
    'framework',
    'data',
    'statistics',
    'correlation',
    'significance',
  ],
  legal: [
    'contract',
    'agreement',
    'clause',
    'terms',
    'conditions',
    'liability',
    'compliance',
    'regulation',
    'statute',
    'law',
    'legal',
    'court',
    'litigation',
    'settlement',
    'arbitration',
    'jurisdiction',
    'patent',
  ],
  medical: [
    'patient',
    'diagnosis',
    'treatment',
    'therapy',
    'medication',
    'clinical',
    'hospital',
    'doctor',
    'nurse',
    'surgery',
    'procedure',
    'symptom',
    'disease',
    'condition',
    'health',
    'medical',
    'pharmaceutical',
    'dosage',
  ],
  educational: [
    'student',
    'teacher',
    'curriculum',
    'lesson',
    'course',
    'assignment',
    'exam',
    'grade',
    'school',
    'university',
    'education',
    'learning',
    'teaching',
    'instruction',
    'assessment',
    'evaluation',
    'knowledge',
  ],
}

/**
 * Content Analyzer class
 */
export class ContentAnalyzer {
  private config: ContentAnalysisConfig

  constructor(config: Partial<ContentAnalysisConfig> = {}) {
    this.config = {
      enableLanguageDetection: true,
      enableKeywordExtraction: true,
      enableCategoryClassification: true,
      enableSummarization: false, // Disabled by default (requires external service)
      enableContextHeaders: true,
      keywordLimit: 10,
      summaryMaxLength: 200,
      contextHeaderLimit: 5,
      ...config,
    }
  }

  /**
   * Analyze content and extract metadata
   */
  async analyzeContent(
    content: string,
    existingMetadata: Partial<DocumentMetadata> = {}
  ): Promise<ContentAnalysisResult> {
    const startTime = Date.now()

    logger.debug('Starting content analysis', {
      contentLength: content.length,
      enabledFeatures: Object.entries(this.config)
        .filter(([_, enabled]) => enabled === true)
        .map(([feature, _]) => feature),
    })

    const result: ContentAnalysisResult = {
      wordCount: this.countWords(content),
      readingTime: this.estimateReadingTime(content),
    }

    try {
      // Language detection
      if (this.config.enableLanguageDetection) {
        result.language = this.detectLanguage(content)
      }

      // Keyword extraction
      if (this.config.enableKeywordExtraction) {
        result.keywords = this.extractKeywords(content, this.config.keywordLimit)
      }

      // Category classification
      if (this.config.enableCategoryClassification) {
        result.category = this.classifyCategory(content, result.keywords)
      }

      // Importance scoring
      result.importance = this.calculateImportance(content, result)

      // Context headers generation
      if (this.config.enableContextHeaders) {
        result.contextHeaders = this.generateContextHeaders(
          content,
          existingMetadata,
          this.config.contextHeaderLimit
        )

        // Ensure we have at least some context headers
        if (!result.contextHeaders || result.contextHeaders.length === 0) {
          result.contextHeaders = [`Content: ${content.substring(0, 50)}...`]
        }
      }

      // Enhanced searchable text
      result.searchableText = this.generateSearchableText(content, result, existingMetadata)

      // Content summarization (if enabled and configured)
      if (this.config.enableSummarization) {
        result.summary = await this.generateSummary(content, this.config.summaryMaxLength)
      }

      const duration = Date.now() - startTime
      logger.debug('Content analysis completed', {
        duration,
        language: result.language,
        category: result.category,
        keywordCount: result.keywords?.length || 0,
        wordCount: result.wordCount,
        importance: result.importance,
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(
        'Content analysis failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          duration,
          contentLength: content.length,
        }
      )

      // Return basic analysis even if advanced features fail
      return result
    }
  }

  /**
   * Detect content language using pattern matching
   */
  private detectLanguage(content: string): string {
    const text = content.toLowerCase().substring(0, 1000) // Analyze first 1000 chars
    const scores: Record<string, number> = {}

    // Score each language based on pattern matches
    for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      let score = 0
      for (const pattern of patterns) {
        const matches = text.match(pattern)
        if (matches) {
          score += matches.length
        }
      }
      scores[language] = score
    }

    // Find language with highest score
    const detectedLanguage = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .find(([_, score]) => score > 0)

    return detectedLanguage ? detectedLanguage[0] : 'en' // Default to English
  }

  /**
   * Extract keywords using TF-IDF-like approach
   */
  private extractKeywords(content: string, limit: number): string[] {
    const text = content.toLowerCase()

    // Common stop words to exclude
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
    ])

    // Extract words and count frequency
    const words = text
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(
        (word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word) // Exclude pure numbers
      )

    const frequency: Record<string, number> = {}
    words.forEach((word) => {
      frequency[word] = (frequency[word] || 0) + 1
    })

    // Sort by frequency and return top keywords
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word, _]) => word)
  }

  /**
   * Classify content category based on keyword presence
   */
  private classifyCategory(content: string, keywords?: string[]): string {
    const text = content.toLowerCase()
    const allWords = keywords ? [...keywords, ...text.split(/\s+/)] : text.split(/\s+/)

    const categoryScores: Record<string, number> = {}

    for (const [category, categoryKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0
      for (const keyword of categoryKeywords) {
        const occurrences = allWords.filter(
          (word) => word.includes(keyword) || keyword.includes(word)
        ).length
        score += occurrences
      }
      categoryScores[category] = score
    }

    // Find category with highest score
    const topCategory = Object.entries(categoryScores)
      .sort(([, a], [, b]) => b - a)
      .find(([_, score]) => score > 0)

    return topCategory ? topCategory[0] : 'general'
  }

  /**
   * Calculate content importance score
   */
  private calculateImportance(content: string, analysis: ContentAnalysisResult): number {
    let importance = 0.5 // Base importance

    // Boost based on content length (but with diminishing returns)
    const lengthScore = Math.min(content.length / 2000, 1) * 0.2
    importance += lengthScore

    // Boost based on keyword density
    if (analysis.keywords && analysis.keywords.length > 0) {
      const keywordDensity = analysis.keywords.length / Math.max(analysis.wordCount, 1)
      importance += Math.min(keywordDensity * 2, 0.2)
    }

    // Boost technical/academic content
    if (analysis.category === 'technical' || analysis.category === 'academic') {
      importance += 0.1
    }

    // Boost content with structured elements (headers, lists, etc.)
    const structuredElementsCount = (content.match(/^#+\s|^\*\s|^-\s|^\d+\./gm) || []).length
    if (structuredElementsCount > 0) {
      importance += Math.min(structuredElementsCount / 10, 0.2)
    }

    return Math.min(Math.max(importance, 0.1), 1.0) // Clamp between 0.1 and 1.0
  }

  /**
   * Generate context headers for better retrieval
   */
  private generateContextHeaders(
    content: string,
    metadata: Partial<DocumentMetadata>,
    limit: number
  ): string[] {
    const headers: string[] = []

    // Add file-based context
    if (metadata.file?.name) {
      headers.push(`Document: ${metadata.file.name}`)
    }

    // Add section context if available
    if (metadata.structure?.sectionTitle) {
      headers.push(`Section: ${metadata.structure.sectionTitle}`)
    }

    // Add category context
    if (metadata.content?.category) {
      headers.push(`Category: ${metadata.content.category}`)
    }

    // Extract and add content headers (markdown-style)
    const contentHeaders = content.match(/^#+\s+(.+)$/gm)
    if (contentHeaders) {
      contentHeaders.slice(0, limit - headers.length).forEach((header) => {
        const cleanHeader = header.replace(/^#+\s+/, '').trim()
        if (cleanHeader.length > 0) {
          headers.push(`Heading: ${cleanHeader}`)
        }
      })
    }

    return headers.slice(0, limit)
  }

  /**
   * Generate enhanced searchable text
   */
  private generateSearchableText(
    content: string,
    analysis: ContentAnalysisResult,
    metadata: Partial<DocumentMetadata>
  ): string {
    const parts: string[] = [content]

    // Add filename without extension
    if (metadata.file?.name) {
      const nameWithoutExt = metadata.file.name.replace(/\.[^/.]+$/, '')
      parts.push(nameWithoutExt)
    }

    // Add file path components
    if (metadata.file?.path) {
      const pathParts = metadata.file.path.split('/').filter((part: string) => part.length > 0)
      parts.push(...pathParts)
    }

    // Add keywords
    if (analysis.keywords) {
      parts.push(...analysis.keywords)
    }

    // Add category
    if (analysis.category) {
      parts.push(analysis.category)
    }

    // Add context headers content
    if (analysis.contextHeaders) {
      const headerContent = analysis.contextHeaders
        .map((header) => header.split(': ')[1] || header)
        .filter((content) => content)
      parts.push(...headerContent)
    }

    return parts.join(' ')
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    return content
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length
  }

  /**
   * Estimate reading time in minutes (assumes 200 words per minute)
   */
  private estimateReadingTime(content: string): number {
    const wordCount = this.countWords(content)
    return Math.max(1, Math.ceil(wordCount / 200))
  }

  /**
   * Generate content summary (placeholder for external service)
   */
  private async generateSummary(content: string, maxLength: number): Promise<string> {
    // This would typically call an external summarization service
    // For now, return first few sentences as a basic summary
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    const summary = sentences.slice(0, 3).join('. ').trim()

    return summary.length > maxLength ? summary.substring(0, maxLength - 3) + '...' : summary
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContentAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.debug('Content analyzer configuration updated', this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): ContentAnalysisConfig {
    return { ...this.config }
  }
}
