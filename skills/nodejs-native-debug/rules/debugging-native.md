---
name: debugging-native
description: gdb, lldb, debugging C++ addons and Node.js core
metadata:
  tags: debugging, gdb, lldb, cpp, native-addons, core-dumps
---

# Debugging Native Code

Debugging C++ code in Node.js addons and Node.js core requires native debuggers like GDB and LLDB. This guide covers setup, common workflows, and debugging techniques.

## Setting Up

### Build with Debug Symbols

```bash
# Node.js core
./configure --debug
make -j$(nproc)

# Native addon
node-gyp configure --debug
node-gyp build --debug
```

### Debug Builds vs Release with Symbols

```python
# binding.gyp for debug symbols in release
{
  "targets": [{
    "target_name": "addon",
    "sources": ["src/addon.cc"],
    "cflags": ["-g"],
    "cflags_cc": ["-g"],
    "ldflags": ["-g"],
    "xcode_settings": {
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "YES",
      "DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym"
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "DebugInformationFormat": 3
      },
      "VCLinkerTool": {
        "GenerateDebugInformation": "true"
      }
    }
  }]
}
```

## LLDB (macOS/Linux)

### Basic Usage

```bash
# Start LLDB with Node.js
lldb -- ./node script.js

# Or attach to running process
lldb -p $(pgrep -f "node script.js")
```

### Common Commands

```lldb
# Run program
(lldb) run

# Set breakpoint by function
(lldb) breakpoint set -n MyFunction
(lldb) b MyFunction

# Set breakpoint by file:line
(lldb) breakpoint set -f addon.cc -l 42
(lldb) b addon.cc:42

# Set breakpoint on all functions matching pattern
(lldb) breakpoint set -r "MyClass::.*"

# Continue execution
(lldb) continue
(lldb) c

# Step over
(lldb) next
(lldb) n

# Step into
(lldb) step
(lldb) s

# Step out
(lldb) finish

# Print variable
(lldb) print variable
(lldb) p variable

# Print expression
(lldb) expression myVar->GetValue()
(lldb) expr myVar->GetValue()

# Print backtrace
(lldb) bt
(lldb) bt all  # All threads

# List threads
(lldb) thread list

# Switch thread
(lldb) thread select 2

# Frame info
(lldb) frame info
(lldb) frame variable  # Local variables

# Memory examination
(lldb) memory read 0x7fff5fbff8a0
(lldb) x/16xb 0x7fff5fbff8a0
```

### V8-Specific Commands

```lldb
# Print V8 object (requires debug build)
(lldb) p v8_object->Print()

# Cast and print
(lldb) p ((v8::internal::String*)str)->ToCString().get()

# Use Node.js LLDB helpers (if loaded)
(lldb) v8 print object
```

### Conditional Breakpoints

```lldb
# Break only when condition is true
(lldb) breakpoint set -f addon.cc -l 42 -c "count > 100"

# Break on specific thread
(lldb) breakpoint set -n MyFunction -t 2

# One-shot breakpoint (delete after hit)
(lldb) breakpoint set -n MyFunction --one-shot
```

## GDB (Linux)

### Basic Usage

```bash
# Start GDB
gdb --args ./node script.js

# Attach to process
gdb -p $(pgrep -f "node script.js")
```

### Common Commands

```gdb
# Run
(gdb) run
(gdb) r

# Set breakpoint
(gdb) break MyFunction
(gdb) b addon.cc:42

# Continue
(gdb) continue
(gdb) c

# Step
(gdb) next
(gdb) step
(gdb) finish

# Print
(gdb) print variable
(gdb) p variable
(gdb) p/x variable  # Hex format

# Backtrace
(gdb) backtrace
(gdb) bt
(gdb) bt full  # With local variables

# Threads
(gdb) info threads
(gdb) thread 2

# Stack frame
(gdb) frame 3
(gdb) info locals
(gdb) info args

# Memory
(gdb) x/16xb 0x7fff5fbff8a0
(gdb) x/s string_ptr  # Print string
```

### GDB Init File

```bash
# ~/.gdbinit
set print pretty on
set print object on
set print static-members on
set print vtbl on
set print demangle on
set pagination off
set history save on
set history size 10000

# Load Node.js helpers
source /path/to/node/tools/gdb/v8-gdb-helpers.py
```

### V8 GDB Helpers

```bash
# Enable in gdb
(gdb) source deps/v8/tools/gdbinit

# Use V8 print commands
(gdb) job v8_object
(gdb) jlh v8_object  # Print handle
```

## Debugging Core Dumps

### Enable Core Dumps

