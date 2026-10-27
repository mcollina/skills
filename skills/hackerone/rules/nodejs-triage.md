---
name: nodejs-triage
description: Classify Node.js HackerOne reports against the threat model in nodejs/node SECURITY.md
metadata:
  tags: nodejs, security, threat-model, triage, cvss, dos
---

# Triaging Node.js reports

The authority is the "Node.js threat model" section of `SECURITY.md` in the nodejs/node checkout. Re-read it per report since it changes; do not rely on memory.

## Dispositions

Pick exactly one, as defined in `SECURITY.md` under "Security triage dispositions":

- **Vulnerability**: exploitable across a Node.js-owned boundary and meets "What constitutes a vulnerability" (plus the DoS criteria for availability issues)
- **Security-interest bug**: real defect, not a vulnerability under the model; fixed as a regular bug, no automatic CVE
- **Common bug**: crash/correctness issue without a boundary or a realistic attacker benefit
- **Invalid / out of scope**: not reproducible, application bug, or excluded by policy (experimental features, etc.)

## Checklist

1. **Who is the attacker?** Remote peers on inbound connections accepted through Node.js APIs are untrusted. Application code, its callbacks, local files, env, CLI flags, and the build environment are trusted.
2. **Is the API stable and documented?** Experimental (stability < 2) or flag-gated features are out of scope. QUIC/HTTP3, `node:vfs`, and the V8 sandbox have explicit sections.
3. **Does the PoC use the API correctly, as documented?** If the crash needs an application mistake, it is not a Node.js vulnerability.
4. **For DoS**, walk every bullet under "Denial of Service (DoS) vulnerabilities": deterministic, asymmetric, not mitigated by process recycling, practical rate.
5. **Check the explicit non-vulnerability list**, especially:
   - Unhandled `'error'` events (CWE-248): the application must attach handlers. The deciding question is whether the application can reach the emitter *before* the error can fire. If a documented property exposes it (e.g. `pushRes.stream`) and the error can only arrive after the app has the object, for example because it needs a network round trip after the callback runs, the exclusion applies even if the wrapper object never re-emits the error. Verify the ordering in code and with instrumentation. Only an emitter the app cannot reach in time is a Node.js vulnerability. Inconsistent error handling in a wrapper is a common bug to fix publicly.
   - Exceptions thrown by application callbacks
   - Malicious protocol peers on HTTP/1.1 keep-alive responses (client side)
   - Prototype pollution, Corepack, permission-model boundaries, untrusted proxies
6. **Affected lines**: check the code on `main` and on each supported release line (`git log -S`, or run the PoC on installed releases). Note when the code path was introduced.
7. **Severity**: give a CVSS 3.1 vector, not just a label. Use `AC:H` when the vulnerable configuration is uncommon or opt-in (non-default feature, rarely used API). Reporter-chosen severity is a starting point only.

## Reproduction tips

- Prefer the local build (`out/Release/node`) for main, and the system `node` or nvm for released lines.
- Collapse client/server PoCs into one script listening on port 0 that prints a sentinel (`SURVIVED`) on success, so outcomes are greppable across versions.
- Changes under `lib/` are embedded in the binary; to test a fix without rebuilding, show that the userland equivalent (e.g. attaching the missing listener) has the same effect, and note that you did this.

## Triage note template

```
# HackerOne <id>: <title>
Disposition: <one of the four> | Severity: <rating> (CVSS:3.1/...) | Duplicate: none / <id>
## Summary
## Reproduction (versions, results)
## Root cause (file:line)
## Threat-model analysis (which bullets apply and why)
## Affected versions
## Proposed fix + regression test
## Draft reply to reporter
```
