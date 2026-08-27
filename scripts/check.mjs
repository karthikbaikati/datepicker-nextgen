#!/usr/bin/env node
/**
 * Typecheck a specific set of files without pulling in the rest of the project.
 * Used during development so an in-progress module can be validated in isolation.
 *
 *   node scripts/check.mjs src/core/constraints.ts src/core/presets.ts
 *
 * With no arguments it typechecks the whole project.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..');

if (files.length === 0) {
  run(['--noEmit', '-p', 'tsconfig.json']);
  process.exit(0);
}

const base = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'));
const tmp = resolve(root, `tsconfig.check.${process.pid}.json`);
writeFileSync(
  tmp,
  JSON.stringify({ compilerOptions: base.compilerOptions, files: files.map((f) => resolve(root, f)) }, null, 2),
);

try {
  run(['--noEmit', '-p', tmp]);
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* already gone */
  }
}

function run(args) {
  try {
    execFileSync('npx', ['tsc', ...args], { cwd: root, stdio: 'inherit' });
    console.log('\n✔ typecheck clean');
  } catch {
    console.error('\n✖ typecheck failed');
    process.exitCode = 1;
  }
}
