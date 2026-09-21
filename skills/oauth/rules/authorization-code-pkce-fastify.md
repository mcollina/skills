---
name: authorization-code-pkce-fastify
description: End-to-end Authorization Code + PKCE implementation in Fastify, from plugin registration through refresh token rotation
metadata:
  tags: oauth2, pkce, fastify, authorization-code, jwt, refresh-token, fastify-oauth2
---

# Authorization Code + PKCE in Fastify

## 1. Install dependencies

```bash
npm install @fastify/oauth2 @fastify/cookie @fastify/session fastify-plugin
```

## 2. Register the OAuth plugin

```typescript
// plugins/oauth.ts
import fp from 'fastify-plugin'
import oauth2, { OAuth2Namespace } from '@fastify/oauth2'
import { FastifyInstance } from 'fastify'

export default fp(async function (fastify: FastifyInstance) {
  fastify.register(oauth2, {
    name: 'oauth2',
    scope: ['openid', 'profile', 'email'],
    credentials: {
      client: {
        id: process.env.CLIENT_ID!,
        secret: process.env.CLIENT_SECRET!,
      },
      auth: {
        authorizeHost: process.env.AUTH_SERVER!,
        authorizePath: '/authorize',
        tokenHost: process.env.AUTH_SERVER!,
        tokenPath: '/token',
      },
    },
    startRedirectPath: '/login',
    callbackUri: process.env.CALLBACK_URI!,
    pkce: 'S256',               // RFC 7636 — always use for public clients
    generateStateFunction: (req) => req.session.state = crypto.randomUUID(),
    checkStateFunction: (req, callback) =>
      req.query.state === req.session.state ? callback() : callback(new Error('State mismatch')),
  })
})
```

**Validation checkpoint:** Confirm `callbackUri` exactly matches a registered redirect URI at the authorization server before proceeding (RFC 6749 §3.1.2).

## 3. Handle the callback and exchange the code

```typescript
// routes/auth.ts
import { FastifyInstance } from 'fastify'

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/login/callback', async (request, reply) => {
    // @fastify/oauth2 verifies state and exchanges code automatically
    const tokenResponse = await fastify.oauth2.getAccessTokenFromAuthorizationCodeFlow(request)

    // Store only what you need; never log the raw token
    request.session.set('accessToken', tokenResponse.token.access_token)
    request.session.set('refreshToken', tokenResponse.token.refresh_token)

    return reply.redirect('/')
  })

  fastify.get('/logout', async (request, reply) => {
    await request.session.destroy()
    return reply.redirect('/')
  })
}
```

## 4. JWT validation middleware (token introspection hook)

```typescript
// hooks/verifyToken.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import jwt from '@fastify/jwt'

export async function verifyToken(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    // Validate required claims (RFC 7519)
    const payload = request.user as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)

    if (typeof payload.exp === 'number' && payload.exp < now)
      return reply.code(401).send({ error: 'token_expired' })

    if (payload.iss !== process.env.EXPECTED_ISSUER)
      return reply.code(401).send({ error: 'invalid_issuer' })

    if (payload.aud !== process.env.EXPECTED_AUDIENCE)
      return reply.code(401).send({ error: 'invalid_audience' })

  } catch (err) {
    return reply.code(401).send({ error: 'invalid_token', error_description: (err as Error).message })
  }
}
```

**Validation checkpoints:**
- Verify `exp`, `iss`, `aud`, and `sub` on every request — never skip (RFC 7519 §4)
- Use `fastify.jwt.verify` (asymmetric RS256/ES256) rather than HS256 for tokens issued by a third-party server

## 5. Protecting routes

```typescript
// routes/api.ts
import { FastifyInstance } from 'fastify'
import { verifyToken } from '../hooks/verifyToken'

export default async function apiRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', verifyToken)   // applies to all routes in this scope

  fastify.get('/me', {
    schema: {
      response: { 200: { type: 'object', properties: { sub: { type: 'string' } } } },
    },
  }, async (request) => {
    const user = request.user as { sub: string }
    return { sub: user.sub }
  })
}
```

## 6. Refresh token rotation

```typescript
async function refreshAccessToken(fastify: FastifyInstance, refreshToken: string) {
  const newToken = await fastify.oauth2.getNewAccessTokenUsingRefreshTokenFlow({ refresh_token: refreshToken })

  // Always replace the stored refresh token if rotation is in use (RFC 6749 §10.4)
  return {
    accessToken: newToken.token.access_token,
    refreshToken: newToken.token.refresh_token ?? refreshToken,
  }
}
```
