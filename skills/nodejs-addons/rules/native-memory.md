---
name: native-memory
description: Buffer handling, external memory, prevent leaks in native addons
metadata:
  tags: native-memory, buffers, external-memory, memory-leaks, native-addons
---

# Native Memory Management

Managing memory correctly in native addons is critical to prevent leaks, crashes, and security vulnerabilities. This guide covers Buffer handling, external memory tracking, and leak prevention.

## Memory Allocation Strategies

### Stack vs Heap

```cpp
// Stack allocation: Fast, automatic cleanup, limited size
void ProcessSmallData(const Napi::CallbackInfo& info) {
  uint8_t buffer[1024];  // Stack allocated
  // Automatically freed when function returns
}

// Heap allocation: Larger data, manual management required
void ProcessLargeData(const Napi::CallbackInfo& info) {
  uint8_t* buffer = new uint8_t[1024 * 1024];  // Heap allocated
  // MUST be explicitly deleted
  delete[] buffer;
}
```

### Smart Pointers

```cpp
#include <memory>

class MyAddon : public Napi::ObjectWrap<MyAddon> {
private:
  // Automatically deleted when object is destroyed
  std::unique_ptr<uint8_t[]> buffer_;
  std::shared_ptr<Database> db_;

public:
  MyAddon(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<MyAddon>(info),
        buffer_(std::make_unique<uint8_t[]>(1024)),
        db_(std::make_shared<Database>()) {}

  // No manual cleanup needed!
};
```

## Buffer Handling

### Creating Buffers

```cpp
// Option 1: Node.js allocates and owns the memory
Napi::Value CreateBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  size_t size = info[0].As<Napi::Number>().Uint32Value();

  // Node.js allocates and manages this memory
  Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::New(env, size);

  // Fill with data
  uint8_t* data = buffer.Data();
  memset(data, 0, size);

  return buffer;
}

// Option 2: Copy existing data into a new Buffer
Napi::Value CopyToBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::vector<uint8_t> data = GetDataFromSomewhere();

  // Copies data - safe, original can be freed
  return Napi::Buffer<uint8_t>::Copy(env, data.data(), data.size());
}

// Option 3: External buffer with custom finalizer
Napi::Value CreateExternalBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  size_t size = 1024 * 1024;
  uint8_t* data = new uint8_t[size];
  FillWithData(data, size);

  // Buffer takes ownership, calls finalizer on GC
  return Napi::Buffer<uint8_t>::New(
    env,
    data,
    size,
    [](Napi::Env env, uint8_t* data) {
      delete[] data;
    }
  );
}
```

### Receiving Buffers

```cpp
Napi::Value ProcessBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();

  // Access buffer data (valid only while buffer is alive!)
  uint8_t* data = buffer.Data();
  size_t length = buffer.Length();

  // Process data...
  uint32_t sum = 0;
  for (size_t i = 0; i < length; i++) {
    sum += data[i];
  }

  return Napi::Number::New(env, sum);
}
```

### Buffer Lifetime

```cpp
// DANGER: Buffer data pointer may become invalid!

class BadExample : public Napi::ObjectWrap<BadExample> {
  uint8_t* cached_data_;  // WRONG: Pointer to Buffer data
  size_t cached_size_;

  void StoreBuffer(const Napi::CallbackInfo& info) {
    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    // BAD: Buffer may be garbage collected!
    cached_data_ = buffer.Data();
    cached_size_ = buffer.Length();
  }
};

// CORRECT: Keep a reference to the Buffer
class GoodExample : public Napi::ObjectWrap<GoodExample> {
  Napi::Reference<Napi::Buffer<uint8_t>> buffer_ref_;

  void StoreBuffer(const Napi::CallbackInfo& info) {
    Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
    // Keep reference to prevent GC
    buffer_ref_ = Napi::Persistent(buffer);
  }

  Napi::Value ProcessStored(const Napi::CallbackInfo& info) {
    if (buffer_ref_.IsEmpty()) {
      Napi::Error::New(info.Env(), "No buffer stored").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }

    Napi::Buffer<uint8_t> buffer = buffer_ref_.Value();
    // Safe to access: reference keeps buffer alive
    uint8_t* data = buffer.Data();
    size_t length = buffer.Length();
    // ...
  }
};
```

