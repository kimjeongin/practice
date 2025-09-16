import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getInitializationManager } from '../lib/agent/services/initialization-manager.service'
import { cleanupService } from './services/cleanup.service'
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

  // Register cleanup handlers first
  cleanupService.registerCleanupHandlers()

  // Initialize all application services
  await initializeServices()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// All cleanup handlers are now managed by the CleanupService

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

console.log('✅ Agent application initialized with centralized cleanup service')
