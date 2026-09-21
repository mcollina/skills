---
name: node-addon-api
description: node-addon-api C++ wrapper patterns and best practices
metadata:
  tags: node-addon-api, napi, cpp, native-addons, wrapper
---

# node-addon-api

`node-addon-api` is a C++ wrapper around N-API that provides a more idiomatic C++ experience. It handles type conversions, error handling, and memory management automatically.

## Setup

### Installation

```bash
npm install node-addon-api
```

### binding.gyp

```python
{
  "targets": [
    {
      "target_name": "addon",
      "sources": ["src/addon.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", {
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
      ]
    }
  ]
}
```

## Basic Addon

### src/addon.cpp

```cpp
#include <napi.h>

Napi::Value Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Argument validation
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected numbers")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  double a = info[0].As<Napi::Number>().DoubleValue();
  double b = info[1].As<Napi::Number>().DoubleValue();

  return Napi::Number::New(env, a + b);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("add", Napi::Function::New(env, Add));
  return exports;
}

NODE_API_MODULE(addon, Init)
```

## Type Conversions

### JavaScript to C++

```cpp
void ProcessValue(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Value val = info[0];

  // Type checking
  if (val.IsNumber()) {
    double num = val.As<Napi::Number>().DoubleValue();
    int32_t int32 = val.As<Napi::Number>().Int32Value();
    uint32_t uint32 = val.As<Napi::Number>().Uint32Value();
    int64_t int64 = val.As<Napi::Number>().Int64Value();
  }

  if (val.IsString()) {
    std::string str = val.As<Napi::String>().Utf8Value();
    std::u16string str16 = val.As<Napi::String>().Utf16Value();
  }

  if (val.IsBoolean()) {
    bool b = val.As<Napi::Boolean>().Value();
  }

  if (val.IsArray()) {
    Napi::Array arr = val.As<Napi::Array>();
    uint32_t len = arr.Length();
    for (uint32_t i = 0; i < len; i++) {
      Napi::Value elem = arr.Get(i);
    }
  }

  if (val.IsObject()) {
    Napi::Object obj = val.As<Napi::Object>();
    Napi::Value prop = obj.Get("propertyName");
    bool has = obj.Has("propertyName");
  }

  if (val.IsBuffer()) {
    Napi::Buffer<uint8_t> buf = val.As<Napi::Buffer<uint8_t>>();
    uint8_t* data = buf.Data();
    size_t length = buf.Length();
  }

  if (val.IsTypedArray()) {
    Napi::TypedArray typedArr = val.As<Napi::TypedArray>();
    if (typedArr.TypedArrayType() == napi_float64_array) {
      Napi::Float64Array arr = val.As<Napi::Float64Array>();
    }
  }

  if (val.IsNull()) { /* null */ }
  if (val.IsUndefined()) { /* undefined */ }
}
```

### C++ to JavaScript

```cpp
Napi::Value CreateValues(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Numbers
  Napi::Number num = Napi::Number::New(env, 42.5);

  // Strings
  Napi::String str = Napi::String::New(env, "hello");

  // Booleans
  Napi::Boolean b = Napi::Boolean::New(env, true);

  // Arrays
  Napi::Array arr = Napi::Array::New(env, 3);
  arr.Set(0u, Napi::Number::New(env, 1));
  arr.Set(1u, Napi::Number::New(env, 2));
  arr.Set(2u, Napi::Number::New(env, 3));

  // Objects
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("name", Napi::String::New(env, "test"));
  obj.Set("value", Napi::Number::New(env, 42));

  // Buffers
  Napi::Buffer<uint8_t> buf = Napi::Buffer<uint8_t>::New(env, 1024);
  // Or from existing data (copies):
  std::vector<uint8_t> data = {1, 2, 3, 4};
  Napi::Buffer<uint8_t> buf2 = Napi::Buffer<uint8_t>::Copy(env, data.data(), data.size());

  return obj;
}
```

## Error Handling

### Exception Mode (NAPI_CPP_EXCEPTIONS)

```cpp
// With NAPI_CPP_EXCEPTIONS defined, errors throw C++ exceptions

Napi::Value RiskyOperation(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  try {
    // This will throw if info[0] is not a number
    double value = info[0].As<Napi::Number>().DoubleValue();

    // Manual throw
    if (value < 0) {
      throw Napi::RangeError::New(env, "Value must be non-negative");
    }

    return Napi::Number::New(env, value * 2);

  } catch (const Napi::Error& e) {
    // Re-throw as JavaScript error
    e.ThrowAsJavaScriptException();
    return env.Undefined();
  }
}
```

