#!/usr/bin/env node
/**
 * Rewrites the GitHub owner (and optionally the repository name) across the repo.
 *
 *   node scripts/set-repo.mjs <github-owner> [repo-name]
 *
 * Useful when forking, or if your GitHub handle differs from the default one
 * baked into package.json, the README badges and the docs links.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const [owner, repo = 'datepicker-nextgen'] = process.argv.slice(2);
if (!owner) {
  console.error('Usage: node scripts/set-repo.mjs <github-owner> [repo-name]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const CURRENT_OWNER = 'karthikbaikati';
const CURRENT_REPO = 'datepicker-nextgen';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-demo', '.git', 'coverage']);
const EXTENSIONS = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.mjs', '.yml', '.yaml', '.html', '.css']);

let changed = 0;
walk(root);
console.log(`Rewrote ${changed} file(s) → ${owner}/${repo}`);

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(extname(entry))) continue;
    const before = readFileSync(full, 'utf8');
    const after = before
      .replaceAll(`${CURRENT_OWNER}/${CURRENT_REPO}`, `${owner}/${repo}`)
      .replaceAll(`${CURRENT_OWNER}.github.io/${CURRENT_REPO}`, `${owner}.github.io/${repo}`);
    if (after !== before) {
      writeFileSync(full, after);
      changed += 1;
    }
  }
}
