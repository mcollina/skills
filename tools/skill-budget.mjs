#!/usr/bin/env node
// Reports the context cost of every skill in this repo.
//
// Skills are loaded in tiers, and the tiers have very different costs because
// they have very different lifetimes:
//
//   resident   the YAML frontmatter of every SKILL.md. Present in every request
//              of every session, whether or not the skill is ever used. Cost
//              scales with the number of skills, not their size.
//   activation SKILL.md minus its frontmatter. Paid whenever the skill fires,
//              including when it fires by mistake. Loaded early and rarely
//              evicted, so it is multiplied by most of the session's turns.
//   on-demand  rules/*.md. Paid only when a rule is actually read, and the
//              cheapest tier to evict because the files are immutable and on
//              disk, so they can always be re-read.
//
// The number that matters for a skill's design is `activation`. Corpus size is
// mostly noise: a 300 KB skill whose router is 600 tokens is cheaper in
// practice than a 30 KB skill whose router is 3000.
//
// Usage:
//   node tools/skill-budget.mjs              summary table
//   node tools/skill-budget.mjs --rules      also list rule files per skill
//   node tools/skill-budget.mjs --json       machine-readable
//   node tools/skill-budget.mjs --check      exit 1 if any skill is over budget

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');

// Budgets are advisory ceilings, not hard limits. They encode the design rule
// that a skill should be the smallest unit a single task needs in full: if a
// router does not fit in ~1000 tokens it is almost always covering more than
// one task and should be split.
export const BUDGETS = {
  resident: 200, // frontmatter, per skill
  activation: 1000, // SKILL.md body, per skill
};

// Rule files are reported but deliberately not budgeted. Size does not
// distinguish a dense, project-specific reference from a restatement of
// training data: the largest rule file in this repo is almost entirely
// non-guessable detail, while generic "use const, not var" style tutorials
// lived in a file comfortably under any threshold. A size check would have
// flagged the good file and passed the bad one, so it is worse than nothing.
// The largest files are listed instead, for a human to look at.
export const RULES_TO_REPORT = 5;

// Rough BPE approximation. Real tokenizers vary by model and we deliberately
// avoid a dependency here, so this is calibrated against English prose with
// fenced code (~3.8 chars/token) rather than the usual chars/4 folklore. Byte
// counts are reported alongside because those are exact and reproducible.
export function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}

export function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: '', body: text };
  return { frontmatter: match[0], body: text.slice(match[0].length) };
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function collectRules(dir) {
  const rules = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err.code === 'ENOENT') return rules;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const path = join(entry.parentPath ?? dir, entry.name);
    const text = await readFile(path, 'utf8');
    rules.push({
      path: relative(dir, path),
      bytes: Buffer.byteLength(text),
      tokens: estimateTokens(text),
    });
  }
  return rules.sort((a, b) => b.tokens - a.tokens);
}

export async function measureSkill(name) {
  const dir = join(SKILLS_DIR, name);
  const skillMd = await readIfExists(join(dir, 'SKILL.md'));
  if (skillMd === null) return null;

  const { frontmatter, body } = splitFrontmatter(skillMd);
  const rules = await collectRules(join(dir, 'rules'));
  const scripts = await collectScripts(join(dir, 'scripts'));

  return {
    name,
    resident: estimateTokens(frontmatter),
    activation: estimateTokens(body),
    rules: {
      count: rules.length,
      tokens: rules.reduce((sum, r) => sum + r.tokens, 0),
      largest: rules[0] ?? null,
      files: rules,
    },
    scripts,
    bytes: Buffer.byteLength(skillMd) + rules.reduce((sum, r) => sum + r.bytes, 0),
  };
}

async function collectScripts(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function measureAll() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const skills = [];
  for (const name of names) {
    const measured = await measureSkill(name);
    if (measured) skills.push(measured);
  }
  return skills;
}

