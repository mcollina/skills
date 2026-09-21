---
name: v8-hidden-classes
description: V8 hidden classes, inline caching, and optimization patterns
metadata:
  tags: v8, hidden-classes, maps, inline-caching, optimization, performance
---

# V8 Hidden Classes (Maps)

V8 uses hidden classes (internally called "Maps") to optimize property access. Understanding hidden classes is essential for writing code that V8 can optimize effectively.

## What Are Hidden Classes?

JavaScript objects are dynamic, but V8 optimizes them by creating hidden classes that describe their structure:

```javascript
// V8 creates hidden classes as properties are added
const obj = {};        // Map M0: empty object
obj.x = 1;             // Map M1: { x: number }
obj.y = 2;             // Map M2: { x: number, y: number }
```

```
M0 (empty)
  ↓ add 'x'
M1 { x: offset 0 }
  ↓ add 'y'
M2 { x: offset 0, y: offset 1 }
```

### Viewing Hidden Classes

```bash
# Print hidden class transitions
node --allow-natives-syntax -e "
  const obj = {};
  obj.x = 1;
  obj.y = 2;
  %DebugPrint(obj);
"

# Trace map (hidden class) creation
node --trace-maps app.js 2>&1 | head -100
```

## Inline Caching (IC)

V8 uses inline caching to speed up property access. When code accesses a property, V8 caches the hidden class and offset:

```javascript
function getX(obj) {
  return obj.x;  // First call: look up 'x', cache result
                 // Subsequent calls: use cached offset if same Map
}

const a = { x: 1 };
const b = { x: 2 };
const c = { x: 3, y: 4 };  // Different Map!

getX(a);  // Monomorphic IC
getX(b);  // Still monomorphic (same Map)
getX(c);  // IC becomes polymorphic (different Map)
```

### IC States

1. **Uninitialized**: No type feedback yet
2. **Monomorphic**: One Map seen - fastest
3. **Polymorphic**: 2-4 Maps seen - still optimized
4. **Megamorphic**: >4 Maps seen - falls back to dictionary lookup

```javascript
// Check IC state with --trace-ic
// node --trace-ic app.js 2>&1 | grep -E "LoadIC|StoreIC"
```

## Maintaining Monomorphic Code

### Initialize Properties in Consistent Order

```javascript
// BAD: Different initialization order creates different Maps
function Point(x, y, z) {
  if (z !== undefined) {
    this.z = z;
    this.x = x;
    this.y = y;
  } else {
    this.x = x;
    this.y = y;
  }
}

// GOOD: Consistent initialization order
function Point(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z !== undefined ? z : 0;
}
```

### Use Constructor Functions or Classes

```javascript
// BAD: Object literals with different shapes
const points = [
  { x: 1, y: 2 },
  { x: 1, y: 2, z: 3 },  // Different Map
  { y: 2, x: 1 },        // Different Map (different order!)
];

// GOOD: Use a class to ensure consistent shape
class Point {
  constructor(x, y, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

const points = [
  new Point(1, 2),
  new Point(1, 2, 3),
  new Point(1, 2),  // Same Map as first!
];
```

### Avoid Adding Properties After Construction

```javascript
// BAD: Adding properties later fragments Maps
const obj = { x: 1, y: 2 };
if (condition) {
  obj.z = 3;  // Creates new Map
}

// GOOD: Initialize all properties upfront
const obj = {
  x: 1,
  y: 2,
  z: condition ? 3 : undefined
};
```

### Avoid Deleting Properties

```javascript
// BAD: Delete causes transition to slow mode
const obj = { x: 1, y: 2, z: 3 };
delete obj.y;  // Object may become slow/dictionary mode

// GOOD: Set to undefined instead
const obj = { x: 1, y: 2, z: 3 };
obj.y = undefined;  // Keeps fast properties
```

## Property Types and Transitions

### Type Stability

```javascript
// BAD: Changing property types causes Map transitions
const obj = { value: 42 };
obj.value = "string";  // Type change! New Map

// GOOD: Keep types consistent
const obj = { value: 42 };
obj.value = 100;  // Same type, same Map
```

### SMI (Small Integer) Optimization

V8 optimizes small integers (31-bit on 64-bit systems):

```javascript
// SMI: Stored directly in the pointer (fastest)
const obj = { count: 42 };

// HeapNumber: Requires heap allocation
const obj = { value: 1.5 };           // Float
const obj = { big: 2147483648 };      // Exceeds SMI range
const obj = { neg: -2147483649 };     // Exceeds SMI range
```

```javascript
// BAD: Mixing SMI and heap numbers
function Counter() {
  this.count = 0;
}
const c = new Counter();
c.count = 1.5;  // Transitions from SMI to HeapNumber

// GOOD: Be consistent with number types
function Counter() {
  this.count = 0.0;  // Start as double if doubles are needed
}
```

## Elements Kinds (Array Optimization)

V8 also tracks "elements kinds" for arrays:

```javascript
// PACKED_SMI_ELEMENTS (fastest)
const a = [1, 2, 3];

// PACKED_DOUBLE_ELEMENTS
const b = [1.1, 2.2, 3.3];

// PACKED_ELEMENTS (any type)
const c = [1, 'two', {}];

// HOLEY_SMI_ELEMENTS (has holes)
const d = [1, , 3];  // Hole at index 1
```