### Non-Exception Mode (NAPI_DISABLE_CPP_EXCEPTIONS)

```cpp
// Without exceptions, check env.IsExceptionPending()

Napi::Value RiskyOperation(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected number").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  double value = info[0].As<Napi::Number>().DoubleValue();

  // Check if something threw
  if (env.IsExceptionPending()) {
    return env.Undefined();
  }

  return Napi::Number::New(env, value * 2);
}
```

## Object Wrapping

### Wrapped Class

```cpp
#include <napi.h>

class Counter : public Napi::ObjectWrap<Counter> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Counter(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;

  Napi::Value GetValue(const Napi::CallbackInfo& info);
  Napi::Value Increment(const Napi::CallbackInfo& info);
  Napi::Value Add(const Napi::CallbackInfo& info);

  int value_;
};

Napi::FunctionReference Counter::constructor;

Napi::Object Counter::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Counter", {
    InstanceMethod("increment", &Counter::Increment),
    InstanceMethod("add", &Counter::Add),
    InstanceAccessor("value", &Counter::GetValue, nullptr),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Counter", func);
  return exports;
}

Counter::Counter(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Counter>(info) {
  Napi::Env env = info.Env();

  if (info.Length() > 0 && info[0].IsNumber()) {
    value_ = info[0].As<Napi::Number>().Int32Value();
  } else {
    value_ = 0;
  }
}

Napi::Value Counter::GetValue(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), value_);
}

Napi::Value Counter::Increment(const Napi::CallbackInfo& info) {
  value_++;
  return Napi::Number::New(info.Env(), value_);
}

Napi::Value Counter::Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected number").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  value_ += info[0].As<Napi::Number>().Int32Value();
  return Napi::Number::New(env, value_);
}

// Module init
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return Counter::Init(env, exports);
}

NODE_API_MODULE(addon, Init)
```

### Static Methods and Properties

```cpp
Napi::Object Counter::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Counter", {
    // Instance members
    InstanceMethod("increment", &Counter::Increment),
    InstanceAccessor("value", &Counter::GetValue, nullptr),

    // Static members
    StaticMethod("create", &Counter::Create),
    StaticValue("MAX_VALUE", Napi::Number::New(env, INT_MAX)),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Counter", func);
  return exports;
}

Napi::Value Counter::Create(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int initial = info[0].IsNumber() ? info[0].As<Napi::Number>().Int32Value() : 0;
  return constructor.New({ Napi::Number::New(env, initial) });
}
```

## Async Operations

### AsyncWorker

```cpp
#include <napi.h>
#include <chrono>
#include <thread>

class SleepWorker : public Napi::AsyncWorker {
public:
  SleepWorker(Napi::Env env, int ms, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env),
        ms_(ms),
        deferred_(deferred) {}

  // Runs on thread pool
  void Execute() override {
    std::this_thread::sleep_for(std::chrono::milliseconds(ms_));
    result_ = "Slept for " + std::to_string(ms_) + "ms";
  }

  // Runs on main thread on success
  void OnOK() override {
    Napi::Env env = Env();
    deferred_.Resolve(Napi::String::New(env, result_));
  }

  // Runs on main thread on error
  void OnError(const Napi::Error& e) override {
    deferred_.Reject(e.Value());
  }

private:
  int ms_;
  Napi::Promise::Deferred deferred_;
  std::string result_;
};

Napi::Value Sleep(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  int ms = info[0].As<Napi::Number>().Int32Value();

  auto deferred = Napi::Promise::Deferred::New(env);
  auto* worker = new SleepWorker(env, ms, deferred);
  worker->Queue();

  return deferred.Promise();
}
```

### AsyncProgressWorker

```cpp
class ProgressWorker : public Napi::AsyncProgressWorker<int> {
public:
  ProgressWorker(Napi::Env env, int count, Napi::Function callback,
                 Napi::Function progressCallback)
      : Napi::AsyncProgressWorker<int>(callback),
        count_(count),
        progressCallback_(Napi::Persistent(progressCallback)) {}

  void Execute(const ExecutionProgress& progress) override {
    for (int i = 0; i < count_; i++) {
      // Report progress
      progress.Send(&i, 1);
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }

  void OnProgress(const int* data, size_t count) override {
    Napi::Env env = Env();
    progressCallback_.Call({Napi::Number::New(env, *data)});
  }

  void OnOK() override {
    Callback().Call({Env().Null(), Napi::String::New(Env(), "Done")});
  }

private:
  int count_;
  Napi::FunctionReference progressCallback_;
};
```

### ThreadSafeFunction

