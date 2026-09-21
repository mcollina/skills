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

test('the nodejs-* skills stay within their activation budget', async () => {
  // The point of splitting nodejs-core was to keep every router small enough
  // that firing a skill — including firing one by mistake — is cheap. If one
  // of these creeps over budget it has started covering more than one task.
  const skills = await measureAll();
  const nodejsSkills = skills.filter((s) => s.name.startsWith('nodejs-'));

  assert.ok(nodejsSkills.length >= 8, 'expected the split nodejs-* skills to exist');

  const over = findViolations(nodejsSkills).filter((v) => v.tier === 'activation' || v.tier === 'resident');
  assert.deepEqual(
    over.map((v) => `${v.skill} ${v.tier} ${v.actual} > ${v.budget}`),
    [],
  );
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

test('budgets are ordered resident < activation < rule', () => {
  assert.ok(BUDGETS.resident < BUDGETS.activation);
  assert.ok(BUDGETS.activation < BUDGETS.rule);
});
