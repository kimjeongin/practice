#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, cpSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const packageInfo = {
  name: 'RAG Server',
  productName: 'RAG-Server',
  version: '1.0.0',
  description: 'Local RAG MCP Server with vector search capabilities',
  author: 'RAG Server Team',
  publisher: 'RAG Server Team'
};

console.log('📦 Creating Windows packages...');

// Ensure directories exist
const packagesDir = join(projectRoot, 'packages', 'windows');
const executablePath = join(projectRoot, 'dist', 'executables', 'rag-server-windows-x64.exe');

if (!existsSync(packagesDir)) {
  mkdirSync(packagesDir, { recursive: true });
}

if (!existsSync(executablePath)) {
  console.error('❌ Executable not found. Please run `npm run bundle:win32` first.');
  process.exit(1);
}

try {
  // Create NSIS installer
  console.log('🔨 Creating NSIS installer...');
  createNsisInstaller();
  
  // Create MSI installer using WiX (if available)
  console.log('🔨 Creating MSI installer...');
  createMsiInstaller();
  
  // Create portable ZIP
  console.log('🔨 Creating portable ZIP...');
  createPortableZip();
  
  console.log('✅ Windows packages created successfully!');
  
} catch (error) {
  console.error(`❌ Failed to create packages: ${error.message}`);
  process.exit(1);
}

function createNsisInstaller() {
  const nsisScript = join(packagesDir, 'installer.nsi');
  const installerOutput = join(packagesDir, `${packageInfo.productName}-${packageInfo.version}-Setup.exe`);
  
  const nsisContent = `; RAG Server NSIS Installation Script
!define APPNAME "${packageInfo.name}"
!define COMPANYNAME "${packageInfo.author}"
!define DESCRIPTION "${packageInfo.description}"
!define VERSIONMAJOR "1"
!define VERSIONMINOR "0"
!define VERSIONBUILD "0"
!define HELPURL "https://github.com/example/rag-server"
!define UPDATEURL "https://github.com/example/rag-server/releases"
!define ABOUTURL "https://github.com/example/rag-server"
!define INSTALLSIZE 100000

RequestExecutionLevel admin
InstallDir "$PROGRAMFILES\\\\${packageInfo.productName}"
LicenseData "LICENSE"
Name "\${APPNAME}"
Icon "icon.ico"
OutFile "${installerOutput}"

!include LogicLib.nsh
!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
    SetOutPath $INSTDIR
    File "${executablePath.replace(/\//g, '\\\\')}"
    File /nonfatal "LICENSE"
    File /nonfatal "README.md"
    
    WriteUninstaller "$INSTDIR\\\\uninstall.exe"
    
    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\\\\\${APPNAME}"
    CreateShortCut "$SMPROGRAMS\\\\\${APPNAME}\\\\\${APPNAME}.lnk" "$INSTDIR\\\\rag-server-windows-x64.exe"
    CreateShortCut "$SMPROGRAMS\\\\\${APPNAME}\\\\Uninstall.lnk" "$INSTDIR\\\\uninstall.exe"
    
    ; Add to PATH
    EnVar::SetHKLM
    EnVar::AddValue "PATH" "$INSTDIR"
    
    ; Registry information for add/remove programs
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "DisplayName" "\${APPNAME}"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "UninstallString" "$\\"$INSTDIR\\\\uninstall.exe$\\""
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "QuietUninstallString" "$\\"$INSTDIR\\\\uninstall.exe$\\" /S"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "InstallLocation" "$\\"$INSTDIR$\\""
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "Publisher" "\${COMPANYNAME}"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "HelpLink" "\${HELPURL}"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "URLUpdateInfo" "\${UPDATEURL}"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "URLInfoAbout" "\${ABOUTURL}"
    WriteRegStr HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "DisplayVersion" "\${VERSIONMAJOR}.\${VERSIONMINOR}.\${VERSIONBUILD}"
    WriteRegDWORD HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "VersionMajor" \${VERSIONMAJOR}
    WriteRegDWORD HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "VersionMinor" \${VERSIONMINOR}
    WriteRegDWORD HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "NoModify" 1
    WriteRegDWORD HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "NoRepair" 1
    WriteRegDWORD HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}" "EstimatedSize" \${INSTALLSIZE}
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\\\\rag-server-windows-x64.exe"
    Delete "$INSTDIR\\\\LICENSE"
    Delete "$INSTDIR\\\\README.md"
    Delete "$INSTDIR\\\\uninstall.exe"
    
    ; Remove shortcuts
    Delete "$SMPROGRAMS\\\\\${APPNAME}\\\\\${APPNAME}.lnk"
    Delete "$SMPROGRAMS\\\\\${APPNAME}\\\\Uninstall.lnk"
    RMDir "$SMPROGRAMS\\\\\${APPNAME}"
    
    ; Remove from PATH
    EnVar::SetHKLM
    EnVar::DeleteValue "PATH" "$INSTDIR"
    
    ; Remove registry entries
    DeleteRegKey HKLM "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\${COMPANYNAME} \${APPNAME}"
    
    RMDir "$INSTDIR"
SectionEnd
`;

  writeFileSync(nsisScript, nsisContent);
  
  // Create basic LICENSE file if it doesn't exist
  const licensePath = join(projectRoot, 'LICENSE');
  if (!existsSync(licensePath)) {
    writeFileSync(licensePath, `MIT License

Copyright (c) 2024 ${packageInfo.author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`);
  }
  
  try {
    // Try to compile with NSIS if available
    execSync(`makensis "${nsisScript}"`, { cwd: packagesDir });
    console.log(`✅ NSIS installer created: ${installerOutput}`);
  } catch (error) {
    console.log(`⚠️  NSIS installer creation skipped (makensis not available): ${error.message}`);
  }
}

