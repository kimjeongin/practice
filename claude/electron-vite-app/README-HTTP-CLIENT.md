# HTTP Client 사용 가이드

`src/shared/http` 디렉토리에 범용적인 HTTP client를 구현했습니다. axios 기반으로 만들어졌으며, TypeScript를 완전 지원합니다.

## 주요 특징

✅ **타입 안전성**: TypeScript 제네릭으로 요청/응답 타입 보장
✅ **중앙화된 설정**: 모든 HTTP 요청이 동일한 설정 사용
✅ **자동 에러 처리**: 공통 에러 처리 로직으로 일관성 보장
✅ **Form data 지원**: 파일 업로드 등 Form data 자동 처리
✅ **인터셉터 활용**: 요청/응답 전처리로 코드 중복 제거
✅ **인증 토큰 관리**: Bearer token 자동 관리

## 기본 사용법

```typescript
import httpClient from '../src/shared/http';

// 타입 안전한 GET 요청
interface User {
  id: number;
  name: string;
  email: string;
}

const user = await httpClient.get<User>('/api/users/1');
console.log(user.data); // User 타입으로 자동 추론

// POST 요청 (타입 안전)
interface CreateUserRequest {
  name: string;
  email: string;
}

const newUser = await httpClient.post<User, CreateUserRequest>('/api/users', {
  name: 'John',
  email: 'john@example.com'
});
```

## 지원하는 HTTP 메서드

```typescript
// GET
await httpClient.get<ResponseType>('/api/endpoint');

// POST
await httpClient.post<ResponseType, RequestType>('/api/endpoint', data);

// PUT
await httpClient.put<ResponseType, RequestType>('/api/endpoint', data);

// DELETE
await httpClient.delete<ResponseType>('/api/endpoint');

// PATCH
await httpClient.patch<ResponseType, RequestType>('/api/endpoint', data);

// Form Data (파일 업로드)
const formData = new FormData();
formData.append('file', file);
await httpClient.postFormData<UploadResponse>('/api/upload', formData);
```

## 표준 응답 형식

모든 응답은 다음 형식으로 정규화됩니다:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

interface ApiError {
  success: false;
  message: string;
  code?: string | number;
  details?: any;
  timestamp?: string;
}
```

## 에러 처리

```typescript
try {
  const response = await httpClient.get<User>('/api/users/1');
  console.log(response.data);
} catch (error: any) {
  if (error.success === false) {
    console.log('API Error:', {
      message: error.message,    // 사용자 친화적 메시지
      code: error.code,          // HTTP 상태 코드 또는 에러 코드
      details: error.details,    // 서버에서 제공한 상세 정보
      timestamp: error.timestamp // 에러 발생 시간
    });
  }
}
```

## 인증 토큰 관리

```typescript
// 토큰 설정 (자동으로 모든 요청에 Authorization 헤더 추가)
httpClient.setAuthToken('your-jwt-token');

// 토큰 제거
httpClient.setAuthToken(null);
```

## 커스텀 클라이언트 생성

```typescript
import { HttpClient } from '../src/shared/http';

const customClient = new HttpClient({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: {
    'X-Custom-Header': 'MyApp/1.0'
  },
  interceptors: {
    request: [
      (config) => {
        // 요청 전처리
        config.headers['X-Request-ID'] = generateRequestId();
        return config;
      }
    ],
    response: [
      {
        onFulfilled: (response) => {
          // 응답 후처리
          return response;
        },
        onRejected: (error) => {
          // 에러 후처리
          return Promise.reject(error);
        }
      }
    ]
  }
});
```

## 동적 인터셉터 관리

```typescript
// 인터셉터 추가
const requestId = httpClient.addRequestInterceptor((config) => {
  config.headers['X-Timestamp'] = Date.now();
  return config;
});

const responseId = httpClient.addResponseInterceptor({
  onFulfilled: (response) => {
    console.log('Response received:', response.status);
    return response;
  }
});

// 인터셉터 제거
httpClient.removeInterceptor('request', requestId);
httpClient.removeInterceptor('response', responseId);
```

## 개발 환경 디버깅

개발 환경에서는 모든 HTTP 요청/응답이 자동으로 콘솔에 로깅됩니다:

```
[HTTP] GET /api/users { params: { page: 1 } }
[HTTP] 200 /api/users { data: [...] }
```

## 파일 구조

```
src/shared/http/
├── index.ts      # 메인 export 파일
├── client.ts     # HTTP client 구현체
└── types.ts      # 타입 정의
```

## 사용 예시

실제 사용 예시는 `examples/http-client-usage.ts` 파일을 참고하세요.

## 주의사항

1. **Base URL 설정**: 환경별로 다른 API 서버를 사용하는 경우 `setBaseURL()` 메서드를 사용하여 동적으로 변경 가능
2. **토큰 저장**: 현재는 localStorage를 사용하므로 서버사이드에서는 다른 저장 방식 고려 필요
3. **에러 처리**: 모든 API 호출을 try-catch로 감싸는 것을 권장