export function findViolations(skills) {
  const violations = [];
  for (const skill of skills) {
    if (skill.resident > BUDGETS.resident) {
      violations.push({
        skill: skill.name,
        tier: 'resident',
        actual: skill.resident,
        budget: BUDGETS.resident,
        hint: 'description is long; usually a sign it is fencing itself off from an overlapping skill',
      });
    }
    if (skill.activation > BUDGETS.activation) {
      violations.push({
        skill: skill.name,
        tier: 'activation',
        actual: skill.activation,
        budget: BUDGETS.activation,
        hint: 'SKILL.md covers more than one task; split it or move detail into rules/',
      });
    }
  }
  return violations;
}

function pad(value, width, align = 'left') {
  const text = String(value);
  return align === 'right' ? text.padStart(width) : text.padEnd(width);
}

function report(skills, { showRules }) {
  const totals = skills.reduce(
    (acc, s) => ({
      resident: acc.resident + s.resident,
      activation: acc.activation + s.activation,
      rules: acc.rules + s.rules.tokens,
      files: acc.files + s.rules.count,
    }),
    { resident: 0, activation: 0, rules: 0, files: 0 },
  );

  const nameWidth = Math.max(12, ...skills.map((s) => s.name.length));
  console.log(
    `${pad('skill', nameWidth)}  ${pad('resident', 9, 'right')}  ${pad('activation', 11, 'right')}  ${pad('rules', 8, 'right')}  ${pad('files', 6, 'right')}`,
  );
  console.log('-'.repeat(nameWidth + 42));

  for (const skill of [...skills].sort((a, b) => b.activation - a.activation)) {
    const over = skill.activation > BUDGETS.activation ? ' !' : '';
    console.log(
      `${pad(skill.name, nameWidth)}  ${pad(skill.resident, 9, 'right')}  ${pad(skill.activation, 11, 'right')}  ${pad(skill.rules.tokens, 8, 'right')}  ${pad(skill.rules.count, 6, 'right')}${over}`,
    );
    if (showRules) {
      for (const rule of skill.rules.files) {
        console.log(`${' '.repeat(nameWidth + 2)}  ${pad(rule.tokens, 9, 'right')}  rules/${rule.path}`);
      }
    }
  }

  console.log('-'.repeat(nameWidth + 42));
  console.log(
    `${pad('TOTAL', nameWidth)}  ${pad(totals.resident, 9, 'right')}  ${pad(totals.activation, 11, 'right')}  ${pad(totals.rules, 8, 'right')}  ${pad(totals.files, 6, 'right')}`,
  );
  console.log();
  console.log(`resident cost per request:      ~${totals.resident} tokens (${skills.length} skills)`);
  console.log(`worst-case if every skill fires: ~${totals.resident + totals.activation} tokens`);
  console.log(`total corpus:                    ~${totals.resident + totals.activation + totals.rules} tokens`);

  const largest = skills
    .flatMap((s) => s.rules.files.map((f) => ({ ...f, skill: s.skill ?? s.name })))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, RULES_TO_REPORT);
  if (largest.length > 0) {
    console.log();
    console.log(`Largest rule files (informational — read them, do not just shrink them):`);
    for (const r of largest) console.log(`  ${String(r.tokens).padStart(6)}  ${r.skill}/rules/${r.path}`);
  }

  console.log();
  console.log('Token counts are estimates (~3.8 chars/token), useful for comparison not billing.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const skills = await measureAll();

  if (args.has('--json')) {
    console.log(JSON.stringify({ budgets: BUDGETS, skills, violations: findViolations(skills) }, null, 2));
    return;
  }

  report(skills, { showRules: args.has('--rules') });

  const violations = findViolations(skills);
  if (violations.length > 0) {
    console.log(`Over budget (${violations.length}):`);
    for (const v of violations) {
      console.log(`  ${v.skill} ${v.tier}: ${v.actual} > ${v.budget} — ${v.hint}`);
    }
    console.log();
  }

  if (args.has('--check')) {
    const blocking = violations.filter((v) => v.tier === 'resident' || v.tier === 'activation');
    if (blocking.length > 0) {
      console.error(`FAIL: ${blocking.length} skill(s) exceed resident/activation budget.`);
      process.exitCode = 1;
      return;
    }
    console.log('OK: all skills within resident and activation budgets.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
