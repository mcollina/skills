---
name: napi
description: N-API development, ABI stability, async workers
metadata:
  tags: napi, native-addons, c, abi-stability, async-workers
---

# N-API (Node-API)

N-API is Node.js's ABI-stable API for building native addons. Code written with N-API is compatible across Node.js versions without recompilation.

## Why N-API?

Before N-API, native addons depended on V8 and Node.js internals:

```cpp
// OLD: V8 API (breaks between Node.js versions)
v8::Local<v8::String> str = v8::String::NewFromUtf8(isolate, "hello");

// NEW: N-API (stable across versions)
napi_value str;
napi_create_string_utf8(env, "hello", NAPI_AUTO_LENGTH, &str);
```

## N-API Versions

N-API has versioned features:

| N-API Version | Node.js Version | Key Features |
|---------------|-----------------|--------------|
| 1 | 8.0.0 | Core API |
| 2 | 8.10.0 | async hooks integration |
| 3 | 10.0.0 | BigInt support |
| 4 | 10.16.0 | Instance data |
| 5 | 12.11.0 | Date, finalization |
| 6 | 12.17.0 | Object freeze/seal |
| 7 | 14.12.0 | Detached ArrayBuffer |
| 8 | 15.0.0 | Type tagging |
| 9 | 18.17.0 | Extended Buffer API |

```cpp
// Check N-API version at compile time
#define NAPI_VERSION 8

// Runtime version check
napi_value getVersion(napi_env env, napi_callback_info info) {
  uint32_t version;
  napi_get_version(env, &version);

  napi_value result;
  napi_create_uint32(env, version, &result);
  return result;
}
```

## Basic Addon Structure

### binding.gyp

```python
{
  "targets": [
    {
      "target_name": "addon",
      "sources": ["src/addon.c"],
      "include_dirs": [],
      "defines": ["NAPI_VERSION=8"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
          }
        }]
      ]
    }
  ]
}
```

### package.json

```json
{
  "name": "my-addon",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "install": "node-gyp rebuild"
  },
  "devDependencies": {
    "node-gyp": "^10.0.0"
  }
}
```

### src/addon.c

```c
#include <node_api.h>
#include <assert.h>

// Simple function: add(a, b)
napi_value Add(napi_env env, napi_callback_info info) {
  napi_status status;

  // Get arguments
  size_t argc = 2;
  napi_value args[2];
  status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  assert(status == napi_ok);

  // Check argument count
  if (argc < 2) {
    napi_throw_type_error(env, NULL, "Expected 2 arguments");
    return NULL;
  }

  // Check argument types
  napi_valuetype type0, type1;
  napi_typeof(env, args[0], &type0);
  napi_typeof(env, args[1], &type1);

  if (type0 != napi_number || type1 != napi_number) {
    napi_throw_type_error(env, NULL, "Expected numbers");
    return NULL;
  }

  // Get values
  double a, b;
  napi_get_value_double(env, args[0], &a);
  napi_get_value_double(env, args[1], &b);

  // Create result
  napi_value result;
  napi_create_double(env, a + b, &result);

  return result;
}

// Module initialization
napi_value Init(napi_env env, napi_value exports) {
  napi_status status;

  // Define exported function
  napi_value fn;
  status = napi_create_function(env, NULL, 0, Add, NULL, &fn);
  assert(status == napi_ok);

  status = napi_set_named_property(env, exports, "add", fn);
  assert(status == napi_ok);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
```

### index.js

```javascript
const addon = require('./build/Release/addon');

console.log(addon.add(1, 2));  // 3
```

## Error Handling

### Status Checking

```c
// Always check status
napi_status status;
status = napi_get_value_double(env, value, &result);
if (status != napi_ok) {
  // Handle error
  const napi_extended_error_info* error_info;
  napi_get_last_error_info(env, &error_info);
  fprintf(stderr, "N-API error: %s\n", error_info->error_message);
}
```

### Throwing Errors

```c
// Throw standard error
napi_throw_error(env, NULL, "Something went wrong");

// Throw TypeError
napi_throw_type_error(env, NULL, "Expected a string");

// Throw RangeError
napi_throw_range_error(env, NULL, "Value out of range");

// Throw with error code
napi_throw_error(env, "ERR_INVALID_ARG_TYPE", "Expected string");

// Create and throw Error object
napi_value error;
napi_value message;
napi_create_string_utf8(env, "Custom error", NAPI_AUTO_LENGTH, &message);
napi_create_error(env, NULL, message, &error);
napi_throw(env, error);
```

### Handling Exceptions

```c
napi_value CallWithExceptionHandling(napi_env env, napi_value fn) {
  napi_value result;
  napi_status status = napi_call_function(env, global, fn, 0, NULL, &result);

  if (status == napi_pending_exception) {
    napi_value exception;
    napi_get_and_clear_last_exception(env, &exception);

    // Handle or rethrow
    napi_throw(env, exception);
    return NULL;
  }

  return result;
}
```

