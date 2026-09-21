---
name: crypto-internals
description: OpenSSL integration, performance considerations
metadata:
  tags: crypto, openssl, encryption, hashing, performance, internals
---

# Node.js Crypto Internals

Node.js crypto module wraps OpenSSL (or BoringSSL in some builds). Understanding the internals helps optimize cryptographic operations and debug security issues.

## Architecture

```
JavaScript Layer (lib/crypto.js)
├── createHash(), createCipher()
├── randomBytes(), pbkdf2()
└── generateKeyPair(), sign(), verify()
        │
        ▼
C++ Bindings (src/crypto/)
├── crypto_hash.cc
├── crypto_cipher.cc
├── crypto_random.cc
└── crypto_keys.cc
        │
        ▼
OpenSSL
├── EVP_* (high-level crypto)
├── RAND_* (random number generation)
└── X509_* (certificates)
```

## Thread Pool vs Main Thread

### Operations Using Thread Pool

```javascript
// These use the thread pool (libuv):
crypto.pbkdf2(password, salt, iterations, keylen, 'sha512', callback);
crypto.scrypt(password, salt, keylen, callback);
crypto.randomBytes(256, callback);
crypto.generateKeyPair('rsa', options, callback);

// Thread pool can become a bottleneck!
```

### Operations on Main Thread

```javascript
// These run synchronously on the main thread:
const hash = crypto.createHash('sha256').update(data).digest();
const cipher = crypto.createCipheriv(algorithm, key, iv);
const hmac = crypto.createHmac('sha256', key).update(data).digest();
```

## Hash Operations

### JavaScript API

```javascript
const crypto = require('node:crypto');

// Stream-based hashing
const hash = crypto.createHash('sha256');
hash.update('data1');
hash.update('data2');
const digest = hash.digest('hex');

// One-shot (Node.js 15+)
const digest = crypto.hash('sha256', data, 'hex');
```

### C++ Implementation

```cpp
// From src/crypto/crypto_hash.cc

void Hash::HashUpdate(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Hash* hash;
  ASSIGN_OR_RETURN_UNWRAP(&hash, args.This());

  // Get data
  ArrayBufferOrViewContents<unsigned char> buf(args[0]);

  // Update OpenSSL context
  int r = EVP_DigestUpdate(hash->mdctx_.get(), buf.data(), buf.size());

  if (r != 1) {
    return ThrowCryptoError(env, ERR_get_error(), "EVP_DigestUpdate");
  }
}

void Hash::HashDigest(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Hash* hash;
  ASSIGN_OR_RETURN_UNWRAP(&hash, args.This());

  unsigned char md_value[EVP_MAX_MD_SIZE];
  unsigned int md_len;

  // Finalize hash
  int r = EVP_DigestFinal_ex(hash->mdctx_.get(), md_value, &md_len);

  if (r != 1) {
    return ThrowCryptoError(env, ERR_get_error(), "EVP_DigestFinal_ex");
  }

  // Return as buffer or encoded string
  Local<Value> result = StringBytes::Encode(
      env->isolate(),
      reinterpret_cast<const char*>(md_value),
      md_len,
      encoding);

  args.GetReturnValue().Set(result);
}
```

## Cipher Operations

### Encryption

```javascript
const crypto = require('node:crypto');

function encrypt(text, key, iv) {
  // Create cipher with specific algorithm
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Set additional authenticated data (for AEAD modes)
  cipher.setAAD(Buffer.from('additional data'));

  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag (for AEAD modes)
  const authTag = cipher.getAuthTag();

  return { encrypted, authTag };
}
```

### C++ Implementation

```cpp
// From src/crypto/crypto_cipher.cc

void CipherBase::Update(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CipherBase* cipher;
  ASSIGN_OR_RETURN_UNWRAP(&cipher, args.This());

  ArrayBufferOrViewContents<unsigned char> buf(args[0]);

  // Allocate output buffer
  int out_len = buf.size() + EVP_CIPHER_CTX_block_size(cipher->ctx_.get());
  AllocatedBuffer out = AllocatedBuffer::AllocateManaged(env, out_len);

  // Call OpenSSL
  int r = EVP_CipherUpdate(cipher->ctx_.get(),
                           reinterpret_cast<unsigned char*>(out.data()),
                           &out_len,
                           buf.data(),
                           buf.size());

  if (r != 1) {
    return ThrowCryptoError(env, ERR_get_error(), "EVP_CipherUpdate");
  }

  // Resize and return
  out.Resize(out_len);
  args.GetReturnValue().Set(out.ToBuffer().ToLocalChecked());
}
```

## Random Number Generation

### Secure Random

```javascript
const crypto = require('node:crypto');

// Async (uses thread pool)
crypto.randomBytes(256, (err, buf) => {
  console.log(buf);
});

// Sync (blocks main thread)
const buf = crypto.randomBytes(256);

// Fill existing buffer
const existing = Buffer.alloc(256);
crypto.randomFillSync(existing);
```

### C++ Implementation

```cpp
// From src/crypto/crypto_random.cc

void RandomBytes(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  const int64_t size = args[0].As<Integer>()->Value();

  // Check if callback provided (async)
  if (args[1]->IsFunction()) {
    // Async: queue to thread pool
    RandomBytesJob* job = new RandomBytesJob(env);
    job->size = size;
    job->callback.Reset(env->isolate(), args[1].As<Function>());

    uv_queue_work(env->event_loop(),
                  &job->work_req_,
                  [](uv_work_t* req) {
                    RandomBytesJob* job = ContainerOf(&RandomBytesJob::work_req_, req);
                    // Run on thread pool
                    RAND_bytes(job->data, job->size);
                  },
                  [](uv_work_t* req, int status) {
                    // Complete on main thread
                    RandomBytesJob* job = ContainerOf(&RandomBytesJob::work_req_, req);
                    job->Complete();
                  });
  } else {
    // Sync: run immediately
    AllocatedBuffer buf = AllocatedBuffer::AllocateManaged(env, size);
    int r = RAND_bytes(reinterpret_cast<unsigned char*>(buf.data()), size);

    if (r != 1) {
      return ThrowCryptoError(env, ERR_get_error(), "RAND_bytes");
    }

    args.GetReturnValue().Set(buf.ToBuffer().ToLocalChecked());
  }
}
```