```cpp
#include <napi.h>
#include <thread>

using Context = Napi::Reference<Napi::Value>;

void CallJs(Napi::Env env, Napi::Function callback, Context* context, int* data) {
  if (env != nullptr && callback != nullptr) {
    callback.Call({Napi::Number::New(env, *data)});
  }
  delete data;
}

using TSFN = Napi::TypedThreadSafeFunction<Context, int, CallJs>;

Napi::Value StartThread(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  int count = info[0].As<Napi::Number>().Int32Value();
  Napi::Function callback = info[1].As<Napi::Function>();

  auto context = new Context(Napi::Persistent(info.This()));

  auto tsfn = TSFN::New(
    env,
    callback,
    "ThreadCallback",
    0,   // max queue size (0 = unlimited)
    1,   // initial thread count
    context,
    [](Napi::Env, void*, Context* ctx) { delete ctx; },  // Release callback
    (void*)nullptr
  );

  std::thread([tsfn, count]() mutable {
    for (int i = 0; i < count; i++) {
      auto* value = new int(i);
      tsfn.BlockingCall(value);
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    tsfn.Release();
  }).detach();

  return env.Undefined();
}
```

## Memory Management

### Reference Handling

```cpp
// Prevent garbage collection of JavaScript objects

class MyClass : public Napi::ObjectWrap<MyClass> {
public:
  void SetCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Store reference to callback
    callback_ = Napi::Persistent(info[0].As<Napi::Function>());

    // Default ref count is 1 (prevents GC)
    // To allow GC, use:
    // callback_.SuppressDestruct();
  }

  void ClearCallback() {
    callback_.Reset();
  }

private:
  Napi::FunctionReference callback_;
};
```

### External Memory

```cpp
// Report external memory to V8 GC

class LargeBuffer : public Napi::ObjectWrap<LargeBuffer> {
public:
  LargeBuffer(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<LargeBuffer>(info) {
    Napi::Env env = info.Env();

    size_ = info[0].As<Napi::Number>().Uint32Value();
    data_ = new uint8_t[size_];

    // Tell V8 about external memory
    Napi::MemoryManagement::AdjustExternalMemory(env, size_);
  }

  ~LargeBuffer() {
    delete[] data_;
    // Note: Can't call AdjustExternalMemory in destructor
    // (env may not be valid)
  }

  static void Destructor(Napi::Env env, LargeBuffer* buffer) {
    // Adjust external memory here
    Napi::MemoryManagement::AdjustExternalMemory(env, -buffer->size_);
    delete buffer;
  }

private:
  uint8_t* data_;
  size_t size_;
};
```

## Best Practices

### Avoid Blocking the Main Thread

```cpp
// BAD: Blocking operation
Napi::Value ReadFile(const Napi::CallbackInfo& info) {
  // This blocks the event loop!
  std::ifstream file(path);
  std::string content((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
  return Napi::String::New(info.Env(), content);
}

// GOOD: Use AsyncWorker
Napi::Value ReadFileAsync(const Napi::CallbackInfo& info) {
  auto* worker = new ReadFileWorker(info.Env(), path, deferred);
  worker->Queue();
  return deferred.Promise();
}
```

### Proper Error Messages

```cpp
// Include context in errors
if (!info[0].IsString()) {
  throw Napi::TypeError::New(env,
    "Argument 0 (filename) must be a string, received " +
    std::string(info[0].Type()));
}
```

### Resource Cleanup

```cpp
// Use RAII patterns
class ScopedLock {
public:
  ScopedLock(std::mutex& m) : mutex_(m) { mutex_.lock(); }
  ~ScopedLock() { mutex_.unlock(); }
private:
  std::mutex& mutex_;
};

Napi::Value ThreadSafeAccess(const Napi::CallbackInfo& info) {
  ScopedLock lock(mutex_);
  // Safe access to shared resource
  return Napi::Number::New(info.Env(), sharedValue_);
}
```

## Debugging

### Logging

```cpp
#include <iostream>

// Debug logging
#ifdef DEBUG
#define LOG(msg) std::cerr << "[addon] " << msg << std::endl
#else
#define LOG(msg)
#endif

Napi::Value MyFunction(const Napi::CallbackInfo& info) {
  LOG("MyFunction called with " << info.Length() << " args");
  // ...
}
```

### GDB/LLDB

```bash
# Build with debug symbols
node-gyp rebuild --debug

# Run with debugger
lldb -- node test.js

# In lldb:
(lldb) break set -f addon.cpp -l 42
(lldb) run
```

## References

- node-addon-api documentation: https://github.com/nodejs/node-addon-api
- API reference: https://github.com/nodejs/node-addon-api/blob/main/doc/
- Examples: https://github.com/nodejs/node-addon-examples
