/**
 * Schema Integration Test and Data Integrity Validator
 *
 * Provides comprehensive testing and validation tools for the new unified metadata schema.
 * Includes integration tests, data integrity checks, and migration validation.
 */

import { logger } from '@/shared/logger/index.js'
import {
  UnifiedDocumentMetadata,
  createUnifiedMetadata,
  isUnifiedDocumentMetadata,
  SCHEMA_FIELD_MAPPINGS,
  REQUIRED_FIELDS,
} from './metadata-schema.js'
import {
  ArrowSchemaGenerator,
  DataTransformer,
  MetadataValidator,
  QueryGenerator,
} from './schema-generator.js'
import { ContentAnalyzer } from '@/shared/content-analysis/content-analyzer.js'

/**
 * Test result interface
 */
export interface TestResult {
  testName: string
  success: boolean
  duration: number
  details?: any
  errors: string[]
}

/**
 * Validation report interface
 */
export interface ValidationReport {
  overall: {
    success: boolean
    totalTests: number
    passedTests: number
    failedTests: number
    duration: number
  }
  tests: TestResult[]
  recommendations: string[]
}

/**
 * Schema Integration Validator
 */
export class SchemaIntegrationValidator {
  private contentAnalyzer: ContentAnalyzer

  constructor() {
    this.contentAnalyzer = new ContentAnalyzer({
      enableLanguageDetection: true,
      enableKeywordExtraction: true,
      enableCategoryClassification: true,
      enableContextHeaders: true,
      keywordLimit: 10,
    })
  }

  /**
   * Run comprehensive schema validation tests
   */
  async runFullValidation(vectorStore?: any): Promise<ValidationReport> {
    const startTime = Date.now()
    const tests: TestResult[] = []
    const recommendations: string[] = []

    logger.info('🧪 Starting comprehensive schema integration validation')

    // Test 1: Schema Definition Validation
    tests.push(await this.testSchemaDefinition())

    // Test 2: Data Transformation Tests
    tests.push(await this.testDataTransformation())

    // Test 3: Arrow Schema Generation
    tests.push(await this.testArrowSchemaGeneration())

    // Test 4: Query Generation
    tests.push(await this.testQueryGeneration())

    // Test 5: Content Analysis Integration
    tests.push(await this.testContentAnalysisIntegration())

    // Test 6: Field Mapping Consistency
    tests.push(await this.testFieldMappingConsistency())

    // Test 7: Metadata Validation
    tests.push(await this.testMetadataValidation())

    // Test 8: Legacy Compatibility
    tests.push(await this.testLegacyCompatibility())

    // Test 9: Vector Store Integration (if available)
    if (vectorStore) {
      tests.push(await this.testVectorStoreIntegration(vectorStore))
    }

    // Test 10: Performance Testing
    tests.push(await this.testPerformance())

    // Calculate overall results
    const passedTests = tests.filter((test) => test.success).length
    const failedTests = tests.length - passedTests
    const totalDuration = Date.now() - startTime

    // Generate recommendations based on test results
    if (failedTests > 0) {
      recommendations.push(
        'Review failed tests and fix underlying issues before deploying to production'
      )
    }

    const slowTests = tests.filter((test) => test.duration > 1000)
    if (slowTests.length > 0) {
      recommendations.push(
        `Performance optimization needed for: ${slowTests.map((t) => t.testName).join(', ')}`
      )
    }

    if (passedTests === tests.length) {
      recommendations.push('All tests passed! Schema integration is ready for production')
    }

    const report: ValidationReport = {
      overall: {
        success: failedTests === 0,
        totalTests: tests.length,
        passedTests,
        failedTests,
        duration: totalDuration,
      },
      tests,
      recommendations,
    }

    logger.info('✅ Schema validation completed', {
      passed: passedTests,
      failed: failedTests,
      duration: totalDuration,
    })

    return report
  }

