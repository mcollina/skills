---
name: oauth
description: Implements and reviews OAuth 2.0/2.1 authorization code + PKCE flows in Fastify, including JWT validation, refresh token rotation, and route protection. Use when building or debugging a Fastify login flow, validating access tokens, fixing redirect URI or state/CSRF errors, or auditing an OAuth implementation against RFC 6749/6750/7636 and the OAuth 2.1 hardening rules.
metadata:
  tags: oauth, oauth2, security, authentication, authorization, jwt, pkce, fastify
---

## Non-negotiables

Every row is a known attack if violated, not a preference.

| Requirement | RFC reference |
|---|---|
| Validate redirect URI against an allowlist | RFC 6749 §3.1.2 |
| PKCE (S256) for all public clients | RFC 7636 §4.2 |
| Validate `state` to prevent CSRF | RFC 6749 §10.12 |
| Validate `iss`, `aud`, `exp` on every JWT | RFC 7519 §4 |
| Rotate refresh tokens on every use | RFC 6749 §10.4 |
| HTTPS everywhere; reject HTTP redirect URIs | RFC 6749 §3.1.2.1 |
| Rate-limit token endpoints | OAuth 2.1 §7 |

## Anti-patterns to flag on sight

- **Tokens in `localStorage`** — use `HttpOnly`, `Secure`, `SameSite=Strict` cookies
- **Skipping audience validation** — allows token reuse across services
- **Implicit flow** — removed in OAuth 2.1; use authorization code + PKCE
- **`response_type=token` in browser apps** — tokens in URL fragments leak via logs and `Referer`
- **HS256 for third-party tokens** — use RS256/ES256 against the issuer's JWKS endpoint

## Implementation

- [rules/authorization-code-pkce-fastify.md](rules/authorization-code-pkce-fastify.md) — plugin registration, callback handling, JWT verification hook, route protection, refresh rotation

## Scope

This skill covers the authorization code + PKCE flow in Fastify. It does **not**
carry worked implementations for the device authorization flow (RFC 8628),
client credentials, native/mobile flows (RFC 8252), or opaque token
introspection. Apply the checklist above to those flows, but read the relevant
RFC rather than extrapolating from the Fastify walkthrough — the threat models
differ.

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- Fastify plugins, hooks, and route structure generally → **fastify**
- Typing the token payload and request augmentation → **typescript-magician**
