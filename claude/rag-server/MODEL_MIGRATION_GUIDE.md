# Model Migration Guide

이 문서는 RAG 시스템에서 임베딩 모델을 안전하게 전환하는 방법을 설명합니다.

## 지원되는 모델 전환 시나리오

### 1. 서비스 변경 (예: Transformers → Ollama)
```bash
# 기존: Transformers.js 사용
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# 새로운: Ollama 사용
EMBEDDING_SERVICE=ollama  
EMBEDDING_MODEL=mxbai-embed-large
```

### 2. 모델 변경 (같은 서비스 내에서)
```bash
# 기존 모델
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=nomic-embed-text

# 새로운 모델  
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=mxbai-embed-large
```

### 3. 차원 변경
```bash
# 기존 설정
EMBEDDING_DIMENSIONS=384

# 새로운 설정 (모델에 따라)
EMBEDDING_DIMENSIONS=1024
```

## 모델 마이그레이션 설정

### 환경 변수 설정

#### 자동 마이그레이션 활성화/비활성화
```bash
# 모델 변경 시 자동 마이그레이션 수행 (기본값: true)
ENABLE_AUTO_MIGRATION=true

# 모델 비호환성 자동 감지 (기본값: true)
ENABLE_INCOMPATIBILITY_DETECTION=true

# 모델 변경 시 기존 벡터 자동 삭제 (기본값: true)
CLEAR_VECTORS_ON_MODEL_CHANGE=true

# 마이그레이션 전 임베딩 백업 (개발환경: false, 프로덕션: true)
BACKUP_EMBEDDINGS_BEFORE_MIGRATION=true

# 마이그레이션 타임아웃 (밀리초, 기본값: 개발 5분, 프로덕션 10분)
MIGRATION_TIMEOUT=600000
```

## 안전한 모델 전환 절차

### 방법 1: 자동 마이그레이션 (권장)

1. **환경 변수 설정**
   ```bash
   # 새로운 모델 설정
   EMBEDDING_SERVICE=ollama
   EMBEDDING_MODEL=mxbai-embed-large
   EMBEDDING_DIMENSIONS=1024
   
   # 자동 마이그레이션 활성화
   ENABLE_AUTO_MIGRATION=true
   CLEAR_VECTORS_ON_MODEL_CHANGE=true
   ```

2. **서버 재시작**
   ```bash
   npm run start
   ```

3. **자동 처리 과정**
   - 시스템이 모델 변경을 자동 감지
   - 기존 벡터 데이터 자동 삭제
   - 모든 문서에 대해 새 모델로 임베딩 재생성
   - 새로운 모델 메타데이터 저장

### 방법 2: 점진적 마이그레이션

1. **호환성 검사만 활성화**
   ```bash
   ENABLE_INCOMPATIBILITY_DETECTION=true
   ENABLE_AUTO_MIGRATION=false
   ```

2. **서버 시작하여 호환성 확인**
   ```bash
   npm run start
   ```
   - 로그에서 호환성 이슈 확인
   - 마이그레이션 필요 여부 판단

3. **수동으로 마이그레이션 활성화**
   ```bash
   ENABLE_AUTO_MIGRATION=true
   ```

4. **서버 재시작으로 마이그레이션 수행**

### 방법 3: 수동 마이그레이션

1. **서버 중지**
   ```bash
   # 실행 중인 서버 중지
   ```

2. **데이터 백업 (선택사항)**
   ```bash
   cp -r ./.data/vectors ./.data/vectors_backup
   cp database.db database_backup.db
   ```

3. **벡터 데이터 삭제**
   ```bash
   rm -rf ./.data/vectors/*
   ```

4. **새 모델 설정**
   ```bash
   export EMBEDDING_SERVICE=ollama
   export EMBEDDING_MODEL=mxbai-embed-large
   export EMBEDDING_DIMENSIONS=1024
   ```

5. **서버 재시작**
   ```bash
   npm run start
   ```

## 모델별 권장 설정

### Transformers.js 모델들
```bash
# Xenova/all-MiniLM-L6-v2 (빠름, 낮은 정확도)
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384

# Xenova/all-mpnet-base-v2 (느림, 높은 정확도)  
EMBEDDING_SERVICE=transformers
EMBEDDING_MODEL=Xenova/all-mpnet-base-v2
EMBEDDING_DIMENSIONS=768
```

### Ollama 모델들
```bash
# nomic-embed-text (균형)
EMBEDDING_SERVICE=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# mxbai-embed-large (높은 성능)
EMBEDDING_SERVICE=ollama  
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_DIMENSIONS=1024
```

## 마이그레이션 로그 모니터링

마이그레이션 과정에서 다음 로그들을 확인하세요:

```
🔍 Checking embedding model compatibility and dimensions
⚠️ Model compatibility issues detected
🔄 Clearing existing vectors due to model incompatibility  
📄 Reprocessing file: example.txt
✅ Model migration completed - all embeddings regenerated
```

## 트러블슈팅

### 마이그레이션이 실패하는 경우

1. **타임아웃 증가**
   ```bash
   MIGRATION_TIMEOUT=1200000  # 20분으로 증가
   ```

2. **수동 벡터 삭제**
   ```bash
   rm -rf ./.data/vectors/*
   ```

3. **메타데이터 리셋**
   - 데이터베이스에서 `embedding_metadata` 테이블 내용 삭제

### 성능 최적화

1. **배치 크기 조정**
   ```bash
   EMBEDDING_BATCH_SIZE=5  # 메모리 부족 시 감소
   BATCH_SIZE=10           # 처리 배치 크기 조정
   ```

2. **동시 처리 수 조정**
   ```bash
   MAX_CONCURRENT_PROCESSING=3  # CPU 성능에 맞게 조정
   ```

## 백업 및 복구

### 백업 생성
```bash
# 전체 데이터 백업
cp -r ./.data ./backup_data_$(date +%Y%m%d)
cp database.db database_backup_$(date +%Y%m%d).db
```

### 복구 방법
```bash
# 백업에서 복구
cp -r ./backup_data_YYYYMMDD/.data ./
cp database_backup_YYYYMMDD.db database.db
```

이 가이드를 따라하면 안전하고 효율적으로 임베딩 모델을 전환할 수 있습니다.