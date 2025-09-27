// multi-api-client.service.ts - Composition 패턴 사용
import { ExampleApiClient } from '../../shared/http/example-client'
import { BlogApiClient } from '../../shared/http/blog-client'
import { TokenManager } from '../../shared/http/token-manager'

export class MultiApiClientService {
  private exampleClient: ExampleApiClient
  private blogClient: BlogApiClient
  private sharedTokenManager: TokenManager

  constructor() {
    // 공유 토큰 매니저 사용
    this.sharedTokenManager = new TokenManager()

    // 각 클라이언트에 동일한 토큰 매니저 전달
    this.exampleClient = new ExampleApiClient('http://localhost:3001', this.sharedTokenManager)
    this.blogClient = new BlogApiClient('http://localhost:3002', this.sharedTokenManager)
  }

  // Example API 관련 메서드들
  get example() {
    return {
      healthCheck: () => this.exampleClient.healthCheck(),
      login: (credentials: { username: string; password: string }) => this.exampleClient.login(credentials),
      getUsers: () => this.exampleClient.getUsers(),
      createUser: (userData: { name: string; email: string }) => this.exampleClient.createUser(userData),
      getProtectedData: () => this.exampleClient.getProtectedData(),
      uploadFile: (file: File, title?: string, description?: string) =>
        this.exampleClient.uploadFile(file, title, description),
    }
  }

  // Blog API 관련 메서드들
  get blog() {
    return {
      getPosts: () => this.blogClient.getBlogPosts(),
      getPost: (id: number) => this.blogClient.getBlogPost(id),
      createPost: (postData: { title: string; content: string; author: string }) =>
        this.blogClient.createBlogPost(postData),
      updatePost: (id: number, postData: Partial<{ title: string; content: string; author: string }>) =>
        this.blogClient.updateBlogPost(id, postData),
      deletePost: (id: number) => this.blogClient.deleteBlogPost(id),
      searchPosts: (query: string) => this.blogClient.searchBlogPosts(query),
    }
  }

  // 공통 토큰 관리
  get auth() {
    return {
      getLoginStatus: () => ({
        success: true as const,
        data: {
          hasToken: !!this.sharedTokenManager.getAccessToken(),
          accessToken: this.sharedTokenManager.getAccessToken(),
          refreshToken: this.sharedTokenManager.getRefreshToken(),
        }
      }),
      logout: () => {
        this.sharedTokenManager.clearTokens()
        return { success: true as const, message: 'Logged out from all services' }
      },
      setTokens: (tokens: { accessToken: string; refreshToken: string }) => {
        this.sharedTokenManager.updateTokens(tokens)
        return { success: true as const, message: 'Tokens updated for all services' }
      }
    }
  }

  // 모든 서비스의 헬스 체크
  async checkAllServices() {
    const results = await Promise.allSettled([
      this.exampleClient.healthCheck(),
      this.blogClient.getBlogPosts() // Blog service health check
    ])

    return {
      success: true as const,
      data: {
        example: results[0].status === 'fulfilled' ? results[0].value : { success: false, error: 'Failed' },
        blog: results[1].status === 'fulfilled' ? results[1].value : { success: false, error: 'Failed' },
        timestamp: new Date().toISOString()
      }
    }
  }
}