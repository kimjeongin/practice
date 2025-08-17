#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 기존 data/ 폴더를 새로운 구조로 마이그레이션
 * - documents/: 사용자 파일
 * - storage/: 시스템 파일 (DB, 벡터 스토어, 캐시)
 */

const oldDataDir = './data';
const documentsDir = './documents';
const storageDir = './storage';

console.log('🔄 Starting folder migration...');

// 디렉토리 생성
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
}

// 파일 이동
function moveFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`📂 Moved: ${src} → ${dest}`);
  }
}

// 폴더 이동 (재귀적)
function moveFolder(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`📁 Moved folder: ${src} → ${dest}`);
  }
}

// 기존 data 폴더가 없으면 종료
if (!fs.existsSync(oldDataDir)) {
  console.log('❌ data/ folder not found. Nothing to migrate.');
  process.exit(0);
}

try {
  // 새 디렉토리 구조 생성
  ensureDir(documentsDir);
  ensureDir(storageDir);
  ensureDir(path.join(storageDir, 'database'));
  ensureDir(path.join(storageDir, 'vectors'));
  ensureDir(path.join(storageDir, 'cache'));

  // 기존 파일들 분류
  const files = fs.readdirSync(oldDataDir);
  
  const userFileExtensions = ['.txt', '.md', '.pdf', '.docx', '.doc', '.rtf', '.csv', '.json', '.xml', '.html'];
  const systemFiles = ['database.db', 'rag.db'];
  const systemFolders = ['faiss_index', '.transformers-cache'];

  files.forEach(file => {
    const filePath = path.join(oldDataDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      
      if (systemFiles.includes(file)) {
        // 시스템 파일 → storage/database/
        moveFile(filePath, path.join(storageDir, 'database', file));
      } else if (userFileExtensions.includes(ext)) {
        // 사용자 파일 → documents/
        moveFile(filePath, path.join(documentsDir, file));
      } else {
        console.log(`⚠️  Unknown file type: ${file} (keeping in data/)`);
      }
    } else if (stat.isDirectory()) {
      if (file === 'faiss_index') {
        // FAISS 인덱스 → storage/vectors/
        moveFolder(filePath, path.join(storageDir, 'vectors'));
      } else if (file === '.transformers-cache') {
        // 모델 캐시 → storage/cache/
        moveFolder(filePath, path.join(storageDir, 'cache', '.transformers-cache'));
      } else {
        console.log(`⚠️  Unknown folder: ${file} (keeping in data/)`);
      }
    }
  });

  // data 폴더가 비어있으면 삭제
  const remainingFiles = fs.readdirSync(oldDataDir);
  if (remainingFiles.length === 0) {
    fs.rmdirSync(oldDataDir);
    console.log('🗑️  Removed empty data/ folder');
  } else {
    console.log(`⚠️  data/ folder still contains: ${remainingFiles.join(', ')}`);
  }

  console.log('✅ Migration completed successfully!');
  console.log('\n📁 New folder structure:');
  console.log('├── documents/     (user files - watched by file watcher)');
  console.log('└── storage/       (system files - ignored by file watcher)');
  console.log('    ├── database/  (SQLite databases)');
  console.log('    ├── vectors/   (FAISS vector store)');
  console.log('    └── cache/     (model cache)');

} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}