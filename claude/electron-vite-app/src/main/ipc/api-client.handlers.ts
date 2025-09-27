// api-client.handlers.ts
import { ipcMain } from 'electron'
import { API_CLIENT_IPC_CHANNELS } from '../../shared/constants/ipc-channels'
import { getApiClientService } from '../services/api-client.service'

console.log('🔌 Registering API Client IPC handlers...')

const apiService = getApiClientService()

// Health check
ipcMain.handle(API_CLIENT_IPC_CHANNELS.HEALTH_CHECK, async () => {
  console.log('📡 API Health check requested')
  return await apiService.healthCheck()
})

// Authentication
ipcMain.handle(API_CLIENT_IPC_CHANNELS.LOGIN, async (_, username: string, password: string) => {
  console.log(`🔐 Login requested for user: ${username}`)
  return await apiService.login({ username, password })
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.LOGOUT, async () => {
  console.log('🔓 Logout requested')
  return await apiService.logout()
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.GET_LOGIN_STATUS, async () => {
  console.log('👤 Login status requested')
  return apiService.getLoginStatus()
})

// User management
ipcMain.handle(API_CLIENT_IPC_CHANNELS.GET_USERS, async () => {
  console.log('👥 Get users requested')
  return await apiService.getUsers()
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.CREATE_USER, async (_, name: string, email: string) => {
  console.log(`👤 Create user requested: ${name} (${email})`)
  return await apiService.createUser({ name, email })
})

// Protected data
ipcMain.handle(API_CLIENT_IPC_CHANNELS.GET_PROTECTED_DATA, async () => {
  console.log('🔒 Protected data requested')
  return await apiService.getProtectedData()
})

// File upload
ipcMain.handle(API_CLIENT_IPC_CHANNELS.UPLOAD_FILE, async (_, fileName: string, content: string, title?: string, description?: string) => {
  console.log(`📁 File upload requested: ${fileName}`)
  return await apiService.uploadFileFromString(fileName, content, title, description)
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.UPLOAD_MULTIPLE_FILES, async (_, files: Array<{ name: string; content: string }>, category?: string) => {
  console.log(`📁 Multiple file upload requested: ${files.length} files`)
  return await apiService.uploadMultipleFilesFromStrings(files, category)
})

// SSE (Server-Sent Events) handlers
ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_CONNECT_BASIC, async (_, connectionId?: string) => {
  console.log(`📡 SSE basic connection requested: ${connectionId || 'basic'}`)
  return await apiService.connectToSSEEvents(connectionId)
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_CONNECT_CUSTOM, async (_, connectionId?: string, message?: string, interval?: number) => {
  console.log(`📡 SSE custom connection requested: ${connectionId || 'custom'}`)
  return await apiService.connectToSSECustomEvents(connectionId, message, interval)
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_CONNECT_PROTECTED, async (_, connectionId?: string) => {
  console.log(`📡 SSE protected connection requested: ${connectionId || 'protected'}`)
  return await apiService.connectToSSEProtectedEvents(connectionId)
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_DISCONNECT, async (_, connectionId: string) => {
  console.log(`📡 SSE disconnect requested: ${connectionId}`)
  return apiService.disconnectSSE(connectionId)
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_DISCONNECT_ALL, async () => {
  console.log('📡 SSE disconnect all requested')
  return apiService.disconnectAllSSE()
})

ipcMain.handle(API_CLIENT_IPC_CHANNELS.SSE_GET_STATUS, async () => {
  console.log('📡 SSE status requested')
  return apiService.getSSEStatus()
})

console.log('✅ API Client IPC handlers registered successfully')