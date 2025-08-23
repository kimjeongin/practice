import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SyncManager, VectorDbSyncReport, VectorDbSyncOptions } from '@/domains/rag/workflows/sync-manager.js';
import { IFileRepository } from '@/domains/rag/repositories/document.js';
import { IChunkRepository } from '@/domains/rag/repositories/chunk.js';
import { IVectorStoreService, IFileProcessingService } from '@/shared/types/interfaces.js';
import { ServerConfig } from '@/shared/types/index.js';
import { logger } from '@/shared/logger/index.js';

export class SyncHandler {
  private syncManager: SyncManager;

  constructor(
    fileRepository: IFileRepository,
    chunkRepository: IChunkRepository,
    vectorStoreService: IVectorStoreService,
    config: ServerConfig,
    fileProcessingService?: IFileProcessingService
  ) {
    this.syncManager = new SyncManager(
      fileRepository,
      chunkRepository,
      vectorStoreService,
      config,
      fileProcessingService
    );
  }

  getTools(): Tool[] {
    return [
      {
        name: 'vector_db_sync_check',
        description: 'Check synchronization status between database and vector store',
        inputSchema: {
          type: 'object',
          properties: {
            deepScan: {
              type: 'boolean',
              description: 'Perform deep scan including file hash verification',
              default: false
            },
            includeNewFiles: {
              type: 'boolean', 
              description: 'Include new files found on filesystem',
              default: true
            },
            autoFix: {
              type: 'boolean',
              description: 'Automatically fix detected issues',
              default: false
            }
          }
        }
      },
      {
        name: 'vector_db_cleanup_orphaned',
        description: 'Clean up orphaned data in vector store and database',
        inputSchema: {
          type: 'object',
          properties: {
            dryRun: {
              type: 'boolean',
              description: 'Preview changes without applying them',
              default: true
            }
          }
        }
      },
      {
        name: 'vector_db_force_sync',
        description: 'Force complete resynchronization of vector database with file system',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              description: 'Confirmation required for destructive operation',
              default: false
            }
          }
        }
      },
      {
        name: 'vector_db_integrity_report',
        description: 'Generate comprehensive vector database integrity report',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['summary', 'detailed', 'json'],
              description: 'Report format',
              default: 'summary'
            }
          }
        }
      }
    ];
  }

  async handleSyncCheck(args: any): Promise<any> {
    const options: Partial<VectorDbSyncOptions> = {
      deepScan: args.deepScan || false,
      includeNewFiles: args.includeNewFiles !== false,
      autoFix: args.autoFix || false,
      maxConcurrency: 3
    };

    logger.info('Starting vector DB sync check', options);

    const report = await this.syncManager.generateSyncReport(options as VectorDbSyncOptions);

    const result = {
      timestamp: report.timestamp,
      summary: report.summary,
      totalFiles: report.totalFiles,
      totalVectors: report.totalVectors,
      totalChunks: report.totalChunks,
      issues: report.issues.map(issue => ({
        type: issue.type,
        filePath: issue.filePath,
        description: issue.description,
        severity: issue.severity
      })),
      autoFixApplied: options.autoFix && report.issues.length > 0,
      fixedIssues: report.fixedIssues.length
    };

    return {
      content: [
        {
          type: 'text',
          text: this.formatSyncReport(result)
        }
      ]
    };
  }

  async handleCleanupOrphaned(args: any): Promise<any> {
    const dryRun = args.dryRun !== false;

    logger.info('Starting vector DB orphaned data cleanup', { dryRun });

    // 먼저 체크하여 고아 데이터 찾기
    const report = await this.syncManager.generateSyncReport({
      autoFix: false,
      deepScan: false,
      includeNewFiles: false,
      maxConcurrency: 3
    });

    const orphanedIssues = report.issues.filter(issue => 
      issue.type === 'orphaned_vector' || issue.type === 'missing_file'
    );

    let result;
    if (dryRun) {
      result = {
        dryRun: true,
        orphanedDataFound: orphanedIssues.length,
        issues: orphanedIssues,
        message: 'Dry run completed. Use autoFix: true to apply changes.'
      };
    } else {
      const fixedIssues = await this.syncManager.fixSyncIssues(orphanedIssues, {
        autoFix: true,
        deepScan: false,
        includeNewFiles: false,
        maxConcurrency: 3
      });

      result = {
        dryRun: false,
        orphanedDataFound: orphanedIssues.length,
        orphanedDataCleaned: fixedIssues.length,
        issues: orphanedIssues,
        fixedIssues: fixedIssues
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: this.formatCleanupReport(result)
        }
      ]
    };
  }

  async handleForceSync(args: any): Promise<any> {
    if (!args.confirm) {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Force vector DB sync is a destructive operation that will rebuild all vector data.\nTo proceed, call again with confirm: true'
          }
        ]
      };
    }

    logger.warn('Starting force vector DB synchronization - destructive operation');

    const report = await this.syncManager.forceSync();

    return {
      content: [
        {
          type: 'text',
          text: `🔄 Force vector DB synchronization completed\n\n` +
                `📊 Post-sync status:\n` +
                `- Total files: ${report.totalFiles}\n` +
                `- Total vectors: ${report.totalVectors}\n` +
                `- Total chunks: ${report.totalChunks}\n` +
                `- Remaining issues: ${report.summary.totalIssues}\n\n` +
                `⚠️ Note: Full reindexing may be required to restore all vector data.`
        }
      ]
    };
  }

  async handleIntegrityReport(args: any): Promise<any> {
    const format = args.format || 'summary';

    const report = await this.syncManager.generateSyncReport({
      autoFix: false,
      deepScan: true,
      includeNewFiles: true,
      maxConcurrency: 3
    });

    let content;
    switch (format) {
      case 'json':
        content = JSON.stringify(report, null, 2);
        break;
      case 'detailed':
        content = this.formatDetailedReport(report);
        break;
      default:
        content = this.formatSummaryReport(report);
    }

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  private formatSyncReport(result: any): string {
    if (!result) {
      return '❌ No vector DB sync report data available';
    }

    const { summary, issues, autoFixApplied, fixedIssues } = result;

    let report = `🔍 Vector Database Synchronization Check Results\n`;
    report += `===============================================\n\n`;
    
    report += `📊 Summary:\n`;
    report += `- Total files: ${result.totalFiles || 0}\n`;
    report += `- Total vectors: ${result.totalVectors || 0}\n`;
    report += `- Total chunks: ${result.totalChunks || 0}\n`;
    report += `- Total issues: ${summary ? summary.totalIssues || 0 : 0}\n\n`;

    if (summary && summary.totalIssues > 0) {
      report += `🚨 Issues Found:\n`;
      report += `- Missing files: ${summary.missingFiles || 0}\n`;
      report += `- Orphaned vectors: ${summary.orphanedVectors || 0}\n`;
      report += `- Hash mismatches: ${summary.hashMismatches || 0}\n`;
      report += `- New files: ${summary.newFiles || 0}\n\n`;

      if (autoFixApplied) {
        const fixedCount = Array.isArray(fixedIssues) ? fixedIssues.length : (fixedIssues || 0);
        report += `✅ Auto-fix applied: ${fixedCount} issues resolved\n`;
      } else {
        report += `💡 Run with autoFix: true to automatically resolve issues\n`;
      }
    } else {
      report += `✅ All vector database data is synchronized and consistent!\n`;
    }

    return report;
  }

  private formatCleanupReport(result: any): string {
    if (!result) {
      return '❌ No vector DB cleanup report data available';
    }

    let report = `🧹 Vector Database Orphaned Data Cleanup\n`;
    report += `=======================================\n\n`;

    if (result.dryRun) {
      report += `📋 Dry Run Results:\n`;
      report += `- Orphaned data items found: ${result.orphanedDataFound || 0}\n\n`;
      if ((result.orphanedDataFound || 0) > 0) {
        report += `🔍 Issues that would be cleaned:\n`;
        if (result.issues && Array.isArray(result.issues)) {
          result.issues.forEach((issue: any, index: number) => {
            if (issue && issue.type && issue.description) {
              report += `${index + 1}. ${issue.type}: ${issue.description}\n`;
            } else {
              report += `${index + 1}. Invalid issue data\n`;
            }
          });
        }
        report += `\n💡 Run with dryRun: false to apply cleanup\n`;
      } else {
        report += `✅ No orphaned vector data found!\n`;
      }
    } else {
      report += `🗑️ Cleanup Results:\n`;
      report += `- Orphaned data items found: ${result.orphanedDataFound || 0}\n`;
      report += `- Orphaned data items cleaned: ${result.orphanedDataCleaned || 0}\n\n`;
      
      if ((result.orphanedDataCleaned || 0) > 0) {
        report += `✅ Vector DB cleanup completed successfully!\n`;
      } else {
        report += `ℹ️ No cleanup was necessary\n`;
      }
    }

    return report;
  }

  private formatSummaryReport(report: VectorDbSyncReport): string {
    if (!report) {
      return '❌ No vector DB integrity report data available';
    }

    let summary = `📋 Vector Database Integrity Report\n`;
    summary += `==================================\n\n`;
    summary += `📊 Overview:\n`;
    
    try {
      summary += `- Timestamp: ${report.timestamp ? report.timestamp.toISOString() : 'Unknown'}\n`;
    } catch (error) {
      summary += `- Timestamp: Invalid timestamp\n`;
    }
    
    summary += `- Total files: ${report.totalFiles || 0}\n`;
    summary += `- Total vectors: ${report.totalVectors || 0}\n`;
    summary += `- Total chunks: ${report.totalChunks || 0}\n`;
    summary += `- Issues found: ${report.summary ? report.summary.totalIssues || 0 : 0}\n\n`;

    if (report.summary && report.summary.totalIssues > 0) {
      summary += `🚨 Issue Breakdown:\n`;
      summary += `- Missing files: ${report.summary.missingFiles || 0}\n`;
      summary += `- Orphaned vectors: ${report.summary.orphanedVectors || 0}\n`;
      summary += `- Hash mismatches: ${report.summary.hashMismatches || 0}\n`;
      summary += `- New files: ${report.summary.newFiles || 0}\n`;
    } else {
      summary += `✅ Vector database is healthy - no issues detected!\n`;
    }

    return summary;
  }

  private formatDetailedReport(report: VectorDbSyncReport): string {
    let detailed = this.formatSummaryReport(report);

    if (!report) {
      return detailed;
    }

    if (report.issues && Array.isArray(report.issues) && report.issues.length > 0) {
      detailed += `\n🔍 Detailed Issues:\n`;
      detailed += `===================\n`;
      
      report.issues.forEach((issue, index) => {
        if (!issue) {
          detailed += `\n${index + 1}. Invalid issue data\n`;
          return;
        }

        const issueType = issue.type ? issue.type.toUpperCase() : 'UNKNOWN';
        const filePath = issue.filePath || 'Unknown path';
        const description = issue.description || 'No description available';
        const severity = issue.severity || 'unknown';

        detailed += `\n${index + 1}. ${issueType}\n`;
        detailed += `   Path: ${filePath}\n`;
        detailed += `   Description: ${description}\n`;
        detailed += `   Severity: ${severity}\n`;
      });
    }

    return detailed;
  }

  /**
   * Get background integrity status
   */
  async getIntegrityStatus() {
    try {
      if (!this.syncManager) {
        throw new Error('SyncManager not available for integrity status check');
      }

      const report = await this.syncManager.generateSyncReport({
        autoFix: false,
        deepScan: false,
        includeNewFiles: false,
        maxConcurrency: 1
      });

      if (!report) {
        logger.warn('Vector DB integrity status check returned no report');
        return {
          isHealthy: false,
          lastCheck: new Date(),
          error: 'No report generated'
        };
      }

      let criticalIssues = [];
      if (report.issues && Array.isArray(report.issues)) {
        criticalIssues = report.issues.filter(issue => {
          if (!issue || !issue.type) {
            return false;
          }
          return issue.type === 'missing_file' || 
                 issue.type === 'orphaned_vector' ||
                 issue.type === 'hash_mismatch';
        });
      }

      const hasIntegrityIssues = criticalIssues.length > 0;
      
      return {
        isHealthy: !hasIntegrityIssues,
        lastCheck: new Date(),
        issueCount: report.summary ? report.summary.totalIssues : 0,
        criticalIssues: criticalIssues.length,
        summary: report.summary || {}
      };
    } catch (error) {
      logger.error('Failed to get vector DB integrity status', error instanceof Error ? error : new Error(String(error)));
      return {
        isHealthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}