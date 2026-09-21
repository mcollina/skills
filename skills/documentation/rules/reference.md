---
name: reference
description: Writing information-oriented reference material: entry format, consistency, and the 30-second lookup test
metadata:
  tags: diataxis, reference, api-docs, information-oriented
---

# Reference (information-oriented)

- **Title pattern:** Name the thing — *"Configuration options"*, *"API endpoints"*, *"CLI flags"*
- Structure: Consistent repeatable format per entry (name → type → default → description → example)
- State facts; avoid instruction beyond minimal usage examples
- Keep current; version-stamp if needed
- **Validation:** A user can look up a specific fact in under 30 seconds without reading surrounding content

**Example entry:**
> **`timeout`** *(integer, default: `5000`)*
> Maximum time in milliseconds to wait for a response before the request fails.
> *Example:* `{ timeout: 3000 }`