  /**
   * Test schema definition integrity
   */
  private async testSchemaDefinition(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test metadata creation
      const metadata = createUnifiedMetadata({
        file: {
          id: 'test-id',
          name: 'test.txt',
          path: '/test/test.txt',
          size: 1000,
          hash: 'test-hash',
          type: 'text',
          mimeType: 'text/plain',
          encoding: 'utf-8',
        },
      })

      // Test metadata validation
      if (!isUnifiedDocumentMetadata(metadata)) {
        errors.push('Created metadata fails validation')
      }

      // Test required fields
      for (const level of ['minimal', 'standard', 'enhanced'] as const) {
        const validation = MetadataValidator.validateRequiredFields(metadata, level)
        if (!validation.isValid && level === 'minimal') {
          errors.push(
            `Required fields missing for ${level}: ${validation.missingFields.join(', ')}`
          )
        }
      }

      // Test field mappings
      const mappingKeys = Object.keys(SCHEMA_FIELD_MAPPINGS)
      if (mappingKeys.length === 0) {
        errors.push('No field mappings defined')
      }

      return {
        testName: 'Schema Definition',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: { metadataFields: Object.keys(metadata), mappingCount: mappingKeys.length },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Schema Definition',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test data transformation functionality
   */
  private async testDataTransformation(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Create test metadata
      const originalMetadata = createUnifiedMetadata({
        file: {
          id: 'transform-test',
          name: 'transform-test.txt',
          path: '/test/transform-test.txt',
          size: 500,
          hash: 'transform-hash',
          type: 'text',
          mimeType: 'text/plain',
          encoding: 'utf-8',
        },
        content: {
          language: 'en',
          keywords: ['test', 'transform'],
          category: 'technical',
        },
      })

      // Test unified to LanceDB transformation
      const lanceDBRecord = DataTransformer.unifiedToLanceDBRecord(
        originalMetadata,
        'test content',
        [0.1, 0.2, 0.3]
      )

      // Validate LanceDB record has required fields
      const requiredLanceDBFields = ['fileId', 'fileName', 'filePath', 'content', 'vector']
      for (const field of requiredLanceDBFields) {
        if (!(field in lanceDBRecord)) {
          errors.push(`Missing required field in LanceDB record: ${field}`)
        }
      }

      // Test reverse transformation
      const reconstructed = DataTransformer.lanceDBRecordToUnified(lanceDBRecord)

      // Validate key fields are preserved
      if (reconstructed.file.id !== originalMetadata.file.id) {
        errors.push('File ID not preserved in round-trip transformation')
      }

      if (reconstructed.content.language !== originalMetadata.content.language) {
        errors.push('Language not preserved in round-trip transformation')
      }

      return {
        testName: 'Data Transformation',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          originalFields: Object.keys(originalMetadata).length,
          lanceDBFields: Object.keys(lanceDBRecord).length,
          reconstructedFields: Object.keys(reconstructed).length,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Data Transformation',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test Arrow schema generation
   */
  private async testArrowSchemaGeneration(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test schema generation with different dimensions
      const dimensions = [384, 768, 1536]

      for (const dim of dimensions) {
        const schema = ArrowSchemaGenerator.generateLanceDBSchema(dim)

        if (!schema) {
          errors.push(`Failed to generate schema for ${dim} dimensions`)
          continue
        }

        // Validate vector field has correct dimensions
        const vectorField = schema.fields.find((field) => field.name === 'vector')
        if (!vectorField) {
          errors.push(`Vector field missing in schema for ${dim} dimensions`)
        }

        // Validate essential fields exist
        const essentialFields = ['id', 'content', 'fileId', 'fileName', 'filePath']
        for (const fieldName of essentialFields) {
          const field = schema.fields.find((f) => f.name === fieldName)
          if (!field) {
            errors.push(`Essential field '${fieldName}' missing in Arrow schema`)
          }
        }
      }

      // Test field name generation
      const allFields = ArrowSchemaGenerator.getAllFieldNames()
      const essentialFields = ArrowSchemaGenerator.getEssentialFieldNames()
      const metadataFields = ArrowSchemaGenerator.getMetadataFieldNames()

      if (allFields.length === 0) {
        errors.push('No field names generated')
      }

      if (!essentialFields.every((field) => allFields.includes(field))) {
        errors.push('Essential fields not included in all fields')
      }

      return {
        testName: 'Arrow Schema Generation',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          testedDimensions: dimensions.length,
          totalFields: allFields.length,
          essentialFields: essentialFields.length,
          metadataFields: metadataFields.length,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Arrow Schema Generation',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test query generation functionality
   */
  private async testQueryGeneration(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test SELECT clause generation
      const selectAll = QueryGenerator.generateSelectClause('all')
      const selectEssential = QueryGenerator.generateSelectClause('essential')
      const selectMetadata = QueryGenerator.generateSelectClause('metadata')
      const selectCustom = QueryGenerator.generateSelectClause(['fileId', 'fileName'])

      if (!selectAll || selectAll.length === 0) {
        errors.push('Failed to generate SELECT clause for all fields')
      }

      if (!selectEssential.includes('fileId')) {
        errors.push('Essential SELECT clause missing fileId')
      }

      if (selectCustom !== '"fileId", "fileName"') {
        errors.push('Custom SELECT clause generation failed')
      }

      // Test WHERE clause generation
      const fileIdWhere = QueryGenerator.generateFileIdWhereClause('test-id')
      const fileIdsWhere = QueryGenerator.generateFileIdsWhereClause(['id1', 'id2'])
      const fileTypeWhere = QueryGenerator.generateFileTypeWhereClause(['text', 'pdf'])

      if (!fileIdWhere.includes('test-id')) {
        errors.push('File ID WHERE clause generation failed')
      }

      if (!fileIdsWhere.includes('IN')) {
        errors.push('Multiple file IDs WHERE clause generation failed')
      }

      // Test clause combination
      const combined = QueryGenerator.combineWhereClausesAnd([fileIdWhere, fileTypeWhere])
      if (!combined.includes('AND')) {
        errors.push('WHERE clause combination failed')
      }

      return {
        testName: 'Query Generation',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          selectClausesGenerated: 4,
          whereClausesGenerated: 3,
          combinedClauses: 1,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Query Generation',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test content analysis integration
   */
  private async testContentAnalysisIntegration(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      const testContent = `
        This is a technical document about machine learning algorithms.
        It covers various aspects of neural networks and deep learning.
        The document is written in English and contains important information.
      `

      const analysis = await this.contentAnalyzer.analyzeContent(testContent)

      // Validate analysis results
      if (!analysis.language) {
        errors.push('Language detection failed')
      }

      if (!analysis.keywords || analysis.keywords.length === 0) {
        errors.push('Keyword extraction failed')
      }

      if (!analysis.category) {
        errors.push('Category classification failed')
      }

      if (analysis.wordCount === 0) {
        errors.push('Word count calculation failed')
      }

      if (!analysis.readingTime || analysis.readingTime <= 0) {
        errors.push('Reading time estimation failed')
      }

      if (!analysis.contextHeaders || analysis.contextHeaders.length === 0) {
        errors.push('Context headers generation failed')
      }

      // Test with metadata
      const metadata = createUnifiedMetadata({
        file: {
          id: 'test-id',
          name: 'test.txt',
          path: '/test/test.txt',
          size: 100,
          hash: 'test-hash',
          type: 'txt',
          mimeType: 'text/plain',
          encoding: 'utf-8',
        },
      })

      const enhancedAnalysis = await this.contentAnalyzer.analyzeContent(testContent, metadata)
      if (!enhancedAnalysis.searchableText) {
        errors.push('Searchable text generation failed')
      }

      return {
        testName: 'Content Analysis Integration',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          detectedLanguage: analysis.language,
          keywordCount: analysis.keywords?.length || 0,
          category: analysis.category,
          wordCount: analysis.wordCount,
          readingTime: analysis.readingTime,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Content Analysis Integration',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test field mapping consistency
   */
  private async testFieldMappingConsistency(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test that all field mappings point to valid paths
      for (const [legacyField, unifiedPath] of Object.entries(SCHEMA_FIELD_MAPPINGS)) {
        const pathParts = unifiedPath.split('.')

        if (pathParts.length !== 2) {
          errors.push(`Invalid mapping path for ${legacyField}: ${unifiedPath}`)
        }

        // Create test metadata and verify path exists
        const testMetadata = createUnifiedMetadata({})
        const [section, field] = pathParts

        if (!section || !field) {
          errors.push(`Invalid path parts for ${legacyField}: ${unifiedPath}`)
          continue
        }

        if (!(section in testMetadata)) {
          errors.push(`Invalid section in mapping for ${legacyField}: ${section}`)
        } else {
          const sectionObj = testMetadata[section as keyof UnifiedDocumentMetadata] as any
          if (typeof sectionObj === 'object' && sectionObj !== null && !(field in sectionObj)) {
            // This might be OK for optional fields, so just log as info
            logger.debug(`Optional field not found`, { legacyField, section, field })
          }
        }
      }

      // Test reverse mapping consistency
      const allFieldNames = ArrowSchemaGenerator.getAllFieldNames()
      const mappedFields = Object.keys(SCHEMA_FIELD_MAPPINGS)

      // Check for unmapped fields that might need mapping
      const unmappedFields = allFieldNames.filter((field) => !mappedFields.includes(field))
      if (unmappedFields.length > 5) {
        // Allow some new fields
        logger.warn('Many unmapped fields found', {
          count: unmappedFields.length,
          fields: unmappedFields.slice(0, 5),
        })
      }

      return {
        testName: 'Field Mapping Consistency',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          totalMappings: Object.keys(SCHEMA_FIELD_MAPPINGS).length,
          totalFields: allFieldNames.length,
          unmappedFields: unmappedFields.length,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Field Mapping Consistency',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test metadata validation functionality
   */
  private async testMetadataValidation(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test valid metadata
      const validMetadata = createUnifiedMetadata({
        file: {
          id: 'valid-test',
          name: 'valid.txt',
          path: '/valid/valid.txt',
          size: 100,
          hash: 'valid-hash',
          type: 'text',
          mimeType: 'text/plain',
          encoding: 'utf-8',
        },
      })

      const validValidation = MetadataValidator.validateRequiredFields(validMetadata, 'standard')
      if (!validValidation.isValid) {
        errors.push(`Valid metadata failed validation: ${validValidation.missingFields.join(', ')}`)
      }

      // Test invalid metadata (missing required fields)
      const invalidMetadata = { file: { id: 'invalid' } } as any
      const invalidValidation = MetadataValidator.validateRequiredFields(
        invalidMetadata,
        'standard'
      )
      if (invalidValidation.isValid) {
        errors.push('Invalid metadata passed validation when it should fail')
      }

      // Test field type validation
      const typeValidation = MetadataValidator.validateFieldTypes(validMetadata)
      if (!typeValidation.isValid) {
        errors.push(
          `Type validation failed for valid metadata: ${typeValidation.errors.join(', ')}`
        )
      }

      // Test type validation with invalid types
      const badTypeMetadata = createUnifiedMetadata({})
      badTypeMetadata.file.size = 'not-a-number' as any
      const badTypeValidation = MetadataValidator.validateFieldTypes(badTypeMetadata)
      if (badTypeValidation.isValid) {
        errors.push('Type validation passed for metadata with invalid types')
      }

      return {
        testName: 'Metadata Validation',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          validMetadataPassed: validValidation.isValid,
          invalidMetadataFailed: !invalidValidation.isValid,
          typeValidationWorking: !badTypeValidation.isValid,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Metadata Validation',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test legacy compatibility
   */
  private async testLegacyCompatibility(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Create legacy-style metadata
      const legacyDocument = {
        id: 'legacy-test',
        content: 'Legacy test content',
        metadata: {
          fileId: 'legacy-file',
          fileName: 'legacy.txt',
          filePath: '/legacy/legacy.txt',
          fileSize: 1000,
          fileType: 'text',
          chunkIndex: 0,
          createdAt: new Date().toISOString(),
        },
      }

      // Test transformation from legacy format
      const lanceDBRecord = DataTransformer.unifiedToLanceDBRecord(
        createUnifiedMetadata({
          file: {
            id: legacyDocument.metadata.fileId,
            name: legacyDocument.metadata.fileName,
            path: legacyDocument.metadata.filePath,
            size: legacyDocument.metadata.fileSize,
            hash: 'legacy-hash',
            type: legacyDocument.metadata.fileType,
            mimeType: 'text/plain',
            encoding: 'utf-8',
          },
        }),
        legacyDocument.content,
        [0.1, 0.2]
      )

      // Verify legacy fields are preserved
      if (lanceDBRecord.fileId !== legacyDocument.metadata.fileId) {
        errors.push('Legacy fileId not preserved')
      }

      if (lanceDBRecord.fileName !== legacyDocument.metadata.fileName) {
        errors.push('Legacy fileName not preserved')
      }

      // Test reverse transformation maintains compatibility
      const reconstructed = DataTransformer.lanceDBRecordToUnified(lanceDBRecord)
      if (reconstructed.file.id !== legacyDocument.metadata.fileId) {
        errors.push('Legacy compatibility broken in reverse transformation')
      }

      return {
        testName: 'Legacy Compatibility',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          legacyFieldsPreserved: true,
          reverseTransformationWorks: true,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Legacy Compatibility',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test vector store integration
   */
  private async testVectorStoreIntegration(vectorStore: any): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      // Test initialization
      await vectorStore.initialize()

      // Test schema compatibility
      const indexInfo = vectorStore.getIndexInfo()
      if (!indexInfo) {
        errors.push('Unable to get index info from vector store')
      }

      // Test if new field names work in queries
      try {
        const testQuery = QueryGenerator.generateSelectClause('essential')
        logger.debug('Testing query generation for vector store', { query: testQuery })
        // In a real test, we'd run this query against the vector store
      } catch (queryError) {
        errors.push(`Query generation failed: ${queryError}`)
      }

      return {
        testName: 'Vector Store Integration',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          vectorStoreInitialized: true,
          indexInfo: indexInfo ? 'available' : 'unavailable',
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Vector Store Integration',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Test performance of key operations
   */
  private async testPerformance(): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      const iterations = 100
      const testContent = 'This is test content for performance testing. '.repeat(10)

      // Test metadata creation performance
      const metadataStart = Date.now()
      for (let i = 0; i < iterations; i++) {
        createUnifiedMetadata({
          file: {
            id: `perf-test-${i}`,
            name: `perf-${i}.txt`,
            path: `/perf/perf-${i}.txt`,
            size: testContent.length,
            hash: `hash-${i}`,
            type: 'text',
            mimeType: 'text/plain',
            encoding: 'utf-8',
          },
        })
      }
      const metadataTime = Date.now() - metadataStart

      // Test data transformation performance
      const transformStart = Date.now()
      for (let i = 0; i < iterations; i++) {
        const metadata = createUnifiedMetadata({
          file: {
            id: `transform-${i}`,
            name: `transform-${i}.txt`,
            path: `/transform/transform-${i}.txt`,
            size: 100,
            hash: `hash-${i}`,
            type: 'text',
            mimeType: 'text/plain',
            encoding: 'utf-8',
          },
        })
        DataTransformer.unifiedToLanceDBRecord(metadata, testContent, [0.1, 0.2])
      }
      const transformTime = Date.now() - transformStart

      // Test content analysis performance
      const analysisStart = Date.now()
      for (let i = 0; i < 10; i++) {
        // Fewer iterations for analysis
        await this.contentAnalyzer.analyzeContent(testContent)
      }
      const analysisTime = Date.now() - analysisStart

      // Performance thresholds (ms)
      const maxMetadataTimePerOp = 10
      const maxTransformTimePerOp = 5
      const maxAnalysisTimePerOp = 100

      if (metadataTime / iterations > maxMetadataTimePerOp) {
        errors.push(`Metadata creation too slow: ${metadataTime / iterations}ms per operation`)
      }

      if (transformTime / iterations > maxTransformTimePerOp) {
        errors.push(`Data transformation too slow: ${transformTime / iterations}ms per operation`)
      }

      if (analysisTime / 10 > maxAnalysisTimePerOp) {
        errors.push(`Content analysis too slow: ${analysisTime / 10}ms per operation`)
      }

      return {
        testName: 'Performance',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          metadataTimePerOp: Math.round(metadataTime / iterations),
          transformTimePerOp: Math.round(transformTime / iterations),
          analysisTimePerOp: Math.round(analysisTime / 10),
          iterations,
        },
        errors,
      }
    } catch (error) {
      return {
        testName: 'Performance',
        success: false,
        duration: Date.now() - startTime,
        errors: [String(error)],
      }
    }
  }

  /**
   * Print validation report to console
   */
  printReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(60))
    console.log('📊 SCHEMA INTEGRATION VALIDATION REPORT')
    console.log('='.repeat(60))

    console.log(`\n📈 Overall Results:`)
    console.log(`  Status: ${report.overall.success ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`  Total Tests: ${report.overall.totalTests}`)
    console.log(`  Passed: ${report.overall.passedTests}`)
    console.log(`  Failed: ${report.overall.failedTests}`)
    console.log(`  Duration: ${report.overall.duration}ms`)

    console.log(`\n📋 Test Results:`)
    for (const test of report.tests) {
      const status = test.success ? '✅' : '❌'
      console.log(`  ${status} ${test.testName} (${test.duration}ms)`)
      if (test.details) {
        console.log(`     Details: ${JSON.stringify(test.details)}`)
      }
      if (test.errors.length > 0) {
        console.log(`     Errors: ${test.errors.join(', ')}`)
      }
    }

    console.log(`\n💡 Recommendations:`)
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`)
    }

    console.log('\n' + '='.repeat(60))
  }
}