## External Memory Tracking

V8's garbage collector doesn't know about native memory. You must tell it about large allocations.

### AdjustExternalMemory

```cpp
class LargeNativeBuffer : public Napi::ObjectWrap<LargeNativeBuffer> {
public:
  LargeNativeBuffer(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<LargeNativeBuffer>(info) {
    Napi::Env env = info.Env();

    size_ = info[0].As<Napi::Number>().Int64Value();
    data_ = new uint8_t[size_];

    // Tell V8 about this allocation
    // Increases pressure for GC
    Napi::MemoryManagement::AdjustExternalMemory(env, size_);
  }

  ~LargeNativeBuffer() {
    // Note: Cannot call AdjustExternalMemory here!
    // Destructor may run on different thread or after env is gone
    delete[] data_;
  }

  // Custom destructor called by N-API
  static void Destroy(Napi::Env env, LargeNativeBuffer* instance, void* hint) {
    // Safe to adjust memory here
    Napi::MemoryManagement::AdjustExternalMemory(env, -instance->size_);
    delete instance;
  }

private:
  uint8_t* data_;
  int64_t size_;
};
```

### When to Track Memory

```cpp
// Track when:
// 1. Allocating large buffers (> 64KB)
// 2. Caching data that persists across calls
// 3. Holding references to external libraries' memory

// Don't track:
// 1. Small temporary allocations
// 2. Memory managed by Napi::Buffer (Node.js already knows)
// 3. Stack-allocated memory
```

## Preventing Memory Leaks

### Common Leak Patterns

```cpp
// LEAK: Forgetting to delete
Napi::Value Leaky(const Napi::CallbackInfo& info) {
  uint8_t* data = new uint8_t[1024];
  ProcessData(data);
  // LEAK: data never deleted!
  return info.Env().Undefined();
}

// LEAK: Exception path
Napi::Value LeakyWithException(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  uint8_t* data = new uint8_t[1024];

  if (!info[0].IsNumber()) {
    // LEAK: data not deleted before throw!
    throw Napi::TypeError::New(env, "Expected number");
  }

  delete[] data;
  return env.Undefined();
}

// FIX: Use RAII
Napi::Value Safe(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::unique_ptr<uint8_t[]> data(new uint8_t[1024]);

  if (!info[0].IsNumber()) {
    // data automatically deleted!
    throw Napi::TypeError::New(env, "Expected number");
  }

  return env.Undefined();
  // data automatically deleted!
}
```

### Reference Cycle Leaks

```cpp
// LEAK: Circular references between C++ and JavaScript

class Parent : public Napi::ObjectWrap<Parent> {
  Napi::Reference<Napi::Object> child_;  // Strong ref to child
};

class Child : public Napi::ObjectWrap<Child> {
  Napi::Reference<Napi::Object> parent_;  // Strong ref to parent
  // Both stay alive forever!
};

// FIX: Use weak references where appropriate
class ChildFixed : public Napi::ObjectWrap<ChildFixed> {
  Napi::ObjectReference parent_;  // Weak reference

  void SetParent(const Napi::CallbackInfo& info) {
    parent_ = Napi::Weak(info[0].As<Napi::Object>());
  }

  Napi::Value GetParent(const Napi::CallbackInfo& info) {
    if (parent_.IsEmpty()) {
      return info.Env().Undefined();  // Parent was GC'd
    }
    return parent_.Value();
  }
};
```

### Event Listener Leaks

```cpp
// LEAK: ThreadSafeFunction not released

class EventEmitter : public Napi::ObjectWrap<EventEmitter> {
  Napi::ThreadSafeFunction tsfn_;

  void AddListener(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Creates a strong reference to callback
    tsfn_ = Napi::ThreadSafeFunction::New(
      env,
      info[0].As<Napi::Function>(),
      "listener",
      0, 1
    );
    // If never Released(), callback stays alive forever!
  }

  // MUST provide cleanup
  void RemoveListener(const Napi::CallbackInfo& info) {
    if (tsfn_) {
      tsfn_.Release();
    }
  }

  ~EventEmitter() {
    // Also cleanup in destructor
    if (tsfn_) {
      tsfn_.Release();
    }
  }
};
```

### AsyncWorker Leaks

