---
name: ai-guidelines
description: Operational constraints for AI assistants helping with Node.js core contributions
metadata:
  tags: ai, contributing, pull-request, verification, automation
---

# AI-Assisted Node.js Maintenance

When helping with `nodejs/node`:

- Treat generated analysis as a hypothesis. Verify it against the source code,
  documentation, or relevant specification before presenting it as fact.
- Make changes the human contributor can review, understand, and explain.
  Provide concrete rationale and evidence rather than citing tool output as
  justification.
- Do not remove or modify existing tests without human verification. Derive
  expected results from the intended behavior, independently of the
  implementation being tested.
- Run the applicable build, lint, and test commands from
  [build-and-test-workflow.md](build-and-test-workflow.md), and report only
  results that were actually observed.
- Treat generated pull request, issue, and review text as a draft for the human
  contributor to verify and edit. Verify technical claims and point to primary
  sources.
- Remind the contributor to disclose AI assistance honestly.
- Do not open a pull request through automated tooling unless the contributor
  confirms that the Node.js project approved the automation in advance.
  Otherwise, prepare the changes and command for the human to run.

Continue to use the existing rules for commit structure, DCO, testing, and
review. These constraints are summarized from Node.js's
[AI use policy and guidelines](https://github.com/nodejs/node/blob/91aaf05a25ea22230daa7b777949006704c43b45/doc/contributing/ai-guidelines.md).
