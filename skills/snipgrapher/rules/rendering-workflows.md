---
name: rendering-workflows
description: Generate snippet images with render, batch, and watch flows
metadata:
  tags: snipgrapher, render, batch, watch, snippets
---

## Single-file rendering

Basic SVG output:

```bash
snipgrapher render ./example.ts -o snippet.svg
```

Generate PNG or WebP:

```bash
snipgrapher render ./example.ts --format png -o snippet.png
snipgrapher render ./example.ts --format webp -o snippet.webp
```

Styling overrides:

```bash
snipgrapher render ./example.ts --background-style gradient --window-controls --shadow
snipgrapher render ./example.ts --watermark "snipgrapher" --language typescript
```

Profile-based rendering:

```bash
snipgrapher render ./example.ts --profile social -o snippet-social.svg
```

## Stdin and piping

From stdin:

```bash
cat ./example.ts | snipgrapher render --stdin -o snippet.svg
```

Or rely on auto-stdin detection:

```bash
cat ./example.ts | snipgrapher render -o snippet.svg
```

When `--output` is omitted and stdout is redirected, image bytes are written to stdout.

## Batch rendering

Render many files with glob patterns:

```bash
snipgrapher batch "./snippets/**/*.ts" --out-dir rendered --concurrency 6
snipgrapher batch "./snippets/**/*.ts" --json --manifest rendered/manifest.json
```

## Watch mode

Regenerate on file change:

```bash
snipgrapher watch ./example.ts -o snippet.svg --profile social
```

## Assistant behavior guidelines

When asked to generate snippet images:

1. Ensure configuration exists (create/update `snipgrapher.config.*` first).
2. Use explicit output paths and file extensions.
3. Prefer named profiles for repeatability.
4. Return the exact command(s) run and the output file paths created.
5. If `snipgrapher` is unavailable, fall back to npm (`npx --yes snipgrapher ...`).
