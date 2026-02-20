---
name: setup-and-configuration
description: Install and configure snipgrapher with stable defaults and profiles
metadata:
  tags: snipgrapher, setup, config, profiles, cli
---

## Goal

Set up `snipgrapher` so snippet rendering is deterministic and easy to repeat.

## 1) Pick an executable strategy

Use one of these:

1. Binary available in PATH: `snipgrapher`
2. npm package without global install:

```bash
npx --yes snipgrapher doctor
```

## 2) Initialize configuration

Create a baseline config in the current project:

```bash
snipgrapher init
```

Supported config filenames (first match wins):
- `snipgrapher.config.json`
- `snipgrapher.config.yaml`
- `snipgrapher.config.yml`
- `snipgrapher.config.toml`

## 3) Define reusable defaults and profiles

Use a config structure like:

```json
{
  "theme": "nord",
  "fontFamily": "Fira Code",
  "fontSize": 14,
  "padding": 32,
  "lineNumbers": true,
  "windowControls": true,
  "shadow": true,
  "backgroundStyle": "gradient",
  "format": "svg",
  "defaultProfile": "default",
  "profiles": {
    "default": {},
    "social": {
      "padding": 48,
      "fontSize": 16,
      "watermark": "@your-handle"
    }
  }
}
```

## 4) Validate environment and config

Run:

```bash
snipgrapher doctor
snipgrapher themes list
```

Fix validation errors before rendering.

## 5) Understand precedence for overrides

Rendering values resolve as:

**CLI flags > environment variables > config file > defaults**

Useful env vars include:
- `SNIPGRAPHER_PROFILE`
- `SNIPGRAPHER_THEME`
- `SNIPGRAPHER_FORMAT`
- `SNIPGRAPHER_FONT_SIZE`
- `SNIPGRAPHER_PADDING`
- `SNIPGRAPHER_LINE_NUMBERS`

Use env vars for CI-wide defaults, and CLI flags for one-off overrides.
