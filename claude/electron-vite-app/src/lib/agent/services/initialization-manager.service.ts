import { EventEmitter } from 'events'

/**
 * Initialization stages for the agent system
 */
export enum InitializationStage {
  NOT_STARTED = 'not_started',
  DATABASE = 'database',
  MCP_LOADER = 'mcp_loader',
  AGENT_SERVICES = 'agent_services',
  SYSTEM_READY = 'system_ready',
  FAILED = 'failed',
}

/**
 * Initialization progress info
 */
export interface InitializationProgress {
  stage: InitializationStage
  progress: number // 0-100
  message: string
  error?: string
  timestamp: Date
}

/**
 * Central initialization manager for the agent system
 * Ensures proper initialization order and dependency management
 */
export class InitializationManager extends EventEmitter {
  private currentStage: InitializationStage = InitializationStage.NOT_STARTED
  private progress = 0
  private startTime: Date | null = null
  private stageErrors: Record<string, string> = {}
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null

  constructor() {
    super()
    this.setMaxListeners(20)
  }

  /**
   * Get current initialization status
   */
  getStatus(): InitializationProgress {
    return {
      stage: this.currentStage,
      progress: this.progress,
      message: this.getStageMessage(this.currentStage),
      error: this.stageErrors[this.currentStage],
      timestamp: new Date(),
    }
  }

  /**
   * Check if system is fully initialized
   */
  isSystemReady(): boolean {
    return this.currentStage === InitializationStage.SYSTEM_READY
  }

  /**
   * Initialize the entire agent system with proper sequencing
   */
  async initialize(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    if (this.isInitialized) {
      console.log('✅ System already initialized')
      return
    }

    this.initializationPromise = this.performInitialization()
    return this.initializationPromise
  }

  /**
   * Perform the actual initialization sequence
   */
  private async performInitialization(): Promise<void> {
    this.startTime = new Date()
    console.log('🚀 Starting system initialization sequence...')

    try {
      // Stage 1: Database
      await this.executeStage(InitializationStage.DATABASE, async () => {
        const { db } = await import('../../database/db')
        await db.initialize()
        console.log('✅ Database initialized successfully')
      })

      // Stage 2: MCP Loader
      await this.executeStage(InitializationStage.MCP_LOADER, async () => {
        const { initializeMCPLoaderService } = await import('./mcp-loader.service')
        const mcpLoader = await initializeMCPLoaderService()
        await mcpLoader.initialize()
        console.log('✅ MCP Loader initialized successfully')
      })

      // Stage 3: Agent Services
      await this.executeStage(InitializationStage.AGENT_SERVICES, async () => {
        // Initialize conversation manager
        const { initializeConversationManager } = await import('./conversation-manager.service')
        const conversationManager = await initializeConversationManager()
        await conversationManager.initialize()

        // Initialize LangGraph agent
        const { initializeLangGraphAgent } = await import('./langgraph-agent.service')
        const agent = await initializeLangGraphAgent()
        await agent.initialize()

        console.log('✅ Agent services initialized successfully')
      })

      // Final stage: System ready
      this.setStage(InitializationStage.SYSTEM_READY, 100)
      this.isInitialized = true

      const duration = Date.now() - (this.startTime?.getTime() || Date.now())
      console.log(`✅ System initialization completed in ${duration}ms`)

      this.emit('initialized', this.getStatus())
    } catch (error) {
      await this.handleInitializationFailure(error)
    }
  }

  /**
   * Execute a single initialization stage
   */
  private async executeStage(
    stage: InitializationStage,
    initializer: () => Promise<void>
  ): Promise<void> {
    const stageProgress = this.getStageProgressRange(stage)
    this.setStage(stage, stageProgress.start)

    try {
      await initializer()
      this.setStage(stage, stageProgress.end)

      // Small delay to show progress visually
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.stageErrors[stage] = errorMessage
      console.error(`❌ Failed to initialize ${stage}:`, error)
      throw error
    }
  }

  /**
   * Handle initialization failure
   */
  private async handleInitializationFailure(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    this.currentStage = InitializationStage.FAILED
    this.stageErrors[InitializationStage.FAILED] = errorMessage

    console.error('❌ System initialization failed:', error)

    // Emit failure event
    this.emit('failed', {
      stage: this.currentStage,
      error: errorMessage,
      timestamp: new Date(),
    })

    // Reset for potential retry
    this.initializationPromise = null

    throw error
  }

  /**
   * Set current stage and progress
   */
  private setStage(stage: InitializationStage, progress: number): void {
    this.currentStage = stage
    this.progress = Math.max(0, Math.min(100, progress))

    const status = this.getStatus()
    console.log(`📊 Initialization: ${stage} (${progress}%) - ${status.message}`)

    this.emit('progress', status)
  }

  /**
   * Get human-readable message for each stage
   */
  private getStageMessage(stage: InitializationStage): string {
    switch (stage) {
      case InitializationStage.NOT_STARTED:
        return 'Preparing to initialize...'
      case InitializationStage.DATABASE:
        return 'Setting up database connections...'
      case InitializationStage.MCP_LOADER:
        return 'Connecting to MCP servers...'
      case InitializationStage.AGENT_SERVICES:
        return 'Initializing AI agent services...'
      case InitializationStage.SYSTEM_READY:
        return 'System ready!'
      case InitializationStage.FAILED:
        return 'Initialization failed'
      default:
        return 'Unknown stage'
    }
  }

  /**
   * Get progress range for each stage
   */
  private getStageProgressRange(stage: InitializationStage): { start: number; end: number } {
    switch (stage) {
      case InitializationStage.DATABASE:
        return { start: 0, end: 30 }
      case InitializationStage.MCP_LOADER:
        return { start: 30, end: 60 }
      case InitializationStage.AGENT_SERVICES:
        return { start: 60, end: 90 }
      case InitializationStage.SYSTEM_READY:
        return { start: 90, end: 100 }
      default:
        return { start: 0, end: 0 }
    }
  }

  /**
   * Reset initialization state for retry
   */
  reset(): void {
    this.currentStage = InitializationStage.NOT_STARTED
    this.progress = 0
    this.startTime = null
    this.stageErrors = {}
    this.isInitialized = false
    this.initializationPromise = null

    console.log('🔄 Initialization state reset')
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.removeAllListeners()
    this.reset()
    console.log('🧹 InitializationManager cleaned up')
  }
}

// Singleton instance
let instance: InitializationManager | null = null

/**
 * Get the singleton initialization manager instance
 */
export function getInitializationManager(): InitializationManager {
  if (!instance) {
    instance = new InitializationManager()
  }
  return instance
}

/**
 * Initialize the complete agent system with proper sequencing
 */
export async function initializeAgentSystem(): Promise<void> {
  const manager = getInitializationManager()
  await manager.initialize()
}