### Elements Kind Transitions

```javascript
// Elements kinds only transition "downward" (less specific):
// PACKED_SMI_ELEMENTS
//   ↓ add float
// PACKED_DOUBLE_ELEMENTS
//   ↓ add object
// PACKED_ELEMENTS
//   ↓ create hole
// HOLEY_ELEMENTS

// Once transitioned, arrays don't go back!
const arr = [1, 2, 3];        // PACKED_SMI_ELEMENTS
arr.push(4.5);                // PACKED_DOUBLE_ELEMENTS
arr[10] = 5;                  // HOLEY_DOUBLE_ELEMENTS (hole at 4-9)
```

### Array Best Practices

```javascript
// BAD: Create holes
const arr = new Array(1000);  // HOLEY_SMI_ELEMENTS
arr[0] = 1;

// GOOD: Pre-allocate and fill
const arr = new Array(1000).fill(0);  // PACKED_SMI_ELEMENTS

// BAD: Push different types
const arr = [];
arr.push(1);
arr.push('string');  // Transitions to PACKED_ELEMENTS

// GOOD: Consistent types
const nums = [];
const strs = [];
nums.push(1);
strs.push('string');
```

## Debugging Hidden Class Issues

### Using --trace-opt and --trace-deopt

```bash
# Trace optimization
node --trace-opt app.js 2>&1 | grep -E "Compiling|optimizing"

# Trace deoptimization (shows why code was deoptimized)
node --trace-deopt app.js
```

### Checking Object Shape

```javascript
// Use %HaveSameMap to check if objects share Maps
// (requires --allow-natives-syntax)

function checkMaps() {
  const a = { x: 1, y: 2 };
  const b = { x: 3, y: 4 };
  const c = { y: 1, x: 2 };  // Different order!

  console.log(%HaveSameMap(a, b));  // true
  console.log(%HaveSameMap(a, c));  // false
}
```

### IC Feedback Analysis

```javascript
// Use %GetOptimizationStatus to check function optimization
// (requires --allow-natives-syntax)

function analyzeFunction(fn) {
  const status = %GetOptimizationStatus(fn);

  const flags = {
    isFunction: (status & 1) !== 0,
    isNeverOptimize: (status & 2) !== 0,
    isAlwaysOptimize: (status & 4) !== 0,
    isMaybeDeopted: (status & 8) !== 0,
    isOptimized: (status & 16) !== 0,
    isTurbofanned: (status & 32) !== 0,
    isInterpreted: (status & 64) !== 0,
  };

  return flags;
}
```

## Common Anti-Patterns

### Polymorphic Property Access

```javascript
// BAD: Function called with different object shapes
function processEntity(entity) {
  return entity.id + entity.name;
}

processEntity({ id: 1, name: 'A' });
processEntity({ id: 2, name: 'B', extra: true });
processEntity({ name: 'C', id: 3 });  // Different order
// IC becomes megamorphic!

// GOOD: Normalize input shapes
class Entity {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

function processEntity(entity) {
  return entity.id + entity.name;
}

processEntity(new Entity(1, 'A'));
processEntity(new Entity(2, 'B'));
// IC stays monomorphic
```

### Dynamic Property Names

```javascript
// BAD: Dynamic property access defeats IC
function getValue(obj, key) {
  return obj[key];  // Can't cache, always megamorphic
}

// BETTER: Use Map for truly dynamic keys
const data = new Map();
data.set('key1', 'value1');
data.get('key1');  // Map access is optimized differently
```

### Object.assign and Spread

```javascript
// Object.assign and spread create new Maps
const base = { a: 1, b: 2 };
const extended = { ...base, c: 3 };  // New Map

// For hot paths, prefer explicit construction
function extend(base) {
  return {
    a: base.a,
    b: base.b,
    c: 3
  };
}
```

## Prototype Chain Optimization

V8 caches prototype chain lookups:

```javascript
class Base {
  getValue() { return this.value; }
}

class Derived extends Base {
  constructor(value) {
    super();
    this.value = value;
  }
}

// Prototype method lookup is cached
const d = new Derived(42);
d.getValue();  // Prototype lookup cached

// BAD: Modifying prototype invalidates caches
Base.prototype.getValue = function() { return this.value * 2; };
// All caches for getValue are invalidated!
```

## Native Code Considerations

When writing N-API addons, hidden class stability matters:

```cpp
// Create objects with consistent shape from C++
napi_value CreatePoint(napi_env env, double x, double y) {
  napi_value obj;
  napi_create_object(env, &obj);

  // Always set properties in the same order
  napi_value xVal, yVal;
  napi_create_double(env, x, &xVal);
  napi_create_double(env, y, &yVal);

  napi_set_named_property(env, obj, "x", xVal);
  napi_set_named_property(env, obj, "y", yVal);

  return obj;
}
```

## References

- V8 Blog on Hidden Classes: https://v8.dev/blog/fast-properties
- V8 Blog on Elements Kinds: https://v8.dev/blog/elements-kinds
- Node.js source: `deps/v8/src/objects/map.h`
