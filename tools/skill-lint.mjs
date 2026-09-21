#!/usr/bin/env node
// Enforces the structural contracts this repo relies on but never checked.
//
// AGENTS.md states that SKILL.md is an index contract: "Every rules/*.md file
// must be explicitly mentioned and linked from that skill's main SKILL.md."
// Nothing verified that, and splitting one skill into eight multiplies the
// number of places it can silently break.
//
// Checks:
//   1. SKILL.md has frontmatter with `name` and `description`.
//   2. `name` matches the directory name (warning: two existing skills use a
//      marketplace slug instead, so this is an inconsistency, not a breakage).
//   3. Every rules/*.md is linked from SKILL.md            (the index contract)
//   4. Every relative link in SKILL.md resolves to a real file.
//   5. No rule file links into a sibling skill by relative path — skills
//      install independently, so those paths do not resolve at runtime.
//   5b. Every prose mention of a `rules/...` path resolves. Skills sometimes
//      name a rule file without making it a link, and an agent told to read a
//      file that does not exist will either fail or invent its contents.
//      Only `rules/`-qualified references are checked: a bare filename in
//      prose is usually a file in the *user's* repo (README.md) or in a target
//      project (doc/api/cli.md), which this linter cannot verify.
//   6. tile.json, when present, registers the skill under exactly the name
//      SKILL.md declares. The tile's own `name` is a registry slug and is
//      allowed to differ from the directory.
//
// Usage: node tools/skill-lint.mjs

import { readdir, readFile, access } from 'node:fs/promises';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

// Fenced blocks and inline code must be removed before scanning for links:
// a C++ lambda such as `[](Napi::Env env, uint8_t* data)` is syntactically
// indistinguishable from a markdown link, and these rule files are full of
// them. Newlines are preserved so any future line-number reporting stays true.
function stripCode(text) {
  return stripFences(text).replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

// Fenced blocks only. Inline code is preserved because prose references to
// other documents are conventionally backticked ("see `DEVICE_FLOW.md`"), so
// blanking inline code would hide exactly the references we want to check.
function stripFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, ' '));
}


function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  // Deliberately minimal: these files use a flat `key: value` subset of YAML
  // at the top level, and adding a parser dependency for it is not worth it.
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listRules(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => relative(dir, join(e.parentPath ?? dir, e.name)));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function isExternal(href) {
  return /^(https?:|mailto:|#)/.test(href);
}

let ruleIndex = null;
// Cross-skill references are written by name ("`primordials.md` in the
// **nodejs-source** skill"), so a bare filename is legitimate as long as the
// file exists somewhere in the corpus.
async function findRuleAnywhere(filename) {
  if (ruleIndex === null) {
    ruleIndex = new Set();
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      for (const rule of await listRules(join(SKILLS_DIR, entry.name, 'rules'))) {
        ruleIndex.add(rule.split('/').pop());
      }
    }
  }
  return ruleIndex.has(filename.split('/').pop());
}

