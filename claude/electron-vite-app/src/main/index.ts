import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getInitializationManager } from '../lib/agent/services/initialization-manager.service'
// Import agent IPC handlers (this will automatically register them)
import '../lib/agent/ipc/agent-ipc.handlers'

function createWindow(): void {
  console.log('🔨 Creating main window...')
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    console.log('🖥️ Main window ready to show')
    mainWindow.show()
    console.log('✅ Main window shown successfully')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log(`📡 Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log(`📄 Loading HTML file: ${htmlPath}`)
    mainWindow.loadFile(htmlPath)
  }

  // Add error handling for loading failures
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('❌ Failed to load renderer:', errorCode, errorDescription)
  })

  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Renderer finished loading')
  })
}

// Initialize application services using centralized manager
async function initializeServices(): Promise<void> {
  try {
    console.log('🚀 Initializing application services with centralized manager...')

    const initManager = getInitializationManager()

    // Set up progress monitoring
    initManager.on('progress', (progress) => {
      console.log(`📊 Initialization Progress: ${progress.stage} (${progress.progress}%) - ${progress.message}`)

      // Forward progress to renderer processes
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('agent:init-progress', progress)
        }
      })
    })

    initManager.on('initialized', (status) => {
      console.log('✅ System initialization completed - notifying renderer')

      // Forward completion to renderer processes
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('agent:init-completed', status)
        }
      })
    })

    initManager.on('failed', (failureInfo) => {
      console.error(`❌ Initialization failed at stage: ${failureInfo.stage}`, failureInfo.error)

      // Forward failure to renderer processes
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('agent:init-failed', failureInfo)
        }
      })
    })

    // Start the initialization sequence
    await initManager.initialize()

    console.log('✅ All services initialized successfully with centralized manager')
  } catch (error) {
    console.error('❌ Failed to initialize services:', error)

    // Show error dialog to user
    dialog.showErrorBox(
      'Service Initialization Error',
      `Failed to start services: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe application will continue but some features may not work.`
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

  // Initialize all application services
  await initializeServices()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Comprehensive cleanup of all services
async function cleanupServices(): Promise<void> {
  try {
    console.log('🧹 Starting comprehensive service cleanup...')

    // Show cleanup progress to user
    const cleanupNotification = new Promise<void>((resolve) => {
      // Create a simple notification window or use existing main window
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        windows[0].webContents
          .executeJavaScript(
            `
          console.log('Application services are shutting down...')
        `
          )
          .catch(() => {})
      }

      // Add a small delay to show the message
      setTimeout(resolve, 500)
    })

    await cleanupNotification

    // Step 1: Clean up initialization manager
    console.log('📋 Cleaning up initialization manager...')
    const initManager = getInitializationManager()
    await initManager.cleanup()

    // Step 2: Force cleanup any remaining processes
    console.log('🧹 Performing final cleanup...')
    // Give a moment for all connections to properly close
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log('✅ All services have been successfully terminated')
  } catch (error) {
    console.warn('⚠️ Warning during service cleanup:', error)
    // Even if cleanup fails partially, we should continue with app termination
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    console.log('💭 All windows closed - initiating shutdown sequence...')
    await cleanupServices()
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
    await cleanupServices()

    // Additional safety measures
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((window) => {
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
  await cleanupServices()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('📟 SIGINT received - performing graceful shutdown...')
  await cleanupServices()
  process.exit(0)
})

// Handle uncaught exceptions with cleanup
process.on('uncaughtException', async (error) => {
  console.error('😨 Uncaught exception:', error)
  try {
    await cleanupServices()
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError)
  }
  process.exit(1)
})

// Handle unhandled promise rejections with cleanup
process.on('unhandledRejection', async (reason, promise) => {
  console.error('😨 Unhandled rejection at:', promise, 'reason:', reason)
  try {
    await cleanupServices()
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError)
  }
  process.exit(1)
})

// Handle macOS-specific quit behavior
app.on('will-quit', async (event) => {
  console.log('🍎 macOS: Will quit event triggered')
  event.preventDefault()
  await cleanupServices()
  app.exit(0)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

console.log('✅ Agent application initialized with comprehensive cleanup handlers')
