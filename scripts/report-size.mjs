#!/usr/bin/env node
/**
 * Prints the gzipped size of every published entry point. Run after `npm run build`.
 * Bundle size is a feature of this library, so CI reports it on every run.
 */
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const files = [];
walk(dist);

const rows = files
  .filter((f) => /\.(js|css)$/.test(f) && !f.endsWith('.map'))
  .map((file) => {
    const source = readFileSync(file);
    return {
      file: relative(dist, file),
      raw: source.length,
      gzip: gzipSync(source, { level: 9 }).length,
      brotli: brotliCompressSync(source).length,
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const pad = (value, width) => String(value).padEnd(width);
const width = Math.max(24, ...rows.map((r) => r.file.length)) + 2;

console.log(`\n${pad('file', width)}${pad('raw', 12)}${pad('gzip', 12)}brotli`);
console.log('-'.repeat(width + 32));
for (const row of rows) {
  console.log(`${pad(row.file, width)}${pad(kb(row.raw), 12)}${pad(kb(row.gzip), 12)}${kb(row.brotli)}`);
}
const total = rows.reduce((sum, r) => sum + r.gzip, 0);
console.log('-'.repeat(width + 32));
console.log(`${pad('total (gzip)', width)}${kb(total)}\n`);

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
}
