---
name: activation-design
description: Patterns that increase skill activation and instruction uptake
metadata:
  tags: activation, salience, retrieval, instruction-design
---

# Activation design

## Make triggers explicit — in the description, not the body

Routing happens on the frontmatter `description`. That is the only text
guaranteed to be in front of the model *before* it decides whether the skill
applies, so every trigger signal has to live there:

- domain nouns (e.g. CSV, OAuth callback, Fastify plugin)
- failure cues (timeouts, backpressure, flaky tests)
- output shape cues (commit footer, schema, endpoint)
- distinctive literals the user is likely to paste (`--experimental-strip-types`,
  a `github.com` URL, `eslint.config.mjs`)

A "When to use" list in the **body** repeats the routing decision after it has
already been made. It is paid on every activation and changes nothing, because
by the time it is read the skill has fired. Delete it and fold any signal it
carried into the description.

The corollary is that the description must stay under ~200 tokens: it is
resident in every request for every installed skill. Enumerate triggers
tersely, and cut anything describing the skill's *internal method* — that
names no situation and cannot route.

## Front-load non-negotiables

If behavior is frequently missed, move it into a numbered top-level checklist.
Use imperative wording:
- "Use `pipeline(...)`"
- "Include `Refs:` when requested"
- "Do not omit ..."

## Use integrated examples

Add examples that combine multiple rules likely needed together in real tasks.
A good integrated example:
- starts from realistic input
- includes critical decision points
- shows final output format

## Avoid ambiguous wording

Replace fuzzy phrasing:
- "consider using"
- "you may want"

With strict phrasing when correctness matters:
- "use"
- "must include"
- "do not omit"

## Activation anti-patterns

- burying critical rules deep in long files
- splitting one core behavior across too many documents
- examples that are toy-only and do not reflect real prompts
- a description that over-promises coverage the skill does not have, which
  turns every matching prompt into a misfire and invites the model to
  improvise under the skill's authority
- naming a file the skill does not ship; the model will either fail the read
  or invent its contents