```cpp
// AsyncWorker is self-deleting, but beware of captured pointers

class BadWorker : public Napi::AsyncWorker {
  SomeClass* instance_;  // Raw pointer

public:
  BadWorker(SomeClass* instance, Napi::Function callback)
      : Napi::AsyncWorker(callback), instance_(instance) {
    // If instance_ is deleted while worker runs, crash!
  }

  void Execute() override {
    // Accessing instance_ here is dangerous
  }
};

// FIX: Copy data or use shared_ptr
class GoodWorker : public Napi::AsyncWorker {
  std::shared_ptr<SomeClass> instance_;
  std::string data_;  // Copied data

public:
  GoodWorker(std::shared_ptr<SomeClass> instance, std::string data,
             Napi::Function callback)
      : Napi::AsyncWorker(callback),
        instance_(instance),
        data_(std::move(data)) {}

  void Execute() override {
    // Safe: we own the data
  }
};
```

## Debugging Memory Issues

### Valgrind

```bash
# Build debug version
node-gyp rebuild --debug

# Run with valgrind
valgrind --leak-check=full --show-leak-kinds=all \
  node --expose-gc test.js 2>&1 | tee valgrind.log

# Force GC in test.js
// test.js
const addon = require('./build/Debug/addon');
addon.createSomething();
global.gc();  // Force GC to check for leaks
```

### AddressSanitizer

```python
# In binding.gyp
{
  "targets": [{
    "target_name": "addon",
    "sources": ["src/addon.cpp"],
    "cflags": ["-fsanitize=address", "-fno-omit-frame-pointer"],
    "ldflags": ["-fsanitize=address"],
    # macOS:
    "xcode_settings": {
      "OTHER_CFLAGS": ["-fsanitize=address"],
      "OTHER_LDFLAGS": ["-fsanitize=address"]
    }
  }]
}
```

```bash
# Run with ASan
ASAN_OPTIONS=detect_leaks=1 node test.js
```

### Heap Snapshots

```javascript
const v8 = require('node:v8');
const addon = require('./build/Release/addon');

// Take baseline snapshot
v8.writeHeapSnapshot('before.heapsnapshot');

// Use addon
for (let i = 0; i < 10000; i++) {
  addon.createObject();
}

// Force GC
if (global.gc) global.gc();

// Take comparison snapshot
v8.writeHeapSnapshot('after.heapsnapshot');

// Compare in Chrome DevTools
```

### Tracking Native Memory

```cpp
#include <atomic>

class MemoryTracker {
public:
  static std::atomic<size_t> allocated;
  static std::atomic<size_t> freed;

  static void* Track(size_t size) {
    void* ptr = malloc(size);
    if (ptr) {
      allocated += size;
    }
    return ptr;
  }

  static void Untrack(void* ptr, size_t size) {
    freed += size;
    free(ptr);
  }

  static size_t Outstanding() {
    return allocated - freed;
  }
};

std::atomic<size_t> MemoryTracker::allocated{0};
std::atomic<size_t> MemoryTracker::freed{0};

// Expose to JavaScript
Napi::Value GetMemoryStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object stats = Napi::Object::New(env);
  stats.Set("allocated", Napi::Number::New(env, MemoryTracker::allocated.load()));
  stats.Set("freed", Napi::Number::New(env, MemoryTracker::freed.load()));
  stats.Set("outstanding", Napi::Number::New(env, MemoryTracker::Outstanding()));
  return stats;
}
```

## Best Practices Summary

1. **Use RAII**: Prefer `std::unique_ptr`, `std::shared_ptr`, and containers

2. **Track external memory**: Call `AdjustExternalMemory` for large allocations

3. **Copy data for async**: Don't hold pointers across async boundaries

4. **Release references**: Clean up `Napi::Reference` and `ThreadSafeFunction`

5. **Test with tools**: Use Valgrind, ASan, and heap snapshots

6. **Handle exceptions**: Ensure cleanup in all code paths

7. **Document ownership**: Be explicit about who owns what memory

## References

- V8 Memory Management: https://v8.dev/blog/high-performance-gc
- Node.js Buffer API: https://nodejs.org/api/buffer.html
- AddressSanitizer: https://clang.llvm.org/docs/AddressSanitizer.html
