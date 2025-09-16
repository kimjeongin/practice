import { app, BrowserWindow } from 'electron'
import { getInitializationManager } from '../../lib/agent/services/initialization-manager.service'

export class CleanupService {
  private static instance: CleanupService | null = null
  private isCleanupInProgress = false
  private cleanupHandlersRegistered = false

  private constructor() {}

  static getInstance(): CleanupService {
    if (!CleanupService.instance) {
      CleanupService.instance = new CleanupService()
    }
    return CleanupService.instance
  }

  /**
   * Register all cleanup handlers for various termination scenarios
   */
  registerCleanupHandlers(): void {
    if (this.cleanupHandlersRegistered) {
      console.log('⚠️ Cleanup handlers already registered')
      return
    }

    console.log('📋 Registering comprehensive cleanup handlers...')

    // Handle normal window closure
    app.on('window-all-closed', async () => {
      if (process.platform !== 'darwin') {
        console.log('💭 All windows closed - initiating shutdown sequence...')
        await this.performCleanup()
        app.quit()
      }
    })

    // Handle app quit event - most important cleanup trigger
    app.on('before-quit', async (event) => {
      if (this.isCleanupInProgress) {
        return // Allow quit if cleanup already in progress
      }

      event.preventDefault()
      console.log('🚀 Application shutdown initiated - cleaning up services...')

      try {
        await this.performCleanup()
        console.log('✅ Shutdown sequence completed successfully')
      } catch (error) {
        console.warn('⚠️ Warning during shutdown cleanup:', error)
      } finally {
        console.log('🔄 Forcing application exit...')
        app.exit(0)
      }
    })

    // Handle macOS-specific quit behavior
    app.on('will-quit', async (event) => {
      if (this.isCleanupInProgress) {
        return
      }

      console.log('🍎 macOS: Will quit event triggered')
      event.preventDefault()
      await this.performCleanup()
      app.exit(0)
    })

    // Handle process termination signals
    process.on('SIGTERM', async () => {
      console.log('📟 SIGTERM received - performing graceful shutdown...')
      await this.performCleanup()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      console.log('📟 SIGINT received - performing graceful shutdown...')
      await this.performCleanup()
      process.exit(0)
    })

    // Handle uncaught exceptions with cleanup
    process.on('uncaughtException', async (error) => {
      console.error('😨 Uncaught exception:', error)
      try {
        await this.performCleanup()
      } catch (cleanupError) {
        console.error('Error during emergency cleanup:', cleanupError)
      }
      process.exit(1)
    })

    // Handle unhandled promise rejections with cleanup
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('😨 Unhandled rejection at:', promise, 'reason:', reason)
      try {
        await this.performCleanup()
      } catch (cleanupError) {
        console.error('Error during emergency cleanup:', cleanupError)
      }
      process.exit(1)
    })

    this.cleanupHandlersRegistered = true
    console.log('✅ All cleanup handlers registered successfully')
  }

  /**
   * Perform comprehensive cleanup of all services
   */
  private async performCleanup(): Promise<void> {
    if (this.isCleanupInProgress) {
      console.log('⚠️ Cleanup already in progress, skipping...')
      return
    }

    this.isCleanupInProgress = true

    try {
      console.log('🧹 Starting comprehensive service cleanup...')

      // Step 1: Notify user about cleanup
      await this.notifyUserCleanup()

      // Step 2: Clean up initialization manager and all services
      console.log('📋 Cleaning up initialization manager...')
      const initManager = getInitializationManager()
      await initManager.cleanup()

      // Step 3: Clean up windows
      await this.cleanupWindows()

      // Step 4: Final cleanup delay
      console.log('🧹 Performing final cleanup...')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log('✅ All services have been successfully terminated')
    } catch (error) {
      console.warn('⚠️ Warning during service cleanup:', error)
      // Even if cleanup fails partially, we should continue with app termination
    } finally {
      this.isCleanupInProgress = false
    }
  }

  /**
   * Notify user about cleanup in progress
   */
  private async notifyUserCleanup(): Promise<void> {
    return new Promise<void>((resolve) => {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        windows[0].webContents
          .executeJavaScript(
            `console.log('Application services are shutting down...')`
          )
          .catch(() => {})
      }

      // Add a small delay to show the message
      setTimeout(resolve, 500)
    })
  }

  /**
   * Clean up all browser windows
   */
  private async cleanupWindows(): Promise<void> {
    console.log('🪟 Cleaning up browser windows...')
    const windows = BrowserWindow.getAllWindows()

    for (const window of windows) {
      try {
        if (!window.isDestroyed()) {
          window.destroy()
        }
      } catch (error) {
        console.warn('Warning closing window:', error)
      }
    }
  }

  /**
   * Force cleanup - for emergency situations
   */
  async forceCleanup(): Promise<void> {
    console.log('⚡ Force cleanup initiated...')
    this.isCleanupInProgress = false // Reset flag to allow cleanup
    await this.performCleanup()
  }
}

// Export singleton instance
export const cleanupService = CleanupService.getInstance()