// mixin-api-client.service.ts - Mixin 패턴 사용
import { ExampleApiClient } from '../../shared/http/example-client'
import { BlogApiClient } from '../../shared/http/blog-client'

// Mixin 함수 타입 정의
type Constructor<T = {}> = new (...args: any[]) => T

// Example API 기능을 믹스인하는 함수
function withExampleAPI<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    private exampleClient = new ExampleApiClient()

    async exampleHealthCheck() {
      return this.exampleClient.healthCheck()
    }

    async exampleLogin(credentials: { username: string; password: string }) {
      return this.exampleClient.login(credentials)
    }

    async exampleGetUsers() {
      return this.exampleClient.getUsers()
    }

    async exampleCreateUser(userData: { name: string; email: string }) {
      return this.exampleClient.createUser(userData)
    }
  }
}

// Blog API 기능을 믹스인하는 함수
function withBlogAPI<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    private blogClient = new BlogApiClient()

    async blogGetPosts() {
      return this.blogClient.getBlogPosts()
    }

    async blogCreatePost(postData: { title: string; content: string; author: string }) {
      return this.blogClient.createBlogPost(postData)
    }

    async blogSearchPosts(query: string) {
      return this.blogClient.searchBlogPosts(query)
    }
  }
}

// 기본 서비스 클래스
class BaseService {
  protected serviceId: string

  constructor(serviceId: string = 'multi-api-service') {
    this.serviceId = serviceId
  }

  getServiceInfo() {
    return {
      success: true as const,
      data: {
        id: this.serviceId,
        timestamp: new Date().toISOString(),
        availableAPIs: ['example', 'blog']
      }
    }
  }
}

// 믹스인을 조합하여 최종 서비스 클래스 생성
export class MixinApiClientService extends withBlogAPI(withExampleAPI(BaseService)) {
  constructor() {
    super('mixin-multi-api-service')
  }

  // 모든 API의 헬스 체크
  async checkAllHealth() {
    const [exampleHealth, blogPosts] = await Promise.allSettled([
      this.exampleHealthCheck(),
      this.blogGetPosts()
    ])

    return {
      success: true as const,
      data: {
        example: exampleHealth.status === 'fulfilled' ? exampleHealth.value : { success: false },
        blog: blogPosts.status === 'fulfilled' ? blogPosts.value : { success: false },
        service: this.getServiceInfo()
      }
    }
  }
}