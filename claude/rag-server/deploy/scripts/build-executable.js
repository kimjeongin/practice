#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Parse command line arguments
const targetPlatform = process.argv[2] || 'linux';

// Configuration
const config = {
  linux: {
    platform: 'linux',
    arch: 'x64',
    extension: '',
    outputName: 'rag-server-linux-x64'
  },
  darwin: {
    platform: 'darwin', 
    arch: 'x64',
    extension: '',
    outputName: 'rag-server-macos-x64'
  },
  win32: {
    platform: 'win32',
    arch: 'x64', 
    extension: '.exe',
    outputName: 'rag-server-windows-x64.exe'
  }
};

const buildConfig = config[targetPlatform];
if (!buildConfig) {
  console.error(`Unsupported platform: ${targetPlatform}`);
  console.error(`Available platforms: ${Object.keys(config).join(', ')}`);
  process.exit(1);
}

// Ensure output directory exists
const outputDir = join(projectRoot, 'dist', 'executables');
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

console.log(`🔨 Building executable for ${buildConfig.platform}-${buildConfig.arch}...`);

try {
  // Build the project first if not already built
  const distPath = join(projectRoot, 'dist', 'app', 'index.js');
  if (!existsSync(distPath)) {
    console.log('📦 Building project first...');
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  }

  // Clean up files that shouldn't be in the executable
  console.log('🧹 Cleaning up unnecessary files...');
  const cleanupDirs = [
    'coverage',
    'test',
    '.git',
    'docs',
    'examples'
  ];

  const excludePaths = cleanupDirs.map(dir => `--exclude "${dir}"`).join(' ');

  // Use caxa to create executable
  const outputPath = join(outputDir, buildConfig.outputName);
  const caxaCommand = [
    'npx caxa',
    `--input "${projectRoot}"`,
    `--output "${outputPath}"`,
    `--command "{{caxa}}/node_modules/.bin/node" "{{caxa}}/dist/app/index.js"`,
    excludePaths,
    '--exclude "*.log"',
    '--exclude "*.tsbuildinfo"',
    '--exclude "node_modules/.cache"'
  ].join(' ');

  console.log(`🚀 Creating executable with caxa...`);
  console.log(`Command: ${caxaCommand}`);
  
  execSync(caxaCommand, { cwd: projectRoot, stdio: 'inherit' });

  console.log(`✅ Successfully created executable: ${outputPath}`);
  
  // Get file size for info
  try {
    const stats = execSync(`ls -lh "${outputPath}"`).toString().trim();
    console.log(`📊 File info: ${stats}`);
  } catch (e) {
    // Windows doesn't have ls -lh, just skip
  }

} catch (error) {
  console.error(`❌ Failed to build executable: ${error.message}`);
  process.exit(1);
}