function createMsiInstaller() {
  // Create WiX source file
  const wixFile = join(packagesDir, 'installer.wxs');
  const msiOutput = join(packagesDir, `${packageInfo.productName}-${packageInfo.version}.msi`);
  
  const wixContent = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="${packageInfo.name}" Language="1033" Version="${packageInfo.version}" 
           Manufacturer="${packageInfo.publisher}" UpgradeCode="{12345678-1234-1234-1234-123456789012}">
    
    <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine" />
    
    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />
    
    <MediaTemplate />
    
    <Feature Id="ProductFeature" Title="${packageInfo.name}" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Product>
  
  <Fragment>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="${packageInfo.productName}" />
      </Directory>
    </Directory>
  </Fragment>
  
  <Fragment>
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
      <Component Id="ProductComponent">
        <File Id="ExecutableFile" Source="${executablePath}" KeyPath="yes" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>`;

  writeFileSync(wixFile, wixContent);
  
  try {
    // Try to compile with WiX if available
    execSync(`candle "${wixFile}" -out "${join(packagesDir, 'installer.wixobj')}"`);
    execSync(`light "${join(packagesDir, 'installer.wixobj')}" -out "${msiOutput}"`);
    console.log(`✅ MSI installer created: ${msiOutput}`);
  } catch (error) {
    console.log(`⚠️  MSI installer creation skipped (WiX toolset not available): ${error.message}`);
  }
}

function createPortableZip() {
  const portableDir = join(packagesDir, 'portable');
  const zipOutput = join(packagesDir, `${packageInfo.productName}-${packageInfo.version}-Portable.zip`);
  
  // Create portable directory
  if (existsSync(portableDir)) {
    execSync(`rmdir /s /q "${portableDir}"`, { shell: true });
  }
  mkdirSync(portableDir, { recursive: true });
  
  // Copy executable
  cpSync(executablePath, join(portableDir, 'rag-server.exe'));
  
  // Create batch file for easy launching
  const batchContent = `@echo off
cd /d "%~dp0"
rag-server.exe %*
pause`;
  
  writeFileSync(join(portableDir, 'start-rag-server.bat'), batchContent);
  
  // Create README
  const readmeContent = `${packageInfo.name} v${packageInfo.version} - Portable

${packageInfo.description}

Usage:
1. Double-click "start-rag-server.bat" to launch the server
2. Or run "rag-server.exe" directly from command line

This is a portable version that doesn't require installation.
You can run it from any location on your system.

For more information, visit: https://github.com/example/rag-server
`;
  
  writeFileSync(join(portableDir, 'README.txt'), readmeContent);
  
  try {
    // Create ZIP using PowerShell (available on all modern Windows)
    const powershellCmd = `Compress-Archive -Path "${portableDir}\\\\*" -DestinationPath "${zipOutput}" -Force`;
    execSync(`powershell -Command "${powershellCmd}"`, { shell: true });
    console.log(`✅ Portable ZIP created: ${zipOutput}`);
  } catch (error) {
    console.log(`⚠️  ZIP creation failed: ${error.message}`);
  }
  
  // Clean up portable directory
  execSync(`rmdir /s /q "${portableDir}"`, { shell: true });
}