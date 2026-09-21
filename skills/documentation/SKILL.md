---
name: documentation
description: Writes and restructures technical documentation using the Diátaxis framework. Use when creating a tutorial, how-to guide, API reference, or conceptual explanation, when reviewing docs that mix those modes, or when reorganising a documentation set that users cannot navigate.
metadata:
  tags: documentation, diataxis, technical-writing, tutorials, how-to, reference, explanation
---

## Before writing anything

Ask about audience, context, and goal **first**. Documentation that targets the
wrong mode is not improved by better prose.

## Step 1 — Identify the mode

Exactly one of four, chosen from what the reader is doing:

| User signal | Mode |
|---|---|
| "I'm new to X and want to learn it" / "walk me through" | **Tutorial** |
| "How do I…?" / "I need to accomplish X" | **How-to guide** |
| "What are the parameters/options/syntax for X?" | **Reference** |
| "Why does X work this way?" / "Help me understand X" | **Explanation** |

When the signal is ambiguous, ask. Guessing the mode wastes the whole document.

## Step 2 — Apply that mode's patterns

Read only the file for the mode you identified. Mixing modes is the failure
this framework exists to prevent, so reading all four while drafting one
document works against the goal.

- [rules/tutorials.md](rules/tutorials.md) — learning-oriented: title patterns, step structure, beginner-completion test
- [rules/how-to-guides.md](rules/how-to-guides.md) — problem-oriented: task framing, assumed knowledge, experienced-user test
- [rules/reference.md](rules/reference.md) — information-oriented: entry format, consistency, 30-second lookup test
- [rules/explanations.md](rules/explanations.md) — understanding-oriented: concept framing, trade-offs, explain-it-back test

## Step 3 — Keep the modes separate

- One document, one mode. Do not mix tutorial steps with reference tables or
  conceptual digressions.
- Cross-link instead: a tutorial links to the reference page; a how-to links to
  an explanation for background.
- Use consistent headings and terminology across the set so the whole thing is
  navigable.

## Step 4 — Validate before delivering

| Mode | Check |
|---|---|
| Tutorial | Can a beginner complete it end-to-end without external help? |
| How-to guide | Does it solve the stated problem for an experienced user? |
| Reference | Can a user find a specific fact in under 30 seconds? |
| Explanation | Does the reader understand the *why*, not just the *what*? |

## Related skills

Cross-skill references are by skill name, not file path, because each skill
installs independently.

- The `doc/api/` reference in the nodejs/node repo, which has its own conventions → **nodejs-api-docs**
- Generating or maintaining an AGENTS.md → **init**
