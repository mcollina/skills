---
name: build-system
description: gyp, ninja, make, cross-platform compilation for Node.js
metadata:
  tags: build, gyp, ninja, make, compilation, cross-platform
---

# Node.js Build System

Understanding the Node.js build system is essential for building from source, debugging build issues, and developing native addons.

## Build System Overview

```
Source Code
     │
     ▼
configure (Python)     ←── Detects platform, creates config
     │
     ▼
GYP (generate-your-project)  ←── Creates platform-specific build files
     │
     ├──> Makefile (Linux/macOS)
     ├──> Ninja files
     └──> MSBuild (Windows)
            │
            ▼
     Compiler (gcc/clang/MSVC)
            │
            ▼
     Node.js binary
```

## Building Node.js from Source

For the day-to-day edit-build-lint-test workflow, see
[build-and-test-workflow.md](build-and-test-workflow.md).

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt-get install -y \
  build-essential \
  python3 \
  g++ \
  make \
  ninja-build

# macOS
xcode-select --install

# Windows
# Install Visual Studio 2022 with C++ workload
# Install Python 3
```

## GYP (Generate Your Project)

### binding.gyp Structure

```python
{
  "targets": [
    {
      "target_name": "addon",
      "sources": ["src/addon.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_VERSION=8"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", {
          "defines": ["_HAS_EXCEPTIONS=1"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }]
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ]
    }
  ]
}
```

### GYP Variables

```python
{
  "variables": {
    "myvar": "default_value",
    "othervar%": "value_if_not_set"  # % means "set if not defined"
  },
  "targets": [{
    "target_name": "addon",
    "defines": ["MY_VAR=<(myvar)"]  # Use variable
  }]
}
```

### Conditional Compilation

```python
{
  "conditions": [
    # OS conditions
    ["OS=='linux'", {
      "sources": ["src/linux.cc"],
      "libraries": ["-lpthread"]
    }],
    ["OS=='mac'", {
      "sources": ["src/mac.cc"],
      "libraries": ["-framework CoreFoundation"]
    }],
    ["OS=='win'", {
      "sources": ["src/win.cc"],
      "libraries": ["ws2_32.lib"]
    }],

    # Architecture conditions
    ["target_arch=='x64'", {
      "defines": ["IS_64BIT"]
    }],

    # Node version conditions
    ["node_major_version >= 18", {
      "defines": ["HAS_NEW_FEATURE"]
    }]
  ]
}
```

## node-gyp

### Installation and Usage

```bash
# Install globally
npm install -g node-gyp

# Configure (generates build files)
node-gyp configure

# Build
node-gyp build

# Rebuild (clean + configure + build)
node-gyp rebuild

# Clean
node-gyp clean

# Debug build
node-gyp configure --debug
node-gyp build --debug
```

### Common node-gyp Issues

```bash
# Python not found
npm config set python /usr/bin/python3
# Or set environment variable
export PYTHON=/usr/bin/python3

# Visual Studio not found (Windows)
npm config set msvs_version 2022

# Specify Node.js headers location
node-gyp rebuild --nodedir=/path/to/node

# Download headers manually
node-gyp install
```

## CMake.js Alternative

For projects preferring CMake:

```bash
npm install cmake-js --save-dev
```

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(addon)

include_directories(${CMAKE_JS_INC})

add_library(${PROJECT_NAME} SHARED
  src/addon.cpp
)

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})
```

## Cross-Compilation

### Building for Different Architectures

```bash
# ARM64 on x64 host
./configure \
  --dest-cpu=arm64 \
  --dest-os=linux \
  --cross-compiling

make -j$(nproc)
```

### Docker Cross-Compile

```dockerfile
FROM dockcross/linux-arm64

RUN apt-get update && apt-get install -y python3

WORKDIR /src
COPY . .

RUN ./configure --dest-cpu=arm64 --dest-os=linux
RUN make -j$(nproc)
```

### Native Addons Cross-Compile

```bash
# Set target architecture
npm config set target_arch arm64

# Set Node.js headers
npm config set nodedir /path/to/node-arm64

# Rebuild all native addons
npm rebuild
```

## Build Debugging

### Verbose Build

```bash
# node-gyp verbose
node-gyp rebuild --verbose

# Very verbose
node-gyp rebuild --loglevel=silly
```

For Node.js core build verbosity (`make V=1`), see
[build-and-test-workflow.md](build-and-test-workflow.md#build).

### Common Build Errors

```bash
# Missing Python
# Solution: Install Python 3 and set path
export PYTHON=/usr/bin/python3

# Missing compiler
# Solution: Install build tools
# Ubuntu: apt install build-essential
# macOS: xcode-select --install

# Header not found
# Example: fatal error: node.h: No such file or directory
# Solution: Install Node.js development headers
node-gyp install

# Symbol not found (linking)
# Example: undefined reference to `symbol_name'
# Check: Library order, missing dependencies
# Solution: Add to "libraries" in binding.gyp

# ABI mismatch
# Example: "Module version mismatch"
# Solution: Rebuild for current Node.js version
npm rebuild
```

### Build with Debug Symbols

```python
# binding.gyp
{
  "targets": [{
    "target_name": "addon",
    "sources": ["src/addon.cc"],
    "cflags": ["-g", "-O0"],
    "cflags_cc": ["-g", "-O0"],
    "xcode_settings": {
      "GCC_OPTIMIZATION_LEVEL": "0",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "YES"
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "Optimization": 0,
        "DebugInformationFormat": 3
      }
    }
  }]
}
```

## Static Analysis for Addons

```bash
# For addons, use clang-tidy
clang-tidy src/*.cc -- -I$(node -p "require('node-addon-api').include")

# Build addon with ASan
node-gyp rebuild --debug
ASAN_OPTIONS=detect_leaks=1 node test.js
```

For Node.js core linting and formatting, see
[build-and-test-workflow.md](build-and-test-workflow.md#lint).

## Prebuild Binaries

### prebuildify

```bash
npm install prebuildify --save-dev
```

```json
{
  "scripts": {
    "prebuild": "prebuildify --napi --strip",
    "prebuild-cross": "prebuildify-cross -i centos7 -i alpine"
  }
}
```

### node-pre-gyp

```json
{
  "binary": {
    "module_name": "addon",
    "module_path": "./lib/binding/{platform}-{arch}",
    "host": "https://github.com/user/repo/releases/download/",
    "remote_path": "v{version}",
    "package_name": "{module_name}-v{version}-{platform}-{arch}.tar.gz"
  }
}
```

## Platform-Specific Notes

### Linux

```bash
# Use specific GCC version
export CC=gcc-11
export CXX=g++-11
./configure

# Static linking
./configure --fully-static
```

### macOS

```bash
# Universal binary (Intel + Apple Silicon)
./configure --dest-cpu=arm64
make -j$(nproc)
mv out/Release/node node-arm64

./configure --dest-cpu=x64
make -j$(nproc)
mv out/Release/node node-x64

lipo -create -output node node-arm64 node-x64
```

### Windows

```powershell
# Use specific Visual Studio version
.\vcbuild.bat vs2022

# Build 64-bit
.\vcbuild.bat x64

# Release build
.\vcbuild.bat release

# Debug build
.\vcbuild.bat debug
```

## References

- Node.js Building: https://github.com/nodejs/node/blob/main/BUILDING.md
- GYP documentation: https://gyp.gsrc.io/docs/UserDocumentation.md
- node-gyp: https://github.com/nodejs/node-gyp
- prebuildify: https://github.com/prebuild/prebuildify
