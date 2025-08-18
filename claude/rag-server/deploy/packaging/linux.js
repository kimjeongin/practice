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
  name: 'rag-server',
  version: '1.0.0',
  description: 'Local RAG MCP Server with vector search capabilities',
  maintainer: 'RAG Server Team',
  arch: 'amd64'
};

console.log('📦 Creating Linux packages...');

// Ensure directories exist
const packagesDir = join(projectRoot, 'packages', 'linux');
const executablePath = join(projectRoot, 'dist', 'executables', 'rag-server-linux-x64');

if (!existsSync(packagesDir)) {
  mkdirSync(packagesDir, { recursive: true });
}

if (!existsSync(executablePath)) {
  console.error('❌ Executable not found. Please run `npm run bundle:linux` first.');
  process.exit(1);
}

try {
  // Create DEB package
  console.log('🔨 Creating DEB package...');
  createDebPackage();
  
  // Create RPM package (optional)
  console.log('🔨 Creating RPM package...');
  createRpmPackage();
  
  // Create AppImage (TODO: requires more complex setup)
  console.log('⏳ AppImage creation skipped (requires additional setup)');
  
  console.log('✅ Linux packages created successfully!');
  
} catch (error) {
  console.error(`❌ Failed to create packages: ${error.message}`);
  process.exit(1);
}

function createDebPackage() {
  const debDir = join(packagesDir, 'deb-temp');
  const binDir = join(debDir, 'usr', 'local', 'bin');
  const debianDir = join(debDir, 'DEBIAN');
  
  // Clean and create directories
  if (existsSync(debDir)) {
    execSync(`rm -rf "${debDir}"`);
  }
  mkdirSync(binDir, { recursive: true });
  mkdirSync(debianDir, { recursive: true });
  
  // Copy executable
  cpSync(executablePath, join(binDir, 'rag-server'));
  chmodSync(join(binDir, 'rag-server'), 0o755);
  
  // Create control file
  const controlContent = `Package: ${packageInfo.name}
Version: ${packageInfo.version}
Section: utils
Priority: optional
Architecture: ${packageInfo.arch}
Maintainer: ${packageInfo.maintainer}
Description: ${packageInfo.description}
 A local RAG server with vector search capabilities for desktop applications.
 Provides MCP (Model Context Protocol) interface for AI integrations.
`;
  
  writeFileSync(join(debianDir, 'control'), controlContent);
  
  // Create desktop file (optional)
  const applicationsDir = join(debDir, 'usr', 'share', 'applications');
  mkdirSync(applicationsDir, { recursive: true });
  
  const desktopContent = `[Desktop Entry]
Name=RAG Server
Comment=${packageInfo.description}
Exec=/usr/local/bin/rag-server
Icon=utilities-terminal
Terminal=true
Type=Application
Categories=Development;Utility;
`;
  
  writeFileSync(join(applicationsDir, 'rag-server.desktop'), desktopContent);
  
  // Build DEB package
  const debOutput = join(packagesDir, `${packageInfo.name}_${packageInfo.version}_${packageInfo.arch}.deb`);
  execSync(`dpkg-deb --build "${debDir}" "${debOutput}"`);
  
  // Clean up temp directory
  execSync(`rm -rf "${debDir}"`);
  
  console.log(`✅ DEB package created: ${debOutput}`);
}

function createRpmPackage() {
  // Create RPM spec file
  const rpmDir = join(packagesDir, 'rpm-temp');
  const specFile = join(rpmDir, `${packageInfo.name}.spec`);
  
  if (!existsSync(rpmDir)) {
    mkdirSync(rpmDir, { recursive: true });
  }
  
  const specContent = `
Name:           ${packageInfo.name}
Version:        ${packageInfo.version}
Release:        1%{?dist}
Summary:        ${packageInfo.description}

License:        MIT
URL:            https://github.com/example/rag-server
Source0:        rag-server-linux-x64

BuildArch:      x86_64
Requires:       glibc

%description
${packageInfo.description}
A local RAG server with vector search capabilities for desktop applications.

%prep

%build

%install
mkdir -p %{buildroot}/usr/local/bin
install -m 755 %{SOURCE0} %{buildroot}/usr/local/bin/rag-server

%files
/usr/local/bin/rag-server

%changelog
* $(date '+%a %b %d %Y') ${packageInfo.maintainer} - ${packageInfo.version}-1
- Initial package
`;
  
  writeFileSync(specFile, specContent);
  
  // Copy source file
  cpSync(executablePath, join(rpmDir, 'rag-server-linux-x64'));
  
  try {
    // Try to build RPM if rpmbuild is available
    execSync('which rpmbuild', { stdio: 'ignore' });
    execSync(`rpmbuild -bb "${specFile}" --define "_rpmdir ${packagesDir}" --define "_sourcedir ${rpmDir}"`);
    console.log(`✅ RPM package created in ${packagesDir}`);
  } catch (error) {
    console.log(`⚠️  RPM build skipped (rpmbuild not available)`);
  }
  
  // Clean up temp directory
  execSync(`rm -rf "${rpmDir}"`);
}