## Key Derivation

### PBKDF2

```javascript
const crypto = require('node:crypto');

// Async (thread pool) - recommended
crypto.pbkdf2('password', 'salt', 100000, 64, 'sha512', (err, key) => {
  console.log(key.toString('hex'));
});

// Sync - blocks event loop!
const key = crypto.pbkdf2Sync('password', 'salt', 100000, 64, 'sha512');
```

### Scrypt (Memory-Hard)

```javascript
// More resistant to hardware attacks
crypto.scrypt('password', 'salt', 64, {
  N: 16384,  // CPU/memory cost
  r: 8,      // Block size
  p: 1       // Parallelization
}, (err, key) => {
  console.log(key.toString('hex'));
});
```

### Performance Comparison

```javascript
const crypto = require('node:crypto');

// Benchmark different KDFs
async function benchmark() {
  const password = 'test-password';
  const salt = crypto.randomBytes(16);

  // PBKDF2
  console.time('pbkdf2');
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve =>
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', resolve)
    );
  }
  console.timeEnd('pbkdf2');

  // Scrypt
  console.time('scrypt');
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve =>
      crypto.scrypt(password, salt, 64, resolve)
    );
  }
  console.timeEnd('scrypt');
}
```

## Performance Optimization

### Reuse Crypto Contexts

```javascript
// BAD: Create new hash for each piece of data
function hashMany(items) {
  return items.map(item =>
    crypto.createHash('sha256').update(item).digest('hex')
  );
}

// GOOD: Stream data through single hash
function hashCombined(items) {
  const hash = crypto.createHash('sha256');
  for (const item of items) {
    hash.update(item);
    hash.update('\n');  // Separator
  }
  return hash.digest('hex');
}
```

### Buffer Reuse

```javascript
// For high-throughput encryption
class CipherStream {
  constructor(key, iv) {
    this.cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    this.outputBuffer = Buffer.allocUnsafe(65536);
  }

  encrypt(data) {
    // Reuse output buffer when possible
    const encrypted = this.cipher.update(data);
    if (encrypted.length <= this.outputBuffer.length) {
      encrypted.copy(this.outputBuffer);
      return this.outputBuffer.slice(0, encrypted.length);
    }
    return encrypted;
  }
}
```

### Avoid Sync in Hot Paths

```javascript
// BAD: Sync operations block event loop
app.post('/login', (req, res) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  // Server blocked for ~100ms!
});

// GOOD: Use async
app.post('/login', async (req, res) => {
  const hash = await promisify(crypto.pbkdf2)(password, salt, 100000, 64, 'sha512');
});
```

## WebCrypto API

Node.js 15+ includes the Web Crypto API:

```javascript
const { subtle } = require('node:crypto').webcrypto;

async function encryptWithWebCrypto(data, password) {
  // Derive key from password
  const keyMaterial = await subtle.importKey(
    'raw',
    Buffer.from(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: Buffer.from('salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.randomBytes(12);

  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    Buffer.from(data)
  );

  return { encrypted: Buffer.from(encrypted), iv };
}
```

## OpenSSL Providers

Node.js 17+ supports OpenSSL 3.0 providers:

```javascript
const crypto = require('node:crypto');

// Check available algorithms
console.log(crypto.getHashes());
console.log(crypto.getCiphers());

// Check if FIPS mode is available
console.log('FIPS available:', crypto.getFips());

// Enable FIPS mode (if compiled with FIPS support)
crypto.setFips(1);
```

## Debugging Crypto Issues

### OpenSSL Errors

```javascript
const crypto = require('node:crypto');

try {
  const cipher = crypto.createCipheriv('aes-256-gcm', 'short-key', 'short-iv');
} catch (err) {
  console.error('Crypto error:', err.message);
  console.error('OpenSSL error:', err.opensslErrorStack);
}
```

### Checking Algorithm Support

```javascript
function isAlgorithmSupported(name) {
  return crypto.getHashes().includes(name) ||
         crypto.getCiphers().includes(name);
}

// Check before use
if (!isAlgorithmSupported('sha3-256')) {
  console.warn('SHA3-256 not available, using SHA-256');
}
```

## Common Pitfalls

### Timing Attacks

```javascript
// BAD: Vulnerable to timing attack
function checkSignature(expected, actual) {
  return expected === actual;  // Short-circuits on first difference
}

// GOOD: Constant-time comparison
function checkSignature(expected, actual) {
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(actual)
  );
}
```

### IV Reuse

```javascript
// BAD: Reusing IV
const iv = crypto.randomBytes(12);
messages.forEach(msg => encrypt(msg, key, iv));  // Security vulnerability!

// GOOD: Unique IV per message
messages.forEach(msg => {
  const iv = crypto.randomBytes(12);
  encrypt(msg, key, iv);
});
```

### Key in Memory

```javascript
// Clear sensitive data after use
function secureEncrypt(data, password) {
  const key = crypto.scryptSync(password, salt, 32);
  try {
    return encrypt(data, key);
  } finally {
    key.fill(0);  // Overwrite key in memory
  }
}
```

## References

- Node.js crypto source: `lib/crypto.js`, `src/crypto/`
- OpenSSL documentation: https://www.openssl.org/docs/
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