```bash
# Linux
ulimit -c unlimited
echo "/tmp/core.%e.%p" | sudo tee /proc/sys/kernel/core_pattern

# macOS
ulimit -c unlimited
```

### Generate Core Dump

```bash
# Force core dump
kill -SIGABRT $(pgrep node)

# Or in code
#include <signal.h>
raise(SIGABRT);
```

### Analyze Core Dump

```bash
# LLDB
lldb ./node -c /tmp/core.node.12345

# GDB
gdb ./node /tmp/core.node.12345
```

```lldb
# Common analysis
(lldb) bt all                    # All thread backtraces
(lldb) thread info               # Current thread info
(lldb) register read             # Register values
(lldb) memory read $rsp $rsp+64  # Stack memory
```

## Debugging Specific Scenarios

### Segmentation Fault

```bash
# Run with ASAN for better diagnostics
ASAN_OPTIONS=abort_on_error=1 ./node script.js

# In debugger
(lldb) run
# ... segfault occurs
(lldb) bt
(lldb) frame variable
(lldb) register read
```

### Infinite Loop

```bash
# Attach to hung process
lldb -p $(pgrep node)

(lldb) bt
# Identify the looping function
(lldb) frame select 5
(lldb) frame variable
```

### Memory Corruption

```bash
# Use Address Sanitizer
./configure --enable-asan
make -j$(nproc)

ASAN_OPTIONS=detect_stack_use_after_return=1 ./node script.js
```

### Deadlock

```bash
# Attach and check all threads
lldb -p $(pgrep node)

(lldb) bt all
(lldb) thread list

# Check locks
(lldb) frame variable
# Look for mutex state
```

## Node.js Specific Debugging

### Breaking on JavaScript Errors

```bash
# Set breakpoint on exception throwing
(lldb) breakpoint set -n "v8::internal::Isolate::Throw"

# Or on specific error type
(lldb) breakpoint set -n "v8::internal::ErrorUtils::MakeGenericError"
```

### Debugging Async Operations

```bash
# Break on uv callbacks
(lldb) breakpoint set -r "uv_.*_cb"

# Break on specific callback
(lldb) breakpoint set -n "node::StreamWrap::OnRead"
```

### Inspecting V8 Objects

```lldb
# In debug build, objects have Print() method
(lldb) p obj->Print()

# For handles
(lldb) p handle.location()->Print()

# For Local<T>
(lldb) p *local.val_->Print()
```

## Debugging N-API Addons

### Setting Breakpoints

```lldb
# Break on addon function
(lldb) breakpoint set -f addon.cc -l 42

# Break on N-API call
(lldb) breakpoint set -n napi_create_string_utf8
```

### Inspecting napi_value

```lldb
# napi_value is an opaque pointer
(lldb) p (v8::Value*)value

# Cast and inspect
(lldb) p ((v8::String*)value)->Utf8Length(isolate)
```

## Remote Debugging

### GDB Server

```bash
# On target
gdbserver :1234 ./node script.js

# On host
gdb ./node
(gdb) target remote target-machine:1234
```

### LLDB Server

```bash
# On target
lldb-server platform --listen "*:1234"

# On host
lldb
(lldb) platform select remote-linux
(lldb) platform connect connect://target-machine:1234
```

## Tips and Tricks

### Watchpoints

```lldb
# Break when variable changes
(lldb) watchpoint set variable myVar
(lldb) w s v myVar

# Break on memory write
(lldb) watchpoint set expression -w write -- &myVar
```

### Reverse Debugging (GDB)

```gdb
# Enable recording
(gdb) target record-full

# Reverse step
(gdb) reverse-step
(gdb) reverse-continue
```

### Scripting

```python
# LLDB Python script
import lldb

def my_command(debugger, command, result, internal_dict):
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    thread = process.GetSelectedThread()
    frame = thread.GetSelectedFrame()

    # Custom logic
    print(f"In function: {frame.GetFunctionName()}")

lldb.debugger.HandleCommand('command script add -f my_script.my_command mycommand')
```

## Performance Debugging

### Sampling

```bash
# macOS sample
sample node 10 -file /tmp/sample.txt

# Linux perf
perf record -g -p $(pgrep node)
perf report
```

### Flame Graphs

```bash
# Record
perf record -g -F 99 -p $(pgrep node) -- sleep 30

# Generate
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

## References

- LLDB commands: https://lldb.llvm.org/use/map.html
- GDB manual: https://sourceware.org/gdb/current/onlinedocs/gdb/
- V8 debugging: https://v8.dev/docs/debug
- Node.js debugging: https://nodejs.org/en/docs/guides/debugging-getting-started
