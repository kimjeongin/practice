/**
 * Korean Tokenizer Service
 * Simplified Korean text tokenization using es-hangul
 */

import { getChoseong } from 'es-hangul';

export class KoreanTokenizer {
  /**
   * Basic Korean tokenization
   * Combines space-based splitting with particle separation
   */
  tokenizeKorean(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // 1. Basic space-based tokenization
    const basicTokens = text.trim().split(/\s+/);
    
    // 2. Particle separation
    const result: string[] = [];
    const commonParticles = [
      '이', '가',      // subject particles
      '을', '를',      // object particles  
      '은', '는',      // topic particles
      '의',            // possessive particle
      '에',            // location/time particle
      '로', '으로',    // direction/method particles
      '와', '과',      // conjunction particles
      '도',            // addition particle
      '만',            // exclusive particle
      '부터', '까지',  // starting/ending particles
    ];
    
    basicTokens.forEach(token => {
      // Always keep the original token
      result.push(token);
      
      // Try to separate common particles
      for (const particle of commonParticles) {
        if (token.endsWith(particle) && token.length > particle.length) {
          const stem = token.slice(0, -particle.length);
          if (stem.length > 0 && /[가-힣]/.test(stem)) {
            result.push(stem); // Add stem if it contains Korean characters
          }
        }
      }
    });
    
    // Remove duplicates and filter invalid tokens
    return [...new Set(result)].filter(token => 
      token.length > 0 && 
      token.length <= 40 && 
      token !== ' '
    );
  }

  /**
   * Extract initial consonants (choseong) for Korean text
   * Used for ㄱㄴㄷ search functionality
   */
  extractInitials(text: string): string {
    if (!text || text.trim().length === 0) {
      return '';
    }

    // Extract only Korean characters and spaces
    const koreanText = text.replace(/[^가-힣\s]/g, ' ');
    const words = koreanText.trim().split(/\s+/).filter(word => word.length > 0);
    
    if (words.length === 0) {
      return '';
    }

    // Extract initial consonants from each Korean word
    const initialConsonants = words
      .map(word => getChoseong(word))
      .filter(initial => initial.length > 0)
      .join(' ');
    
    return initialConsonants;
  }

  /**
   * Extract individual initial consonant characters
   * For granular initial consonant searching
   */
  extractInitialCharacters(text: string): string[] {
    const initialString = this.extractInitials(text);
    if (!initialString) {
      return [];
    }

    // Split into individual consonant characters and remove duplicates
    return [...new Set(initialString.replace(/\s+/g, '').split(''))];
  }

  /**
   * Check if text contains Korean characters
   */
  hasKorean(text: string): boolean {
    return /[가-힣]/.test(text);
  }

  /**
   * Get basic statistics about Korean text
   */
  getTokenizationStats(text: string): {
    originalLength: number;
    tokens: string[];
    tokenCount: number;
    initialConsonants: string;
    hasKorean: boolean;
  } {
    const tokens = this.tokenizeKorean(text);
    const initialConsonants = this.extractInitials(text);
    
    return {
      originalLength: text.length,
      tokens,
      tokenCount: tokens.length,
      initialConsonants,
      hasKorean: this.hasKorean(text),
    };
  }
}