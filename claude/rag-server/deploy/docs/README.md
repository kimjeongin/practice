# 🚀 Deployment Documentation

This directory contains all deployment and distribution related files for the RAG Server project.

## 📁 Directory Structure

```
deploy/
├── scripts/           # Build and automation scripts
│   └── build-executable.js    # Cross-platform executable builder
├── packaging/         # Platform-specific packaging scripts  
│   ├── linux.js      # Linux .deb/.rpm package creation
│   ├── macos.js      # macOS .pkg/.dmg package creation
│   └── windows.js    # Windows .msi/.exe installer creation
├── docker/           # Docker deployment files
│   ├── Dockerfile    # Multi-stage build configuration
│   └── docker-compose.yml     # Development/build environments
└── docs/            # Deployment documentation
    └── README.md    # This file
```

## 🎯 Quick Start

### Build Executables

```bash
# Build all platforms
npm run build:executable

# Build specific platform
npm run bundle:linux     # Creates rag-server-linux-x64
npm run bundle:macos     # Creates rag-server-macos-x64  
npm run bundle:windows   # Creates rag-server-windows-x64.exe
```

### Create Distribution Packages

```bash
# Create all platform packages
npm run package:all

# Create specific platform packages
npm run package:linux    # Creates .deb/.rpm packages
npm run package:macos    # Creates .pkg/.dmg packages  
npm run package:windows  # Creates .msi/.exe installers
```

### Complete Release Build

```bash
# Build executables + create packages
npm run release:build
```

## 🐳 Docker Usage

```bash
# Development environment
docker-compose -f deploy/docker/docker-compose.yml up rag-server-dev

# Build Linux executable in Docker
docker-compose -f deploy/docker/docker-compose.yml run build-linux

# Build all executables via Docker
docker-compose -f deploy/docker/docker-compose.yml run build-linux
docker-compose -f deploy/docker/docker-compose.yml run build-windows
```

## 📦 Output Locations

- **Executables**: `dist/executables/`
- **Packages**: `packages/[platform]/`

## 🔧 Requirements

### Development Requirements
- Node.js 18+ 
- pnpm 9.0.0

### Platform-Specific Packaging Requirements

#### Linux
- `dpkg-deb` (for .deb packages)
- `rpmbuild` (for .rpm packages, optional)

#### macOS  
- `pkgbuild` (for .pkg installers)
- `hdiutil` (for .dmg disk images)

#### Windows
- `makensis` (NSIS, for .exe installers, optional)
- `candle` & `light` (WiX Toolset, for .msi installers, optional)
- `powershell` (for .zip creation)

> **Note**: Missing tools will be gracefully skipped with warnings.

## 🚀 CI/CD

GitHub Actions automatically builds and packages releases:

- **Trigger**: Tags matching `v*` pattern
- **Platforms**: Linux x64, macOS x64, Windows x64
- **Output**: GitHub Releases with all executables and packages

## 🛠️ Customization

### Adding New Platforms

1. Update `config` object in `deploy/scripts/build-executable.js`
2. Add new platform to GitHub Actions matrix
3. Create platform-specific packaging script if needed

### Modifying Package Contents

Edit the respective packaging scripts:
- Linux: `deploy/packaging/linux.js`
- macOS: `deploy/packaging/macos.js`  
- Windows: `deploy/packaging/windows.js`

## 📋 Troubleshooting

### Common Issues

1. **"Executable not found"**: Run `npm run build` first
2. **Permission errors**: Ensure scripts have execute permissions
3. **Missing packaging tools**: Install platform-specific requirements
4. **Docker issues**: Ensure Docker is running and has sufficient resources

### Getting Help

- Check GitHub Actions logs for CI/CD issues
- Open an issue with deployment logs
- Review platform-specific requirements above