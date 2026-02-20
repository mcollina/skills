---
name: snipgrapher
description: Configure and use snipgrapher to generate polished code snippet images
metadata:
  tags: snipgrapher, snippets, images, svg, png, webp, cli
---

## When to use

Use this skill when you need to:
- Generate image snippets from source code
- Configure reusable snippet rendering defaults
- Batch-render snippet assets for docs, social posts, or changelogs
- Use published `snipgrapher` from npm to generate snippet images

## How to use

Read these rule files in order:

- [rules/setup-and-configuration.md](rules/setup-and-configuration.md) - Install, select executable, initialize config, and define profiles
- [rules/rendering-workflows.md](rules/rendering-workflows.md) - Render single snippets, batch jobs, watch mode, and output practices

## Core principles

- **Configure first**: establish a project config before repeated renders
- **Reproducible output**: prefer named profiles and explicit output paths
- **Portable commands**: use command patterns that work with installed binaries and `npx`
- **Automation-friendly**: rely on CLI flags/config/env precedence intentionally