## Async Operations

### AsyncWorker Pattern

For blocking operations, use the thread pool:

```c
#include <node_api.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  napi_async_work work;
  napi_deferred deferred;
  char* input;
  char* result;
  int error;
} AsyncData;

// Runs on thread pool (blocking OK)
void Execute(napi_env env, void* data) {
  AsyncData* async_data = (AsyncData*)data;

  // Do expensive computation
  size_t len = strlen(async_data->input);
  async_data->result = malloc(len + 1);

  for (size_t i = 0; i < len; i++) {
    char c = async_data->input[i];
    async_data->result[i] = (c >= 'a' && c <= 'z') ? c - 32 : c;
  }
  async_data->result[len] = '\0';
}

// Runs on main thread after Execute
void Complete(napi_env env, napi_status status, void* data) {
  AsyncData* async_data = (AsyncData*)data;

  napi_value result;

  if (status == napi_cancelled || async_data->error) {
    napi_value error;
    napi_create_string_utf8(env, "Operation failed", NAPI_AUTO_LENGTH, &error);
    napi_reject_deferred(env, async_data->deferred, error);
  } else {
    napi_create_string_utf8(env, async_data->result, NAPI_AUTO_LENGTH, &result);
    napi_resolve_deferred(env, async_data->deferred, result);
  }

  // Cleanup
  napi_delete_async_work(env, async_data->work);
  free(async_data->input);
  free(async_data->result);
  free(async_data);
}

napi_value ToUpperAsync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  // Get input string
  size_t len;
  napi_get_value_string_utf8(env, args[0], NULL, 0, &len);

  AsyncData* async_data = malloc(sizeof(AsyncData));
  async_data->input = malloc(len + 1);
  napi_get_value_string_utf8(env, args[0], async_data->input, len + 1, &len);
  async_data->result = NULL;
  async_data->error = 0;

  // Create promise
  napi_value promise;
  napi_create_promise(env, &async_data->deferred, &promise);

  // Create async work
  napi_value resource_name;
  napi_create_string_utf8(env, "ToUpperAsync", NAPI_AUTO_LENGTH, &resource_name);
  napi_create_async_work(env, NULL, resource_name, Execute, Complete,
                         async_data, &async_data->work);

  // Queue work
  napi_queue_async_work(env, async_data->work);

  return promise;
}
```

### ThreadSafeFunction

For calling JavaScript from any thread:

```c
#include <node_api.h>
#include <pthread.h>

typedef struct {
  napi_threadsafe_function tsfn;
  int count;
} ThreadData;

// Called on main thread
void CallJS(napi_env env, napi_value js_callback, void* context, void* data) {
  if (env != NULL) {
    int* value = (int*)data;

    napi_value argv[1];
    napi_create_int32(env, *value, &argv[0]);

    napi_value global;
    napi_get_global(env, &global);

    napi_call_function(env, global, js_callback, 1, argv, NULL);

    free(value);
  }
}

// Background thread
void* ThreadFunc(void* arg) {
  ThreadData* data = (ThreadData*)arg;

  for (int i = 0; i < data->count; i++) {
    int* value = malloc(sizeof(int));
    *value = i;

    // Schedule call to JavaScript
    napi_call_threadsafe_function(data->tsfn, value, napi_tsfn_blocking);

    usleep(100000);  // 100ms
  }

  // Signal completion
  napi_release_threadsafe_function(data->tsfn, napi_tsfn_release);

  return NULL;
}

napi_value StartThread(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  ThreadData* data = malloc(sizeof(ThreadData));
  napi_get_value_int32(env, args[1], &data->count);

  // Create thread-safe function
  napi_value resource_name;
  napi_create_string_utf8(env, "ThreadCallback", NAPI_AUTO_LENGTH, &resource_name);

  napi_create_threadsafe_function(
    env,
    args[0],           // JS callback
    NULL,              // async_resource
    resource_name,     // name
    0,                 // max_queue_size (0 = unlimited)
    1,                 // initial_thread_count
    NULL,              // thread_finalize_data
    NULL,              // thread_finalize_cb
    NULL,              // context
    CallJS,            // call_js_cb
    &data->tsfn
  );

  // Start background thread
  pthread_t thread;
  pthread_create(&thread, NULL, ThreadFunc, data);
  pthread_detach(thread);

  return NULL;
}
```

## Object Wrapping

Wrap C/C++ objects as JavaScript objects:

