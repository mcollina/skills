import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintAll } from './skill-lint.mjs';
import { measureAll, findViolations, estimateTokens, splitFrontmatter, BUDGETS } from './skill-budget.mjs';

test('every skill satisfies the structural contracts', async () => {
  const problems = await lintAll();
  const errors = problems.filter((p) => p.severity !== 'warn');
  assert.deepEqual(
    errors.map((e) => `${e.skill}: [${e.rule}] ${e.message}`),
    [],
  );
});

test('every skill stays within its resident and activation budget', async () => {
  // Routers must stay small enough that firing a skill — including firing one
  // by mistake — is cheap. A router over budget has started covering more than
  // one task, or is restating its own description in the body.
  //
  // Rule-file size is deliberately not asserted: it is advisory, and a long
  // reference file that is read rarely is much cheaper than a short router
  // that is loaded on every activation.
  const skills = await measureAll();
  assert.ok(skills.length >= 18, 'expected the full skill set to be measurable');

  const over = findViolations(skills).filter((v) => v.tier === 'activation' || v.tier === 'resident');
  assert.deepEqual(
    over.map((v) => `${v.skill} ${v.tier} ${v.actual} > ${v.budget}`),
    [],
  );
});

test('no skill restates its own routing in the body', async () => {
  // The description routes. A "When to use" list in the body repeats that
  // decision after it has been made, costing activation tokens on every fire
  // without changing behaviour.
  const { readFile, readdir } = await import('node:fs/promises');
  const dirs = (await readdir('skills', { withFileTypes: true })).filter((d) => d.isDirectory());
  const offenders = [];
  for (const dir of dirs) {
    let text;
    try {
      text = await readFile(`skills/${dir.name}/SKILL.md`, 'utf8');
    } catch {
      continue;
    }
    if (/^##+ +(When to use|Activation examples)\s*$/im.test(text)) offenders.push(dir.name);
  }
  assert.deepEqual(offenders, []);
});

test('no single skill dominates the resident index', async () => {
  const skills = await measureAll();
  const total = skills.reduce((sum, s) => sum + s.resident, 0);
  for (const skill of skills) {
    assert.ok(
      skill.resident < total / 4,
      `${skill.name} is ${skill.resident} of ${total} resident tokens; its description is doing too much work`,
    );
  }
});

test('splitFrontmatter separates frontmatter from body', () => {
  const { frontmatter, body } = splitFrontmatter('---\nname: x\n---\nhello\n');
  assert.equal(frontmatter, '---\nname: x\n---\n');
  assert.equal(body, 'hello\n');
});

test('splitFrontmatter tolerates a file with no frontmatter', () => {
  const { frontmatter, body } = splitFrontmatter('# just a heading\n');
  assert.equal(frontmatter, '');
  assert.equal(body, '# just a heading\n');
});

test('estimateTokens is monotonic and non-zero for non-empty input', () => {
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('a') >= 1);
  assert.ok(estimateTokens('a'.repeat(1000)) > estimateTokens('a'.repeat(100)));
});

test('resident budget is tighter than activation budget', () => {
  assert.ok(BUDGETS.resident < BUDGETS.activation);
  // Rule files are intentionally unbudgeted; see the note in skill-budget.mjs.
  assert.equal(BUDGETS.rule, undefined);
});
