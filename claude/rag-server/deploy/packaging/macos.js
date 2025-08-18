#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, cpSync, chmodSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const packageInfo = {
  name: 'RAG Server',
  bundleId: 'com.ragserver.app',
  version: '1.0.0',
  description: 'Local RAG MCP Server with vector search capabilities',
  author: 'RAG Server Team'
};

console.log('📦 Creating macOS packages...');

// Ensure directories exist
const packagesDir = join(projectRoot, 'packages', 'macos');
const executablePath = join(projectRoot, 'dist', 'executables', 'rag-server-macos-x64');

if (!existsSync(packagesDir)) {
  mkdirSync(packagesDir, { recursive: true });
}

if (!existsSync(executablePath)) {
  console.error('❌ Executable not found. Please run `npm run bundle:darwin` first.');
  process.exit(1);
}

try {
  // Create .app bundle
  console.log('🔨 Creating .app bundle...');
  createAppBundle();
  
  // Create .pkg installer
  console.log('🔨 Creating .pkg installer...');
  createPkgInstaller();
  
  // Create .dmg disk image
  console.log('🔨 Creating .dmg disk image...');
  createDmgImage();
  
  console.log('✅ macOS packages created successfully!');
  
} catch (error) {
  console.error(`❌ Failed to create packages: ${error.message}`);
  process.exit(1);
}

function createAppBundle() {
  const appDir = join(packagesDir, `${packageInfo.name}.app`);
  const contentsDir = join(appDir, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');
  
  // Clean and create directories
  if (existsSync(appDir)) {
    execSync(`rm -rf "${appDir}"`);
  }
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  
  // Copy executable
  cpSync(executablePath, join(macosDir, 'rag-server'));
  chmodSync(join(macosDir, 'rag-server'), 0o755);
  
  // Create wrapper script for GUI launch
  const wrapperScript = `#!/bin/bash
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
exec ./rag-server "$@"
`;
  writeFileSync(join(macosDir, packageInfo.name.replace(/\s+/g, '')), wrapperScript);
  chmodSync(join(macosDir, packageInfo.name.replace(/\s+/g, '')), 0o755);
  
  // Create Info.plist
  const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${packageInfo.name.replace(/\s+/g, '')}</string>
    <key>CFBundleIdentifier</key>
    <string>${packageInfo.bundleId}</string>
    <key>CFBundleName</key>
    <string>${packageInfo.name}</string>
    <key>CFBundleVersion</key>
    <string>${packageInfo.version}</string>
    <key>CFBundleShortVersionString</key>
    <string>${packageInfo.version}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
`;
  
  writeFileSync(join(contentsDir, 'Info.plist'), infoPlistContent);
  
  console.log(`✅ App bundle created: ${appDir}`);
}

function createPkgInstaller() {
  const appDir = join(packagesDir, `${packageInfo.name}.app`);
  const pkgOutput = join(packagesDir, `${packageInfo.name}-${packageInfo.version}.pkg`);
  
  try {
    // Create installer package
    execSync(`pkgbuild --root "${appDir}" --identifier "${packageInfo.bundleId}" --version "${packageInfo.version}" --install-location "/Applications/${packageInfo.name}.app" "${pkgOutput}"`);
    console.log(`✅ PKG installer created: ${pkgOutput}`);
  } catch (error) {
    console.log(`⚠️  PKG creation skipped (macOS required): ${error.message}`);
  }
}

function createDmgImage() {
  const appDir = join(packagesDir, `${packageInfo.name}.app`);
  const dmgOutput = join(packagesDir, `${packageInfo.name}-${packageInfo.version}.dmg`);
  const tempDmgDir = join(packagesDir, 'dmg-temp');
  
  try {
    // Create temporary directory for DMG contents
    if (existsSync(tempDmgDir)) {
      execSync(`rm -rf "${tempDmgDir}"`);
    }
    mkdirSync(tempDmgDir, { recursive: true });
    
    // Copy app to temp directory
    cpSync(appDir, join(tempDmgDir, `${packageInfo.name}.app`), { recursive: true });
    
    // Create Applications symlink
    execSync(`ln -sf /Applications "${tempDmgDir}/Applications"`);
    
    // Create README
    const readmeContent = `${packageInfo.name} v${packageInfo.version}

${packageInfo.description}

Installation:
1. Drag "${packageInfo.name}" to the Applications folder
2. Open Terminal and run: ${packageInfo.name.toLowerCase().replace(/\s+/g, '-')}

For command line usage:
/Applications/${packageInfo.name}.app/Contents/MacOS/rag-server
`;
    
    writeFileSync(join(tempDmgDir, 'README.txt'), readmeContent);
    
    // Create DMG using hdiutil
    execSync(`hdiutil create -volname "${packageInfo.name}" -srcfolder "${tempDmgDir}" -ov -format UDZO "${dmgOutput}"`);
    
    // Clean up
    execSync(`rm -rf "${tempDmgDir}"`);
    
    console.log(`✅ DMG image created: ${dmgOutput}`);
  } catch (error) {
    console.log(`⚠️  DMG creation skipped (macOS required): ${error.message}`);
  }
}