```c
#include <node_api.h>
#include <stdlib.h>

typedef struct {
  int value;
} Counter;

// Constructor
napi_value CounterNew(napi_env env, napi_callback_info info) {
  napi_value this_val;
  napi_get_cb_info(env, info, NULL, NULL, &this_val, NULL);

  Counter* counter = malloc(sizeof(Counter));
  counter->value = 0;

  // Wrap native object
  napi_wrap(env, this_val, counter, CounterDestructor, NULL, NULL);

  return this_val;
}

void CounterDestructor(napi_env env, void* data, void* hint) {
  Counter* counter = (Counter*)data;
  free(counter);
}

// Instance method: increment()
napi_value Increment(napi_env env, napi_callback_info info) {
  napi_value this_val;
  napi_get_cb_info(env, info, NULL, NULL, &this_val, NULL);

  Counter* counter;
  napi_unwrap(env, this_val, (void**)&counter);

  counter->value++;

  napi_value result;
  napi_create_int32(env, counter->value, &result);
  return result;
}

// Instance method: getValue()
napi_value GetValue(napi_env env, napi_callback_info info) {
  napi_value this_val;
  napi_get_cb_info(env, info, NULL, NULL, &this_val, NULL);

  Counter* counter;
  napi_unwrap(env, this_val, (void**)&counter);

  napi_value result;
  napi_create_int32(env, counter->value, &result);
  return result;
}

// Define class
napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    { "increment", NULL, Increment, NULL, NULL, NULL, napi_default, NULL },
    { "value", NULL, NULL, GetValue, NULL, NULL, napi_default, NULL },
  };

  napi_value counter_class;
  napi_define_class(
    env,
    "Counter",
    NAPI_AUTO_LENGTH,
    CounterNew,
    NULL,
    sizeof(props) / sizeof(props[0]),
    props,
    &counter_class
  );

  napi_set_named_property(env, exports, "Counter", counter_class);

  return exports;
}
```

Usage:

```javascript
const { Counter } = require('./build/Release/addon');

const counter = new Counter();
console.log(counter.value);     // 0
console.log(counter.increment()); // 1
console.log(counter.increment()); // 2
```

## Buffer Handling

```c
// Receive Buffer from JavaScript
napi_value ProcessBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  // Check if it's a Buffer
  bool is_buffer;
  napi_is_buffer(env, args[0], &is_buffer);
  if (!is_buffer) {
    napi_throw_type_error(env, NULL, "Expected Buffer");
    return NULL;
  }

  // Get buffer data
  void* data;
  size_t length;
  napi_get_buffer_info(env, args[0], &data, &length);

  // Process data...

  return NULL;
}

// Create Buffer to return
napi_value CreateBuffer(napi_env env, napi_callback_info info) {
  // Allocate buffer
  void* data;
  napi_value buffer;
  napi_create_buffer(env, 1024, &data, &buffer);

  // Fill with data
  memset(data, 0, 1024);

  return buffer;
}

// Create Buffer from existing data (with finalizer)
napi_value CreateExternalBuffer(napi_env env, napi_callback_info info) {
  char* data = malloc(1024);
  strcpy(data, "Hello from C!");

  napi_value buffer;
  napi_create_external_buffer(
    env,
    strlen(data) + 1,
    data,
    FinalizeBuffer,  // Called when buffer is GC'd
    NULL,
    &buffer
  );

  return buffer;
}

void FinalizeBuffer(napi_env env, void* data, void* hint) {
  free(data);
}
```

## Instance Data

Store per-addon-instance data (important for worker threads):

```c
typedef struct {
  int counter;
  napi_ref constructor;
} AddonData;

napi_value Init(napi_env env, napi_value exports) {
  AddonData* data = malloc(sizeof(AddonData));
  data->counter = 0;

  napi_set_instance_data(env, data, FreeAddonData, NULL);

  // ... rest of init
}

void FreeAddonData(napi_env env, void* data, void* hint) {
  AddonData* addon_data = (AddonData*)data;
  napi_delete_reference(env, addon_data->constructor);
  free(addon_data);
}

napi_value GetCounter(napi_env env, napi_callback_info info) {
  AddonData* data;
  napi_get_instance_data(env, (void**)&data);

  napi_value result;
  napi_create_int32(env, data->counter++, &result);
  return result;
}
```

## Debugging N-API

```bash
# Compile with debug symbols
node-gyp rebuild --debug

# Run with gdb
gdb --args node test.js

# In gdb:
# break addon.c:42
# run
# print variable
```

### Common Issues

```c
// Issue: Using napi_value after scope ends
// BAD:
napi_value get_value(napi_env env) {
  napi_value result;
  napi_create_string_utf8(env, "hello", NAPI_AUTO_LENGTH, &result);
  return result;  // OK - still in scope
}

// Issue: Returning NULL without throwing
// BAD:
napi_value my_func(napi_env env, napi_callback_info info) {
  if (error_condition) {
    return NULL;  // JavaScript will see undefined, no error!
  }
}

// GOOD:
napi_value my_func(napi_env env, napi_callback_info info) {
  if (error_condition) {
    napi_throw_error(env, NULL, "Error occurred");
    return NULL;
  }
}
```

## References

- N-API documentation: https://nodejs.org/api/n-api.html
- Node.js source: `src/js_native_api.h`, `src/node_api.h`
- N-API header: `deps/v8/include/js_native_api.h`
