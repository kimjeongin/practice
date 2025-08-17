# Test Suite

이 디렉토리는 RAG MCP Server의 포괄적인 테스트 환경을 포함합니다.

## 테스트 구조

```
test/
├── unit/           # 단위 테스트 - 개별 함수/클래스 테스트
├── integration/    # 통합 테스트 - 여러 컴포넌트 간 상호작용 테스트
├── e2e/           # End-to-End 테스트 - 전체 애플리케이션 동작 테스트
├── fixtures/      # 테스트 데이터 및 모킹 데이터
├── helpers/       # 테스트 유틸리티 및 헬퍼 함수
└── setup.ts       # 전역 테스트 설정
```

## 테스트 실행 방법

### 모든 테스트 실행
```bash
npm test
```

### 단위 테스트만 실행
```bash
npm run test:unit
```

### 통합 테스트만 실행
```bash
npm run test:integration
```

### E2E 테스트만 실행
```bash
npm run test:e2e
```

### 테스트 커버리지 확인
```bash
npm run test:coverage
```

### 테스트 watch 모드
```bash
npm run test:watch
```

### 전체 테스트 스위트 실행
```bash
npm run test:all
```

## 테스트 종류

### 1. 단위 테스트 (Unit Tests)
- **위치**: `test/unit/`
- **목적**: 개별 함수, 클래스, 메서드의 정확한 동작 확인
- **특징**: 
  - 빠른 실행 속도
  - 외부 의존성을 모킹
  - 개별 기능의 정확성 검증

**포함된 테스트**:
- `file-processing-service.test.ts`: 파일 처리 서비스 테스트
- `search-service.test.ts`: 검색 서비스 테스트

### 2. 통합 테스트 (Integration Tests)
- **위치**: `test/integration/`
- **목적**: 여러 컴포넌트가 함께 동작할 때의 상호작용 테스트
- **특징**: 
  - 실제 데이터베이스 사용 (in-memory)
  - 실제 파일 시스템 상호작용
  - 컴포넌트 간 데이터 흐름 검증

**포함된 테스트**:
- `rag-workflow.test.ts`: RAG 워크플로우 전체 테스트
- `mcp-server.test.ts`: MCP 서버 통합 테스트

### 3. E2E 테스트 (End-to-End Tests)
- **위치**: `test/e2e/`
- **목적**: 실제 사용자 시나리오에서 전체 애플리케이션 동작 테스트
- **특징**: 
  - 실제 서버 프로세스 실행
  - 실제 파일 시스템 및 데이터베이스 사용
  - 외부 의존성과의 실제 상호작용

**포함된 테스트**:
- `full-application.test.ts`: 전체 애플리케이션 라이프사이클 테스트

## 테스트 환경 설정

### 환경 변수
테스트 실행 시 다음 환경 변수가 자동으로 설정됩니다:
- `NODE_ENV=test`
- `LOG_LEVEL=error`
- `RAG_DB_PATH=data/test-rag.db`

### 테스트 데이터
테스트용 샘플 문서는 `test/fixtures/sample-documents.ts`에 정의되어 있습니다:
- 간단한 텍스트 문서
- 마크다운 문서
- 긴 문서
- 기술 문서

### 모킹
`test/helpers/test-helpers.ts`에는 다양한 모킹 유틸리티가 포함되어 있습니다:
- 설정 모킹
- 로거 모킹
- 임베딩 프로바이더 모킹
- 벡터 스토어 모킹

## 테스트 작성 가이드라인

### 1. 테스트 파일 명명 규칙
- 단위 테스트: `[component].test.ts`
- 통합 테스트: `[workflow].test.ts`
- E2E 테스트: `[scenario].test.ts`

### 2. 테스트 구조
```typescript
describe('Component/Feature Name', () => {
  beforeEach(() => {
    // 테스트 전 설정
  });

  afterEach(() => {
    // 테스트 후 정리
  });

  describe('specific functionality', () => {
    test('should do something specific', async () => {
      // 준비 (Arrange)
      // 실행 (Act)
      // 검증 (Assert)
    });
  });
});
```

### 3. 비동기 테스트
```typescript
test('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
}, 30000); // 타임아웃 설정
```

### 4. 에러 테스트
```typescript
test('should handle errors gracefully', async () => {
  await expect(functionThatShouldThrow()).rejects.toThrow('Expected error message');
});
```

## CI/CD 통합

이 테스트 스위트는 CI/CD 파이프라인에서 다음과 같이 실행될 수 있습니다:

1. **빠른 피드백**: 단위 테스트 우선 실행
2. **통합 검증**: 통합 테스트로 컴포넌트 상호작용 확인
3. **전체 검증**: E2E 테스트로 사용자 시나리오 검증

## 성능 벤치마킹

일부 테스트는 성능 벤치마킹도 포함합니다:
- 파일 처리 시간 측정
- 검색 응답 시간 측정
- 메모리 사용량 모니터링

## 문제 해결

### 테스트 실패 시 체크리스트
1. 의존성이 모두 설치되었는지 확인: `pnpm install`
2. 애플리케이션이 빌드되는지 확인: `npm run build`
3. 타입체크 통과하는지 확인: `npm run typecheck`
4. 개별 테스트 파일 실행으로 문제 격리
5. 테스트 데이터베이스 정리: `rm -f data/test-*.db`

### 일반적인 문제들
- **타임아웃 에러**: 테스트 타임아웃 값 증가 또는 비동기 로직 최적화
- **파일 권한 에러**: 테스트 파일 권한 확인
- **포트 충돌**: E2E 테스트 포트 변경
- **의존성 에러**: node_modules 재설치

## 기여하기

새로운 테스트 추가 시:
1. 적절한 디렉토리에 테스트 파일 생성
2. 기존 테스트 패턴 따르기
3. 모킹 데이터는 `fixtures/`에, 유틸리티는 `helpers/`에 추가
4. 테스트 실행 확인 후 커밋