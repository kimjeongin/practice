import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startClientHostService, stopClientHostService } from '../lib/mcp/services/mcp-client-host.service'
import { registerClientHostHandlers, unregisterClientHostHandlers } from '../lib/mcp/ipc/mcp-client-host.handlers'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Initialize MCP Client Host Service
async function initializeClientHostService(): Promise<void> {
  try {
    console.log('🚀 Initializing MCP Client Host Service...')
    
    // Register IPC handlers first
    registerClientHostHandlers()
    
    // Start Client Host service
    await startClientHostService()
    
    console.log('✅ MCP Client Host Service initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize MCP Client Host Service:', error)
    
    // Show error dialog to user
    dialog.showErrorBox(
      'MCP Client Host Error',
      `Failed to start MCP Client Host Service: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe application will continue but MCP features may not work.`
    )
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Initialize MCP Client Host Service
  await initializeClientHostService()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Comprehensive cleanup of all MCP services
async function cleanupClientHostService(): Promise<void> {
  try {
    console.log('🧹 Starting comprehensive MCP Client Host cleanup...')
    
    // Show cleanup progress to user
    const cleanupNotification = new Promise<void>((resolve) => {
      // Create a simple notification window or use existing main window
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        windows[0].webContents.executeJavaScript(`
          console.log('MCP services are shutting down...')
        `).catch(() => {})
      }
      
      // Add a small delay to show the message
      setTimeout(resolve, 500)
    })
    
    await cleanupNotification
    
    // Step 1: Unregister IPC handlers first to prevent new requests
    console.log('🔌 Unregistering IPC handlers...')
    unregisterClientHostHandlers()
    
    // Step 2: Stop Client Host service (this will disconnect all MCP servers)
    console.log('🛑 Stopping MCP Client Host service...')
    await stopClientHostService()
    
    // Step 3: Force cleanup any remaining processes
    console.log('🧹 Performing final cleanup...')
    // Give a moment for all connections to properly close
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    console.log('✅ All MCP services have been successfully terminated')
  } catch (error) {
    console.warn('⚠️ Warning during MCP Client Host Service cleanup:', error)
    // Even if cleanup fails partially, we should continue with app termination
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    console.log('💭 All windows closed - initiating shutdown sequence...')
    await cleanupClientHostService()
    app.quit()
  }
})

// Handle app quit event - this is the most important cleanup trigger
app.on('before-quit', async (event) => {
  // Prevent default quit to allow proper cleanup
  event.preventDefault()
  
  console.log('🚀 Application shutdown initiated - cleaning up MCP services...')
  
  try {
    // Perform comprehensive cleanup
    await cleanupClientHostService()
    
    // Additional safety measures
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      try {
        if (!window.isDestroyed()) {
          window.destroy()
        }
      } catch (error) {
        console.warn('Warning closing window:', error)
      }
    })
    
    console.log('✅ Shutdown sequence completed successfully')
  } catch (error) {
    console.warn('⚠️ Warning during shutdown cleanup:', error)
  } finally {
    // Ensure app terminates even if cleanup partially fails
    console.log('🔄 Forcing application exit...')
    app.exit(0)
  }
})

// Additional cleanup handlers for various termination scenarios
process.on('SIGTERM', async () => {
  console.log('📟 SIGTERM received - performing graceful shutdown...')
  await cleanupClientHostService()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('📟 SIGINT received - performing graceful shutdown...')
  await cleanupClientHostService()
  process.exit(0)
})

// Handle uncaught exceptions with cleanup
process.on('uncaughtException', async (error) => {
  console.error('😨 Uncaught exception:', error)
  try {
    await cleanupClientHostService()
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError)
  }
  process.exit(1)
})

// Handle unhandled promise rejections with cleanup
process.on('unhandledRejection', async (reason, promise) => {
  console.error('😨 Unhandled rejection at:', promise, 'reason:', reason)
  try {
    await cleanupClientHostService()
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError)
  }
  process.exit(1)
})

// Handle macOS-specific quit behavior
app.on('will-quit', async (event) => {
  console.log('🍎 macOS: Will quit event triggered')
  event.preventDefault()
  await cleanupClientHostService()
  app.exit(0)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

console.log('✅ MCP Client Host application initialized with comprehensive cleanup handlers')
