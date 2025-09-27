// client-patterns-usage.ts - 각 패턴의 사용 예시

import { MultiApiClientService } from '../src/main/services/multi-api-client.service'
import { MixinApiClientService } from '../src/main/services/mixin-api-client.service'
import { ImprovedApiClientService } from '../src/main/services/improved-api-client.service'

async function demonstratePatterns() {
  console.log('🔍 API Client 패턴 비교 데모\n')

  // 1. Composition 패턴 (추천)
  console.log('1️⃣ Composition 패턴:')
  const multiClient = new MultiApiClientService()

  // 각 API를 명확하게 구분하여 사용
  console.log('- Example API 헬스 체크:', await multiClient.example.healthCheck())
  console.log('- Blog API 포스트 조회:', await multiClient.blog.getPosts())
  console.log('- 공통 인증 상태:', multiClient.auth.getLoginStatus())
  console.log('- 모든 서비스 체크:', await multiClient.checkAllServices())
  console.log()

  // 2. Mixin 패턴
  console.log('2️⃣ Mixin 패턴:')
  const mixinClient = new MixinApiClientService()

  // 메서드 이름에 접두사가 있음
  console.log('- Example 헬스 체크:', await mixinClient.exampleHealthCheck())
  console.log('- Blog 포스트 조회:', await mixinClient.blogGetPosts())
  console.log('- 서비스 정보:', mixinClient.getServiceInfo())
  console.log('- 전체 헬스 체크:', await mixinClient.checkAllHealth())
  console.log()

  // 3. 개선된 상속 패턴 (Override 없이)
  console.log('3️⃣ 개선된 상속 패턴:')
  const improvedClient = new ImprovedApiClientService()

  // 부모 클래스 메서드를 직접 사용
  console.log('- 부모 헬스 체크:', await improvedClient.healthCheck())
  console.log('- 부모 사용자 조회:', await improvedClient.getUsers())

  // 추가 기능 사용
  console.log('- 추적 로그인:', await improvedClient.loginWithTracking({ username: 'admin', password: 'password' }))
  console.log('- 로그인 상태:', improvedClient.getLoginStatus())
  console.log('- 보호된 데이터 (체크 포함):', await improvedClient.getProtectedDataWithCheck())
  console.log('- 로깅 포함 사용자 생성:', await improvedClient.createUserWithLogging({ name: 'Test User', email: 'test@example.com' }))
  console.log()

  // 4. 패턴별 장단점 요약
  console.log('📊 패턴별 장단점:')
  console.log(`
🏆 Composition 패턴 (추천):
✅ 장점: 명확한 분리, 유연성, 테스트 용이성
❌ 단점: 조금 더 많은 코드

🔀 Mixin 패턴:
✅ 장점: 다중 상속 효과, 모듈성
❌ 단점: 복잡성, 이름 충돌 가능성

🎯 개선된 상속 패턴:
✅ 장점: 단순함, 부모 메서드 직접 사용
❌ 단점: 단일 상속 제한
  `)
}

// 실제 사용법 예시
export async function exampleUsage() {
  // Composition 패턴이 가장 추천되는 방식
  const apiService = new MultiApiClientService()

  // 1. 인증
  await apiService.example.login({ username: 'admin', password: 'password' })

  // 2. 각 API 사용
  const users = await apiService.example.getUsers()
  const posts = await apiService.blog.getPosts()

  // 3. 파일 업로드
  const file = new File(['Hello World'], 'test.txt', { type: 'text/plain' })
  await apiService.example.uploadFile(file, 'Test', 'Description')

  // 4. 로그아웃 (모든 서비스에서)
  apiService.auth.logout()

  return { users, posts }
}

// 데모 실행
if (require.main === module) {
  demonstratePatterns()
}