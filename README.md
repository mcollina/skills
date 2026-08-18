# Matteo Collina's Skills

Skills for AI-assisted development.

## Available Skills

| Skill | Description |
|-------|-------------|
| `documentation` | Technical writer specializing in the Diátaxis documentation framework |
| `fastify` | Comprehensive best practices for Fastify development |
| `init` | Creates and maintains high-signal AGENTS.md guidance for repositories |
| `linting-neostandard-eslint9` | Linting workflows with neostandard and ESLint v9 flat config |
| `node` | Best practices for Node.js development |
| `nodejs-core` | Deep Node.js internals expertise including C++ addons, V8, libuv, and build systems |
| `oauth` | OAuth 2.0/2.1 specification expert with deep RFC knowledge and Fastify integration patterns |
| `octocat` | Git and GitHub wizard using gh CLI for all git operations and GitHub interactions |
| `skill-optimizer` | Improves skill activation, benchmark outcomes, and regression resistance across models |
| `snipgrapher` | Configure and use snipgrapher to generate polished code snippet images |
| `typescript-magician` | TypeScript wizard specializing in advanced type systems, complex generics, and eliminating any types |

## Installation

Install any of the skills above to your AI agent host (Claude Code, Cursor, Windsurf, and [15 more](https://github.com/pea3nut/agent-get)) with a single command via [agent-add](https://github.com/pea3nut/agent-get):

```bash
# Install a specific skill (replace <skill-name> with e.g. fastify, node, oauth)
npx -y agent-add --skill 'https://github.com/mcollina/skills#skills/<skill-name>'
```

Example — install the `fastify` skill:

```bash
npx -y agent-add --skill 'https://github.com/mcollina/skills#skills/fastify'
```

`agent-add` auto-detects your AI host and copies the skill directory to the correct location.

### Manual installation

If you prefer manual installation, copy any `skills/<skill-name>/` directory from this repository into your AI tool's skills directory.

## Usage

This package contains best practices and skills for AI-assisted development.

## Benchmarking

- [Cross-model skill benchmarking workflow](docs/skill-benchmarking.md)
- [Benchmark run history](docs/skill-benchmark-runs.md)