export async function lintSkill(name) {
  const dir = join(SKILLS_DIR, name);
  const skillPath = join(dir, 'SKILL.md');
  const problems = [];

  if (!(await exists(skillPath))) return problems; // not a skill directory

  const text = await readFile(skillPath, 'utf8');
  const prose = stripCode(text);
  const fm = parseFrontmatter(text);

  if (!fm) {
    problems.push({ skill: name, rule: 'frontmatter', message: 'SKILL.md has no YAML frontmatter' });
  } else {
    if (!fm.name) problems.push({ skill: name, rule: 'frontmatter', message: 'missing `name`' });
    if (!fm.description) problems.push({ skill: name, rule: 'frontmatter', message: 'missing `description`' });
    if (fm.name && fm.name !== name) {
      problems.push({
        skill: name,
        rule: 'name',
        severity: 'warn',
        message: `frontmatter name "${fm.name}" != directory "${name}"`,
      });
    }
  }

  // --- links in SKILL.md resolve ---------------------------------------------
  const linked = new Set();
  for (const [, href] of prose.matchAll(LINK_RE)) {
    if (isExternal(href)) continue;
    const clean = href.split('#')[0];
    if (!clean) continue;
    if (!(await exists(resolve(dir, clean)))) {
      problems.push({ skill: name, rule: 'dead-link', message: `SKILL.md links to missing ${clean}` });
    }
    if (clean.startsWith('rules/')) linked.add(clean.slice('rules/'.length));
  }

  // --- index contract ---------------------------------------------------------
  const rules = await listRules(join(dir, 'rules'));
  for (const rule of rules) {
    if (!linked.has(rule)) {
      problems.push({
        skill: name,
        rule: 'index-contract',
        message: `rules/${rule} is not linked from SKILL.md (AGENTS.md requires it)`,
      });
    }
  }

  // --- no relative links across skill boundaries -------------------------------
  for (const rule of rules) {
    const rulePath = join(dir, 'rules', rule);
    const ruleText = stripCode(await readFile(rulePath, 'utf8'));
    for (const [, href] of ruleText.matchAll(LINK_RE)) {
      if (isExternal(href)) continue;
      const clean = href.split('#')[0];
      if (!clean) continue;
      const target = resolve(dirname(rulePath), clean);
      if (!target.startsWith(dir)) {
        problems.push({
          skill: name,
          rule: 'cross-skill-path',
          message: `rules/${rule} links outside the skill (${clean}); reference the skill by name instead`,
        });
      } else if (!(await exists(target))) {
        problems.push({ skill: name, rule: 'dead-link', message: `rules/${rule} links to missing ${clean}` });
      }
    }
  }

  // --- prose references to rule files that do not exist -------------------------
  const docs = [['SKILL.md', text], ...(await Promise.all(
    rules.map(async (r) => [`rules/${r}`, await readFile(join(dir, 'rules', r), 'utf8')]),
  ))];

  for (const [where, raw] of docs) {
    const content = stripFences(raw)
      .replace(/https?:\/\/\S+/g, ' ')  // bare URLs are not local references
      .replace(LINK_RE, ' ');          // real links are checked above

    for (const [, ref] of content.matchAll(/\b(rules\/[\w.-]+\.md)\b/g)) {
      if (await exists(resolve(dir, ref))) continue;
      if (await findRuleAnywhere(ref)) continue; // cross-skill reference by name
      problems.push({
        skill: name,
        rule: 'dangling-reference',
        message: `${where} names "${ref}", which exists in no skill`,
      });
    }
  }

  // --- tile.json consistency ----------------------------------------------------
  const tilePath = join(dir, 'tile.json');
  if (await exists(tilePath)) {
    let tile;
    try {
      tile = JSON.parse(await readFile(tilePath, 'utf8'));
    } catch (err) {
      problems.push({ skill: name, rule: 'tile', message: `tile.json is not valid JSON: ${err.message}` });
    }
    if (tile) {
      // The tile `name` is a registry slug (e.g. mcollina/node-best-practices)
      // and may differ from the directory. What must hold is that the tile
      // registers the skill under the name SKILL.md actually declares,
      // otherwise the published tile exposes a skill nobody can resolve.
      const declared = fm?.name ?? name;
      const keys = Object.keys(tile.skills ?? {});
      if (!keys.includes(declared)) {
        problems.push({
          skill: name,
          rule: 'tile',
          message: `tile.json registers [${keys.join(', ') || 'nothing'}] but SKILL.md declares name "${declared}"`,
        });
      } else if (tile.skills[declared].path !== 'SKILL.md') {
        problems.push({
          skill: name,
          rule: 'tile',
          message: `tile.json path "${tile.skills[declared].path}" != SKILL.md`,
        });
      }
    }
  }

  return problems;
}

export async function lintAll() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const problems = [];
  for (const name of names) problems.push(...(await lintSkill(name)));
  return problems;
}

async function main() {
  const problems = await lintAll();
  const errors = problems.filter((p) => p.severity !== 'warn');
  const warnings = problems.filter((p) => p.severity === 'warn');

  let current = '';
  for (const p of problems) {
    if (p.skill !== current) {
      current = p.skill;
      console.error(`\n${current}`);
    }
    console.error(`  ${p.severity === 'warn' ? 'warn' : 'ERR '} [${p.rule}] ${p.message}`);
  }

  if (problems.length > 0) console.error('');
  console.error(`skill-lint: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
