// improved-api-client.service.ts - Override 없이 부모 메서드 직접 사용
import { ExampleApiClient } from '../../shared/http/example-client'

export class ImprovedApiClientService extends ExampleApiClient {
  private isLoggedIn: boolean = false

  constructor() {
    super()
  }

  // 부모 클래스의 메서드를 그대로 사용 (override 불필요)
  // - healthCheck()
  // - getUsers()
  // - createUser()
  // - getProtectedData()
  // - uploadFile()
  // - uploadMultipleFiles()

  // 추가 기능만 구현
  async loginWithTracking(credentials: { username: string; password: string }) {
    const result = await this.login(credentials) // 부모 클래스 메서드 직접 호출
    if (result.success) {
      this.isLoggedIn = true
      console.log(`✅ User ${credentials.username} logged in successfully`)
    }
    return result
  }

  async logoutWithTracking() {
    this.tokenManager.clearTokens()
    this.isLoggedIn = false
    console.log('🔓 User logged out successfully')
    return { success: true as const, message: 'Logged out successfully' }
  }

  // 로그인 상태 확인
  getLoginStatus() {
    return {
      success: true as const,
      data: {
        isLoggedIn: this.isLoggedIn,
        hasToken: !!this.tokenManager.getAccessToken()
      }
    }
  }

  // 파일 업로드 편의 메서드 (string content용)
  async uploadFileFromString(fileName: string, content: string, title?: string, description?: string) {
    const file = new File([content], fileName, { type: 'text/plain' })
    return this.uploadFile(file, title, description) // 부모 클래스 메서드 직접 호출
  }

  // 다중 파일 업로드 편의 메서드 (string content용)
  async uploadMultipleFilesFromStrings(files: Array<{ name: string; content: string }>, category?: string) {
    const fileObjects = files.map(f => new File([f.content], f.name, { type: 'text/plain' }))
    return this.uploadMultipleFiles(fileObjects, category) // 부모 클래스 메서드 직접 호출
  }

  // 보호된 데이터 접근 시 자동 로그인 체크
  async getProtectedDataWithCheck() {
    if (!this.isLoggedIn) {
      return {
        success: false as const,
        errorCode: 'AUTH_REQUIRED',
        message: 'Please login first using loginWithTracking()'
      }
    }
    return this.getProtectedData() // 부모 클래스 메서드 직접 호출
  }

  // 사용자 생성 시 추가 로깅
  async createUserWithLogging(userData: { name: string; email: string }) {
    console.log(`👤 Creating user: ${userData.name} (${userData.email})`)
    const result = await this.createUser(userData) // 부모 클래스 메서드 직접 호출
    if (result.success) {
      console.log(`✅ User created successfully: ${result.data.id}`)
    }
    return result
  }
}

// Singleton 인스턴스
let improvedApiClientService: ImprovedApiClientService | null = null

export function getImprovedApiClientService(): ImprovedApiClientService {
  if (!improvedApiClientService) {
    improvedApiClientService = new ImprovedApiClientService()
  }
  return improvedApiClientService
}