/**
 * Simplified multilingual language detector
 * Detects Korean or English content without mixed classification
 */

export type LanguageType = 'ko' | 'en';

export interface LanguageDetectionResult {
  language: LanguageType;
  confidence: number;
  koreanRatio: number;
  englishRatio: number;
  primaryLanguage: LanguageType; // The dominant language in mixed content
}

export class LanguageDetector {
  /**
   * Detect language of text with confidence scoring
   */
  detectLanguage(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        language: 'en',
        confidence: 0,
        koreanRatio: 0,
        englishRatio: 0,
        primaryLanguage: 'en'
      };
    }

    const cleanText = text.trim();
    const totalChars = cleanText.length;

    // Count Korean characters (Hangul syllables)
    const koreanChars = (cleanText.match(/[가-힣]/g) || []).length;
    const koreanRatio = koreanChars / totalChars;

    // Count English characters
    const englishChars = (cleanText.match(/[a-zA-Z]/g) || []).length;
    const englishRatio = englishChars / totalChars;

    // Simplified language detection logic (no mixed classification)
    let language: LanguageType;
    let confidence: number;
    let primaryLanguage: LanguageType;

    if (koreanRatio >= 0.2) {
      // Korean threshold: 20% or more Korean characters
      language = 'ko';
      primaryLanguage = 'ko';
      confidence = koreanRatio + (koreanRatio > 0.5 ? 0.3 : 0.1);
    } else if (englishRatio >= 0.3) {
      // English threshold: 30% or more English characters
      language = 'en';
      primaryLanguage = 'en';
      confidence = englishRatio + (englishRatio > 0.6 ? 0.3 : 0.1);
    } else {
      // Ambiguous content - default to English but track primary language
      language = 'en';
      primaryLanguage = koreanRatio > englishRatio ? 'ko' : 'en';
      confidence = 0.4; // Low confidence for ambiguous content
    }

    return {
      language,
      confidence: Math.min(confidence, 1.0),
      koreanRatio,
      englishRatio,
      primaryLanguage
    };
  }

  /**
   * Quick language check for simple use cases
   */
  isKorean(text: string): boolean {
    return this.detectLanguage(text).language === 'ko';
  }

  /**
   * Quick language check for simple use cases
   */
  isEnglish(text: string): boolean {
    return this.detectLanguage(text).language === 'en';
  }

  /**
   * Check if text contains mixed languages (for informational purposes)
   */
  isMixedContent(text: string): boolean {
    const result = this.detectLanguage(text);
    return result.koreanRatio > 0.1 && result.englishRatio > 0.1;
  }
}